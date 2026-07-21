// server/routes/integrations.js
const express = require('express');
const router = express.Router();
const integrationsController = require('../controllers/integrationsController');
const authenticate = require('../middleware/authenticate');

// API Keys
router.post('/keys', authenticate, integrationsController.generateApiKey);
router.get('/keys', authenticate, integrationsController.listApiKeys);
router.delete('/keys/:id', authenticate, integrationsController.revokeApiKey);

// Webhook config
router.post('/webhooks', authenticate, integrationsController.setWebhookConfig);
router.get('/webhooks', authenticate, integrationsController.getWebhookConfig);
router.get('/webhooks/logs', authenticate, integrationsController.getWebhookLogs);
router.post('/webhooks/logs/:id/retry', authenticate, integrationsController.retryWebhook);

module.exports = router;
