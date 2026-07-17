const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const {
  decrypt,
  getCanvasServiceUrl,
  readBoundedJson,
  MAX_CANVAS_SERVICE_RESPONSE_BYTES,
  CanvasServiceResponseTooLargeError,
} = require('@librechat/api');
const { Constants, extractCanvasCourseId } = require('librechat-data-provider');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');
const {
  LEARNLIGHT_PLUGIN_KEY,
  LEGACY_LEARNLIGHT_PLUGIN_KEY,
  CANVAS_TOKEN_FIELD,
  CANVAS_TENANT_FIELD,
  CANVAS_PENDING_REVOCATION_FIELD,
  LEGACY_CANVAS_TOKEN_FIELD,
  LEGACY_CANVAS_TENANT_FIELD,
  isValidLearnLightTenantId,
} = require('~/server/services/LearnLightAuth');
const MAX_SHARED_CHAT_MESSAGES = 250;
const MAX_SHARED_CHAT_NODES = 500;
const MAX_SHARED_CHAT_JSON_BYTES = 800_000;
const MAX_SHARED_MESSAGE_BYTES = 50_000;
const MAX_SHARED_TITLE_BYTES = 5_000;
const MAX_SHARED_SENDER_BYTES = 500;
const CANVAS_IDENTITY_CACHE_TTL_MS = 60_000;
const DEFAULT_CANVAS_IDENTITY_CACHE_KEY = '__default__';
const canvasIdentityCache = new Map();

/** Returns the user's Canvas tenant id, or null when they haven't connected an account. */
async function getLearnLightTenantId(userId) {
  if (!userId) {
    return null;
  }
  const current = await getUserPluginAuthValue(
    userId,
    CANVAS_TENANT_FIELD,
    false,
    LEARNLIGHT_PLUGIN_KEY,
  );
  if (isValidLearnLightTenantId(current)) {
    return current;
  }
  const legacy = await getUserPluginAuthValue(
    userId,
    LEGACY_CANVAS_TENANT_FIELD,
    false,
    LEGACY_LEARNLIGHT_PLUGIN_KEY,
  );
  if (isValidLearnLightTenantId(legacy)) {
    return legacy;
  }
  if (current != null || legacy != null) {
    logger.warn('[LearnLight] Ignoring an invalid stored Canvas tenant id');
  }
  return null;
}

/** Resolves one explicit tenant or the environment-backed default without exposing a bearer. */
async function resolveLearnLightCanvasIdentity(requestedTenantId, allowDefaultFallback = true) {
  const cacheKey = requestedTenantId ?? DEFAULT_CANVAS_IDENTITY_CACHE_KEY;
  const cached = canvasIdentityCache.get(cacheKey);
  if (cached?.expiresAt > Date.now()) {
    return { tenantId: cached.tenantId, canvasAccountKey: cached.canvasAccountKey };
  }

  const status = await serviceFetch('/api/learnlight/tenant', {
    headers: requestedTenantId ? { 'X-Tenant-Id': requestedTenantId } : {},
  });
  if (!status.ok) {
    if (requestedTenantId && status.status === 404 && allowDefaultFallback) {
      return resolveLearnLightCanvasIdentity(null);
    }
    throw new Error(`Canvas tenant status failed with ${status.status}`);
  }
  const tenantId = status.body?.tenantId;
  if (!isValidLearnLightTenantId(tenantId)) {
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
async function getLearnLightCanvasIdentity(userId) {
  return resolveLearnLightCanvasIdentity(await getLearnLightTenantId(userId));
}

function clearLearnLightCanvasIdentityCache(tenantId) {
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
  const serviceKey = process.env.LEARNLIGHT_SERVICE_KEY?.trim();
  if (!serviceKey) {
    throw new Error('LEARNLIGHT_SERVICE_KEY is required for Canvas service requests');
  }
  const response = await fetch(`${getCanvasServiceUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-LearnLight-Service-Key': serviceKey,
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
    logger.info(`[LearnLight] Backfilled canvasCourseId on ${ops.length} conversation(s)`);
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
        `[LearnLight] Could not decrypt a legacy Canvas mapping during chat-scope backfill: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      continue;
    }
    if (!isValidLearnLightTenantId(tenantId) || typeof mapping.userId !== 'string') {
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
      identityPromises.set(key, resolveLearnLightCanvasIdentity(tenantId, false));
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
        `[LearnLight] Could not resolve a historical Canvas account while backfilling chat scope: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (scopeOps.length > 0) {
    await Conversation.bulkWrite(scopeOps);
    logger.info(
      `[LearnLight] Backfilled Canvas account scope on ${scopeOps.length} conversation(s)`,
    );
  }
  if (ambiguous > 0 || unavailable > 0) {
    logger.warn(
      `[LearnLight] Left ${ambiguous + unavailable} legacy course chat(s) unbound ` +
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
  return isValidLearnLightTenantId(active.value) ? active.value : undefined;
}

/** Removes Canvas bearer copies left by older LearnLight builds; tenant ids are retained. */
async function purgeLegacyCanvasTokens() {
  const PluginAuth = mongoose.models.PluginAuth;
  if (!PluginAuth) {
    throw new Error('PluginAuth model is not initialized');
  }
  const result = await PluginAuth.deleteMany({
    authField: { $in: [CANVAS_TOKEN_FIELD, LEGACY_CANVAS_TOKEN_FIELD] },
  });
  if (result.deletedCount > 0) {
    logger.info(`[LearnLight] Removed ${result.deletedCount} legacy Canvas token copy/copies`);
  }
}

module.exports = {
  serviceFetch,
  MAX_CANVAS_SERVICE_RESPONSE_BYTES,
  CanvasServiceResponseTooLargeError,
  backfillCourseChats,
  purgeLegacyCanvasTokens,
  getLearnLightTenantId,
  getLearnLightCanvasIdentity,
  clearLearnLightCanvasIdentityCache,
  selectLegacyCanvasTenantId,
  getOwnedChatSnapshot,
  LEARNLIGHT_PLUGIN_KEY,
  CANVAS_TOKEN_FIELD,
  CANVAS_TENANT_FIELD,
  CANVAS_PENDING_REVOCATION_FIELD,
  LEGACY_CANVAS_TOKEN_FIELD,
  LEGACY_CANVAS_TENANT_FIELD,
};
