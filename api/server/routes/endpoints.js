const express = require('express');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');
const configMiddleware = require('~/server/middleware/config/app');
const endpointController = require('~/server/controllers/EndpointController');
const tokenConfigController = require('~/server/controllers/TokenConfigController');

const router = express.Router();
/** Optional auth so guests can render the chat UI; authenticated users still get role/tenant-scoped config. */
router.get('/', optionalJwtAuth, endpointController);
router.get('/token-config', requireJwtAuth, configMiddleware, tokenConfigController);

module.exports = router;
