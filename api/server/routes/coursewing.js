const express = require('express');
const { isCourseWingEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth, createFeedbackLimiters } = require('~/server/middleware');
const {
  getUserPluginAuthValue,
  updateUserPluginAuth,
  deleteUserPluginAuth,
} = require('~/server/services/PluginService');
const {
  serviceFetch,
  getCourseWingTenantId,
  getCourseWingCanvasIdentity,
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
  'canvasAccountKey',
  'userName',
  'baseUrl',
  'lastSyncAt',
  'syncing',
  'courseCount',
];

async function acquireCanvasMutationLock(userId) {
  const previous = canvasMutationQueues.get(userId);
  let releaseQueue;
  const current = new Promise((resolve) => {
    releaseQueue = resolve;
  });
  canvasMutationQueues.set(userId, current);
  if (previous) {
    await previous;
  }
  return () => {
    releaseQueue();
    if (canvasMutationQueues.get(userId) === current) {
      canvasMutationQueues.delete(userId);
    }
  };
}

router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Authorization');
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

/** 404 (already gone) and 409 (still referenced) are acceptable tenant-deletion outcomes. */
function tenantDeleteFailed(result) {
  return !result.ok && result.status !== 404 && result.status !== 409;
}

/** Best-effort removal of a tenant that was created but never linked to the user. */
async function cleanupUnlinkedTenant(tenantId) {
  try {
    const cleanup = await serviceFetch(`/api/coursewing/tenants/${tenantId}`, {
      method: 'DELETE',
    });
    if (tenantDeleteFailed(cleanup)) {
      logger.error(`[coursewing/canvas] Failed to clean up unlinked Canvas tenant ${tenantId}`);
    }
  } catch (cleanupError) {
    logger.error('[coursewing/canvas] Failed to clean up an unlinked Canvas tenant', cleanupError);
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

async function deleteLocalCanvasAuth(userId) {
  const results = await Promise.all([
    deleteUserPluginAuth(userId, CANVAS_TOKEN_FIELD),
    deleteUserPluginAuth(userId, CANVAS_TENANT_FIELD),
    deleteUserPluginAuth(userId, LEGACY_CANVAS_TOKEN_FIELD),
    deleteUserPluginAuth(userId, LEGACY_CANVAS_TENANT_FIELD),
    deleteUserPluginAuth(userId, CANVAS_PENDING_REVOCATION_FIELD),
  ]);
  results.forEach(throwPluginAuthError);
}

function parsePendingRevocation(value) {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (
      typeof parsed?.tenantId === 'string' &&
      isValidCourseWingTenantId(parsed.tenantId) &&
      typeof parsed?.replacementTenantId === 'string' &&
      isValidCourseWingTenantId(parsed.replacementTenantId)
    ) {
      return parsed;
    }
  } catch {
    // Invalid legacy/internal state is cleared below rather than used as a tenant id.
  }
  return null;
}

async function getPendingRevocation(userId) {
  const value = await getUserPluginAuthValue(
    userId,
    CANVAS_PENDING_REVOCATION_FIELD,
    false,
    COURSEWING_PLUGIN_KEY,
  );
  return parsePendingRevocation(value);
}

async function clearPendingRevocation(userId) {
  throwPluginAuthError(await deleteUserPluginAuth(userId, CANVAS_PENDING_REVOCATION_FIELD));
}

/** Retries a persisted old-tenant cleanup without ever revoking the user's active mapping. */
async function retryPendingRevocation(userId) {
  const raw = await getUserPluginAuthValue(
    userId,
    CANVAS_PENDING_REVOCATION_FIELD,
    false,
    COURSEWING_PLUGIN_KEY,
  );
  if (!raw) {
    return true;
  }
  const pending = parsePendingRevocation(raw);
  const currentTenantId = await getCourseWingTenantId(userId);
  if (!pending || currentTenantId === pending.tenantId) {
    await clearPendingRevocation(userId);
    return true;
  }
  const deletion = await serviceFetch(`/api/coursewing/tenants/${pending.tenantId}`, {
    method: 'DELETE',
  });
  if (tenantDeleteFailed(deletion)) {
    return false;
  }
  clearCourseWingCanvasIdentityCache(pending.tenantId);
  await clearPendingRevocation(userId);
  return true;
}

async function proxyUserCanvasData(req, res, servicePath) {
  const userId = req.user.id;
  const release = await acquireCanvasMutationLock(userId);
  try {
    const identity = await getCourseWingCanvasIdentity(userId);

    const { ok, status, body } = await serviceFetch(servicePath, {
      headers: tenantHeaders(identity.tenantId),
    });
    if (!ok) {
      return res.status(status === 404 ? 409 : 502).json({
        message: status === 404 ? 'Reconnect the Canvas account' : 'Canvas data unavailable',
      });
    }
    return res.json(body);
  } finally {
    release();
  }
}

router.get('/canvas', requireJwtAuth, async (req, res) => {
  const userId = req.user.id;
  const release = await acquireCanvasMutationLock(userId);
  try {
    await retryPendingRevocation(userId);
    const mappedTenantId = await getCourseWingTenantId(userId);
    const identity = await getCourseWingCanvasIdentity(userId);

    const { ok, body } = await serviceFetch('/api/coursewing/tenant', {
      headers: tenantHeaders(identity.tenantId),
    });
    if (!ok) {
      return res.status(502).json({ message: 'Canvas service unavailable' });
    }

    return res.json({
      enabled: true,
      connected: true,
      isDefault: mappedTenantId !== identity.tenantId,
      ...publicCanvasStatus(body),
    });
  } catch (error) {
    logger.error('[coursewing/canvas] Failed to fetch connection status', error);
    return res.status(502).json({ message: 'Canvas service unavailable' });
  } finally {
    release();
  }
});

router.put('/canvas', requireJwtAuth, async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    return res.status(400).json({ message: 'Missing Canvas access token' });
  }

  const release = await acquireCanvasMutationLock(req.user.id);
  try {
    if (!(await retryPendingRevocation(req.user.id))) {
      return res.status(503).json({
        message: 'A previous Canvas connection is still being cleaned up; try again shortly',
      });
    }
    const previousTenantId = await getCourseWingTenantId(req.user.id);
    const { ok, status, body } = await serviceFetch('/api/coursewing/tenants', {
      method: 'POST',
      body: JSON.stringify({ token, baseUrl: req.body?.baseUrl }),
    });

    if (!ok) {
      return res
        .status(status >= 400 && status < 500 ? 400 : 502)
        .json({ message: body?.error ?? 'Canvas rejected the token' });
    }

    const newTenantId = body?.tenantId;
    if (!isValidCourseWingTenantId(newTenantId)) {
      return res.status(502).json({ message: 'Canvas service returned an invalid tenant' });
    }

    const isReplacement = Boolean(previousTenantId && previousTenantId !== newTenantId);
    if (isReplacement) {
      const pendingResult = await updateUserPluginAuth(
        req.user.id,
        CANVAS_PENDING_REVOCATION_FIELD,
        COURSEWING_PLUGIN_KEY,
        JSON.stringify({ tenantId: previousTenantId, replacementTenantId: newTenantId }),
      );
      if (pendingResult instanceof Error) {
        await cleanupUnlinkedTenant(newTenantId);
        throw pendingResult;
      }
    }

    const updateResult = await updateUserPluginAuth(
      req.user.id,
      CANVAS_TENANT_FIELD,
      COURSEWING_PLUGIN_KEY,
      newTenantId,
    );
    if (updateResult instanceof Error) {
      if (isReplacement) {
        try {
          await clearPendingRevocation(req.user.id);
        } catch (pendingError) {
          logger.error(
            '[coursewing/canvas] Failed to clear replacement cleanup marker',
            pendingError,
          );
        }
      }
      if (newTenantId !== previousTenantId) {
        await cleanupUnlinkedTenant(newTenantId);
      }
      throw updateResult;
    }

    const cleanupResults = await Promise.all([
      deleteUserPluginAuth(req.user.id, CANVAS_TOKEN_FIELD),
      deleteUserPluginAuth(req.user.id, LEGACY_CANVAS_TOKEN_FIELD),
      deleteUserPluginAuth(req.user.id, LEGACY_CANVAS_TENANT_FIELD),
    ]);
    cleanupResults.forEach(throwPluginAuthError);

    if (previousTenantId && previousTenantId !== newTenantId) {
      const deletion = await serviceFetch(`/api/coursewing/tenants/${previousTenantId}`, {
        method: 'DELETE',
      });
      if (tenantDeleteFailed(deletion)) {
        logger.error(
          `[coursewing/canvas] Will retry revoking replaced Canvas tenant ${previousTenantId}`,
        );
        return res.json({
          connected: true,
          isDefault: false,
          ...publicCanvasStatus(body),
          warning: 'previous_canvas_cleanup_pending',
        });
      }
      clearCourseWingCanvasIdentityCache(previousTenantId);
      await clearPendingRevocation(req.user.id);
    }

    clearCourseWingCanvasIdentityCache(newTenantId);
    return res.json({ connected: true, isDefault: false, ...publicCanvasStatus(body) });
  } catch (error) {
    logger.error('[coursewing/canvas] Failed to connect Canvas account', error);
    return res.status(502).json({ message: 'Canvas service unavailable' });
  } finally {
    release();
  }
});

