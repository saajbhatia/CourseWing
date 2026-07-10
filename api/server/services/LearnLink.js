const mongoose = require('mongoose');
const { logger } = require('@librechat/data-schemas');
const { getCanvasServiceUrl } = require('@librechat/api');
const { extractCanvasCourseId } = require('librechat-data-provider');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');

const LEARNLINK_PLUGIN_KEY = 'learnlink';
const CANVAS_TOKEN_FIELD = 'LEARNLINK_CANVAS_TOKEN';
const CANVAS_TENANT_FIELD = 'LEARNLINK_CANVAS_TENANT';

/** Returns the user's Canvas tenant id, or null when they haven't connected an account. */
async function getLearnLinkTenantId(userId) {
  if (!userId) {
    return null;
  }
  return (await getUserPluginAuthValue(userId, CANVAS_TENANT_FIELD, false)) || null;
}

async function serviceFetch(path, options = {}) {
  const response = await fetch(`${getCanvasServiceUrl()}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...options.headers },
    signal: AbortSignal.timeout(120_000),
  });
  const body = await response.json().catch(() => ({}));
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
    logger.info(`[LearnLink] Backfilled canvasCourseId on ${ops.length} conversation(s)`);
  }
}

module.exports = {
  serviceFetch,
  backfillCourseChats,
  getLearnLinkTenantId,
  LEARNLINK_PLUGIN_KEY,
  CANVAS_TOKEN_FIELD,
  CANVAS_TENANT_FIELD,
};
