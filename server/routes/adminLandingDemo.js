const express = require('express');
const authenticate = require('../middleware/authenticate');
const auditMutation = require('../middleware/auditMutation');
const logger = require('../logger');
const LandingDemoConfig = require('../models/LandingDemoConfig');
const { directSuperadminOnly } = require('./adminImpersonation');
const { invalidateConfigCache } = require('./landingDemo');

const router = express.Router();

router.use(authenticate, directSuperadminOnly);

// Current configuration of the landing page demo agent.
router.get('/', async (req, res) => {
  try {
    const config = await LandingDemoConfig.getConfig();
    return res.status(200).json({
      success: true,
      data: {
        isEnabled: config.isEnabled,
        instructions: config.instructions || '',
        dailyCap: config.dailyCap,
        usageDate: config.usageDate || '',
        usageCount: config.usageCount || 0,
        updatedAt: config.updatedAt,
      },
    });
  } catch (err) {
    logger.error('admin_landing_demo_load_failed', { requestId: req.requestId, err: err.message });
    return res.status(500).json({
      success: false,
      error: 'ADMIN_LANDING_DEMO_LOAD_FAILED',
      message: 'The landing demo configuration could not be loaded',
    });
  }
});

// Update instructions / enabled flag. Audited via auditMutation.
router.put('/', auditMutation, async (req, res) => {
  try {
    const config = await LandingDemoConfig.getConfig();

    if (req.body?.isEnabled !== undefined) {
      config.isEnabled = Boolean(req.body.isEnabled);
    }

    if (req.body?.dailyCap !== undefined) {
      const cap = Number(req.body.dailyCap);
      if (!Number.isInteger(cap) || cap < 0 || cap > 100000) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_DAILY_CAP',
          message: 'dailyCap must be an integer between 0 and 100,000',
        });
      }
      config.dailyCap = cap;
    }

    if (req.body?.instructions !== undefined) {
      const instructions = String(req.body.instructions || '');
      if (instructions.length > 12000) {
        return res.status(400).json({
          success: false,
          error: 'INSTRUCTIONS_TOO_LONG',
          message: 'Instructions must be 12,000 characters or fewer',
        });
      }
      config.instructions = instructions.trim();
    }

    await config.save();
    invalidateConfigCache();

    logger.info('admin_landing_demo_updated', {
      requestId: req.requestId,
      actorUserId: req.auth?.actorUserId,
      isEnabled: config.isEnabled,
      instructionsLength: (config.instructions || '').length,
    });

    return res.status(200).json({
      success: true,
      data: {
        isEnabled: config.isEnabled,
        instructions: config.instructions || '',
        dailyCap: config.dailyCap,
        updatedAt: config.updatedAt,
      },
    });
  } catch (err) {
    logger.error('admin_landing_demo_update_failed', { requestId: req.requestId, err: err.message });
    return res.status(500).json({
      success: false,
      error: 'ADMIN_LANDING_DEMO_UPDATE_FAILED',
      message: 'The landing demo configuration could not be saved',
    });
  }
});

module.exports = router;
