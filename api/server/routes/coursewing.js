const express = require('express');
const jwt = require('jsonwebtoken');
const { parse: parseCookie } = require('cookie');
const { createHmac, randomBytes, timingSafeEqual } = require('crypto');
const { isCourseWingEnabled } = require('@librechat/api');
const { logger, tenantStorage } = require('@librechat/data-schemas');
const { requireJwtAuth, createFeedbackLimiters } = require('~/server/middleware');
const {
  getOptionalUserPluginAuthValue,
  updateUserPluginAuth,
  deleteUserPluginAuth,
} = require('~/server/services/PluginService');
const {
  serviceFetch,
  getCourseWingTenantId,
  acquireCourseWingMutationLease,
  getCourseWingTenantReferenceStatus,
  getCourseWingCanvasIdentity,
  assertNoPendingCourseWingDisconnect,
  clearCourseWingCanvasIdentityCache,
  getOwnedChatSnapshot,
  COURSEWING_PLUGIN_KEY,
  CANVAS_TOKEN_FIELD,
  CANVAS_TENANT_FIELD,
  CANVAS_PENDING_REVOCATION_FIELD,
  LEGACY_CANVAS_TOKEN_FIELD,
  LEGACY_CANVAS_TENANT_FIELD,
} = require('~/server/services/CourseWing');
const { isValidCourseWingTenantId } = require('~/server/services/CourseWingAuth');

const router = express.Router();
const { feedbackIpLimiter, feedbackUserLimiter } = createFeedbackLimiters();
const canvasMutationQueues = new Map();
const FEEDBACK_CATEGORIES = new Set(['bug', 'idea', 'praise', 'other']);
const MAX_FEEDBACK_MESSAGE_BYTES = 50_000;
const MAX_FEEDBACK_USER_NAME_BYTES = 256;
const MAX_FEEDBACK_USER_EMAIL_BYTES = 320;
const MAX_FEEDBACK_REFERENCE_BYTES = 256;
const PUBLIC_CANVAS_STATUS_FIELDS = [
  'provider',
  'canvasAccountKey',
  'userName',
  'baseUrl',
  'lastSyncAt',
  'lastSyncError',
  'frozenNow',
  'syncing',
  'courseCount',
];
const GOOGLE_OAUTH_STATE_PURPOSE = 'coursewing_google_oauth';
const GOOGLE_OAUTH_NONCE_COOKIE = 'coursewing_google_oauth_nonce';
const GOOGLE_OAUTH_NONCE_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_GOOGLE_OAUTH_TENANT_ID_LENGTH = 128;
const MAX_PENDING_DISCONNECT_TENANTS = 4;
const VALID_GOOGLE_OAUTH_TENANT_ID = /^[-a-zA-Z0-9_.]+$/;

function isProtectedCanvasRead(req) {
  const path = req.path.replace(/\/+$/, '').toLowerCase();
  return (
    (req.method === 'GET' || req.method === 'HEAD') &&
    (path === '/canvas' || path === '/courses/current' || /^\/courses\/[^/]+$/.test(path))
  );
}

async function acquireCanvasMutationLock(userId, appTenantId) {
  const previous = canvasMutationQueues.get(userId);
  let releaseQueue;
  const current = new Promise((resolve) => {
    releaseQueue = resolve;
  });
  canvasMutationQueues.set(userId, current);
  if (previous) {
    await previous;
  }
  let releaseLease;
  try {
    releaseLease = await acquireCourseWingMutationLease(courseWingBindingId(userId, appTenantId));
  } catch (error) {
    releaseQueue();
    if (canvasMutationQueues.get(userId) === current) {
      canvasMutationQueues.delete(userId);
    }
    throw error;
  }
  return async () => {
    try {
      await releaseLease();
    } finally {
      releaseQueue();
      if (canvasMutationQueues.get(userId) === current) {
        canvasMutationQueues.delete(userId);
      }
    }
  };
}

async function withCanvasMutationLock(userId, appTenantId, operation) {
  const release = userId ? await acquireCanvasMutationLock(userId, appTenantId) : async () => {};
  try {
    return await operation();
  } finally {
    await release();
  }
}

async function withFeedbackMutationLock(userId, appTenantId, operation) {
  const release = await acquireCanvasMutationLock(userId, appTenantId);
  let result;
  let operationError;
  try {
    result = await operation();
  } catch (error) {
    operationError = error;
  }

  let releaseError;
  try {
    await release();
  } catch (error) {
    releaseError = error;
  }
  if (operationError) {
    throw operationError;
  }
  if (releaseError && result?.status !== 201) {
    throw releaseError;
  }
  if (releaseError) {
    // The non-idempotent service write is already committed. Returning a 502
    // here would invite a retry and duplicate the feedback (and snapshot).
    logger.error(
      '[coursewing/feedback] Mutation lease was lost after feedback committed',
      releaseError,
    );
  }
  return result;
}

function sendJsonResult(res, result) {
  return res.status(result.status ?? 200).json(result.body);
}

router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Authorization');
  next();
});

router.use((req, res, next) =>
  isProtectedCanvasRead(req) ? requireJwtAuth(req, res, next) : next(),
);

router.use((req, res, next) => {
  if (isCourseWingEnabled()) {
    return next();
  }
  if (req.method === 'GET' && req.path === '/canvas') {
    return res.json({ enabled: false, connected: false });
  }
  return res.status(404).json({ message: 'CourseWing is disabled' });
});

