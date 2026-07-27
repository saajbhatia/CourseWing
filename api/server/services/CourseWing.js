const mongoose = require('mongoose');
const { randomBytes } = require('crypto');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const {
  decrypt,
  getCanvasServiceUrl,
  readBoundedJson,
  MAX_CANVAS_SERVICE_RESPONSE_BYTES,
  CanvasServiceResponseTooLargeError,
} = require('@librechat/api');
const { Constants, extractCanvasCourseId } = require('librechat-data-provider');
const { getOptionalUserPluginAuthValue } = require('~/server/services/PluginService');
const {
  COURSEWING_PLUGIN_KEY,
  LEGACY_COURSEWING_PLUGIN_KEY,
  CANVAS_TOKEN_FIELD,
  CANVAS_TENANT_FIELD,
  CANVAS_PENDING_REVOCATION_FIELD,
  LEGACY_CANVAS_TOKEN_FIELD,
  LEGACY_CANVAS_TENANT_FIELD,
  isValidCourseWingTenantId,
} = require('~/server/services/CourseWingAuth');
const MAX_SHARED_CHAT_MESSAGES = 250;
const MAX_SHARED_CHAT_NODES = 500;
const MAX_SHARED_CHAT_JSON_BYTES = 800_000;
const MAX_SHARED_MESSAGE_BYTES = 50_000;
const MAX_SHARED_TITLE_BYTES = 5_000;
const MAX_SHARED_SENDER_BYTES = 500;
const CANVAS_IDENTITY_CACHE_TTL_MS = 60_000;
const COURSEWING_MUTATION_LOCK_LEASE_MS = 3 * 60_000;
const COURSEWING_MUTATION_LOCK_WAIT_MS = 30_000;
const DEFAULT_CANVAS_IDENTITY_CACHE_KEY = '__default__';
const canvasIdentityCache = new Map();
let courseWingMutationLockModel;

class CanvasTenantStatusError extends Error {
  constructor(status) {
    super(`Canvas tenant status failed with ${status}`);
    this.status = status;
  }
}

function getCourseWingMutationLockModel() {
  if (courseWingMutationLockModel) {
    return courseWingMutationLockModel;
  }
  if (mongoose.models.CourseWingMutationLock) {
    courseWingMutationLockModel = mongoose.models.CourseWingMutationLock;
    return courseWingMutationLockModel;
  }
  const schema = new mongoose.Schema(
    {
      _id: { type: String, required: true },
      owner: { type: String, required: true },
      expiresAt: { type: Date, required: true, expires: 0 },
    },
    { versionKey: false },
  );
  courseWingMutationLockModel = mongoose.model('CourseWingMutationLock', schema);
  return courseWingMutationLockModel;
}

