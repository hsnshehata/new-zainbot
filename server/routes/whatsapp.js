const { isFreeTier, FREE_LIMITS, MESSAGES } = require('../services/freePlanLimits');
const ChannelConnection = require('../models/ChannelConnection');
const express = require('express');
const authenticate = require('../middleware/authenticate');
const { loadAccessibleBot } = require('../middleware/botAccess');
const {
  getWhatsAppSessionManager,
  WhatsAppSessionError,
} = require('../services/whatsappSessionManager');
const platformWhatsappSession = require('../services/platformWhatsappSession');
const logger = require('../logger');

const router = express.Router();
const manager = getWhatsAppSessionManager();

const PLATFORM_TO_SESSION_STATUS = {
  connected: 'connected',
  loading: 'connecting',
  authenticating: 'connecting',
  qr_ready: 'qr_required',
  disconnected: 'disconnected',
};

// The platform WhatsApp number serves its bot through platformWhatsappSession,
// not the per-bot QR manager — report that live state so the dashboard card
// reflects the session that actually carries the messages.
async function resolveSessionStatus(bot) {
  if (String(bot._id) === platformWhatsappSession.getPlatformBotId()) {
    const platform = await platformWhatsappSession.getStatus();
    const mappedStatus = PLATFORM_TO_SESSION_STATUS[platform.status] || 'disconnected';
    return {
      id: null,
      botId: String(bot._id),
      channel: 'whatsapp',
      mode: 'platform',
      status: mappedStatus,
      connected: Boolean(platform.connected),
      externalAccount: platform.phone || '',
      externalDisplayName: '',
      requiresRelink: false,
      restoredFromLegacy: false,
      lastReadyAt: platform.connected ? platform.updatedAt || null : null,
      lastDisconnectedAt: mappedStatus === 'disconnected' ? platform.updatedAt || null : null,
      health: {
        lastCheckAt: platform.lastHeartbeat || null,
        lastSuccessAt: platform.connected ? platform.updatedAt || null : null,
      },
    };
  }
  return manager.getStatus(bot._id);
}

function sendManagerError(res, error, requestId) {
  if (error instanceof WhatsAppSessionError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.code,
      message: error.message,
    });
  }
  logger.error('whatsapp_session_request_failed', {
    requestId,
    error: error?.name || 'Error',
  });
  return res.status(500).json({
    success: false,
    error: 'WHATSAPP_SESSION_REQUEST_FAILED',
  });
}

router.use(authenticate);

router.get('/session', loadAccessibleBot, async (req, res) => {
  try {
    const data = await resolveSessionStatus(req.bot);
    return res.json({ success: true, data });
  } catch (error) {
    return sendManagerError(res, error, req.requestId);
  }
});

router.post('/connect-qr', loadAccessibleBot, async (req, res) => {
  try {
    if (isFreeTier(req.user)) {
      // One WhatsApp number per free account. Reconnecting the same bot is always allowed.
      const others = await ChannelConnection.countDocuments({
        userId: req.bot.userId,
        channel: 'whatsapp',
        mode: 'whatsapp_web_qr',
        botId: { $ne: req.bot._id },
        status: { $ne: 'disconnected' },
      });
      if (others >= FREE_LIMITS.whatsappChannels) {
        return res.status(403).json({ success: false, error: 'FREE_PLAN_LIMIT', kind: 'whatsappChannels', limit: FREE_LIMITS.whatsappChannels, message: MESSAGES.whatsappChannels });
      }
    }
    const data = await manager.connect({
      botId: req.bot._id,
      userId: req.bot.userId,
    });
    const status = await manager.waitForQrOrReady(req.bot._id);
    return res.status(status.qrCode ? 200 : 202).json({ success: true, data: status });
  } catch (error) {
    return sendManagerError(res, error, req.requestId);
  }
});

router.post('/disconnect', loadAccessibleBot, async (req, res) => {
  try {
    const data = await manager.disconnect(req.bot._id);
    return res.json({
      success: true,
      message: 'تم فصل جلسة واتساب',
      data,
    });
  } catch (error) {
    return sendManagerError(res, error, req.requestId);
  }
});

module.exports = router;
module.exports.resolveSessionStatus = resolveSessionStatus;
module.exports.PLATFORM_TO_SESSION_STATUS = PLATFORM_TO_SESSION_STATUS;