router.delete('/canvas', requireJwtAuth, async (req, res) => {
  const release = await acquireCanvasMutationLock(req.user.id);
  try {
    const tenantId = await getCourseWingTenantId(req.user.id);
    const pending = await getPendingRevocation(req.user.id);
    const tenantIds = new Set([tenantId, pending?.tenantId].filter(Boolean));
    for (const id of tenantIds) {
      const deletion = await serviceFetch(`/api/coursewing/tenants/${id}`, {
        method: 'DELETE',
      });
      if (tenantDeleteFailed(deletion)) {
        return res.status(502).json({ message: 'Canvas service could not revoke the connection' });
      }
      clearCourseWingCanvasIdentityCache(id);
    }
    await deleteLocalCanvasAuth(req.user.id);

    const fallback = await serviceFetch('/api/coursewing/tenant');
    if (!fallback.ok) {
      return res.json({ connected: false });
    }
    return res.json({
      connected: true,
      isDefault: true,
      ...publicCanvasStatus(fallback.body),
    });
  } catch (error) {
    logger.error('[coursewing/canvas] Failed to disconnect Canvas account', error);
    return res.status(500).json({ message: 'Failed to disconnect' });
  } finally {
    release();
  }
});

router.get('/courses/current', requireJwtAuth, async (req, res) => {
  try {
    return await proxyUserCanvasData(req, res, '/api/coursewing/courses/current');
  } catch (error) {
    logger.error('[coursewing/courses/current] Failed to fetch courses', error);
    return res.status(502).json({ message: 'Canvas data unavailable' });
  }
});

router.get('/courses/:canvasCourseId', requireJwtAuth, async (req, res) => {
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

      const tenantId = await getCourseWingTenantId(req.user.id);
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
        return res.status(502).json({ message: 'Sending feedback failed' });
      }

      if (shareChat) {
        const feedbackId = created.body?.feedback?.id;
        if (!Number.isSafeInteger(feedbackId) || feedbackId <= 0) {
          return res.status(201).json({
            ...created.body,
            warning: 'chat_share_failed',
            chatShared: false,
          });
        }
        const shared = await serviceFetch('/api/coursewing/feedback', {
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
        if (!shared.ok || shared.body?.updated !== 1) {
          return res.status(201).json({
            ...created.body,
            warning: 'chat_share_failed',
            chatShared: false,
          });
        }
        return res.status(201).json({ ...created.body, ...shared.body });
      }

      return res.status(201).json(created.body);
    } catch (error) {
      logger.error('[coursewing/feedback] Failed to send feedback', error);
      return res.status(502).json({ message: 'Sending feedback failed' });
    }
  },
);

module.exports = router;
