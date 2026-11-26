const express = require('express');
const router = express.Router();
const { getSettings, updateSettings, getWhatsAppSettings, updateWhatsAppSettings } = require('../controllers/botController');
const authenticate = require('../middleware/authenticate');
const Conversation = require('../models/Conversation');
const Bot = require('../models/Bot');
const botEngine = require('../botEngine');
const NodeCache = require('node-cache');
const logger = require('../logger');
const { loadAccessibleBot } = require('../middleware/botAccess');

// إعداد cache لتخزين الطلبات مؤقتاً (5 دقايق)
const apiCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Routes for settings with botId in the URL
router.get('/:id/settings', authenticate, loadAccessibleBot, getSettings);
router.patch('/:id/settings', authenticate, loadAccessibleBot, updateSettings);

// Routes جديدة لإعدادات واتساب
router.get('/:botId/whatsapp-settings', authenticate, loadAccessibleBot, getWhatsAppSettings);
router.patch('/:botId/whatsapp-settings', authenticate, loadAccessibleBot, updateWhatsAppSettings);

// Public web/widget visitors must present an opaque `web_<id>` visitor id
// (matching public/js/chat.js). Reject WhatsApp JIDs (@c.us), channel-prefixed
// ids (facebook_/instagram_/whatsapp_), and raw/wrapped phone numbers so
// callers cannot load or mutate another channel's conversation or orders.
function isValidWebVisitorId(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!/^web_[a-zA-Z0-9_-]{8,128}$/.test(trimmed)) return false;
  if (trimmed.includes('@')) return false;
  const suffix = trimmed.slice(4);
  if (/^\d{7,15}$/.test(suffix)) return false;
  return true;
}

// معالجة رسايل الدردشة (مسار عام لدردشة الويب والويدجت)
router.post('/', async (req, res) => {
  try {
    const { botId, message, userId, isImage, isVoice, mediaUrl } = req.body;
    const safeChannel = 'web';
    logger.info('📥 Raw request body', { path: '/api/bot', bodyKeys: Object.keys(req.body || {}) });

    // فحص الحقول المطلوبة
    if (!botId || !userId || (!message && !isImage && !isVoice)) {
      logger.error('❌ Missing required fields for /api/bot', { botId, hasMessage: !!message, hasUserId: !!userId });
      return res.status(400).json({ message: 'Bot ID, message or media, and user ID are required' });
    }

    if (!isValidWebVisitorId(userId)) {
      logger.warn('🚫 Rejected non-web visitor userId on public /api/bot', { botId });
      return res.status(400).json({ message: 'Invalid web visitor userId' });
    }
    const safeUserId = userId.trim();

    // فحص إن mediaUrl موجود لو isImage: true
    if (isImage && !mediaUrl) {
      logger.error('❌ Missing mediaUrl for image message');
      return res.status(400).json({ message: 'Image URL is required for image messages' });
    }

    // جلب البوت والتحقق من حالته
    const bot = await Bot.findById(botId);
    if (!bot) {
      logger.warn('البوت غير موجود', { botId });
      return res.status(404).json({ message: 'البوت غير موجود' });
    }
    if (!bot.isActive || bot.archivedAt) {
      logger.warn('البوت غير نشط، تخطي المعالجة', { botId, botName: bot.name });
      return res.status(400).json({ message: 'البوت متوقف حاليًا ولا يمكنه استقبال الرسائل' });
    }

    // فحص تكرار الطلب
    const messageKey = `${botId}-${safeUserId}-${message}-${Date.now()}`;
    if (apiCache.get(messageKey)) {
      logger.warn('⚠️ Duplicate API request detected', { messageKey });
      return res.status(200).json({ reply: 'تم معالجة هذه الرسالة من قبل' });
    }
    apiCache.set(messageKey, true);

    // جلب المحادثة
    let conversation = await Conversation.findOne({ botId, userId: safeUserId, channel: safeChannel });
    if (!conversation) {
      logger.info('📋 Creating new conversation', { botId, userId: safeUserId, channel: safeChannel });
      conversation = new Conversation({
        botId,
        userId: safeUserId,
        messages: [],
        channel: safeChannel
      });
      await conversation.save();
    }

    // فحص إذا كانت الرسالة موجودة
    const messageExists = conversation.messages.some(msg => 
      msg.content === message && 
      Math.abs(new Date(msg.timestamp) - Date.now()) < 1000
    );
    if (messageExists) {
      logger.warn('⚠️ Duplicate message detected in conversation', { userId: safeUserId });
      return res.status(200).json({ reply: 'تم معالجة هذه الرسالة من قبل' });
    }

    // تمرير mediaUrl لدالة processMessage
    logger.info('📤 Calling botEngine', { hasMediaUrl: !!mediaUrl, botId, userId: safeUserId, channel: safeChannel });
    const reply = await botEngine.processMessage(botId, safeUserId, message, isImage, isVoice, null, safeChannel, mediaUrl);

    if (reply === null) {
      logger.info('🔇 Conversation muted, no reply will be sent', { userId: safeUserId });
      return res.status(204).send();
    }
    res.status(200).json({ reply });
  } catch (err) {
    logger.error('❌ خطأ في معالجة رسالة البوت', { err });
    res.status(500).json({ message: 'خطأ في السيرفر أثناء معالجة الرسالة' });
  }
});

router.isValidWebVisitorId = isValidWebVisitorId;
module.exports = router;
