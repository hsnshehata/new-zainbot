// server/controllers/integrationsController.js
const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const WebhookConfig = require('../models/WebhookConfig');
const WebhookLog = require('../models/WebhookLog');
const axios = require('axios');
const logger = require('../logger');

// Generate API Key
exports.generateApiKey = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'برجاء تحديد اسم لمفتاح الوصول.' });
    }

    const randomKey = `zb_live_${crypto.randomBytes(24).toString('hex')}`;
    const newKey = await ApiKey.create({
      userId: req.user.userId,
      name,
      key: randomKey
    });

    res.status(201).json({ success: true, data: { _id: newKey._id, name: newKey.name, key: newKey.key, createdAt: newKey.createdAt } });
  } catch (err) {
    logger.error('❌ Error generating API key:', { err });
    res.status(500).json({ success: false, message: 'فشل في إنشاء مفتاح الوصول.' });
  }
};

// List API Keys
exports.listApiKeys = async (req, res) => {
  try {
    const keys = await ApiKey.find({ userId: req.user.userId }).select('-key'); // hide raw key
    res.status(200).json({ success: true, data: keys });
  } catch (err) {
    logger.error('❌ Error listing API keys:', { err });
    res.status(500).json({ success: false, message: 'فشل في تحميل مفاتيح الوصول.' });
  }
};

// Revoke API Key
exports.revokeApiKey = async (req, res) => {
  try {
    const { id } = req.params;
    const key = await ApiKey.findOneAndDelete({ _id: id, userId: req.user.userId });
    if (!key) {
      return res.status(404).json({ success: false, message: 'مفتاح الوصول غير موجود.' });
    }
    res.status(200).json({ success: true, message: 'تم إبطال مفتاح الوصول بنجاح.' });
  } catch (err) {
    logger.error('❌ Error revoking API key:', { err });
    res.status(500).json({ success: false, message: 'فشل في حذف مفتاح الوصول.' });
  }
};

// Set Webhook Config
exports.setWebhookConfig = async (req, res) => {
  try {
    const { botId, url, events, isActive } = req.body;
    if (!botId || !url) {
      return res.status(400).json({ success: false, message: 'حقل البوت والرابط مطلوبين.' });
    }

    let config = await WebhookConfig.findOne({ userId: req.user.userId, botId });
    
    if (config) {
      config.url = url;
      config.events = events || config.events;
      config.isActive = isActive !== undefined ? isActive : config.isActive;
      await config.save();
    } else {
      const secret = `whsec_${crypto.randomBytes(16).toString('hex')}`;
      config = await WebhookConfig.create({
        userId: req.user.userId,
        botId,
        url,
        secret,
        events: events || ['message.received', 'message.sent', 'order.created'],
        isActive: isActive !== undefined ? isActive : true
      });
    }

    res.status(200).json({ success: true, data: config });
  } catch (err) {
    logger.error('❌ Error setting webhook config:', { err });
    res.status(500).json({ success: false, message: 'فشل في حفظ إعدادات الويب هوك.' });
  }
};

// Get Webhook Config
exports.getWebhookConfig = async (req, res) => {
  try {
    const { botId } = req.query;
    if (!botId) {
      return res.status(400).json({ success: false, message: 'معرف البوت مطلوب.' });
    }

    const config = await WebhookConfig.findOne({ userId: req.user.userId, botId });
    res.status(200).json({ success: true, data: config || null });
  } catch (err) {
    logger.error('❌ Error getting webhook config:', { err });
    res.status(500).json({ success: false, message: 'فشل في تحميل إعدادات الويب هوك.' });
  }
};

// Get Webhook Logs
exports.getWebhookLogs = async (req, res) => {
  try {
    const { botId } = req.query;
    if (!botId) {
      return res.status(400).json({ success: false, message: 'معرف البوت مطلوب.' });
    }

    const logs = await WebhookLog.find({ userId: req.user.userId, botId })
      .sort({ timestamp: -1 })
      .limit(30);

    res.status(200).json({ success: true, data: logs });
  } catch (err) {
    logger.error('❌ Error getting webhook logs:', { err });
    res.status(500).json({ success: false, message: 'فشل في تحميل سجل الويب هوك.' });
  }
};

// Retry Webhook Delivery
exports.retryWebhook = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await WebhookLog.findOne({ _id: id, userId: req.user.userId });
    if (!log) {
      return res.status(404).json({ success: false, message: 'سجل التوصيل غير موجود.' });
    }

    const webhook = await WebhookConfig.findById(log.webhookId);
    if (!webhook) {
      return res.status(404).json({ success: false, message: 'إعدادات الويب هوك الأصلية غير موجودة.' });
    }

    // Re-dispatch using webhook secret signature
    const payloadString = JSON.stringify(log.payload);
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(payloadString)
      .digest('hex');

    let responseStatus = 0;
    let responseBody = '';
    let success = false;

    try {
      const response = await axios.post(log.url, payloadString, {
        headers: {
          'Content-Type': 'application/json',
          'X-ZainBot-Signature': signature,
          'X-ZainBot-Event': log.event,
          'User-Agent': 'ZainBot-Webhook-Dispatcher/2.0-Retry'
        },
        timeout: 8000
      });

      responseStatus = response.status;
      responseBody = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
      success = responseStatus >= 200 && responseStatus < 300;
    } catch (err) {
      success = false;
      responseStatus = err.response ? err.response.status : 500;
      responseBody = err.response 
        ? (typeof err.response.data === 'object' ? JSON.stringify(err.response.data) : String(err.response.data)) 
        : err.message;
    }

    // Update log
    log.responseStatus = responseStatus;
    log.responseBody = responseBody.slice(0, 1500);
    log.success = success;
    log.attempts += 1;
    log.timestamp = new Date();
    await log.save();

    res.status(200).json({ success, data: log });
  } catch (err) {
    logger.error('❌ Error retrying webhook delivery:', { err });
    res.status(500).json({ success: false, message: 'فشل في إعادة إرسال الويب هوك.' });
  }
};