/** Acquires a crash-recoverable cross-process lease for one opaque user binding. */
async function acquireCourseWingMutationLease(bindingId) {
  if (typeof bindingId !== 'string' || !/^[a-f\d]{64}$/.test(bindingId)) {
    throw new Error('Invalid CourseWing binding id');
  }
  const Lock = getCourseWingMutationLockModel();
  const owner = randomBytes(16).toString('hex');
  const deadline = Date.now() + COURSEWING_MUTATION_LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + COURSEWING_MUTATION_LOCK_LEASE_MS);
    try {
      const lock = await Lock.findOneAndUpdate(
        {
          _id: bindingId,
          $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $lte: now } }],
        },
        {
          $set: {
            owner,
            expiresAt,
          },
          $setOnInsert: { _id: bindingId },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      if (lock?.owner === owner) {
        let stopping = false;
        let leaseLost = false;
        let leaseExpiresAt = expiresAt.getTime();
        let renewal = Promise.resolve();
        const renewalTimer = setInterval(() => {
          renewal = renewal
            .then(async () => {
              if (stopping) {
                return;
              }
              const renewedAt = new Date();
              const nextExpiry = new Date(renewedAt.getTime() + COURSEWING_MUTATION_LOCK_LEASE_MS);
              const result = await Lock.updateOne(
                { _id: bindingId, owner },
                {
                  $set: {
                    expiresAt: nextExpiry,
                  },
                },
              );
              if (result.matchedCount !== 1) {
                leaseLost = true;
                logger.error(`[CourseWing] Mutation lease ${bindingId} was lost during renewal`);
              } else {
                leaseExpiresAt = nextExpiry.getTime();
              }
            })
            .catch((error) => {
              if (Date.now() >= leaseExpiresAt) {
                leaseLost = true;
              }
              logger.warn(
                `[CourseWing] Failed to renew mutation lease ${bindingId}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            });
        }, COURSEWING_MUTATION_LOCK_LEASE_MS / 3);
        renewalTimer.unref?.();
        return async () => {
          stopping = true;
          clearInterval(renewalTimer);
          await renewal;
          if (Date.now() >= leaseExpiresAt) {
            leaseLost = true;
          }
          try {
            const result = await Lock.deleteOne({ _id: bindingId, owner });
            if (result.deletedCount !== 1) {
              leaseLost = true;
              logger.error(`[CourseWing] Mutation lease ${bindingId} was lost before release`);
            }
          } catch (error) {
            leaseLost = true;
            logger.warn(
              `[CourseWing] Failed to release mutation lease ${bindingId}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
          if (leaseLost) {
            throw new Error(`CourseWing mutation lease ${bindingId} was lost`);
          }
        };
      }
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error('Timed out waiting for another CourseWing account update');
}

/** Returns the user's Canvas tenant id, or null when they haven't connected an account. */
async function getCourseWingTenantId(userId) {
  if (!userId) {
    return null;
  }
  const current = await getOptionalUserPluginAuthValue(
    userId,
    CANVAS_TENANT_FIELD,
    COURSEWING_PLUGIN_KEY,
  );
  if (isValidCourseWingTenantId(current)) {
    return current;
  }
  const legacy = await getOptionalUserPluginAuthValue(
    userId,
    LEGACY_CANVAS_TENANT_FIELD,
    LEGACY_COURSEWING_PLUGIN_KEY,
  );
  if (isValidCourseWingTenantId(legacy)) {
    return legacy;
  }
  if (current != null || legacy != null) {
    logger.warn('[CourseWing] Ignoring an invalid stored Canvas tenant id');
  }
  return null;
}

/**
 * Checks every app tenant before a service tenant is revoked. PluginAuth values
 * are encrypted, so this deliberately scans only the two reserved mapping
 * fields under a system context and decrypts them in process.
 *
 * A corrupt row is treated as a live reference: leaking an orphaned service
 * tenant is safer than deleting credentials or cached data another user may
 * still depend on.
 */
async function getCourseWingTenantReferenceStatus(tenantId, excludedUserId) {
  if (!isValidCourseWingTenantId(tenantId)) {
    throw new Error('Invalid Canvas tenant id');
  }
  const PluginAuth = mongoose.models.PluginAuth;
  if (!PluginAuth) {
    throw new Error('PluginAuth model is not initialized');
  }
  const mappingRows = await runAsSystem(async () =>
    PluginAuth.find(
      {
        authField: { $in: [CANVAS_TENANT_FIELD, LEGACY_CANVAS_TENANT_FIELD] },
        ...(excludedUserId ? { userId: { $ne: String(excludedUserId) } } : {}),
      },
      'value',
    ).lean(),
  );
  let hasIndeterminateMapping = false;
  for (const mapping of mappingRows) {
    let mappedTenantId;
    try {
      mappedTenantId = await decrypt(mapping.value);
    } catch (error) {
      logger.warn(
        `[CourseWing] Preserving Canvas tenant ${tenantId} because a stored mapping ` +
          `could not be decrypted: ${error instanceof Error ? error.message : String(error)}`,
      );
      hasIndeterminateMapping = true;
      continue;
    }
    if (mappedTenantId === tenantId) {
      return 'referenced';
    }
    if (mappedTenantId != null && !isValidCourseWingTenantId(mappedTenantId)) {
      logger.warn(
        `[CourseWing] Preserving Canvas tenant ${tenantId} because a stored mapping ` +
          'contains an invalid tenant id',
      );
      hasIndeterminateMapping = true;
    }
  }
  return hasIndeterminateMapping ? 'indeterminate' : 'unreferenced';
}

async function hasOtherCourseWingTenantReference(tenantId, excludedUserId) {
  return (await getCourseWingTenantReferenceStatus(tenantId, excludedUserId)) !== 'unreferenced';
}

/** Resolves one explicit tenant or the environment-backed default without exposing a bearer. */
async function resolveCourseWingCanvasIdentity(requestedTenantId, allowDefaultFallback = true) {
  const cacheKey = requestedTenantId ?? DEFAULT_CANVAS_IDENTITY_CACHE_KEY;
  const cached = canvasIdentityCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) {
    return { tenantId: cached.tenantId, canvasAccountKey: cached.canvasAccountKey };
  }

  const status = await serviceFetch('/api/coursewing/tenant', {
    headers: requestedTenantId ? { 'X-Tenant-Id': requestedTenantId } : {},
  });
  if (!status.ok) {
    if (requestedTenantId && status.status === 404 && allowDefaultFallback) {
      return resolveCourseWingCanvasIdentity(null);
    }
    throw new CanvasTenantStatusError(status.status);
  }
  const tenantId = status.body?.tenantId;
  if (!isValidCourseWingTenantId(tenantId)) {
    throw new Error('Canvas service returned an invalid tenant identity');
  }
  const canvasAccountKey = status.body?.canvasAccountKey;
  if (typeof canvasAccountKey !== 'string' || !/^[a-f\d]{24}$/.test(canvasAccountKey)) {
    throw new Error('Canvas service returned an invalid account identity');
  }
  canvasIdentityCache.set(cacheKey, {
    tenantId,
    canvasAccountKey,
    expiresAt: Date.now() + CANVAS_IDENTITY_CACHE_TTL_MS,
  });
  return { tenantId, canvasAccountKey };
}

/**
 * Resolves the user's personal Canvas mapping when present, otherwise the server-owned
 * environment account. The returned tenant id never leaves the trusted server boundary.
 */
async function getCourseWingCanvasIdentity(userId) {
  await assertNoPendingCourseWingDisconnect(userId);
  const mappedTenantId = await getCourseWingTenantId(userId);
  const identity = await resolveCourseWingCanvasIdentity(mappedTenantId);
  await assertNoPendingCourseWingDisconnect(userId);
  await assertCourseWingTenantUnchanged(userId, mappedTenantId);
  return identity;
}

async function assertCourseWingTenantUnchanged(userId, expectedTenantId) {
  if ((await getCourseWingTenantId(userId)) === expectedTenantId) {
    return;
  }
  const error = new Error('Canvas account changed while resolving its identity');
  error.code = 'COURSEWING_TENANT_CHANGED';
  throw error;
}

async function assertNoPendingCourseWingDisconnect(userId) {
  if (!userId) {
    return;
  }
  const raw = await getOptionalUserPluginAuthValue(
    userId,
    CANVAS_PENDING_REVOCATION_FIELD,
    COURSEWING_PLUGIN_KEY,
  );
  if (!raw) {
    return;
  }
  try {
    if (['disconnect', 'replacement', 'unlinked'].includes(JSON.parse(raw)?.type)) {
      const error = new Error('Canvas connection cleanup is still pending');
      error.code = 'COURSEWING_DISCONNECT_PENDING';
      throw error;
    }
  } catch (error) {
    if (error?.code === 'COURSEWING_DISCONNECT_PENDING') {
      throw error;
    }
  }
}

function clearCourseWingCanvasIdentityCache(tenantId) {
  if (tenantId) {
    canvasIdentityCache.delete(tenantId);
    for (const [cacheKey, identity] of canvasIdentityCache) {
      if (identity.tenantId === tenantId) {
        canvasIdentityCache.delete(cacheKey);
      }
    }
  } else {
    canvasIdentityCache.clear();
  }
  clearCourseWingFrozenNowCache(tenantId);
}

function visibleMessageText(message) {
  if (typeof message?.text === 'string' && message.text.trim()) {
    return message.text;
  }
  if (!Array.isArray(message?.content)) {
    return '';
  }
  return message.content
    .map((part) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

function truncateUtf8(value, maxBytes) {
  let result = '';
  let bytes = 0;
  let truncated = false;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > maxBytes) {
      truncated = true;
      break;
    }
    result += character;
    bytes += characterBytes;
  }
  return { value: result, truncated };
}

/** Finds the longest prefix that keeps the complete serialized snapshot within its byte cap. */
function fitSnapshotText(baseBytes, messagesBytes, messageCount, message, text) {
  const separatorBytes = messageCount > 0 ? 1 : 0;
  const sizeWithText = (candidateText) =>
    baseBytes +
    messagesBytes +
    separatorBytes +
    Buffer.byteLength(JSON.stringify({ ...message, text: candidateText }), 'utf8');
  if (sizeWithText(text) <= MAX_SHARED_CHAT_JSON_BYTES) {
    return text;
  }
  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    const candidate = characters.slice(0, midpoint).join('');
    if (sizeWithText(candidate) <= MAX_SHARED_CHAT_JSON_BYTES) {
      low = midpoint;
    } else {
      high = midpoint - 1;
    }
  }
  return characters.slice(0, low).join('');
}

/**
 * Creates a bounded visible-text snapshot for one verified branch. The target is supplied by the
 * UI's currently visible leaf, then every ancestor is independently checked for user ownership and
 * conversation membership so regenerated sibling branches are never included.
 */
async function getOwnedChatSnapshot(userId, conversationId, targetMessageId) {
  if (!userId || !conversationId || !targetMessageId) {
    return null;
  }
  const db = require('~/models');
  const conversation = await db.getConvo(userId, conversationId);
  if (!conversation) {
    return null;
  }

  const title =
    typeof conversation.title === 'string'
      ? truncateUtf8(conversation.title, MAX_SHARED_TITLE_BYTES)
      : { value: null, truncated: false };
  const base = {
    version: 1,
    conversationId,
    targetMessageId,
    title: title.value,
    sharedAt: new Date().toISOString(),
    truncated: false,
  };
  const baseBytes = Buffer.byteLength(JSON.stringify({ ...base, messages: [] }), 'utf8');
  let messagesBytes = 0;
  let truncated = title.truncated;
  const messagesNewestFirst = [];
  const visited = new Set();
  let nextMessageId = targetMessageId;
  let visitedNodes = 0;

  while (nextMessageId && nextMessageId !== Constants.NO_PARENT) {
    if (visited.has(nextMessageId) || visitedNodes >= MAX_SHARED_CHAT_NODES) {
      truncated = true;
      break;
    }
    visited.add(nextMessageId);
    visitedNodes += 1;

    const message = await db.getMessage({ user: userId, messageId: nextMessageId });
    if (!message || message.conversationId !== conversationId) {
      return null;
    }
    const fullText = visibleMessageText(message);
    if (fullText) {
      if (messagesNewestFirst.length >= MAX_SHARED_CHAT_MESSAGES) {
        truncated = true;
        break;
      }
      const perMessage = truncateUtf8(fullText, MAX_SHARED_MESSAGE_BYTES);
      const sender =
        typeof message.sender === 'string'
          ? truncateUtf8(message.sender, MAX_SHARED_SENDER_BYTES)
          : { value: null, truncated: false };
      const createdAt = message.createdAt ? new Date(message.createdAt) : null;
      const snapshotMessage = {
        role: message.isCreatedByUser === true ? 'user' : 'assistant',
        sender: sender.value,
        text: perMessage.value,
        createdAt:
          createdAt != null && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString() : null,
      };
      const fittedText = fitSnapshotText(
        baseBytes,
        messagesBytes,
        messagesNewestFirst.length,
        snapshotMessage,
        perMessage.value,
      );
      if (!fittedText) {
        truncated = true;
        break;
      }
      snapshotMessage.text = fittedText;
      messagesBytes +=
        (messagesNewestFirst.length > 0 ? 1 : 0) +
        Buffer.byteLength(JSON.stringify(snapshotMessage), 'utf8');
      messagesNewestFirst.push(snapshotMessage);
      if (
        perMessage.truncated ||
        sender.truncated ||
        fittedText.length !== perMessage.value.length
      ) {
        truncated = true;
      }
    }
    nextMessageId =
      typeof message.parentMessageId === 'string' ? message.parentMessageId : Constants.NO_PARENT;
  }

  return {
    ...base,
    truncated,
    messages: messagesNewestFirst.reverse(),
  };
}

async function serviceFetch(path, options = {}) {
  const serviceKey = process.env.COURSEWING_SERVICE_KEY?.trim();
  if (!serviceKey) {
    throw new Error('COURSEWING_SERVICE_KEY is required for Canvas service requests');
  }
  const response = await fetch(`${getCanvasServiceUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-CourseWing-Service-Key': serviceKey,
      ...options.headers,
    },
    signal: AbortSignal.timeout(120_000),
  });
  const body = await readBoundedJson(response);
  return { ok: response.ok, status: response.status, body };
}

/**
 * One-time backfill: course chats saved before `canvasCourseId` existed carry the
 * course marker only inside `promptPrefix` — derive and persist the field for them.
 */
async function backfillCourseChats() {
  const Conversation = mongoose.models.Conversation;
  const cursor = Conversation.find(
    { canvasCourseId: { $exists: false }, promptPrefix: /Canvas course ID:/i },
    'conversationId promptPrefix',
  )
    .lean()
    .cursor();

  const ops = [];
  for await (const convo of cursor) {
    const canvasCourseId = extractCanvasCourseId(convo.promptPrefix);
    if (canvasCourseId == null) {
      continue;
    }
    ops.push({ updateOne: { filter: { _id: convo._id }, update: { $set: { canvasCourseId } } } });
  }

  if (ops.length > 0) {
    await Conversation.bulkWrite(ops);
    logger.info(`[CourseWing] Backfilled canvasCourseId on ${ops.length} conversation(s)`);
  }

  const unboundConversations = await Conversation.find(
    {
      canvasCourseId: { $type: 'number' },
      canvasAccountKey: { $exists: false },
    },
    '_id user createdAt',
  ).lean();
  if (unboundConversations.length === 0) {
    return;
  }

  const PluginAuth = mongoose.models.PluginAuth;
  if (!PluginAuth) {
    throw new Error('PluginAuth model is not initialized');
  }
  const mappingRows = await PluginAuth.find(
    {
      authField: { $in: [CANVAS_TENANT_FIELD, LEGACY_CANVAS_TENANT_FIELD] },
    },
    'userId authField value createdAt updatedAt',
  ).lean();
  const mappingsByUser = new Map();
  for (const mapping of mappingRows) {
    let tenantId;
    try {
      tenantId = await decrypt(mapping.value);
    } catch (error) {
      logger.warn(
        `[CourseWing] Could not decrypt a legacy Canvas mapping during chat-scope backfill: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }
    if (!isValidCourseWingTenantId(tenantId) || typeof mapping.userId !== 'string') {
      continue;
    }
    const existing = mappingsByUser.get(mapping.userId) ?? [];
    existing.push({ ...mapping, value: tenantId });
    mappingsByUser.set(mapping.userId, existing);
  }

  const identityPromises = new Map();
  const getHistoricalIdentity = (tenantId) => {
    const key = tenantId ?? DEFAULT_CANVAS_IDENTITY_CACHE_KEY;
    if (!identityPromises.has(key)) {
      identityPromises.set(key, resolveCourseWingCanvasIdentity(tenantId, false));
    }
    return identityPromises.get(key);
  };

  const scopeOps = [];
  let ambiguous = 0;
  let unavailable = 0;
  for (const conversation of unboundConversations) {
    const tenantId = selectLegacyCanvasTenantId(
      mappingsByUser.get(String(conversation.user)) ?? [],
      conversation.createdAt,
    );
    if (tenantId === undefined) {
      ambiguous += 1;
      continue;
    }
    try {
      const identity = await getHistoricalIdentity(tenantId);
      scopeOps.push({
        updateOne: {
          filter: { _id: conversation._id, canvasAccountKey: { $exists: false } },
          update: { $set: { canvasAccountKey: identity.canvasAccountKey } },
        },
      });
    } catch (error) {
      unavailable += 1;
      logger.warn(
        `[CourseWing] Could not resolve a historical Canvas account while backfilling chat scope: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (scopeOps.length > 0) {
    await Conversation.bulkWrite(scopeOps);
    logger.info(
      `[CourseWing] Backfilled Canvas account scope on ${scopeOps.length} conversation(s)`,
    );
  }
  if (ambiguous > 0 || unavailable > 0) {
    logger.warn(
      `[CourseWing] Left ${ambiguous + unavailable} legacy course chat(s) unbound ` +
        `(${ambiguous} ambiguous, ${unavailable} unavailable)`,
    );
  }
}

function mappingTimestamp(value) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value ?? ''));
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Chooses the account that was provably active when a legacy conversation was created.
 * `null` means the server default; `undefined` means a mapping was known but its update
 * history is too ambiguous to bind immutably without risking the wrong Canvas account.
 */
function selectLegacyCanvasTenantId(mappings, conversationCreatedAt) {
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return null;
  }
  const conversationTime = mappingTimestamp(conversationCreatedAt);
  if (conversationTime == null) {
    return undefined;
  }
  const eligible = mappings
    .map((mapping) => ({
      ...mapping,
      createdTime: mappingTimestamp(mapping.createdAt),
      updatedTime: mappingTimestamp(mapping.updatedAt),
      priority: mapping.authField === CANVAS_TENANT_FIELD ? 1 : 0,
    }))
    .filter((mapping) => mapping.createdTime != null && mapping.createdTime <= conversationTime)
    .sort((left, right) =>
      left.createdTime === right.createdTime
        ? left.priority - right.priority
        : left.createdTime - right.createdTime,
    );
  const active = eligible.at(-1);
  if (!active) {
    return null;
  }
  if (
    active.updatedTime != null &&
    active.updatedTime > active.createdTime + 1_000 &&
    conversationTime < active.updatedTime
  ) {
    return undefined;
  }
  return isValidCourseWingTenantId(active.value) ? active.value : undefined;
}

const FROZEN_NOW_CACHE_TTL_MS = 5 * 60_000;
const frozenNowCache = new Map();

function clearCourseWingFrozenNowCache(tenantId) {
  if (tenantId) {
    frozenNowCache.delete(tenantId);
  } else {
    frozenNowCache.clear();
  }
}

/**
 * The demo tenant carries a frozen clock; the tutor's "Today's date" must match it
 * or the model asks for date windows the data can't satisfy. Null for real tenants.
 */
async function getCourseWingCanvasContext(userId) {
  await assertNoPendingCourseWingDisconnect(userId);
  const mappedTenantId = await getCourseWingTenantId(userId);
  let identity;
  try {
    identity = await resolveCourseWingCanvasIdentity(mappedTenantId);
  } catch (error) {
    // A confirmed missing default tenant is normal only when the user had no
    // stored mapping. If a persisted tenant disappeared (and no default can
    // replace it), fail closed so that account never silently uses host time.
    if (
      mappedTenantId == null &&
      error instanceof CanvasTenantStatusError &&
      (error.status === 404 || error.status === 503)
    ) {
      await assertNoPendingCourseWingDisconnect(userId);
      await assertCourseWingTenantUnchanged(userId, mappedTenantId);
      return { identity: null, frozenNow: null };
    }
    throw error;
  }
  const tenantId = identity?.tenantId;
  if (!tenantId) {
    await assertNoPendingCourseWingDisconnect(userId);
    await assertCourseWingTenantUnchanged(userId, mappedTenantId);
    return { identity: null, frozenNow: null };
  }
  const cached = frozenNowCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    await assertNoPendingCourseWingDisconnect(userId);
    await assertCourseWingTenantUnchanged(userId, mappedTenantId);
    return { identity, frozenNow: cached.value };
  }
  const { ok, status, body } = await serviceFetch(`/api/coursewing/tenants/${tenantId}`, {
    headers: { 'X-Tenant-Id': tenantId },
  });
  if (!ok) {
    throw new Error(`Canvas frozen-clock lookup failed with ${status}`);
  }
  let value = null;
  if (body?.frozenNow != null) {
    if (typeof body.frozenNow !== 'string') {
      throw new Error('Canvas service returned an invalid frozen clock');
    }
    const parsed = new Date(body.frozenNow);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('Canvas service returned an invalid frozen clock');
    }
    value = parsed;
  }
  // Do not let an in-flight clock lookup repopulate the cache after a
  // concurrent disconnect has persisted its durable cleanup intent.
  await assertNoPendingCourseWingDisconnect(userId);
  await assertCourseWingTenantUnchanged(userId, mappedTenantId);
  frozenNowCache.set(tenantId, { value, expiresAt: Date.now() + FROZEN_NOW_CACHE_TTL_MS });
  return { identity, frozenNow: value };
}

async function getCourseWingFrozenNow(userId) {
  return (await getCourseWingCanvasContext(userId)).frozenNow;
}

/** Removes Canvas bearer copies left by older CourseWing builds; tenant ids are retained. */
async function purgeLegacyCanvasTokens() {
  const PluginAuth = mongoose.models.PluginAuth;
  if (!PluginAuth) {
    throw new Error('PluginAuth model is not initialized');
  }
  const result = await PluginAuth.deleteMany({
    authField: { $in: [CANVAS_TOKEN_FIELD, LEGACY_CANVAS_TOKEN_FIELD] },
  });
  if (result.deletedCount > 0) {
    logger.info(`[CourseWing] Removed ${result.deletedCount} legacy Canvas token copy/copies`);
  }
}

module.exports = {
  serviceFetch,
  MAX_CANVAS_SERVICE_RESPONSE_BYTES,
  CanvasServiceResponseTooLargeError,
  backfillCourseChats,
  purgeLegacyCanvasTokens,
  getCourseWingTenantId,
  assertNoPendingCourseWingDisconnect,
  acquireCourseWingMutationLease,
  getCourseWingTenantReferenceStatus,
  hasOtherCourseWingTenantReference,
  getCourseWingCanvasContext,
  getCourseWingFrozenNow,
  getCourseWingCanvasIdentity,
  clearCourseWingCanvasIdentityCache,
  selectLegacyCanvasTenantId,
  getOwnedChatSnapshot,
  COURSEWING_PLUGIN_KEY,
  CANVAS_TOKEN_FIELD,
  CANVAS_TENANT_FIELD,
  CANVAS_PENDING_REVOCATION_FIELD,
  LEGACY_CANVAS_TOKEN_FIELD,
  LEGACY_CANVAS_TENANT_FIELD,
};
