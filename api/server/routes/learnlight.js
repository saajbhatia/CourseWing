const express = require('express');
const { logger } = require('@librechat/data-schemas');
const { requireJwtAuth } = require('~/server/middleware');
const { updateUserPluginAuth, deleteUserPluginAuth } = require('~/server/services/PluginService');
const {
  serviceFetch,
  getLearnLightTenantId,
  LEARNLIGHT_PLUGIN_KEY,
  CANVAS_TOKEN_FIELD,
  CANVAS_TENANT_FIELD,
  LEGACY_CANVAS_TOKEN_FIELD,
  LEGACY_CANVAS_TENANT_FIELD,
} = require('~/server/services/LearnLight');

const router = express.Router();
router.use(requireJwtAuth);

router.get('/canvas', async (req, res) => {
  try {
    const tenantId = await getLearnLightTenantId(req.user.id);
    if (!tenantId) {
      return res.json({ connected: false });
    }

    const { ok, body } = await serviceFetch(`/api/learnlight/tenants/${tenantId}`);
    if (!ok) {
      return res.json({ connected: false, stale: true });
    }

    return res.json({ connected: true, ...body });
  } catch (error) {
    logger.error('[learnlight/canvas] Failed to fetch connection status', error);
    return res.status(502).json({ message: 'Canvas service unavailable' });
  }
});

router.put('/canvas', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    return res.status(400).json({ message: 'Missing Canvas access token' });
  }

  try {
    const { ok, status, body } = await serviceFetch('/api/learnlight/tenants', {
      method: 'POST',
      body: JSON.stringify({ token, baseUrl: req.body?.baseUrl }),
    });

    if (!ok) {
      return res
        .status(status >= 400 && status < 500 ? 400 : 502)
        .json({ message: body?.error ?? 'Canvas rejected the token' });
    }

    await updateUserPluginAuth(req.user.id, CANVAS_TOKEN_FIELD, LEARNLIGHT_PLUGIN_KEY, token);
    await updateUserPluginAuth(
      req.user.id,
      CANVAS_TENANT_FIELD,
      LEARNLIGHT_PLUGIN_KEY,
      body.tenantId,
    );

    return res.json({ connected: true, ...body });
  } catch (error) {
    logger.error('[learnlight/canvas] Failed to connect Canvas account', error);
    return res.status(502).json({ message: 'Canvas service unavailable' });
  }
});

router.delete('/canvas', async (req, res) => {
  try {
    await deleteUserPluginAuth(req.user.id, CANVAS_TOKEN_FIELD);
    await deleteUserPluginAuth(req.user.id, CANVAS_TENANT_FIELD);
    await deleteUserPluginAuth(req.user.id, LEGACY_CANVAS_TOKEN_FIELD);
    await deleteUserPluginAuth(req.user.id, LEGACY_CANVAS_TENANT_FIELD);
    return res.json({ connected: false });
  } catch (error) {
    logger.error('[learnlight/canvas] Failed to disconnect Canvas account', error);
    return res.status(500).json({ message: 'Failed to disconnect' });
  }
});

module.exports = router;
