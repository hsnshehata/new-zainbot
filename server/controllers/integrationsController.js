const { checkCountLimit, denyResponse } = require('../services/freePlanLimits');
// server/controllers/integrationsController.js
const crypto = require('crypto');
const mongoose = require('mongoose');
const ApiKey = require('../models/ApiKey');
const Bot = require('../models/Bot');
const WebhookConfig = require('../models/WebhookConfig');
const WebhookLog = require('../models/WebhookLog');
const { assertPublicHttpsUrl, buildPinnedHttpsAgent } = require('../services/webhookUrlGuard');
const axios = require('axios');
const logger = require('../logger');

// An endpoint that answers HTTP 200 with an explicit `success:false` body
// rejected the delivery — that is a failure, never proof of delivery.
function endpointRejected(data) {
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    return data.success === false;
  }
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return parsed !== null && typeof parsed === 'object' && parsed.success === false;
    } catch (_ignored) {
      return false;
    }
  }
  return false;
}

// Generate API Key
exports.generateApiKey = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'برجاء تحديد اسم لمفتاح الوصول.' });
    }

    const keyCount = await ApiKey.countDocuments({ userId: req.user.userId });
    const verdict = checkCountLimit(req.user, 'apiKeys', keyCount);
    if (!verdict.allowed) return denyResponse(res, verdict);

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

    // Ownership gate: the webhook config must reference a bot the caller
    // owns (a direct, non-impersonating superadmin keeps full access).
    // Without this check a caller could attach their config to someone
    // else's botId; the dispatcher's owner scoping currently prevents
    // foreign events from flowing, but the dangling config must not exist.
    if (!mongoose.isValidObjectId(botId)) {
      return res.status(404).json({ success: false, message: 'البوت غير موجود.' });
    }
    const isDirectSuperadmin = req.auth?.actorRole === 'superadmin'
      && !req.auth?.isImpersonating;
    const ownedBot = isDirectSuperadmin
      ? await Bot.exists({ _id: botId })
      : await Bot.exists({ _id: botId, userId: req.user.userId });
    if (!ownedBot) {
      return res.status(404).json({ success: false, message: 'البوت غير موجود.' });
    }

    // SSRF guard at config time: webhook targets must be public HTTPS.
    try {
      await assertPublicHttpsUrl(url);
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message });
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
      return res.status(404).json({
        success: false,
        code: 'WEBHOOK_LOG_NOT_FOUND',
        message: 'سجل التوصيل غير موجود.',
      });
    }

    const webhook = await WebhookConfig.findById(log.webhookId);
    if (!webhook) {
      return res.status(404).json({
        success: false,
        code: 'WEBHOOK_CONFIG_NOT_FOUND',
        message: 'إعدادات الويب هوك الأصلية غير موجودة.',
      });
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
      // Same connect-time-pinned SSRF guard as live dispatch before
      // re-posting to the saved URL.
      const httpsAgent = await buildPinnedHttpsAgent(log.url);

      const response = await axios.post(log.url, payloadString, {
        headers: {
          'Content-Type': 'application/json',
          'X-ZainBot-Signature': signature,
          'X-ZainBot-Event': log.event,
          'User-Agent': 'ZainBot-Webhook-Dispatcher/2.0-Retry'
        },
        timeout: 8000,
        maxRedirects: 0, // never follow redirects to un-validated targets
        httpsAgent
      });

      responseStatus = response.status;
      responseBody = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
      success = responseStatus >= 200 && responseStatus < 300;
      if (success && endpointRejected(response.data)) {
        // HTTP 200 carrying success:false is a delivery failure, not proof
        // of delivery. It gets the same stable failure code.
        success = false;
      }
    } catch (err) {
      success = false;
      if (err.response) {
        responseStatus = err.response.status;
        const data = err.response.data;
        responseBody = typeof data === 'object' ? JSON.stringify(data) : String(data);
      } else {
        // Transport-level failure (timeout/DNS/refused): never persist or
        // return raw client error strings (they may carry IPs/internals).
        responseStatus = 0;
        responseBody = 'NO_RESPONSE_FROM_ENDPOINT';
      }
    }

    // Update log
    log.responseStatus = responseStatus;
    log.responseBody = responseBody.slice(0, 300); // Minimize stored endpoint output (SSRF readback surface)
    log.success = success;
    log.attempts += 1;
    log.timestamp = new Date();
    await log.save();

    // Return a sanitized projection: the stored log may hold the endpoint's
    // raw body for the owner's log viewer, but the retry response itself
    // must not leak raw provider output.
    const result = {
      _id: log._id,
      event: log.event,
      url: log.url,
      success: log.success,
      responseStatus: log.responseStatus,
      attempts: log.attempts,
      timestamp: log.timestamp,
    };

    if (!success) {
      return res.status(200).json({
        success: false,
        code: 'WEBHOOK_DELIVERY_FAILED',
        message: 'تعذر تسليم الويب هوك عند إعادة المحاولة.',
        data: result,
      });
    }
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    logger.error('❌ Error retrying webhook delivery:', { err });
    res.status(500).json({ success: false, code: 'WEBHOOK_RETRY_FAILED', message: 'فشل في إعادة إرسال الويب هوك.' });
  }
};
