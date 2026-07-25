const express = require('express');
const router = express.Router();
const { getSettings, updateSettings, getWhatsAppSettings, updateWhatsAppSettings } = require('../controllers/botController');
const authenticate = require('../middleware/authenticate');
const Conversation = require('../models/Conversation');
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

// معالجة رسايل الدردشة
router.post('/', authenticate, loadAccessibleBot, async (req, res) => {
  try {
    const { botId, message, userId, isImage, isVoice, channel, mediaUrl } = req.body;
    logger.info('📥 Raw request body', { path: '/api/bot', bodyKeys: Object.keys(req.body || {}) });

    // فحص الحقول المطلوبة
    if (!botId || !userId || (!message && !isImage && !isVoice)) {
      logger.error('❌ Missing required fields for /api/bot', { botId, message, userId });
      return res.status(400).json({ message: 'Bot ID, message or media, and user ID are required' });
    }

    // فحص إن mediaUrl موجود لو isImage: true
    if (isImage && !mediaUrl) {
      logger.error('❌ Missing mediaUrl for image message');
      return res.status(400).json({ message: 'Image URL is required for image messages' });
    }

    // التحقق من حالة البوت
    const bot = req.bot;
    if (!bot.isActive) {
      logger.warn('البوت غير نشط، تخطي المعالجة', { botId, botName: bot.name });
      return res.status(400).json({ message: 'البوت متوقف حاليًا ولا يمكنه استقبال الرسائل' });
    }

    // فحص تكرار الطلب
    const messageKey = `${botId}-${userId}-${message}-${Date.now()}`;
    if (apiCache.get(messageKey)) {
      logger.warn('⚠️ Duplicate API request detected', { messageKey });
      return res.status(200).json({ reply: 'تم معالجة هذه الرسالة من قبل' });
    }
    apiCache.set(messageKey, true);

    // جلب المحادثة
    let conversation = await Conversation.findOne({ botId, userId, channel: channel || 'web' });
    if (!conversation) {
      logger.info('📋 Creating new conversation', { botId, userId, channel: channel || 'web' });
      conversation = new Conversation({
        botId,
        userId,
        messages: [],
        channel: channel || 'web'
      });
      await conversation.save();
    }

    // فحص إذا كانت الرسالة موجودة
    const messageExists = conversation.messages.some(msg => 
      msg.content === message && 
      Math.abs(new Date(msg.timestamp) - Date.now()) < 1000
    );
    if (messageExists) {
      logger.warn('⚠️ Duplicate message detected in conversation', { userId });
      return res.status(200).json({ reply: 'تم معالجة هذه الرسالة من قبل' });
    }

    // تمرير mediaUrl لدالة processMessage
    logger.info('📤 Calling botEngine', { mediaUrl, botId, userId, channel: channel || 'web' });
    const reply = await botEngine.processMessage(botId, userId, message, isImage, isVoice, null, channel || 'web', mediaUrl);

    if (reply === null) {
      logger.info('🔇 Conversation muted, no reply will be sent', { userId });
      return res.status(204).send();
    }
    res.status(200).json({ reply });
  } catch (err) {
    logger.error('❌ خطأ في معالجة رسالة البوت', { err });
    res.status(500).json({ message: 'خطأ في السيرفر أثناء معالجة الرسالة' });
  }
});

module.exports = router;
