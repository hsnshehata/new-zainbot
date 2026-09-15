const express = require('express');
const authenticate = require('../middleware/authenticate');
const { loadAccessibleBot } = require('../middleware/botAccess');
const {
  getWhatsAppSessionManager,
  WhatsAppSessionError,
} = require('../services/whatsappSessionManager');
const logger = require('../logger');

const router = express.Router();
const manager = getWhatsAppSessionManager();

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
    const data = await manager.getStatus(req.bot._id);
    return res.json({ success: true, data });
  } catch (error) {
    return sendManagerError(res, error, req.requestId);
  }
});

router.post('/connect-qr', loadAccessibleBot, async (req, res) => {
  try {
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
