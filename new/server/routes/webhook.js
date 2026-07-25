const express = require('express');
const { handleMessage: handleFacebookMessage } = require('../controllers/facebookController');
const { handleMessage: handleInstagramMessage } = require('../controllers/instagramController');
const { processWebhook: handleWhatsAppMessage } = require('../controllers/whatsappController');
const logger = require('../logger');
const {
  timingSafeStringEqual,
  verifyMetaSignature,
} = require('../middleware/verifyWebhookSignature');

const router = express.Router();

function verifySubscription(channel, specificEnvName) {
  return (req, res) => {
    const expected = process.env[specificEnvName]?.trim()
      || (channel === 'whatsapp' ? process.env.WHATSAPP_VERIFY_TOKEN?.trim() : '')
      || process.env.META_WEBHOOK_VERIFY_TOKEN?.trim()
      || process.env.WEBHOOK_VERIFY_TOKEN?.trim();
    if (!expected) {
      logger.error('webhook_verify_token_missing', {
        requestId: req.requestId,
        channel,
        specificEnvName,
      });
      return res.status(503).json({
        success: false,
        error: 'WEBHOOK_NOT_CONFIGURED',
      });
    }

    const mode = req.query['hub.mode'];
    const received = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (
      mode !== 'subscribe'
      || !received
      || !timingSafeStringEqual(received, expected)
    ) {
      logger.warn('webhook_verification_rejected', {
        requestId: req.requestId,
        channel,
      });
      return res.sendStatus(403);
    }

    logger.info('webhook_verified', {
      requestId: req.requestId,
      channel,
    });
    return res.status(200).send(challenge);
  };
}

router.get(
  '/facebook',
  verifySubscription('facebook', 'FACEBOOK_WEBHOOK_VERIFY_TOKEN')
);
router.post(
  '/facebook',
  verifyMetaSignature('FACEBOOK_APP_SECRET'),
  handleFacebookMessage
);

router.get(
  '/instagram',
  verifySubscription('instagram', 'INSTAGRAM_WEBHOOK_VERIFY_TOKEN')
);
router.post(
  '/instagram',
  verifyMetaSignature('INSTAGRAM_APP_SECRET'),
  handleInstagramMessage
);

router.get(
  '/whatsapp',
  verifySubscription('whatsapp', 'WHATSAPP_WEBHOOK_VERIFY_TOKEN')
);
router.post(
  '/whatsapp',
  verifyMetaSignature('WHATSAPP_APP_SECRET'),
  handleWhatsAppMessage
);

module.exports = router;
module.exports.verifySubscription = verifySubscription;
