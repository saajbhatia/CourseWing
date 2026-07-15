const express = require('express');
const { modelController } = require('~/server/controllers/ModelController');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');

const router = express.Router();
router.get('/', optionalJwtAuth, modelController);

module.exports = router;