function tenantHeaders(tenantId, extra = {}) {
  if (tenantId != null && !isValidCourseWingTenantId(tenantId)) {
    throw new Error('Invalid Canvas tenant id');
  }
  return tenantId ? { 'X-Tenant-Id': tenantId, ...extra } : extra;
}

function courseWingBindingId(userId, appTenantId) {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET is required for a stable CourseWing binding');
  }
  const tenant = normalizeGoogleOAuthTenantId(appTenantId);
  if (!tenant.valid) {
    throw new Error('Invalid app tenant id for CourseWing binding');
  }
  const bindingScope = JSON.stringify({
    version: 1,
    appTenantId: tenant.tenantId ?? '__DEFAULT__',
    userId: String(userId),
  });
  return createHmac('sha256', secret).update(bindingScope).digest('hex');
}

function courseWingTenantCleanupLockId(tenantId) {
  if (!isValidCourseWingTenantId(tenantId)) {
    throw new Error('Invalid Canvas tenant id');
  }
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET is required for CourseWing cleanup locking');
  }
  return createHmac('sha256', secret)
    .update(JSON.stringify({ version: 1, purpose: 'tenant_cleanup', tenantId }))
    .digest('hex');
}

async function withTenantCleanupLocks(tenantIds, operation) {
  const releases = [];
  let result;
  let operationError;
  try {
    for (const tenantId of [...tenantIds].sort()) {
      releases.push(await acquireCourseWingMutationLease(courseWingTenantCleanupLockId(tenantId)));
    }
    result = await operation();
  } catch (error) {
    operationError = error;
  }

  let releaseError;
  for (const release of releases.reverse()) {
    try {
      await release();
    } catch (error) {
      releaseError ??= error;
    }
  }
  if (releaseError) {
    throw releaseError;
  }
  if (operationError) {
    throw operationError;
  }
  return result;
}

/** 404 (already gone) and 409 (protected) are acceptable tenant-deletion outcomes. */
function tenantDeleteFailed(result) {
  return !result.ok && result.status !== 404 && result.status !== 409;
}

/** Deletes a service tenant only after a cross-app-tenant reference scan. */
async function deleteTenantIfUnreferenced(tenantId, excludedUserId, cleanupLockHeld = false) {
  const deleteTenant = async () => {
    const referenceStatus = await getCourseWingTenantReferenceStatus(tenantId, excludedUserId);
    if (referenceStatus === 'referenced') {
      return { ok: false, status: 409, body: { referenced: true } };
    }
    if (referenceStatus === 'indeterminate') {
      return { ok: false, status: 503, body: { indeterminate: true } };
    }
    return serviceFetch(`/api/coursewing/tenants/${tenantId}`, {
      method: 'DELETE',
    });
  };
  return cleanupLockHeld ? deleteTenant() : withTenantCleanupLocks([tenantId], deleteTenant);
}

/** Best-effort removal of a private tenant that was never linked to the user. */
async function cleanupUnlinkedTenant(tenantId, safeToDelete) {
  // Stable binding registrations are private to this app user even when a
  // retry reports isNew=false. Shared tenants (notably demo) are never
  // candidates for rollback deletion.
  if (safeToDelete !== true) {
    return true;
  }
  try {
    const cleanup = await deleteTenantIfUnreferenced(tenantId);
    if (tenantDeleteFailed(cleanup)) {
      logger.error(`[coursewing/canvas] Failed to clean up unlinked Canvas tenant ${tenantId}`);
      return false;
    }
    return true;
  } catch (cleanupError) {
    logger.error('[coursewing/canvas] Failed to clean up an unlinked Canvas tenant', cleanupError);
    return false;
  }
}

function publicCanvasStatus(body) {
  const source = body != null && typeof body === 'object' ? body : {};
  return Object.fromEntries(
    PUBLIC_CANVAS_STATUS_FIELDS.filter((field) => source[field] !== undefined).map((field) => [
      field,
      source[field],
    ]),
  );
}

function optionalFeedbackCategory(value) {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const category = value.trim();
  if (!category) {
    return null;
  }
  return FEEDBACK_CATEGORIES.has(category) ? category : undefined;
}

function trustedBoundedString(values, maxBytes) {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed && Buffer.byteLength(trimmed, 'utf8') <= maxBytes) {
      return trimmed;
    }
  }
  return null;
}

function throwPluginAuthError(result) {
  if (result instanceof Error) {
    throw result;
  }
}

async function deleteLocalCanvasCredentials(userId) {
  const results = await Promise.all([
    deleteUserPluginAuth(userId, CANVAS_TENANT_FIELD),
    deleteLegacyCanvasCredentials(userId),
  ]);
  results.forEach(throwPluginAuthError);
}

async function deleteLegacyCanvasCredentials(userId) {
  const results = await Promise.all([
    deleteUserPluginAuth(userId, CANVAS_TOKEN_FIELD),
    deleteUserPluginAuth(userId, LEGACY_CANVAS_TOKEN_FIELD),
    deleteUserPluginAuth(userId, LEGACY_CANVAS_TENANT_FIELD),
  ]);
  results.forEach(throwPluginAuthError);
}

async function deleteLocalCanvasAuth(userId) {
  await deleteLocalCanvasCredentials(userId);
  await clearPendingRevocation(userId);
}

