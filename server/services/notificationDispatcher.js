// server/services/notificationDispatcher.js
const NotificationRecipient = require('../models/NotificationRecipient');
const Bot = require('../models/Bot');
const User = require('../models/User');
const logger = require('../logger');
const { sendTelegramMessage } = require('./telegramService');

// Dynamic values are text, never Telegram markup. Escape at the rendering
// boundary; keep original stored values untouched for other channels.
function escapeTelegramHtml(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Only our static <b> wrappers are removed. Decode our entities once, AFTER
// removing wrappers, so a customer's literal <b> or &lt; is preserved as text.
function notificationPlainText(value) {
  return String(value).replace(/<\/?b>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function formatOrderNotificationMessage(data, botName = 'ZainBot AI') {
  const itemsStr = Array.isArray(data.items)
    ? data.items.map((it) => `• ${escapeTelegramHtml(it.title || 'منتج')} (x${escapeTelegramHtml(it.quantity || 1)}) - ${escapeTelegramHtml(it.price || 0)} ${escapeTelegramHtml(it.currency || 'EGP')}`).join('\n')
    : '';
  return `🛒 <b>طلب جديد من المحادثة (${escapeTelegramHtml(botName)})</b>\n\n` +
    `👤 <b>العميل:</b> ${escapeTelegramHtml(data.customerName || 'غير محدد')}\n` +
    `📞 <b>الهاتف:</b> ${escapeTelegramHtml(data.customerPhone || 'غير محدد')}\n` +
    `📍 <b>العنوان:</b> ${escapeTelegramHtml(data.customerAddress || 'غير محدد')}\n` +
    (itemsStr ? `📦 <b>المنتجات:</b>\n${itemsStr}\n` : '') +
    `💰 <b>الإجمالي:</b> ${escapeTelegramHtml(data.total || data.totalAmount || 0)} ${escapeTelegramHtml(data.currency || 'EGP')}\n` +
    `🕒 <b>التاريخ:</b> ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`;
}

function formatBookingNotificationMessage(data, botName = 'ZainBot AI') {
  const dateStr = data.bookingDate ? new Date(data.bookingDate).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) : 'قريباً';
  return `📅 <b>حجز موعد جديد من المحادثة (${escapeTelegramHtml(botName)})</b>\n\n` +
    `👤 <b>العميل:</b> ${escapeTelegramHtml(data.customerName || 'غير محدد')}\n` +
    `📞 <b>الهاتف:</b> ${escapeTelegramHtml(data.customerPhone || 'غير محدد')}\n` +
    `💼 <b>الخدمة/الموعد:</b> ${escapeTelegramHtml(data.serviceType || 'موعد عام')}\n` +
    `⏰ <b>التاريخ والوقت:</b> ${escapeTelegramHtml(dateStr)}\n` +
    (data.notes ? `📝 <b>ملاحظات:</b> ${escapeTelegramHtml(data.notes)}\n` : '') +
    `🕒 <b>تم الحجز في:</b> ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`;
}

const Notification = require('../models/Notification');

function formatComplaintNotificationMessage(data, botName = 'ZainBot AI') {
  return `⚠️ <b>تنبيه عاجل: شكوى أو طلب تدخل بشري (${escapeTelegramHtml(botName)})</b>\n\n` +
    `👤 <b>العميل:</b> ${escapeTelegramHtml(data.customerName || data.username || data.sourceUsername || 'غير محدد')}\n` +
    `📞 <b>معرف/هاتف:</b> ${escapeTelegramHtml(data.customerPhone || data.userId || 'غير محدد')}\n` +
    `💬 <b>نص الرسالة:</b> ${escapeTelegramHtml(data.message || data.userMessageContent || 'طلب التحدث مع خدمة العملاء')}\n` +
    `🕒 <b>الوقت:</b> ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`;
}

function formatDailyDigestNotificationMessage(data, botName = 'ZainBot AI') {
  return `📊 <b>تقرير الأداء والمبيعات اليومي (${escapeTelegramHtml(botName)})</b>\n\n` +
    `💬 <b>محادثات اليوم الجديدة:</b> ${escapeTelegramHtml(data.conversationsCount || 0)}\n` +
    `🛒 <b>الطلبات الجديدة:</b> ${escapeTelegramHtml(data.ordersCount || 0)}\n` +
    `💰 <b>إجمالي مبيعات اليوم:</b> ${escapeTelegramHtml(data.revenue || 0)} ${escapeTelegramHtml(data.currency || 'EGP')}\n` +
    `📅 <b>المواعيد المحجوزة:</b> ${escapeTelegramHtml(data.bookingsCount || 0)}\n` +
    `🔥 <b>العملاء المهتمين بشدة:</b> ${escapeTelegramHtml(data.hotLeadsCount || 0)}\n` +
    `🕒 <b>التاريخ:</b> ${new Date().toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' })}`;
}

/**
 * Dispatch an alert message to all matching WhatsApp and Telegram recipients
 */
async function dispatchMultiChannelNotification({ userId, botId, event, data = {} }) {
  if (!userId && !botId) return { delivered: 0, failed: 0 };

  try {
    let effectiveUserId = userId;
    let bot = null;

    if (botId) {
      bot = await Bot.findById(botId).select('userId name telegramUserId');
      if (bot && !effectiveUserId) effectiveUserId = bot.userId;
    }

    if (!effectiveUserId) return { delivered: 0, failed: 0 };

    // Fetch user subscription tier to ensure limits
    const user = await User.findById(effectiveUserId).select('subscriptionTier subscriptionType');
    const tier = user?.subscriptionTier || 'free';
    const sub = user?.subscriptionType || 'free';
    const isFree = !user || (tier === 'free' && sub === 'free');

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
    let notificationTitle = `تنبيه من ${botName}`;

    if (event === 'order_created' || event === 'chat_order') {
      notificationTitle = `🛒 طلب جديد من المحادثة (${botName})`;
      messageText = formatOrderNotificationMessage(data, botName);
    } else if (event === 'booking_created') {
      notificationTitle = `📅 حجز موعد جديد (${botName})`;
      messageText = formatBookingNotificationMessage(data, botName);
    } else if (event === 'booking_rescheduled') {
      const dateStr = data.bookingDate ? new Date(data.bookingDate).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) : 'قريباً';
      notificationTitle = `🔄 تعديل موعد حجز (${botName})`;
      messageText = `🔄 <b>تم تعديل موعد الحجز (${escapeTelegramHtml(botName)})</b>\n\n` +
        `👤 <b>العميل:</b> ${escapeTelegramHtml(data.customerName || 'غير محدد')}\n` +
        `📞 <b>الهاتف:</b> ${escapeTelegramHtml(data.customerPhone || 'غير محدد')}\n` +
        `⏰ <b>الموعد الجديد:</b> ${escapeTelegramHtml(dateStr)}\n` +
        (data.notes ? `📝 <b>ملاحظة:</b> ${escapeTelegramHtml(data.notes)}\n` : '');
    } else if (event === 'booking_cancelled') {
      notificationTitle = `❌ إلغاء حجز (${botName})`;
      messageText = `❌ <b>تم إلغاء الحجز (${escapeTelegramHtml(botName)})</b>\n\n` +
        `👤 <b>العميل:</b> ${escapeTelegramHtml(data.customerName || 'غير محدد')}\n` +
        `📞 <b>الهاتف:</b> ${escapeTelegramHtml(data.customerPhone || 'غير محدد')}\n` +
        (data.notes ? `📝 <b>السبب:</b> ${escapeTelegramHtml(data.notes)}\n` : '');
    } else if (event === 'urgent_complaint' || event === 'human_handoff') {
      notificationTitle = `⚠️ شكوى أو طلب تدخل بشري (${botName})`;
      messageText = formatComplaintNotificationMessage(data, botName);
    } else if (event === 'daily_digest') {
      notificationTitle = `📊 ملخص المبيعات والأداء اليومي (${botName})`;
      messageText = formatDailyDigestNotificationMessage(data, botName);
    } else {
      messageText = `🔔 <b>تنبيه من الوكيل (${escapeTelegramHtml(botName)})</b>\n\n` +
        `📌 <b>الحدث:</b> ${escapeTelegramHtml(event)}\n` +
        `📝 <b>التفاصيل:</b> ${escapeTelegramHtml(data.message || JSON.stringify(data))}`;
    }

    // Always create an in-app notification record
    try {
      const plainSnippet = notificationPlainText(messageText).slice(0, 500);
      await Notification.create({
        user: effectiveUserId,
        title: notificationTitle,
        message: plainSnippet,
        isRead: false,
      });
    } catch (notifErr) {
      logger.warn('in_app_notification_creation_failed', { err: notifErr.message });
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
        const { getWhatsAppSessionManager } = require('./whatsappSessionManager');
        const waManager = getWhatsAppSessionManager();
        const plainText = notificationPlainText(messageText);
        for (const rec of waRecipients) {
          try {
            await waManager.sendMessage(botId, rec.target, plainText);
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
  formatComplaintNotificationMessage,
  formatDailyDigestNotificationMessage,
};
