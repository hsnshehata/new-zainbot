// server/controllers/notificationsController.js
const Notification = require('../models/Notification');
const NotificationRecipient = require('../models/NotificationRecipient');
const User = require('../models/User');
const Bot = require('../models/Bot');
const logger = require('../logger');
const { sendTelegramMessage } = require('../services/telegramService');
const { getWhatsAppSessionManager } = require('../services/whatsappSessionManager');

const isFreeTier = (user) => {
  if (!user) return true;
  const tier = user.planTier || 'free';
  const sub = user.subscriptionType || 'free';
  return tier === 'free' && sub === 'free';
};

// In-app notifications
async function sendGlobalNotification(req, res) {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: 'العنوان والرسالة مطلوبان' });
    }
    const users = await User.find({}, '_id');
    const notifications = users.map((u) => ({
      title,
      message,
      user: u._id,
      createdAt: new Date(),
    }));
    await Notification.insertMany(notifications);
    return res.json({ success: true, message: 'تم إرسال الإشعار لجميع المستخدمين' });
  } catch (err) {
    logger.error('send_global_notification_error', { err: err.message });
    return res.status(500).json({ message: 'خطأ في إرسال الإشعار العام' });
  }
}

async function sendNotification(req, res) {
  try {
    const { username, title, message } = req.body;
    if (!username || !title || !message) {
      return res.status(400).json({ message: 'اسم المستخدم، العنوان، والرسالة مطلوبة' });
    }
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

    const notification = await Notification.create({
      title,
      message,
      user: user._id,
    });
    return res.json({ success: true, data: notification });
  } catch (err) {
    logger.error('send_notification_error', { err: err.message });
    return res.status(500).json({ message: 'خطأ في إرسال الإشعار' });
  }
}

async function getNotifications(req, res) {
  try {
    const userId = req.user.userId;
    const notifications = await Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(50);
    return res.json(notifications);
  } catch (err) {
    logger.error('get_notifications_error', { err: err.message });
    return res.status(500).json({ message: 'خطأ في جلب الإشعارات' });
  }
}

async function markAsRead(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    await Notification.findOneAndUpdate({ _id: id, user: userId }, { isRead: true });
    return res.json({ success: true, message: 'تم تعيين الإشعار كمقروء' });
  } catch (err) {
    logger.error('mark_notification_read_error', { err: err.message });
    return res.status(500).json({ message: 'خطأ في تحديث الإشعار' });
  }
}

// Multi-channel Notification Recipients
async function listRecipients(req, res) {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select('planTier subscriptionType');
    const free = isFreeTier(user);

    let query = { userId };
    if (req.query.botId) {
      query.$or = [{ botId: null }, { botId: req.query.botId }];
    }

    const recipients = await NotificationRecipient.find(query).sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: recipients,
      recipients,
      isFreePlan: free,
      limit: free ? 1 : null,
      count: recipients.length,
    });
  } catch (err) {
    logger.error('notification_recipients_list_error', { err: err.message });
    return res.status(500).json({ message: 'خطأ في جلب مستلمي الإشعارات' });
  }
}

async function createRecipient(req, res) {
  try {
    const userId = req.user.userId;
    const { botId, channel, target, label, events } = req.body;

    if (!channel || !target) {
      return res.status(400).json({ message: 'القناة (channel) والوجهة (target) مطلوبتان' });
    }

    if (!['whatsapp', 'telegram'].includes(channel)) {
      return res.status(400).json({ message: 'القناة يجب أن تكون whatsapp أو telegram' });
    }

    const user = await User.findById(userId).select('planTier subscriptionType');
    const free = isFreeTier(user);

    if (free) {
      const existingCount = await NotificationRecipient.countDocuments({ userId });
      if (existingCount >= 1) {
        return res.status(403).json({
          success: false,
          code: 'FREE_PLAN_NOTIFICATION_LIMIT',
          message: 'تسمح الباقة المجانية بربط قناة واحدة فقط لتلقي الإشعارات. يرجى الترقية لإضافة أرقام وقنوات متعددة.',
        });
      }
    }

    if (botId) {
      const bot = await Bot.findOne({ _id: botId, userId });
      if (!bot && req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'غير مصرح بربط هذا الوكيل' });
      }
    }

    const recipient = await NotificationRecipient.create({
      userId,
      botId: botId || null,
      channel,
      target: target.trim(),
      label: (label || (channel === 'whatsapp' ? 'رقم واتساب للإشعارات' : 'حساب تيليجرام للإشعارات')).trim(),
      events: Array.isArray(events) && events.length ? events : ['order_created', 'booking_created'],
      isActive: true,
    });

    return res.status(201).json({ success: true, data: recipient, recipient });
  } catch (err) {
    logger.error('notification_recipient_create_error', { err: err.message });
    return res.status(500).json({ message: 'خطأ في إضافة مستلم الإشعار' });
  }
}