function parsePendingRevocation(value) {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed?.type === 'disconnect') {
      if (
        Array.isArray(parsed.tenantIds) &&
        parsed.tenantIds.length > 0 &&
        parsed.tenantIds.length <= MAX_PENDING_DISCONNECT_TENANTS &&
        parsed.tenantIds.every(isValidCourseWingTenantId)
      ) {
        return {
          type: 'disconnect',
          tenantIds: [...new Set(parsed.tenantIds)],
        };
      }
      return { type: 'invalid_disconnect' };
    }
    if (parsed?.type === 'unlinked') {
      if (isValidCourseWingTenantId(parsed.tenantId) && parsed.bindingScoped === true) {
        return {
          type: 'unlinked',
          tenantId: parsed.tenantId,
          bindingScoped: true,
        };
      }
      return { type: 'invalid_unlinked' };
    }
    const validReplacement =
      typeof parsed?.tenantId === 'string' &&
      isValidCourseWingTenantId(parsed.tenantId) &&
      typeof parsed?.replacementTenantId === 'string' &&
      isValidCourseWingTenantId(parsed.replacementTenantId);
    if (parsed?.type === 'replacement' && !validReplacement) {
      return { type: 'invalid_replacement' };
    }
    if ((parsed?.type == null || parsed.type === 'replacement') && validReplacement) {
      return {
        type: 'replacement',
        tenantId: parsed.tenantId,
        replacementTenantId: parsed.replacementTenantId,
        replacementTenantWasCreated: parsed.replacementTenantWasCreated === true,
        bindingScoped: parsed.bindingScoped === true,
      };
    }
  } catch {
    // Invalid legacy/internal state is cleared below rather than used as a tenant id.
  }
  return null;
}

function pendingRevocationTenantIds(pending) {
  if (pending?.type === 'disconnect') {
    return pending.tenantIds;
  }
  if (pending?.type === 'replacement') {
    return [
      pending.tenantId,
      ...(pending.bindingScoped || pending.replacementTenantWasCreated
        ? [pending.replacementTenantId]
        : []),
    ];
  }
  if (pending?.type === 'unlinked') {
    return [pending.tenantId];
  }
  return [];
}

async function getPendingRevocation(userId) {
  const value = await getOptionalUserPluginAuthValue(
    userId,
    CANVAS_PENDING_REVOCATION_FIELD,
    COURSEWING_PLUGIN_KEY,
  );
  return parsePendingRevocation(value);
}

async function clearPendingRevocation(userId) {
  throwPluginAuthError(await deleteUserPluginAuth(userId, CANVAS_PENDING_REVOCATION_FIELD));
}

async function completeCanvasDisconnect(userId, tenantIds) {
  return withTenantCleanupLocks(tenantIds, async () => {
    for (const tenantId of tenantIds) {
      const deletion = await deleteTenantIfUnreferenced(tenantId, userId, true);
      if (tenantDeleteFailed(deletion)) {
        return false;
      }
      clearCourseWingCanvasIdentityCache(tenantId);
    }
    // The durable intent is deliberately removed last. If any independent
    // PluginAuth deletion fails or the process exits, the next request retries.
    await deleteLocalCanvasAuth(userId);
    return true;
  });
}

async function completeReplacementCleanup(userId, pending, currentTenantId) {
  const mappingWasCommitted = currentTenantId === pending.replacementTenantId;
  const canDeleteUncommittedReplacement =
    pending.bindingScoped || pending.replacementTenantWasCreated;
  let tenantIds;
  if (mappingWasCommitted) {
    tenantIds = [pending.tenantId];
  } else if (currentTenantId === pending.tenantId) {
    tenantIds = canDeleteUncommittedReplacement ? [pending.replacementTenantId] : [];
  } else {
    tenantIds = [
      pending.tenantId,
      ...(canDeleteUncommittedReplacement ? [pending.replacementTenantId] : []),
    ];
  }
  tenantIds = [...new Set(tenantIds)];

  return withTenantCleanupLocks(tenantIds, async () => {
    if (mappingWasCommitted) {
      await deleteLegacyCanvasCredentials(userId);
    }
    for (const tenantId of tenantIds) {
      const deletion = await deleteTenantIfUnreferenced(tenantId, userId, true);
      if (tenantDeleteFailed(deletion)) {
        return false;
      }
      clearCourseWingCanvasIdentityCache(tenantId);
    }
    await clearPendingRevocation(userId);
    return true;
  });
}

async function completeUnlinkedCleanup(userId, pending) {
  return withTenantCleanupLocks([pending.tenantId], async () => {
    // Do not exclude the current user: an uncertain mapping write may actually
    // have committed. A confirmed reference makes the rollback complete
    // without deleting the now-active tenant.
    const deletion = await deleteTenantIfUnreferenced(pending.tenantId, undefined, true);
    if (tenantDeleteFailed(deletion)) {
      return false;
    }
    clearCourseWingCanvasIdentityCache(pending.tenantId);
    await clearPendingRevocation(userId);
    return true;
  });
}

