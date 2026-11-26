// server/controllers/botController.js
const Bot = require('../models/Bot');
const express = require('express');
const axios = require('axios');
const logger = require('../logger');

// دالة مساعدة للتحقق من صيغة الوقت (HH:mm)
const isValidTimeFormat = (time) => {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
};

// جلب إعدادات البوت العامة (مثل أوقات العمل)
exports.getSettings = async (req, res) => {
  try {
    const botId = req.params.id;
    logger.info('جاري جلب إعدادات البوت', { botId });

    const bot = await Bot.findById(botId);
    if (!bot) {
      logger.warn('البوت غير موجود', { botId });
      return res.status(404).json({ success: false, message: 'البوت غير موجود' });
    }

    // Ownership: some mounts (routes/bots.js, facebook.js, instagram.js)
    // reach this handler without loadAccessibleBot, so the check must
    // live here too, same as updateSettings.
    if (req.user.role !== 'superadmin' && bot.userId.toString() !== req.user.userId.toString()) {
      logger.warn('⚠️ غير مصرح للمستخدم بعرض إعدادات البوت', { botUserId: bot.userId, requestUserId: req.user.userId });
      return res.status(403).json({ success: false, message: 'غير مصرح لك بعرض إعدادات هذا البوت' });
    }

    const settings = {
      workingHours: bot.workingHours,
      messagingOptinsEnabled: bot.messagingOptinsEnabled,
      messageReactionsEnabled: bot.messageReactionsEnabled,
      messagingReferralsEnabled: bot.messagingReferralsEnabled,
      messageEditsEnabled: bot.messageEditsEnabled,
      inboxLabelsEnabled: bot.inboxLabelsEnabled,
      commentsRepliesEnabled: bot.commentsRepliesEnabled,
      ownerPauseKeyword: bot.ownerPauseKeyword || '',
      ownerPauseKeyword: bot.ownerPauseKeyword || '',
      ownerPauseDurationMinutes: bot.ownerPauseDurationMinutes ?? 30,
      commentReplyMode: bot.commentReplyMode || 'ai',
      commentKeywords: bot.commentKeywords || [],
      commentDefaultReply: bot.commentDefaultReply || '',
      privateReplyMessage: bot.privateReplyMessage || 'تم إرسال التفاصيل على الخاص',
    };

    logger.info('✅ تم جلب إعدادات البوت بنجاح', { botId });
    res.status(200).json({ success: true, data: settings });
  } catch (err) {
    logger.error('❌ خطأ في جلب إعدادات البوت', { botId: req.params.id, err });
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};

// تحديث إعدادات البوت العامة
exports.updateSettings = async (req, res) => {
  try {
    const botId = req.params.id;
    const { workingHours, messagingOptinsEnabled, messageReactionsEnabled, messagingReferralsEnabled, messageEditsEnabled, inboxLabelsEnabled, commentsRepliesEnabled, ownerPauseKeyword, ownerPauseDurationMinutes, commentReplyMode, commentKeywords, commentDefaultReply, privateReplyMessage } = req.body;
    logger.info('📝 محاولة تحديث إعدادات البوت', { botId, bodyKeys: Object.keys(req.body || {}) });

    const bot = await Bot.findById(botId);
    if (!bot) {
      logger.warn('⚠️ البوت غير موجود', { botId });
      return res.status(404).json({ success: false, message: 'البوت غير موجود' });
    }

    if (req.user.role !== 'superadmin' && bot.userId.toString() !== req.user.userId.toString()) {
      logger.warn('⚠️ غير مصرح للمستخدم لتحديث البوت', { botUserId: bot.userId, requestUserId: req.user.userId });
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتعديل هذا البوت' });
    }

    let hasChanges = false;
    if (workingHours) {
      if (!workingHours.start || !workingHours.end || !isValidTimeFormat(workingHours.start) || !isValidTimeFormat(workingHours.end)) {
        logger.warn('⚠️ صيغة أوقات العمل غير صحيحة', { botId, workingHours });
        return res.status(400).json({ success: false, message: 'صيغة أوقات العمل غير صحيحة، يجب أن تكون HH:mm' });
      }
      if (workingHours.start !== bot.workingHours?.start || workingHours.end !== bot.workingHours?.end) {
        bot.workingHours = { start: workingHours.start, end: workingHours.end };
        hasChanges = true;
      }
    }

    const booleanFields = {
      messagingOptinsEnabled,
      messageReactionsEnabled,
      messagingReferralsEnabled,
      messageEditsEnabled,
      inboxLabelsEnabled,
      commentsRepliesEnabled,
    };

    for (const [key, value] of Object.entries(booleanFields)) {
      if (value !== undefined) {
        if (typeof value !== 'boolean') {
          logger.warn('⚠️ القيمة غير صحيحة', { botId, field: key, value });
          return res.status(400).json({ success: false, message: `القيمة ${key} يجب أن تكون true أو false` });
        }
        if (bot[key] !== value) {
          bot[key] = value;
          hasChanges = true;
        }
      }
    }

    if (ownerPauseKeyword !== undefined) {
      if (ownerPauseKeyword !== null && typeof ownerPauseKeyword !== 'string') {
        logger.warn('⚠️ صيغة الكلمة غير صحيحة', { botId, ownerPauseKeyword });
        return res.status(400).json({ success: false, message: 'كلمة الإيقاف يجب أن تكون نصًا' });
      }
      bot.ownerPauseKeyword = ownerPauseKeyword ? ownerPauseKeyword.trim() : '';
      hasChanges = true;
    }

    if (commentReplyMode !== undefined) {
      if (!['ai', 'keyword', 'private'].includes(commentReplyMode)) {
        return res.status(400).json({ success: false, message: 'نظام الرد غير صحيح' });
      }
      bot.commentReplyMode = commentReplyMode;
      hasChanges = true;
    }

    if (commentKeywords !== undefined) {
      if (!Array.isArray(commentKeywords)) {
        return res.status(400).json({ success: false, message: 'الكلمات المفتاحية يجب أن تكون مصفوفة' });
      }
      bot.commentKeywords = commentKeywords;
      hasChanges = true;
    }

    if (commentDefaultReply !== undefined) {
      bot.commentDefaultReply = commentDefaultReply ? commentDefaultReply.trim() : '';
      hasChanges = true;
    }

    if (privateReplyMessage !== undefined) {
      bot.privateReplyMessage = privateReplyMessage ? privateReplyMessage.trim() : 'تم إرسال التفاصيل على الخاص';
      hasChanges = true;
    }

    if (ownerPauseDurationMinutes !== undefined) {
      const durationNumber = Number(ownerPauseDurationMinutes);
      if (Number.isNaN(durationNumber) || durationNumber < 0 || durationNumber > 10080) {
        logger.warn('⚠️ مدة الإيقاف غير صحيحة', { botId, ownerPauseDurationMinutes });
        return res.status(400).json({ success: false, message: 'مدة الإيقاف يجب أن تكون بين 0 و 10080 دقيقة' });
      }
      bot.ownerPauseDurationMinutes = durationNumber;
      hasChanges = true;
    }

    if (hasChanges) {
      await bot.save();
      logger.info('✅ تم تحديث إعدادات البوت بنجاح', { botId });
    } else {
      logger.info('⚠️ لا توجد تغييرات لتحديثها', { botId });
    }

    const updatedSettings = {
      workingHours: bot.workingHours,
      messagingOptinsEnabled: bot.messagingOptinsEnabled,
      messageReactionsEnabled: bot.messageReactionsEnabled,
      messagingReferralsEnabled: bot.messagingReferralsEnabled,
      messageEditsEnabled: bot.messageEditsEnabled,
      inboxLabelsEnabled: bot.inboxLabelsEnabled,
      commentsRepliesEnabled: bot.commentsRepliesEnabled,
      ownerPauseKeyword: bot.ownerPauseKeyword || '',
      ownerPauseKeyword: bot.ownerPauseKeyword || '',
      ownerPauseDurationMinutes: bot.ownerPauseDurationMinutes ?? 30,
      commentReplyMode: bot.commentReplyMode || 'ai',
      commentKeywords: bot.commentKeywords || [],
      commentDefaultReply: bot.commentDefaultReply || '',
      privateReplyMessage: bot.privateReplyMessage || 'تم إرسال التفاصيل على الخاص',
    };

    res.status(200).json({ success: true, data: updatedSettings });
  } catch (err) {
    logger.error('❌ خطأ في تحديث إعدادات البوت', { botId: req.params.id, err });
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};

// جلب إعدادات الإنستجرام
exports.getInstagramSettings = async (req, res) => {
  try {
    const botId = req.params.id;
    logger.info('جاري جلب إعدادات الإنستجرام', { botId });

    const bot = await Bot.findById(botId);
    if (!bot) {
      logger.warn('البوت غير موجود', { botId });
      return res.status(404).json({ success: false, message: 'البوت غير موجود' });
    }

    const instagramSettings = {
      instagramMessagingOptinsEnabled: bot.instagramMessagingOptinsEnabled,
      instagramMessageReactionsEnabled: bot.instagramMessageReactionsEnabled,
      instagramMessagingReferralsEnabled: bot.instagramMessagingReferralsEnabled,
      instagramMessageEditsEnabled: bot.instagramMessageEditsEnabled,
      instagramInboxLabelsEnabled: bot.instagramInboxLabelsEnabled,
      instagramCommentsRepliesEnabled: bot.instagramCommentsRepliesEnabled,
    };

    logger.info('✅ تم جلب إعدادات الإنستجرام بنجاح', { botId });
    res.status(200).json({ success: true, data: instagramSettings });
  } catch (err) {
    logger.error('❌ خطأ في جلب إعدادات الإنستجرام', { botId: req.params.id, err });
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};

// تحديث إعدادات الإنستجرام
exports.updateInstagramSettings = async (req, res) => {
  try {
    const botId = req.params.id;
    const { instagramMessagingOptinsEnabled, instagramMessageReactionsEnabled, instagramMessagingReferralsEnabled, instagramMessageEditsEnabled, instagramInboxLabelsEnabled, instagramCommentsRepliesEnabled } = req.body;
    logger.info('📝 محاولة تحديث إعدادات الإنستجرام', { botId, bodyKeys: Object.keys(req.body || {}) });

    const bot = await Bot.findById(botId);
    if (!bot) {
      logger.warn('⚠️ البوت غير موجود', { botId });
      return res.status(404).json({ success: false, message: 'البوت غير موجود' });
    }

    if (req.user.role !== 'superadmin' && bot.userId.toString() !== req.user.userId.toString()) {
      logger.warn('⚠️ غير مصرح للمستخدم', { botUserId: bot.userId, requestUserId: req.user.userId });
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتعديل هذا البوت' });
    }

    const booleanFields = {
      instagramMessagingOptinsEnabled,
      instagramMessageReactionsEnabled,
      instagramMessagingReferralsEnabled,
      instagramMessageEditsEnabled,
      instagramInboxLabelsEnabled,
      instagramCommentsRepliesEnabled,
    };

    let hasChanges = false;
    for (const [key, value] of Object.entries(booleanFields)) {
      if (value !== undefined) {
        if (typeof value !== 'boolean') {
          logger.warn('⚠️ القيمة غير صحيحة', { botId, field: key, value });
          return res.status(400).json({ success: false, message: `القيمة ${key} يجب أن تكون true أو false` });
        }
        if (bot[key] !== value) {
          bot[key] = value;
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      await bot.save();
      logger.info('✅ تم تحديث إعدادات الإنستجرام بنجاح', { botId });
    } else {
      logger.info('⚠️ لا توجد تغييرات لتحديثها', { botId });
    }

    const updatedInstagramSettings = {
      instagramMessagingOptinsEnabled: bot.instagramMessagingOptinsEnabled,
      instagramMessageReactionsEnabled: bot.instagramMessageReactionsEnabled,
      instagramMessagingReferralsEnabled: bot.instagramMessagingReferralsEnabled,
      instagramMessageEditsEnabled: bot.instagramMessageEditsEnabled,
      instagramInboxLabelsEnabled: bot.instagramInboxLabelsEnabled,
      instagramCommentsRepliesEnabled: bot.instagramCommentsRepliesEnabled,
    };

    res.status(200).json({ success: true, data: updatedInstagramSettings });
  } catch (err) {
    logger.error('❌ خطأ في تحديث إعدادات الإنستجرام', { botId: req.params.id, err });
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};

// جلب إعدادات واتساب
exports.getWhatsAppSettings = async (req, res) => {
  try {
    const botId = req.params.botId;
    logger.info('جاري جلب إعدادات واتساب', { botId });

    const bot = await Bot.findById(botId);
    if (!bot) {
      logger.warn('⚠️ البوت غير موجود', { botId });
      return res.status(404).json({ success: false, message: 'البوت غير موجود' });
    }

    const whatsappSettings = {
      whatsappMessagingOptinsEnabled: bot.whatsappMessagingOptinsEnabled,
      whatsappMessageReactionsEnabled: bot.whatsappMessageReactionsEnabled,
      whatsappMessagingReferralsEnabled: bot.whatsappMessagingReferralsEnabled,
      whatsappMessageEditsEnabled: bot.whatsappMessageEditsEnabled,
    };

    logger.info('✅ تم جلب إعدادات واتساب بنجاح', { botId });
    res.status(200).json({ success: true, data: whatsappSettings });
  } catch (err) {
    logger.error('❌ خطأ في جلب إعدادات واتساب', { botId: req.params.botId, err });
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};

// تحديث إعدادات واتساب
exports.updateWhatsAppSettings = async (req, res) => {
  try {
    const botId = req.params.botId;
    const { whatsappMessagingOptinsEnabled, whatsappMessageReactionsEnabled, whatsappMessagingReferralsEnabled, whatsappMessageEditsEnabled } = req.body;
    logger.info('📝 محاولة تحديث إعدادات واتساب', { botId, bodyKeys: Object.keys(req.body || {}) });

    const bot = await Bot.findById(botId);
    if (!bot) {
      logger.warn('⚠️ البوت غير موجود', { botId });
      return res.status(404).json({ success: false, message: 'البوت غير موجود' });
    }

    if (req.user.role !== 'superadmin' && bot.userId.toString() !== req.user.userId.toString()) {
      logger.warn('⚠️ غير مصرح للمستخدم', { botUserId: bot.userId, requestUserId: req.user.userId });
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتعديل هذا البوت' });
    }

    const booleanFields = {
      whatsappMessagingOptinsEnabled,
      whatsappMessageReactionsEnabled,
      whatsappMessagingReferralsEnabled,
      whatsappMessageEditsEnabled,
    };

    let hasChanges = false;
    for (const [key, value] of Object.entries(booleanFields)) {
      if (value !== undefined) {
        if (typeof value !== 'boolean') {
          logger.warn('⚠️ القيمة غير صحيحة', { botId, field: key, value });
          return res.status(400).json({ success: false, message: `القيمة ${key} يجب أن تكون true أو false` });
        }
        if (bot[key] !== value) {
          bot[key] = value;
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      await bot.save();
      logger.info('✅ تم تحديث إعدادات واتساب بنجاح', { botId });
    } else {
      logger.info('⚠️ لا توجد تغييرات لتحديثها', { botId });
    }

    const updatedWhatsAppSettings = {
      whatsappMessagingOptinsEnabled: bot.whatsappMessagingOptinsEnabled,
      whatsappMessageReactionsEnabled: bot.whatsappMessageReactionsEnabled,
      whatsappMessagingReferralsEnabled: bot.whatsappMessagingReferralsEnabled,
      whatsappMessageEditsEnabled: bot.whatsappMessageEditsEnabled,
    };

    res.status(200).json({ success: true, data: updatedWhatsAppSettings });
  } catch (err) {
    logger.error('❌ خطأ في تحديث إعدادات واتساب', { botId: req.params.botId, err });
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};

// إلغاء ربط حساب واتساب
exports.unlinkWhatsApp = async (req, res) => {
  try {
    const botId = req.params.id;
    logger.info('📝 محاولة إلغاء ربط حساب واتساب', { botId });

    const bot = await Bot.findById(botId);
    if (!bot) {
      logger.warn('⚠️ البوت غير موجود', { botId });
      return res.status(404).json({ success: false, message: 'البوت غير موجود' });
    }

    if (req.user.role !== 'superadmin' && bot.userId.toString() !== req.user.userId.toString()) {
      logger.warn('⚠️ غير مصرح للمستخدم', { botUserId: bot.userId, requestUserId: req.user.userId });
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتعديل هذا البوت' });
    }

    bot.whatsappApiKey = null;
    bot.whatsappBusinessAccountId = null;
    bot.lastWhatsappTokenRefresh = null;
    await bot.save();

    logger.info('✅ تم إلغاء ربط حساب واتساب بنجاح', { botId });
    res.status(200).json({ success: true, message: 'تم إلغاء ربط حساب واتساب بنجاح' });
  } catch (err) {
    logger.error('❌ خطأ في إلغاء ربط حساب واتساب', { botId: req.params.id, err });
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};

// تعديل دالة linkSocial لدعم واتساب
exports.linkSocial = async (req, res) => {
  try {
    const botId = req.params.id;
    const { facebookApiKey, facebookPageId, instagramApiKey, instagramPageId, whatsappApiKey, whatsappBusinessAccountId } = req.body;
    logger.info('📝 محاولة ربط حساب اجتماعي', { botId, bodyKeys: Object.keys(req.body || {}) });

    if (!facebookApiKey && !facebookPageId && !instagramApiKey && !instagramPageId && !whatsappApiKey && !whatsappBusinessAccountId) {
      logger.warn('⚠️ لا توجد بيانات للربط', { botId });
      return res.status(400).json({ success: false, message: 'يجب توفير مفتاح API ومعرف الحساب لفيسبوك، إنستجرام، أو واتساب' });
    }

    const bot = await Bot.findById(botId);
    if (!bot) {
      logger.warn('⚠️ البوت غير موجود', { botId });
      return res.status(404).json({ success: false, message: 'البوت غير موجود' });
    }

    if (req.user.role !== 'superadmin' && bot.userId.toString() !== req.user.userId.toString()) {
      logger.warn('⚠️ غير مصرح للمستخدم', { botUserId: bot.userId, requestUserId: req.user.userId });
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتعديل هذا البوت' });
    }

    let platform = '';
    if (facebookApiKey && facebookPageId) {
      platform = 'facebook';
      bot.facebookApiKey = facebookApiKey;
      bot.facebookPageId = facebookPageId;
      bot.lastInstagramTokenRefresh = new Date(); // تحديث تاريخ الربط
      try {
        const subscribedFields = [
          'messages',
          'message_echoes',
          'message_deliveries',
          'message_reads',
          'messaging_postbacks',
          'messaging_optins',
          'messaging_optouts',
          'messaging_referrals',
          'message_edits',
          'message_reactions',
          'inbox_labels',
          'messaging_customer_information',
          'response_feedback',
          'messaging_integrity',
          'feed'
        ].join(',');
        const subscriptionResponse = await axios.post(
          `https://graph.facebook.com/v22.0/${facebookPageId}/subscribed_apps`,
          { subscribed_fields: subscribedFields, access_token: facebookApiKey }
        );
        if (!subscriptionResponse.data.success) {
          logger.error('❌ فشل في الاشتراك في Webhook Events لفيسبوك', { botId });
          return res.status(400).json({ success: false, message: 'فشل في الاشتراك في Webhook Events' });
        }
      } catch (err) {
        logger.error('❌ خطأ في الاشتراك في Webhook Events لفيسبوك', { botId, err: err.message });
        return res.status(500).json({ success: false, message: 'خطأ في الاشتراك في Webhook Events' });
      }
    }
    if (instagramApiKey && instagramPageId) {
      platform = 'instagram';
      bot.instagramApiKey = instagramApiKey;
      bot.instagramPageId = instagramPageId;
      bot.lastInstagramTokenRefresh = new Date();
    }
    if (whatsappApiKey && whatsappBusinessAccountId) {
      platform = 'whatsapp';
      bot.whatsappApiKey = whatsappApiKey;
      bot.whatsappBusinessAccountId = whatsappBusinessAccountId;
      bot.lastWhatsappTokenRefresh = new Date();
    }

    await bot.save();
    logger.info('✅ تم ربط حساب اجتماعي بنجاح', { botId, platform });
    res.status(200).json({ success: true, message: `تم ربط حساب ${platform} بنجاح` });
  } catch (err) {
    logger.error('❌ خطأ في ربط حساب اجتماعي', { botId: req.params.id, err });
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};
module.exports = exports;
