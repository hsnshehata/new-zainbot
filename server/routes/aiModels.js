const express = require('express');
const authenticate = require('../middleware/authenticate');
const logger = require('../logger');
const { createAiModelAccessService } = require('../services/aiModelAccessService');

const aiModelAccess = createAiModelAccessService({});

const router = express.Router();

// Models the requesting user may manually select, plus whether the virtual
// Auto choice is available for their tier/override.
router.get('/available-models', authenticate, async (req, res) => {
  try {
    const result = await aiModelAccess.listAllowedModelsForUser(req.user);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    logger.error('ai_available_models_failed', {
      requestId: req.requestId,
      userId: req.user?.userId,
      err: err.message,
    });
    return res.status(500).json({
      success: false,
      error: 'AI_MODELS_UNAVAILABLE',
      message: 'The model list could not be loaded',
    });
  }
});

module.exports = router;
