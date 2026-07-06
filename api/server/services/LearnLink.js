const { getCanvasServiceUrl } = require('@librechat/api');
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

module.exports = {
  serviceFetch,
  getLearnLinkTenantId,
  LEARNLINK_PLUGIN_KEY,
  CANVAS_TOKEN_FIELD,
  CANVAS_TENANT_FIELD,
};