async function updateRecipient(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { target, label, events, isActive } = req.body;

    const recipient = await NotificationRecipient.findOne({ _id: id, userId });
    if (!recipient) return res.status(404).json({ message: 'مستلم الإشعار غير موجود' });

    if (target) recipient.target = target.trim();
    if (label !== undefined) recipient.label = label.trim();
    if (Array.isArray(events)) recipient.events = events;
    if (isActive !== undefined) recipient.isActive = Boolean(isActive);

    await recipient.save();
    return res.json({ success: true, data: recipient, recipient });
  } catch (err) {
    logger.error('notification_recipient_update_error', { err: err.message });
    return res.status(500).json({ message: 'خطأ في تحديث مستلم الإشعار' });
  }
}

async function deleteRecipient(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const recipient = await NotificationRecipient.findOne({ _id: id, userId });
    if (!recipient) return res.status(404).json({ message: 'مستلم الإشعار غير موجود' });

    await recipient.deleteOne();
    return res.json({ success: true, message: 'تم حذف مستلم الإشعار بنجاح' });
  } catch (err) {
    logger.error('notification_recipient_delete_error', { err: err.message });
    return res.status(500).json({ message: 'خطأ في حذف مستلم الإشعار' });
  }
}

async function testRecipient(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const recipient = await NotificationRecipient.findOne({ _id: id, userId });
    if (!recipient) return res.status(404).json({ message: 'مستلم الإشعار غير موجود' });

    const testMsg = '🔔 <b>اختبار إشعارات ZainBot AI</b>\n\nتم إرسال هذا الإشعار التجريبي للتأكد من نجاح ربط القناة لتلقي التنبيهات الفورية بنجاح. ✅';

    if (recipient.channel === 'telegram') {
      const result = await sendTelegramMessage(recipient.target, testMsg);
      if (result.ok) {
        return res.json({ success: true, message: 'تم إرسال الإشعار التجريبي عبر تيليجرام بنجاح' });
      }
      return res.status(400).json({ success: false, message: `فشل الإرسال: ${result.reason || 'تأكد من بدء محادثة مع البوت'}` });
    }

    if (recipient.channel === 'whatsapp') {
      if (recipient.botId) {
        const waManager = getWhatsAppSessionManager();
        await waManager.sendDirectText(recipient.botId, recipient.target, testMsg.replace(/<[^>]*>/g, ''));
        return res.json({ success: true, message: 'تم إرسال الإشعار التجريبي عبر واتساب بنجاح' });
      }
      return res.json({ success: true, message: 'تم حفظ إعدادات واتساب للإشعارات بنجاح' });
    }

    return res.json({ success: true, message: 'تم الاختبار' });
  } catch (err) {
    logger.error('notification_recipient_test_error', { err: err.message });
    return res.status(500).json({ message: `خطأ في إرسال الإشعار التجريبي: ${err.message}` });
  }
}

module.exports = {
  sendGlobalNotification,
  sendNotification,
  getNotifications,
  markAsRead,
  listRecipients,
  createRecipient,
  updateRecipient,
  deleteRecipient,
  testRecipient,
};
