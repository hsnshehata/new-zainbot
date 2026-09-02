// server/services/notificationDispatcher.js
const NotificationRecipient = require('../models/NotificationRecipient');
const Bot = require('../models/Bot');
const User = require('../models/User');
const logger = require('../logger');
const { sendTelegramMessage } = require('./telegramService');
const { getWhatsAppSessionManager } = require('./whatsappSessionManager');

function formatOrderNotificationMessage(data, botName = 'ZainBot AI') {
  const itemsStr = Array.isArray(data.items)
    ? data.items.map((it) => `• ${it.title || 'منتج'} (x${it.quantity || 1}) - ${it.price || 0} ${it.currency || 'EGP'}`).join('\n')
    : '';
  return `🛒 <b>طلب جديد من المحادثة (${botName})</b>\n\n` +
    `👤 <b>العميل:</b> ${data.customerName || 'غير محدد'}\n` +
    `📞 <b>الهاتف:</b> ${data.customerPhone || 'غير محدد'}\n` +
    `📍 <b>العنوان:</b> ${data.customerAddress || 'غير محدد'}\n` +
    (itemsStr ? `📦 <b>المنتجات:</b>\n${itemsStr}\n` : '') +
    `💰 <b>الإجمالي:</b> ${data.total || data.totalAmount || 0} ${data.currency || 'EGP'}\n` +
    `🕒 <b>التاريخ:</b> ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`;
}

function formatBookingNotificationMessage(data, botName = 'ZainBot AI') {
  const dateStr = data.bookingDate ? new Date(data.bookingDate).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) : 'قريباً';
  return `📅 <b>حجز موعد جديد من المحادثة (${botName})</b>\n\n` +
    `👤 <b>العميل:</b> ${data.customerName || 'غير محدد'}\n` +
    `📞 <b>الهاتف:</b> ${data.customerPhone || 'غير محدد'}\n` +
    `💼 <b>الخدمة/الموعد:</b> ${data.serviceType || 'موعد عام'}\n` +
    `⏰ <b>التاريخ والوقت:</b> ${dateStr}\n` +
    (data.notes ? `📝 <b>ملاحظات:</b> ${data.notes}\n` : '') +
    `🕒 <b>تم الحجز في:</b> ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`;
}

/**
 * Dispatch an alert message to all matching WhatsApp and Telegram recipients
 */
async function dispatchMultiChannelNotification({ userId, botId, event, data }) {
  if (!userId && !botId) return { delivered: 0, failed: 0 };

  try {
    let effectiveUserId = userId;
    let bot = null;

    if (botId) {
      bot = await Bot.findById(botId).select('userId name telegramUserId');
      if (bot && !effectiveUserId) effectiveUserId = bot.userId;
    }

    if (!effectiveUserId) return { delivered: 0, failed: 0 };

    // Fetch user plan tier to ensure limits
    const user = await User.findById(effectiveUserId).select('planTier subscriptionType');
    const isFree = !user || user.planTier === 'free' || user.subscriptionType === 'free';

    // Find all active recipients configured for this user/bot
    let query = {
      userId: effectiveUserId,
      isActive: true,
      $or: [{ botId: null }, { botId: botId }],
    };

    let recipients = await NotificationRecipient.find(query);

    // Filter by event if specified
    if (event) {
      recipients = recipients.filter((r) => !r.events || r.events.length === 0 || r.events.includes(event));
    }

    // If free tier, enforce max 1 recipient
    if (isFree && recipients.length > 1) {
      recipients = [recipients[0]];
    }

    // Build notification message text in Arabic & English friendly format
    const botName = bot?.name || 'ZainBot AI';
    let messageText = '';

    if (event === 'order_created' || event === 'chat_order') {
      messageText = formatOrderNotificationMessage(data, botName);
    } else if (event === 'booking_created') {
      messageText = formatBookingNotificationMessage(data, botName);
    } else if (event === 'booking_rescheduled') {
      const dateStr = data.bookingDate ? new Date(data.bookingDate).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) : 'قريباً';
      messageText = `🔄 <b>تم تعديل موعد الحجز (${botName})</b>\n\n` +
        `👤 <b>العميل:</b> ${data.customerName || 'غير محدد'}\n` +
        `📞 <b>الهاتف:</b> ${data.customerPhone || 'غير محدد'}\n` +
        `⏰ <b>الموعد الجديد:</b> ${dateStr}\n` +
        (data.notes ? `📝 <b>ملاحظة:</b> ${data.notes}\n` : '');
    } else if (event === 'booking_cancelled') {
      messageText = `❌ <b>تم إلغاء الحجز (${botName})</b>\n\n` +
        `👤 <b>العميل:</b> ${data.customerName || 'غير محدد'}\n` +
        `📞 <b>الهاتف:</b> ${data.customerPhone || 'غير محدد'}\n` +
        (data.notes ? `📝 <b>السبب:</b> ${data.notes}\n` : '');
    } else {
      messageText = `🔔 <b>تنبيه من الوكيل (${botName})</b>\n\n` +
        `📌 <b>الحدث:</b> ${event}\n` +
        `📝 <b>التفاصيل:</b> ${data.message || JSON.stringify(data)}`;
    }

    let delivered = 0;
    let failed = 0;

    // 1. Deliver to Telegram recipients
    const telegramRecipients = recipients.filter((r) => r.channel === 'telegram');
    // Also support default legacy bot.telegramUserId if no custom recipient was added
    if (telegramRecipients.length === 0 && bot?.telegramUserId) {
      telegramRecipients.push({ target: bot.telegramUserId });
    }

    for (const rec of telegramRecipients) {
      try {
        const result = await sendTelegramMessage(rec.target, messageText);
        if (result.ok) delivered++;
        else failed++;
      } catch (err) {
        logger.warn('telegram_recipient_dispatch_failed', { target: rec.target, err: err.message });
        failed++;
      }
    }

    // 2. Deliver to WhatsApp recipients
    const waRecipients = recipients.filter((r) => r.channel === 'whatsapp');
    if (waRecipients.length > 0 && botId) {
      try {
        const waManager = getWhatsAppSessionManager();
        const plainText = messageText.replace(/<[^>]*>/g, '');
        for (const rec of waRecipients) {
          try {
            await waManager.sendDirectText(botId, rec.target, plainText);
            delivered++;
          } catch (waErr) {
            logger.warn('whatsapp_recipient_dispatch_failed', { target: rec.target, err: waErr.message });
            failed++;
          }
        }
      } catch (mgrErr) {
        logger.warn('whatsapp_manager_unavailable', { err: mgrErr.message });
      }
    }

    return { delivered, failed };
  } catch (error) {
    logger.error('dispatch_multi_channel_notification_error', { err: error.message, stack: error.stack });
    return { delivered: 0, failed: 1, error: error.message };
  }
}

module.exports = {
  dispatchMultiChannelNotification,
  formatOrderNotificationMessage,
  formatBookingNotificationMessage,
};
