const express = require('express');
const authenticate = require('../middleware/authenticate');
const auditMutation = require('../middleware/auditMutation');
const logger = require('../logger');
const PlatformSetting = require('../models/PlatformSetting');
const { directSuperadminOnly } = require('./adminImpersonation');
const {
  normalizeEgyptianWhatsappNumber,
  normalizeOpenAiModelId,
  normalizeBooleanSetting,
  resolveSubscriptionWhatsapp,
  resolveDefaultOpenAiModel,
  invalidatePlatformSettingsCache,
} = require('../services/platformSettingsService');
const { listOpenAiChatModels } = require('../services/openaiModelsService');

const router = express.Router();

router.use(authenticate, directSuperadminOnly);

// Current platform settings and effective subscription WhatsApp resolution.
router.get('/', async (req, res) => {
  try {
    const config = await PlatformSetting.getConfig();
    const resolved = resolveSubscriptionWhatsapp(config.subscriptionWhatsappNumber);
    const resolvedModel = resolveDefaultOpenAiModel(config.defaultOpenAiModel);
    return res.status(200).json({
      success: true,
      data: {
        subscriptionWhatsappNumber: config.subscriptionWhatsappNumber || '',
        effectiveWhatsappNumber: resolved.value,
        source: resolved.source,
        defaultOpenAiModel: config.defaultOpenAiModel || '',
        effectiveDefaultModel: resolvedModel.value,
        modelSource: resolvedModel.source,
        assistantWriteToolsEnabled: Boolean(config.assistantWriteToolsEnabled),
        copilotEnabled: Boolean(config.copilotEnabled),
        updatedAt: config.updatedAt,
      },
    });
  } catch (err) {
    logger.error('admin_platform_settings_load_failed', { requestId: req.requestId, err: err.message });
    return res.status(500).json({
      success: false,
      error: 'ADMIN_PLATFORM_SETTINGS_LOAD_FAILED',
      message: 'The platform settings could not be loaded',
    });
  }
});

// Update platform settings. Audited via auditMutation.
router.put('/', auditMutation, async (req, res) => {
  try {
    const config = await PlatformSetting.getConfig();

    if (req.body?.subscriptionWhatsappNumber !== undefined) {
      const normalized = normalizeEgyptianWhatsappNumber(req.body.subscriptionWhatsappNumber);
      if (!normalized.valid) {
        return res.status(400).json({
          success: false,
          error: normalized.error,
          message: normalized.message,
        });
      }
      config.subscriptionWhatsappNumber = normalized.value;
    }

    if (req.body?.defaultOpenAiModel !== undefined) {
      const normalizedModel = normalizeOpenAiModelId(req.body.defaultOpenAiModel);
      if (!normalizedModel.valid) {
        return res.status(400).json({
          success: false,
          error: normalizedModel.error,
          message: normalizedModel.message,
        });
      }
      config.defaultOpenAiModel = normalizedModel.value;
    }

    if (req.body?.assistantWriteToolsEnabled !== undefined) {
      const normalizedFlag = normalizeBooleanSetting(req.body.assistantWriteToolsEnabled);
      if (!normalizedFlag.valid) {
        return res.status(400).json({
          success: false,
          error: normalizedFlag.error,
          message: normalizedFlag.message,
        });
      }
      config.assistantWriteToolsEnabled = normalizedFlag.value;
    }

    if (req.body?.copilotEnabled !== undefined) {
      const normalizedFlag = normalizeBooleanSetting(req.body.copilotEnabled);
      if (!normalizedFlag.valid) {
        return res.status(400).json({
          success: false,
          error: normalizedFlag.error,
          message: normalizedFlag.message,
        });
      }
      config.copilotEnabled = normalizedFlag.value;
    }

    await config.save();
    invalidatePlatformSettingsCache();

    const resolved = resolveSubscriptionWhatsapp(config.subscriptionWhatsappNumber);
    const resolvedModel = resolveDefaultOpenAiModel(config.defaultOpenAiModel);

    logger.info('admin_platform_settings_updated', {
      requestId: req.requestId,
      actorUserId: req.auth?.actorUserId,
      hasSubscriptionWhatsappOverride: Boolean(config.subscriptionWhatsappNumber),
      hasDefaultModelOverride: Boolean(config.defaultOpenAiModel),
      assistantWriteToolsEnabled: Boolean(config.assistantWriteToolsEnabled),
      copilotEnabled: Boolean(config.copilotEnabled),
      source: resolved.source,
    });

    return res.status(200).json({
      success: true,
      data: {
        subscriptionWhatsappNumber: config.subscriptionWhatsappNumber || '',
        effectiveWhatsappNumber: resolved.value,
        source: resolved.source,
        defaultOpenAiModel: config.defaultOpenAiModel || '',
        effectiveDefaultModel: resolvedModel.value,
        modelSource: resolvedModel.source,
        assistantWriteToolsEnabled: Boolean(config.assistantWriteToolsEnabled),
        copilotEnabled: Boolean(config.copilotEnabled),
        updatedAt: config.updatedAt,
      },
    });
  } catch (err) {
    logger.error('admin_platform_settings_update_failed', { requestId: req.requestId, err: err.message });
    return res.status(500).json({
      success: false,
      error: 'ADMIN_PLATFORM_SETTINGS_UPDATE_FAILED',
      message: 'The platform settings could not be saved',
    });
  }
});

// Live list of chat-capable OpenAI models visible to the platform key, for
// the default-model dropdown. The API key stays server-side; failures return
// 502/503 with no key material.
router.get('/openai-models', async (req, res) => {
  try {
    const { models, stale } = await listOpenAiChatModels();
    return res.status(200).json({
      success: true,
      data: { models, stale },
    });
  } catch (err) {
    const missingKey = err.code === 'OPENAI_KEY_MISSING';
    logger.error('admin_openai_models_failed', { requestId: req.requestId, err: err.message });
    return res.status(missingKey ? 503 : 502).json({
      success: false,
      error: missingKey ? 'OPENAI_KEY_MISSING' : 'OPENAI_MODELS_UNAVAILABLE',
      message: missingKey
        ? 'The platform OpenAI key is not configured'
        : 'The OpenAI model list could not be loaded',
    });
  }
});

module.exports = router;
