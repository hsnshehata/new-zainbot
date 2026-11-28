// server/services/notificationDispatcher.js
const NotificationRecipient = require('../models/NotificationRecipient');
const Bot = require('../models/Bot');
const User = require('../models/User');
const logger = require('../logger');
const { sendTelegramMessage } = require('./telegramService');
const channelGuard = require('./channelGuard');

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

const COPILOT_CHANNEL_LABELS = {
  whatsapp: 'واتساب',
  facebook: 'فيسبوك',
  instagram: 'إنستجرام',
  web: 'دردشة الويب',
  telegram: 'تيليجرام',
};

function formatCopilotDraftNotificationMessage(data = {}, botName = 'ZainBot AI') {
  const rawChannel = String(data.channel || '').trim().toLowerCase();
  const channelLabel = COPILOT_CHANNEL_LABELS[rawChannel] || (data.channel ? String(data.channel) : 'محادثة');
  const customerName = data.customerName || data.username || 'عميل';
  const snippet = data.customerMessageSnippet || data.message || '';
  const suggestedReply = data.suggestedReply || '';
  const draftCode = data.draftCode ? String(data.draftCode).trim() : '';

  let msg = `💬 <b>مسودة رد جديدة (${escapeTelegramHtml(botName)})</b>\n\n` +
    `👤 <b>العميل:</b> ${escapeTelegramHtml(customerName)} (${escapeTelegramHtml(channelLabel)})\n`;

  if (snippet) {
    msg += `📩 <b>سؤاله:</b> «${escapeTelegramHtml(snippet)}»\n`;
  }
  if (suggestedReply) {
    msg += `📝 <b>الرد المقترح:</b>\n«${escapeTelegramHtml(suggestedReply)}»\n`;
  }
  if (draftCode) {
    msg += `\nرد بـ:\n` +
      `• <b>إرسال ${escapeTelegramHtml(draftCode)}</b> (إرسال فوري)\n` +
      `• <b>تعديل ${escapeTelegramHtml(draftCode)}: النص الجديد</b>\n` +
      `• <b>تجاهل ${escapeTelegramHtml(draftCode)}</b>`;
  }

  return msg.trim();
}

function buildCopilotTelegramInlineKeyboard(draftId) {
  const id = String(draftId || '').trim();
  if (!id) return undefined;
  return {
    inline_keyboard: [
      [
        { text: '✅ إرسال', callback_data: `cp_send:${id}` },
        { text: '❌ تجاهل', callback_data: `cp_drop:${id}` },
      ],
    ],
  };
}

// Dispatched event names that a recipient subscribes to under another name.
// chat_order (orders created in chat) is the "New Orders" subscription and
// human_handoff is the "handoff" subscription.
const EVENT_SUBSCRIPTION_ALIASES = {
  chat_order: ['order_created'],
  human_handoff: ['handoff'],
};

// Alert types that could not be selected when older channels were created.
// Those channels (no eventsVersion) get them by default; channels created with
// the full modal (eventsVersion 2) only get what the user ticked.
const LEGACY_DEFAULT_ON_EVENTS = new Set(['human_handoff', 'handoff', 'urgent_complaint', 'daily_digest', 'low_stock']);

function recipientWantsEvent(recipient, event) {
  const subscribed = recipient && recipient.events;
  if (!event || !Array.isArray(subscribed) || subscribed.length === 0) return true;
  if (LEGACY_DEFAULT_ON_EVENTS.has(event) && !(recipient && recipient.eventsVersion >= 2)) return true;
  if (subscribed.includes(event)) return true;
  return (EVENT_SUBSCRIPTION_ALIASES[event] || []).some((alias) => subscribed.includes(alias));
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
      bot = await Bot.findById(botId).select('userId name telegramUserId copilotSettings');
      if (bot && !effectiveUserId) effectiveUserId = bot.userId;
    }

    if (!effectiveUserId) return { delivered: 0, failed: 0 };

    // Fetch user subscription tier and optional verified WhatsApp phone / Telegram ID
    const user = await User.findById(effectiveUserId).select(
      'subscriptionTier subscriptionType telegramUserId assistantSettings.verifiedWhatsappPhone'
    );

    const botName = bot?.name || 'ZainBot AI';

    // Dedicated strictly opt-in mobile approval flow for Copilot drafts:
    // - Never sends to generic NotificationRecipients or merchant WhatsApp bots
    // - Telegram 1-tap inline buttons only when bot.copilotSettings.notifyChannels.telegramToMerchant === true
    // - ZainBot Main WhatsApp only when bot.copilotSettings.notifyChannels.whatsappToMerchant === true
    //   AND merchant has verifiedWhatsappPhone (Slice 3)
    // - Respects CHANNELS_MODE (channelGuard) and fails silent on errors
    if (event === 'copilot_draft') {
      const notifyChannels = bot?.copilotSettings?.notifyChannels || {};
      const notificationTitle = `💬 مسودة رد جديدة (${botName})`;
      const messageText = formatCopilotDraftNotificationMessage(data, botName);

      if (notifyChannels.inApp !== false && !data.skipInApp) {
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
      }

      const channelsAllowed = botId
        ? channelGuard.isBotAllowed(botId)
        : channelGuard.anyChannelsEnabled();
      if (!channelsAllowed) {
        return { delivered: 0, failed: 0, skipped: 'channels_disabled' };
      }

      let delivered = 0;
      let failed = 0;

      // 1. Optional opt-in Telegram 1-tap approval to owning merchant's linked Telegram chat
      if (notifyChannels.telegramToMerchant === true) {
        const telegramTarget = String(bot?.telegramUserId || user?.telegramUserId || '').trim();
        if (telegramTarget) {
          try {
            const replyMarkup = buildCopilotTelegramInlineKeyboard(data.draftId);
            const extra = replyMarkup ? { reply_markup: replyMarkup } : {};
            const result = await sendTelegramMessage(telegramTarget, messageText, extra);
            if (result && result.ok) delivered++;
            else failed++;
          } catch (err) {
            logger.warn('copilot_telegram_dispatch_failed', {
              botId: String(botId || ''),
              err: err?.message || String(err),
            });
            failed++;
          }
        }
      }

      // 2. Optional opt-in ZainBot Main WhatsApp alert to merchant's verified linked phone
      if (notifyChannels.whatsappToMerchant === true) {
        const verifiedPhone = String(user?.assistantSettings?.verifiedWhatsappPhone || '').trim();
        if (verifiedPhone) {
          try {
            // Lazy require avoids circular load-time dependencies and allows test stubs
            // eslint-disable-next-line global-require
            const platformWhatsappSession = require('./platformWhatsappSession');
            const plainText = notificationPlainText(messageText);
            const waResult = await platformWhatsappSession.sendMessage(verifiedPhone, plainText);
            if (waResult && waResult.ok !== false) delivered++;
            else failed++;
          } catch (waErr) {
            logger.warn('copilot_platform_whatsapp_dispatch_failed', {
              botId: String(botId || ''),
              err: waErr?.message || String(waErr),
            });
            failed++;
          }
        }
      }

      return { delivered, failed };
    }

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
      recipients = recipients.filter((r) => recipientWantsEvent(r, event));
    }

    // If free tier, enforce max 1 recipient
    if (isFree && recipients.length > 1) {
      recipients = [recipients[0]];
    }

    // Build notification message text in Arabic & English friendly format
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
  recipientWantsEvent,
  formatOrderNotificationMessage,
  formatBookingNotificationMessage,
  formatComplaintNotificationMessage,
  formatDailyDigestNotificationMessage,
  formatCopilotDraftNotificationMessage,
};