/** Resumes a persisted replacement cleanup or durable disconnect intent. */
async function retryPendingRevocation(userId) {
  const raw = await getOptionalUserPluginAuthValue(
    userId,
    CANVAS_PENDING_REVOCATION_FIELD,
    COURSEWING_PLUGIN_KEY,
  );
  if (!raw) {
    return true;
  }
  const pending = parsePendingRevocation(raw);
  if (pending?.type === 'disconnect') {
    return completeCanvasDisconnect(userId, pending.tenantIds);
  }
  if (pending?.type === 'unlinked') {
    return completeUnlinkedCleanup(userId, pending);
  }
  if (
    pending?.type === 'invalid_disconnect' ||
    pending?.type === 'invalid_replacement' ||
    pending?.type === 'invalid_unlinked'
  ) {
    return false;
  }
  if (!pending || pending.type !== 'replacement') {
    await clearPendingRevocation(userId);
    return true;
  }
  return completeReplacementCleanup(userId, pending, await getCourseWingTenantId(userId));
}

/**
 * Links a freshly registered tenant to the user, replacing (and revoking) any
 * previous connection. Shared by the Canvas token flow and the Google OAuth
 * callback; the caller must already hold the user's mutation lock.
 */
async function adoptTenant(
  userId,
  previousTenantId,
  newTenantId,
  { newTenantWasCreated = false, bindingScoped = false } = {},
) {
  const isReplacement = Boolean(previousTenantId && previousTenantId !== newTenantId);
  const canDeleteUnlinkedTenant = bindingScoped || newTenantWasCreated;
  const replacementIntent = JSON.stringify({
    type: 'replacement',
    tenantId: previousTenantId,
    replacementTenantId: newTenantId,
    replacementTenantWasCreated: newTenantWasCreated === true,
    bindingScoped: bindingScoped === true,
  });
  if (isReplacement) {
    const pendingResult = await updateUserPluginAuth(
      userId,
      CANVAS_PENDING_REVOCATION_FIELD,
      COURSEWING_PLUGIN_KEY,
      replacementIntent,
    );
    if (pendingResult instanceof Error) {
      const cleanupComplete = await cleanupUnlinkedTenant(newTenantId, canDeleteUnlinkedTenant);
      if (!cleanupComplete) {
        const recoveryResult = await updateUserPluginAuth(
          userId,
          CANVAS_PENDING_REVOCATION_FIELD,
          COURSEWING_PLUGIN_KEY,
          replacementIntent,
        );
        if (recoveryResult instanceof Error) {
          logger.error(
            '[coursewing/canvas] Could not persist replacement cleanup after rollback failed',
            recoveryResult,
          );
          // A second compensating attempt closes the gap when durable storage
          // remains unavailable but the service deletion has recovered.
          await cleanupUnlinkedTenant(newTenantId, canDeleteUnlinkedTenant);
        }
      }
      throw pendingResult;
    }
  }

  const updateResult = await updateUserPluginAuth(
    userId,
    CANVAS_TENANT_FIELD,
    COURSEWING_PLUGIN_KEY,
    newTenantId,
  );
  if (updateResult instanceof Error) {
    let observedTenantId;
    try {
      observedTenantId = await getCourseWingTenantId(userId);
    } catch (readError) {
      logger.error(
        '[coursewing/canvas] Failed to resolve an uncertain Canvas mapping update',
        readError,
      );
      throw updateResult;
    }
    if (observedTenantId === newTenantId) {
      logger.warn('[coursewing/canvas] Canvas mapping write succeeded despite an update error');
    } else if (isReplacement) {
      const cleanupComplete = await completeReplacementCleanup(
        userId,
        {
          type: 'replacement',
          tenantId: previousTenantId,
          replacementTenantId: newTenantId,
          replacementTenantWasCreated: newTenantWasCreated === true,
          bindingScoped: bindingScoped === true,
        },
        observedTenantId,
      );
      if (!cleanupComplete) {
        logger.error(
          `[coursewing/canvas] Will retry cleaning up unlinked replacement tenant ${newTenantId}`,
        );
      }
      throw updateResult;
    } else if (newTenantId !== previousTenantId) {
      const cleanupComplete = await cleanupUnlinkedTenant(newTenantId, canDeleteUnlinkedTenant);
      if (!cleanupComplete && canDeleteUnlinkedTenant) {
        const recoveryResult = await updateUserPluginAuth(
          userId,
          CANVAS_PENDING_REVOCATION_FIELD,
          COURSEWING_PLUGIN_KEY,
          JSON.stringify({
            type: 'unlinked',
            tenantId: newTenantId,
            bindingScoped: true,
          }),
        );
        if (recoveryResult instanceof Error) {
          logger.error(
            '[coursewing/canvas] Could not persist cleanup for an unlinked Canvas tenant',
            recoveryResult,
          );
          await cleanupUnlinkedTenant(newTenantId, canDeleteUnlinkedTenant);
        }
      }
      throw updateResult;
    } else {
      throw updateResult;
    }
  }

  await deleteLegacyCanvasCredentials(userId);

  if (previousTenantId && previousTenantId !== newTenantId) {
    const deletion = await deleteTenantIfUnreferenced(previousTenantId, userId);
    if (tenantDeleteFailed(deletion)) {
      logger.error(
        `[coursewing/canvas] Will retry revoking replaced Canvas tenant ${previousTenantId}`,
      );
      return { warning: 'previous_canvas_cleanup_pending' };
    }
    clearCourseWingCanvasIdentityCache(previousTenantId);
    await clearPendingRevocation(userId);
  }

  clearCourseWingCanvasIdentityCache(newTenantId);
  return {};
}

