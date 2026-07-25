const crypto = require('crypto');
const logger = require('../logger');

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyMetaSignature(secretEnvName) {
  return (req, res, next) => {
    const secret = process.env[secretEnvName]?.trim();
    if (!secret) {
      logger.error('webhook_signature_secret_missing', {
        requestId: req.requestId,
        secretEnvName,
      });
      return res.status(503).json({
        success: false,
        error: 'WEBHOOK_NOT_CONFIGURED',
      });
    }

    if (!Buffer.isBuffer(req.rawBody)) {
      return res.status(400).json({
        success: false,
        error: 'WEBHOOK_RAW_BODY_MISSING',
      });
    }

    const received = req.get('x-hub-signature-256') || '';
    const expected = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(req.rawBody)
      .digest('hex')}`;

    if (!timingSafeStringEqual(received, expected)) {
      logger.warn('webhook_signature_rejected', {
        requestId: req.requestId,
        path: req.path,
      });
      return res.status(401).json({
        success: false,
        error: 'INVALID_WEBHOOK_SIGNATURE',
      });
    }

    return next();
  };
}

function verifyTelegramWebhookSecret(req, res, next) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) {
    logger.error('telegram_webhook_secret_missing', {
      requestId: req.requestId,
    });
    return res.status(503).json({
      success: false,
      error: 'WEBHOOK_NOT_CONFIGURED',
    });
  }

  const received = req.get('x-telegram-bot-api-secret-token') || '';
  if (!timingSafeStringEqual(received, expected)) {
    logger.warn('telegram_webhook_secret_rejected', {
      requestId: req.requestId,
    });
    return res.status(401).json({
      success: false,
      error: 'INVALID_WEBHOOK_SIGNATURE',
    });
  }
  return next();
}

module.exports = {
  timingSafeStringEqual,
  verifyMetaSignature,
  verifyTelegramWebhookSecret,
};
