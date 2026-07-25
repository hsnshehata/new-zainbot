const express = require('express');
const authenticate = require('../middleware/authenticate');
const telegramController = require('../controllers/telegramController');
const { loadAccessibleBot } = require('../middleware/botAccess');
const {
  verifyTelegramWebhookSecret,
} = require('../middleware/verifyWebhookSignature');

const router = express.Router();

router.post('/webhook', verifyTelegramWebhookSecret, telegramController.handleWebhook);
router.get('/status', authenticate, loadAccessibleBot, telegramController.getStatus);
router.post('/link-code', authenticate, loadAccessibleBot, telegramController.generateLinkCode);
router.post('/preferences', authenticate, loadAccessibleBot, telegramController.updatePreferences);
router.post('/unlink', authenticate, loadAccessibleBot, telegramController.unlink);

module.exports = router;
