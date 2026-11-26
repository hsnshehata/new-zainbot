const express = require('express');
const authenticate = require('../middleware/authenticate');
const auditMutation = require('../middleware/auditMutation');
const logger = require('../logger');
const PlatformSetting = require('../models/PlatformSetting');
const { directSuperadminOnly } = require('./adminImpersonation');
const {
  normalizeEgyptianWhatsappNumber,
  resolveSubscriptionWhatsapp,
  invalidatePlatformSettingsCache,
} = require('../services/platformSettingsService');

const router = express.Router();

router.use(authenticate, directSuperadminOnly);

// Current platform settings and effective subscription WhatsApp resolution.
router.get('/', async (req, res) => {
  try {
    const config = await PlatformSetting.getConfig();
    const resolved = resolveSubscriptionWhatsapp(config.subscriptionWhatsappNumber);
    return res.status(200).json({
      success: true,
      data: {
        subscriptionWhatsappNumber: config.subscriptionWhatsappNumber || '',
        effectiveWhatsappNumber: resolved.value,
        source: resolved.source,
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

    await config.save();
    invalidatePlatformSettingsCache();

    const resolved = resolveSubscriptionWhatsapp(config.subscriptionWhatsappNumber);

    logger.info('admin_platform_settings_updated', {
      requestId: req.requestId,
      actorUserId: req.auth?.actorUserId,
      hasSubscriptionWhatsappOverride: Boolean(config.subscriptionWhatsappNumber),
      source: resolved.source,
    });

    return res.status(200).json({
      success: true,
      data: {
        subscriptionWhatsappNumber: config.subscriptionWhatsappNumber || '',
        effectiveWhatsappNumber: resolved.value,
        source: resolved.source,
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

module.exports = router;
