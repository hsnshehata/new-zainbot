const axios = require('axios');
const User = require('../models/User');
const Bot = require('../models/Bot');
const logger = require('../logger');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || '';
const LINK_CODE_TTL_MINUTES = Number(process.env.TELEGRAM_LINK_CODE_TTL_MINUTES || 15);

const now = () => new Date();
const minutesFromNow = (mins) => new Date(Date.now() + mins * 60 * 1000);
const safeCurrency = (c) => (c || 'EGP').toUpperCase();

const STATUS_LABEL_MAP = {
  pending: 'قيد الانتظار',
  processing: 'جاري التجهيز',
  confirmed: 'مؤكد',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  on_hold: 'معلّق',
  cancelled: 'ملغي',
};

const statusLabel = (key) => STATUS_LABEL_MAP[key] || key;

const formatMoney = (total = 0, currency = 'EGP') => {
  const rounded = Number(total || 0);
  try {
    return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: currency || 'EGP' }).format(rounded);
  } catch (err) {
    return `${rounded.toFixed(2)} ${safeCurrency(currency)}`;
  }
};

const getApiUrl = (method) => {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is missing');
  return `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
};

async function sendTelegramMessage(chatId, text, extra = {}) {
  if (!chatId || !text) {
    return { ok: false, reason: 'missing_parameters' };
  }

  const { reply_markup, ...restExtra } = extra || {};
  const inlineKeyboard = reply_markup?.inline_keyboard;
  const basePayload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...restExtra,
  };

  try {
    const sendUrl = getApiUrl('sendMessage');

    const res = await axios.post(sendUrl, {
      ...basePayload,
      reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : reply_markup,
    });
    return { ok: true, data: res.data };
  } catch (err) {
    const reason = err.response?.data?.description || err.message;
    logger.error('Telegram send error', { reason });
    return { ok: false, reason };
  }
}

function buildLinkCode() {
  const num = Math.floor(100000 + Math.random() * 900000);
  return String(num);
}

async function generateLinkCode({ botId, userId }) {
  if (!botId) throw new Error('botId is required');
  const code = buildLinkCode();
  const expiresAt = minutesFromNow(LINK_CODE_TTL_MINUTES);
  await Bot.findByIdAndUpdate(botId, {
    telegramLinkCode: code,
    telegramLinkExpiresAt: expiresAt,
  });
  return { code, expiresAt };
}

async function linkByCode(code, chatId, username) {
  if (!code || !chatId) return { status: 'invalid' };

  // الأول نحاول على مستوى البوت
  const bot = await Bot.findOne({ telegramLinkCode: code }).select('name userId telegramLinkExpiresAt');
  if (bot) {
    const expired = bot.telegramLinkExpiresAt && new Date(bot.telegramLinkExpiresAt) < now();
    if (expired) return { status: 'expired' };
    bot.telegramUserId = String(chatId);
    bot.telegramUsername = username || '';
    bot.telegramLinkCode = '';
    bot.telegramLinkExpiresAt = null;
    await bot.save();
    return { status: 'linked_bot', bot };
  }

  // توافق قديم: ربط على مستوى المستخدم
  const user = await User.findOne({ telegramLinkCode: code });
  if (!user) return { status: 'not_found' };
  const expired = user.telegramLinkExpiresAt && new Date(user.telegramLinkExpiresAt) < now();
  if (expired) return { status: 'expired' };

  user.telegramUserId = String(chatId);
  user.telegramUsername = username || '';
  user.telegramLinkCode = '';
  user.telegramLinkExpiresAt = null;
  await user.save();
  return { status: 'linked_user', user };
}

async function unlinkBot(botId) {
  if (!botId) return null;
  return Bot.findByIdAndUpdate(
    botId,
    {
      telegramUserId: '',
      telegramUsername: '',
      telegramLinkCode: '',
      telegramLinkExpiresAt: null,
    },
    { new: true }
  );
}

async function updateBotPrefs(botId, prefs = {}, language) {
  const bot = await Bot.findById(botId).select('telegramNotifications telegramLanguage');
  if (!bot) return null;
  bot.telegramNotifications = { ...(bot.telegramNotifications || {}), ...prefs };
  if (language) bot.telegramLanguage = language;
  await bot.save();
  return bot;
}

async function getDestination({ botId, userId }) {
  if (botId) {
    const bot = await Bot.findById(botId).select(
      'telegramUserId telegramUsername telegramNotifications telegramLanguage userId name'
    );
    if (bot && bot.telegramUserId) {
      return {
        chatId: bot.telegramUserId,
        username: bot.telegramUsername,
        prefs: bot.telegramNotifications || {},
        lang: bot.telegramLanguage || 'ar',
        ownerId: bot.userId,
        botName: bot.name,
      };
    }
    if (bot && bot.userId) {
      userId = bot.userId; // fallback للمالك
    }
  }

  if (!userId) return null;
  const user = await User.findById(userId).select(
    'telegramUserId telegramUsername telegramNotifications telegramLanguage telegramLinkCode telegramLinkExpiresAt'
  );
  if (!user || !user.telegramUserId) return null;
  return {
    chatId: user.telegramUserId,
    username: user.telegramUsername,
    prefs: user.telegramNotifications || {},
    lang: user.telegramLanguage || 'ar',
    ownerId: user._id,
  };
}

const buildNewOrderMessage = ({ storeName, orderId, total, currency, status, customerName, customerAddress, customerWhatsapp, items }) => {
  const itemsLine = Array.isArray(items) && items.length
    ? `المطلوب: ${items.slice(0, 6).map((p) => `${p.quantity || 1}x ${p.name || ''}`).join('، ')}`
    : null;
  const lines = [
    '📦 طلب جديد وصل',
    storeName ? `المتجر: ${storeName}` : null,
    orderId ? `رقم الطلب: ${orderId}` : null,
    status ? `الحالة: ${statusLabel(status)}` : null,
    customerName ? `العميل: ${customerName}` : null,
    customerWhatsapp ? `واتساب: ${customerWhatsapp}` : null,
    customerAddress ? `العنوان: ${customerAddress}` : null,
    itemsLine,
    total !== undefined ? `الإجمالي: ${formatMoney(total, currency)}` : null,
    '\nاضغط /start للخيارات أو اكتب أي سؤال للمساعد.'
  ].filter(Boolean);
  return lines.join('\n');
};

const buildOrderStatusMessage = ({ storeName, orderId, status, note }) => {
  const lines = [
    '🔄 تحديث حالة طلب',
    storeName ? `المتجر: ${storeName}` : null,
    orderId ? `رقم الطلب: ${orderId}` : null,
    status ? `الحالة الجديدة: ${statusLabel(status)}` : null,
    note ? `ملاحظة: ${note}` : null,
  ].filter(Boolean);
  return lines.join('\n');
};

const buildChatOrderMessage = ({ botName, orderId, status, customerName, customerPhone, customerAddress, items, total, currency }) => {
  const itemsLine = Array.isArray(items) && items.length
    ? `المطلوب: ${items.slice(0, 6).map((p) => `${p.quantity || 1}x ${p.title || ''}`).join('، ')}`
    : null;
  const lines = [
    '💬 طلب جديد من البوت',
    botName ? `البوت: ${botName}` : null,
    orderId ? `رقم الطلب: ${orderId}` : null,
    status ? `الحالة: ${statusLabel(status)}` : null,
    customerName ? `العميل: ${customerName}` : null,
    customerPhone ? `هاتف: ${customerPhone}` : null,
    customerAddress ? `العنوان: ${customerAddress}` : null,
    itemsLine,
    total !== undefined ? `الإجمالي: ${formatMoney(total, currency)}` : null,
  ].filter(Boolean);
  return lines.join('\n');
};

async function notifyNewOrder(userId, payload, botId = null) {
  const destination = await getDestination({ botId, userId });
  if (!destination || destination.prefs?.newOrder === false) return { skipped: true };
  return sendTelegramMessage(destination.chatId, buildNewOrderMessage(payload));
}

async function notifyOrderStatus(userId, payload, botId = null) {
  const destination = await getDestination({ botId, userId });
  if (!destination || destination.prefs?.orderStatus === false) return { skipped: true };
  logger.info('📬 notifyOrderStatus', {
    chatId: destination.chatId,
    ownerId: destination.ownerId,
    botId: botId || 'none',
    userId: userId || 'none',
    status: payload?.status,
  });
  return sendTelegramMessage(destination.chatId, buildOrderStatusMessage(payload));
}

async function notifyChatOrder(userId, payload, botId = null) {
  const destination = await getDestination({ botId, userId });
  if (!destination) {
    logger.warn('Telegram notifyChatOrder skipped: no destination', { botId: botId || 'none', userId: userId || 'none' });
    return { skipped: true, reason: 'no_destination' };
  }
  if (destination.prefs?.chatOrder === false) {
    logger.warn('Telegram notifyChatOrder skipped: chatOrder disabled', { botId: botId || 'none', userId: userId || 'none' });
    return { skipped: true, reason: 'disabled' };
  }
  logger.info('📬 notifyChatOrder', {
    chatId: destination.chatId,
    ownerId: destination.ownerId,
    botId: botId || 'none',
    userId: userId || 'none',
    status: payload?.status,
  });
  return sendTelegramMessage(destination.chatId, buildChatOrderMessage(payload));
}

module.exports = {
  BOT_USERNAME,
  generateLinkCode,
  linkByCode,
  unlinkBot,
  updateBotPrefs,
  sendTelegramMessage,
  notifyNewOrder,
  notifyOrderStatus,
  notifyChatOrder,
  getDestination,
};