async function proxyUserCanvasData(req, res, servicePath) {
  const userId = req.user?.id;
  const result = await withCanvasMutationLock(userId, req.user?.tenantId, async () => {
    if (userId && !(await retryPendingRevocation(userId))) {
      return {
        status: 503,
        body: {
          message: 'A previous Canvas connection is still being cleaned up; try again shortly',
        },
      };
    }
    const identity = await getCourseWingCanvasIdentity(userId);

    const { ok, status, body } = await serviceFetch(servicePath, {
      headers: tenantHeaders(identity.tenantId),
    });
    if (!ok) {
      return {
        status: status === 404 ? 409 : 502,
        body: {
          message: status === 404 ? 'Reconnect the Canvas account' : 'Canvas data unavailable',
        },
      };
    }
    return { body };
  });
  return sendJsonResult(res, result);
}

router.get('/canvas', async (req, res) => {
  const userId = req.user?.id;
  try {
    const result = await withCanvasMutationLock(userId, req.user?.tenantId, async () => {
      if (userId && !(await retryPendingRevocation(userId))) {
        return {
          status: 503,
          body: {
            message: 'A previous Canvas connection is still being cleaned up; try again shortly',
          },
        };
      }
      const mappedTenantId = userId ? await getCourseWingTenantId(userId) : null;
      let identity;
      try {
        identity = await getCourseWingCanvasIdentity(userId);
      } catch (error) {
        // No personal mapping and no server default: offer the connect form
        // instead of an error (Google-Classroom-only deployments have no default).
        if (!mappedTenantId) {
          return { body: { enabled: true, connected: false } };
        }
        throw error;
      }

      const { ok, body } = await serviceFetch('/api/coursewing/tenant', {
        headers: tenantHeaders(identity.tenantId),
      });
      if (!ok) {
        return { status: 502, body: { message: 'Canvas service unavailable' } };
      }

      return {
        body: {
          enabled: true,
          connected: true,
          isDefault: mappedTenantId !== identity.tenantId,
          ...publicCanvasStatus(body),
        },
      };
    });
    return sendJsonResult(res, result);
  } catch (error) {
    logger.error('[coursewing/canvas] Failed to fetch connection status', error);
    return res.status(502).json({ message: 'Canvas service unavailable' });
  }
});

router.put('/canvas', requireJwtAuth, async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    return res.status(400).json({ message: 'Missing Canvas access token' });
  }

  try {
    const result = await withCanvasMutationLock(req.user.id, req.user.tenantId, async () => {
      if (!(await retryPendingRevocation(req.user.id))) {
        return {
          status: 503,
          body: {
            message: 'A previous Canvas connection is still being cleaned up; try again shortly',
          },
        };
      }
      const previousTenantId = await getCourseWingTenantId(req.user.id);
      const { ok, status, body } = await serviceFetch('/api/coursewing/tenants', {
        method: 'POST',
        body: JSON.stringify({
          token,
          baseUrl: req.body?.baseUrl,
          bindingId: courseWingBindingId(req.user.id, req.user.tenantId),
        }),
      });

      if (!ok) {
        return {
          status: status >= 400 && status < 500 ? 400 : 502,
          body: { message: body?.error ?? 'Canvas rejected the token' },
        };
      }

      const newTenantId = body?.tenantId;
      if (!isValidCourseWingTenantId(newTenantId)) {
        return {
          status: 502,
          body: { message: 'Canvas service returned an invalid tenant' },
        };
      }

      const { warning } = await adoptTenant(req.user.id, previousTenantId, newTenantId, {
        newTenantWasCreated: body?.isNew === true,
        bindingScoped: true,
      });
      return {
        body: {
          connected: true,
          isDefault: false,
          ...publicCanvasStatus(body),
          ...(warning ? { warning } : {}),
        },
      };
    });
    return sendJsonResult(res, result);
  } catch (error) {
    logger.error('[coursewing/canvas] Failed to connect Canvas account', error);
    return res.status(502).json({ message: 'Canvas service unavailable' });
  }
});

/**
 * Maps the user onto the shared, frozen, PII-scrubbed demo tenant so "skip"
 * still shows a fully-populated product. The tenant itself is never deleted —
 * the service no-ops deletion for demo tenants — so switching to a real
 * account later only moves the mapping.
 */
router.post('/demo', requireJwtAuth, async (req, res) => {
  const demoTenantId = process.env.COURSEWING_DEMO_TENANT_ID?.trim();
  if (!isValidCourseWingTenantId(demoTenantId)) {
    return res.status(404).json({ message: 'Demo data is not available on this server' });
  }

  try {
    const result = await withCanvasMutationLock(req.user.id, req.user.tenantId, async () => {
      if (!(await retryPendingRevocation(req.user.id))) {
        return {
          status: 503,
          body: {
            message: 'A previous Canvas connection is still being cleaned up; try again shortly',
          },
        };
      }
      const { ok, body } = await serviceFetch(`/api/coursewing/tenants/${demoTenantId}`);
      if (!ok || body?.tenantId !== demoTenantId) {
        return { status: 502, body: { message: 'Demo data is unavailable' } };
      }

      const previousTenantId = await getCourseWingTenantId(req.user.id);
      const { warning } = await adoptTenant(req.user.id, previousTenantId, demoTenantId);
      return {
        body: {
          connected: true,
          isDefault: false,
          demo: true,
          ...publicCanvasStatus(body),
          ...(warning ? { warning } : {}),
        },
      };
    });
    return sendJsonResult(res, result);
  } catch (error) {
    logger.error('[coursewing/demo] Failed to attach the demo tenant', error);
    return res.status(502).json({ message: 'Demo data is unavailable' });
  }
});

function httpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      return null;
    }
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

/**
 * Returns the configured client base, including any deployment subpath.
 * The request Origin and Referer are deliberately ignored because both are
 * attacker-controlled inputs to this OAuth flow.
 */
function courseWingAppBase() {
  const client = httpUrl(process.env.DOMAIN_CLIENT);
  if (client) {
    return client;
  }

  const configuredServer = httpUrl(process.env.DOMAIN_SERVER);
  if (configuredServer) {
    return new URL(configuredServer.origin);
  }

  return null;
}

function courseWingPath(pathname, searchParams) {
  const path = `/${pathname.replace(/^\/+/, '')}`;
  const query = new URLSearchParams(searchParams ?? {}).toString();
  return query ? `${path}?${query}` : path;
}

function courseWingAppUrl(pathname, searchParams) {
  const url = courseWingAppBase();
  if (!url) {
    return null;
  }
  const basePath = url.pathname.replace(/\/+$/, '');
  url.pathname = `${basePath}/${pathname.replace(/^\/+/, '')}`;
  url.search = '';
  url.hash = '';
  for (const [name, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(name, value);
  }
  return url.toString();
}

function googleRedirectUri() {
  return courseWingAppUrl('/api/coursewing/google/callback');
}

function googleOAuthNonceCookieOptions() {
  const appBase = courseWingAppBase();
  const basePath = appBase?.pathname.replace(/\/+$/, '') ?? '';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: appBase?.protocol === 'https:',
    path: `${basePath}/api/coursewing/google`,
  };
}

function requestGoogleOAuthNonce(req) {
  try {
    return parseCookie(req.get('cookie') ?? '')[GOOGLE_OAUTH_NONCE_COOKIE] ?? '';
  } catch {
    return '';
  }
}

function googleOAuthNonceMatches(stateNonce, cookieNonce) {
  if (typeof stateNonce !== 'string' || typeof cookieNonce !== 'string') {
    return false;
  }
  const state = Buffer.from(stateNonce, 'utf8');
  const cookie = Buffer.from(cookieNonce, 'utf8');
  return state.length === cookie.length && state.length > 0 && timingSafeEqual(state, cookie);
}

function normalizeGoogleOAuthTenantId(value) {
  if (value == null) {
    return { valid: true, tenantId: undefined };
  }
  if (typeof value !== 'string') {
    return { valid: false };
  }
  const tenantId = value.trim();
  if (
    !tenantId ||
    tenantId.length > MAX_GOOGLE_OAUTH_TENANT_ID_LENGTH ||
    !VALID_GOOGLE_OAUTH_TENANT_ID.test(tenantId)
  ) {
    return { valid: false };
  }
  return { valid: true, tenantId };
}

const SCHOOL_SEARCH_URL = 'https://sso.canvaslms.com/api/v1/accounts/search';
const MAX_SCHOOL_RESULTS = 12;

/** Proxies Instructure's public school directory so students can find their Canvas domain by name. */
router.get('/schools', requireJwtAuth, async (req, res) => {
  const query = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
  if (query.length < 3) {
    return res.json([]);
  }
  try {
    const response = await fetch(`${SCHOOL_SEARCH_URL}?name=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return res.status(502).json({ message: 'School search is unavailable' });
    }
    const body = await response.json();
    const schools = (Array.isArray(body) ? body : [])
      .filter((school) => typeof school?.name === 'string' && typeof school?.domain === 'string')
      .slice(0, MAX_SCHOOL_RESULTS)
      .map((school) => ({ id: school.id, name: school.name, domain: school.domain }));
    return res.json(schools);
  } catch (error) {
    logger.warn(`[coursewing/schools] Search failed: ${error?.message ?? error}`);
    return res.status(502).json({ message: 'School search is unavailable' });
  }
});

router.get('/google/auth-url', requireJwtAuth, async (req, res) => {
  try {
    const redirectUri = googleRedirectUri();
    if (!redirectUri) {
      return res.status(503).json({
        message: 'Google Classroom OAuth requires a valid DOMAIN_CLIENT or DOMAIN_SERVER',
      });
    }
    const tenant = normalizeGoogleOAuthTenantId(req.user?.tenantId);
    if (!tenant.valid) {
      return res.status(400).json({ message: 'Invalid tenant context' });
    }
    const nonce = randomBytes(32).toString('base64url');
    const state = jwt.sign(
      {
        sub: req.user.id,
        purpose: GOOGLE_OAUTH_STATE_PURPOSE,
        nonce,
        tenantId: tenant.tenantId ?? null,
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' },
    );
    const { ok, status, body } = await serviceFetch(
      `/api/coursewing/google/auth-url?redirectUri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`,
    );
    if (!ok) {
      return res.status(status === 503 ? 503 : 502).json({
        message: body?.error ?? 'Google Classroom is unavailable',
      });
    }
    res.cookie(GOOGLE_OAUTH_NONCE_COOKIE, nonce, {
      ...googleOAuthNonceCookieOptions(),
      maxAge: GOOGLE_OAUTH_NONCE_MAX_AGE_MS,
    });
    return res.json({ url: body?.url });
  } catch (error) {
    logger.error('[coursewing/google] Failed to build the consent URL', error);
    return res.status(502).json({ message: 'Google Classroom is unavailable' });
  }
});

/** Browser-facing OAuth callback: verifies the signed state, links the tenant, returns to the app. */
router.get('/google/callback', async (req, res) => {
  let userId;
  let tenantId;
  const cookieNonce = requestGoogleOAuthNonce(req);
  res.clearCookie(GOOGLE_OAUTH_NONCE_COOKIE, googleOAuthNonceCookieOptions());
  try {
    const payload = jwt.verify(String(req.query?.state ?? ''), process.env.JWT_SECRET);
    const tenant =
      payload &&
      typeof payload === 'object' &&
      Object.prototype.hasOwnProperty.call(payload, 'tenantId')
        ? normalizeGoogleOAuthTenantId(payload.tenantId)
        : { valid: false };
    if (
      payload?.purpose !== GOOGLE_OAUTH_STATE_PURPOSE ||
      typeof payload?.sub !== 'string' ||
      !tenant.valid ||
      !googleOAuthNonceMatches(payload?.nonce, cookieNonce)
    ) {
      throw new Error('Unexpected state payload');
    }
    userId = payload.sub;
    tenantId = tenant.tenantId;
  } catch {
    userId = undefined;
    tenantId = undefined;
  }
  const finish = (outcome) =>
    res.redirect(
      courseWingAppUrl('/c/new', { classroom: outcome }) ??
        courseWingPath('/c/new', { classroom: outcome }),
    );
  if (typeof req.query?.error === 'string' && req.query.error) {
    return finish(userId ? 'denied' : 'invalid');
  }
  const code = typeof req.query?.code === 'string' ? req.query.code : '';
  if (!code || !userId) {
    return finish('invalid');
  }
  const redirectUri = googleRedirectUri();
  if (!redirectUri) {
    logger.error(
      '[coursewing/google] Cannot complete OAuth without a valid DOMAIN_CLIENT or DOMAIN_SERVER',
    );
    return finish('error');
  }

  return tenantStorage.run({ tenantId, userId }, async () => {
    try {
      const outcome = await withCanvasMutationLock(userId, tenantId, async () => {
        if (!(await retryPendingRevocation(userId))) {
          return 'retry';
        }
        const previousTenantId = await getCourseWingTenantId(userId);
        const { ok, body } = await serviceFetch('/api/coursewing/tenants/google', {
          method: 'POST',
          body: JSON.stringify({
            code,
            redirectUri,
            bindingId: courseWingBindingId(userId, tenantId),
          }),
        });
        if (!ok || !isValidCourseWingTenantId(body?.tenantId)) {
          logger.error(
            `[coursewing/google] Tenant registration failed: ${body?.error ?? 'invalid response'}`,
          );
          return 'error';
        }
        const { warning } = await adoptTenant(userId, previousTenantId, body.tenantId, {
          newTenantWasCreated: body?.isNew === true,
          bindingScoped: true,
        });
        return warning ? 'connected_pending_cleanup' : 'connected';
      });
      return finish(outcome);
    } catch (error) {
      logger.error('[coursewing/google] Failed to complete the Google Classroom connection', error);
      return finish('error');
    }
  });
});

router.delete('/canvas', requireJwtAuth, async (req, res) => {
  try {
    const result = await withCanvasMutationLock(req.user.id, req.user.tenantId, async () => {
      let tenantId = await getCourseWingTenantId(req.user.id);
      let pending = await getPendingRevocation(req.user.id);
      if (pending?.type === 'unlinked') {
        if (!(await completeUnlinkedCleanup(req.user.id, pending))) {
          return {
            status: 503,
            body: {
              message: 'A previous Canvas connection is still being cleaned up; try again shortly',
            },
          };
        }
        // The reference scan may have discovered that an uncertain mapping
        // write actually committed. Re-read it so this explicit disconnect
        // revokes that service tenant instead of deleting only the local row.
        tenantId = await getCourseWingTenantId(req.user.id);
        pending = null;
      }
      if (
        pending?.type === 'invalid_disconnect' ||
        pending?.type === 'invalid_replacement' ||
        pending?.type === 'invalid_unlinked'
      ) {
        return {
          status: 503,
          body: {
            message: 'A previous Canvas connection is still being cleaned up; try again shortly',
          },
        };
      }
      // A failed stale-tenant cleanup must leave the active tenant intact and
      // locally mapped, so the active tenant is always revoked last.
      const pendingTenantIds = pendingRevocationTenantIds(pending);
      const tenantIds = [
        ...new Set([
          ...pendingTenantIds.filter((pendingTenantId) => pendingTenantId !== tenantId),
          tenantId,
        ]),
      ].filter(Boolean);
      if (tenantIds.length > 0) {
        throwPluginAuthError(
          await updateUserPluginAuth(
            req.user.id,
            CANVAS_PENDING_REVOCATION_FIELD,
            COURSEWING_PLUGIN_KEY,
            JSON.stringify({ type: 'disconnect', tenantIds }),
          ),
        );
      }
      if (!(await completeCanvasDisconnect(req.user.id, tenantIds))) {
        return {
          status: 502,
          body: { message: 'Canvas service could not revoke the connection' },
        };
      }

      const fallback = await serviceFetch('/api/coursewing/tenant');
      if (!fallback.ok) {
        return { body: { connected: false } };
      }
      return {
        body: {
          connected: true,
          isDefault: true,
          ...publicCanvasStatus(fallback.body),
        },
      };
    });
    return sendJsonResult(res, result);
  } catch (error) {
    logger.error('[coursewing/canvas] Failed to disconnect Canvas account', error);
    return res.status(500).json({ message: 'Failed to disconnect' });
  }
});

router.get('/courses/current', async (req, res) => {
  try {
    return await proxyUserCanvasData(req, res, '/api/coursewing/courses/current');
  } catch (error) {
    logger.error('[coursewing/courses/current] Failed to fetch courses', error);
    return res.status(502).json({ message: 'Canvas data unavailable' });
  }
});

router.get('/courses/:canvasCourseId', async (req, res) => {
  const canvasCourseId = Number(req.params.canvasCourseId);
  if (!Number.isSafeInteger(canvasCourseId) || canvasCourseId <= 0) {
    return res.status(400).json({ message: 'canvasCourseId must be a positive integer' });
  }
  try {
    return await proxyUserCanvasData(req, res, `/api/coursewing/courses/${canvasCourseId}`);
  } catch (error) {
    logger.error('[coursewing/courses/:canvasCourseId] Failed to fetch course materials', error);
    return res.status(502).json({ message: 'Canvas data unavailable' });
  }
});

router.post(
  '/feedback',
  requireJwtAuth,
  feedbackIpLimiter,
  feedbackUserLimiter,
  async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const category = optionalFeedbackCategory(req.body?.category);
    const shareChat = req.body?.shareChat === true;
    const conversationId =
      typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
    const targetMessageId =
      typeof req.body?.targetMessageId === 'string' ? req.body.targetMessageId.trim() : '';

    if (!message) {
      return res.status(400).json({ message: 'Feedback message is required' });
    }
    if (Buffer.byteLength(message, 'utf8') > MAX_FEEDBACK_MESSAGE_BYTES) {
      return res.status(413).json({ message: 'Feedback message is too large' });
    }
    if (category === undefined) {
      return res.status(400).json({
        message: 'Feedback category must be one of: bug, idea, praise, other',
      });
    }
    if (shareChat && (!conversationId || !targetMessageId)) {
      return res.status(400).json({
        message: 'A conversation and visible target message are required to share chat context',
      });
    }
    if (
      shareChat &&
      (Buffer.byteLength(conversationId, 'utf8') > MAX_FEEDBACK_REFERENCE_BYTES ||
        Buffer.byteLength(targetMessageId, 'utf8') > MAX_FEEDBACK_REFERENCE_BYTES)
    ) {
      return res.status(413).json({ message: 'Feedback conversation reference is too large' });
    }

    try {
      let chatSnapshot = null;
      if (shareChat) {
        chatSnapshot = await getOwnedChatSnapshot(req.user.id, conversationId, targetMessageId);
        if (!chatSnapshot) {
          return res.status(404).json({ message: 'Conversation not found' });
        }
      }

      const result = await withFeedbackMutationLock(req.user.id, req.user.tenantId, async () => {
        await assertNoPendingCourseWingDisconnect(req.user.id);
        const tenantId = await getCourseWingTenantId(req.user.id);
        await assertNoPendingCourseWingDisconnect(req.user.id);
        const trustedBody = {
          message,
          category,
          conversationId: shareChat ? conversationId : null,
          userName: trustedBoundedString(
            [req.user.name, req.user.username],
            MAX_FEEDBACK_USER_NAME_BYTES,
          ),
          userEmail: trustedBoundedString([req.user.email], MAX_FEEDBACK_USER_EMAIL_BYTES),
        };
        const created = await serviceFetch('/api/coursewing/feedback', {
          method: 'POST',
          headers: tenantHeaders(tenantId),
          body: JSON.stringify(trustedBody),
        });
        if (!created.ok) {
          return { status: 502, body: { message: 'Sending feedback failed' } };
        }

        if (shareChat) {
          const feedbackId = created.body?.feedback?.id;
          if (!Number.isSafeInteger(feedbackId) || feedbackId <= 0) {
            return {
              status: 201,
              body: {
                ...created.body,
                warning: 'chat_share_failed',
                chatShared: false,
              },
            };
          }
          let shared;
          try {
            shared = await serviceFetch('/api/coursewing/feedback', {
              method: 'POST',
              headers: tenantHeaders(tenantId, {
                'X-CourseWing-Chat-Share-Consent': 'explicit',
              }),
              body: JSON.stringify({
                feedbackId,
                conversationId,
                targetMessageId,
                shareChat: true,
                chatSnapshot,
              }),
            });
          } catch (error) {
            logger.error(
              '[coursewing/feedback] Feedback was created but chat sharing failed',
              error,
            );
            return {
              status: 201,
              body: {
                ...created.body,
                warning: 'chat_share_failed',
                chatShared: false,
              },
            };
          }
          if (!shared.ok || shared.body?.updated !== 1) {
            return {
              status: 201,
              body: {
                ...created.body,
                warning: 'chat_share_failed',
                chatShared: false,
              },
            };
          }
          return { status: 201, body: { ...created.body, ...shared.body } };
        }

        return { status: 201, body: created.body };
      });
      return sendJsonResult(res, result);
    } catch (error) {
      logger.error('[coursewing/feedback] Failed to send feedback', error);
      return res.status(502).json({ message: 'Sending feedback failed' });
    }
  },
);

router.use(require('./teacher'));

module.exports = router;
