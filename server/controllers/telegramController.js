const User = require('../models/User');
const Bot = require('../models/Bot');
const Rule = require('../models/Rule');
const Order = require('../models/Order');
const ChatOrder = require('../models/ChatOrder');
const Conversation = require('../models/Conversation');
const logger = require('../logger');
const {
  BOT_USERNAME,
  generateLinkCode,
  linkByCode,
  unlinkBot,
  updateBotPrefs,
  sendTelegramMessage,
  getDestination,
} = require('../services/telegramService');

// حالة محادثات تيليجرام (ذاكرة مؤقتة)
const chatStates = new Map(); // chatId -> { step, rules: [], selectedRuleId }

const settingsButtonLabel = (botName = 'البوت') => {
  const name = (botName || 'البوت').trim();
  const shortName = name.length > 18 ? `${name.slice(0, 18)}…` : name;
  return `⚙️ إعدادات ربط (${shortName})`;
};

const botStatsButtonLabel = '📊 عدادات البوت';

const ORDER_STATUS_OPTIONS = [
  { key: 'pending', label: 'قيد الانتظار' },
  { key: 'processing', label: 'جاري التجهيز' },
  { key: 'confirmed', label: 'مؤكد' },
  { key: 'shipped', label: 'تم الشحن' },
  { key: 'delivered', label: 'تم التسليم' },
  { key: 'on_hold', label: 'معلّق' },
  { key: 'cancelled', label: 'ملغي' },
];

const STATUS_LABEL_MAP = ORDER_STATUS_OPTIONS.reduce((acc, cur) => {
  acc[cur.key] = cur.label;
  return acc;
}, {});

const statusLabel = (key) => STATUS_LABEL_MAP[key] || key;

const parseOrderStatusInput = (text) => {
  const normalized = (text || '').trim().toLowerCase();
  if (!normalized) return null;
  // رقم (1..N)
  const num = parseInt(normalized, 10);
  if (Number.isInteger(num) && num >= 1 && num <= ORDER_STATUS_OPTIONS.length) {
    return ORDER_STATUS_OPTIONS[num - 1].key;
  }

  // مطابق للمفتاح الإنجليزي
  const synonyms = { canceled: 'cancelled', cancelled: 'cancelled', onhold: 'on_hold', on_hold: 'on_hold' };
  const keyNorm = synonyms[normalized] || normalized;
  const matchKey = ORDER_STATUS_OPTIONS.find((o) => o.key === keyNorm);
  if (matchKey) return matchKey.key;

  // مطابق للتسمية العربية
  const matchLabel = ORDER_STATUS_OPTIONS.find((o) => o.label === normalized || o.label.toLowerCase() === normalized);
  if (matchLabel) return matchLabel.key;

  return null;
};

// نكتفي بالأزرار inline داخل الرسائل، مع زر وحيد للعودة للرئيسية
const inlineBackHome = () => ({
  inline_keyboard: [
    [
      { text: '🏠 القائمة الرئيسية', callback_data: 'إلغاء' },
    ],
  ],
});

const buildInlineMainMenu = (botName) => ({
  inline_keyboard: [
    [{ text: settingsButtonLabel(botName), callback_data: settingsButtonLabel(botName) }],
    [{ text: '➕ إضافة قاعدة جديدة', callback_data: '➕ إضافة قاعدة جديدة' }],
    [{ text: '✏️ تعديل قاعدة موجودة', callback_data: '✏️ تعديل قاعدة موجودة' }],
    [{ text: '🗑 حذف قاعدة', callback_data: '🗑 حذف قاعدة' }],
    [{ text: '🛍 إدارة طلبات المتجر', callback_data: '🛍 إدارة طلبات المتجر' }],
    [{ text: '💬 إدارة طلبات الدردشة', callback_data: '💬 إدارة طلبات الدردشة' }],
    [{ text: '📦 استعراض كل الطلبات', callback_data: '📦 استعراض كل الطلبات' }],
    [{ text: botStatsButtonLabel, callback_data: botStatsButtonLabel }],
    [{ text: '🏠 القائمة الرئيسية', callback_data: 'إلغاء' }],
  ],
});

const sendShortcutHint = (chatId, botName, prefix = 'استخدم الأزرار لإدارة القواعد والطلبات.') =>
  sendTelegramMessage(chatId, prefix, { reply_markup: buildInlineMainMenu(botName) });

const sendMainMenu = async (chatId, botName) => {
  const title = botName ? `(${botName})` : '';
  return sendTelegramMessage(
    chatId,
    `اختر إجراء لإدارة قواعد البوت ${title}`,
    { reply_markup: buildInlineMainMenu(botName) }
  );
};

const summarizeRule = (rule, idx) => {
  let summary = '';
  if (typeof rule.content === 'string') {
    summary = rule.content.slice(0, 60);
  } else if (rule.content?.question) {
    summary = rule.content.question.slice(0, 60);
  } else if (rule.content?.description) {
    summary = rule.content.description.slice(0, 60);
  } else {
    summary = JSON.stringify(rule.content).slice(0, 60);
  }
  return `${idx + 1}. (${rule.type}) ${summary}`;
};

const listRulesForSelection = async (chatId, botId, actionLabel, menuKeyboard) => {
  const rules = await Rule.find({ botId }).sort({ createdAt: -1 }).limit(20);
  if (!rules.length) {
    await sendTelegramMessage(chatId, 'لا توجد قواعد حالياً لهذا البوت.', { reply_markup: inlineBackHome() });
    return null;
  }
  const lines = rules.map((r, idx) => summarizeRule(r, idx)).join('\n');
  await sendTelegramMessage(
    chatId,
    `اختر رقم القاعدة التي تريد ${actionLabel}:\n${lines}\n\nأرسل الرقم الآن (1-${rules.length}).`,
    { reply_markup: inlineBackHome() }
  );
  return rules;
};

const formatMoney = (value = 0, currency = 'EGP') => {
  const num = Number(value) || 0;
  try {
    return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: currency || 'EGP' }).format(num);
  } catch (e) {
    return `${num.toFixed(2)} ${currency || 'EGP'}`;
  }
};

const listOrders = async (chatId, storeId, filter = {}, menuKeyboard) => {
  const query = { storeId, ...filter };
  const orders = await Order.find(query).sort({ createdAt: -1 }).limit(10);
  if (!orders.length) {
    await sendTelegramMessage(chatId, 'لا توجد طلبات حالياً لهذا المتجر.', { reply_markup: inlineBackHome() });
    return null;
  }
  const lines = orders.map((o, idx) => {
    const total = formatMoney(o.totalPrice, o.currency);
    const created = o.createdAt ? new Date(o.createdAt).toLocaleString('ar-EG') : '';
    const items = Array.isArray(o.products)
      ? o.products.map((p) => `${p.quantity || 1}x ${p.name || ''}`).slice(0, 6).join('، ')
      : '';
    const contact = [o.customerName, o.customerWhatsapp].filter(Boolean).join(' | ');
    const address = o.customerAddress ? `العنوان: ${o.customerAddress}` : '';
    return [
      `${idx + 1}. رقم الطلب: ${o._id}`,
      `الحالة: ${statusLabel(o.status)}`,
      `الإجمالي: ${total}`,
      created ? `التاريخ: ${created}` : null,
      contact ? `العميل: ${contact}` : null,
      address || null,
      items ? `المطلوب: ${items}` : null,
    ].filter(Boolean).join('\n');
  }).join('\n\n');
  await sendTelegramMessage(chatId, `${filter.status ? 'الطلبات المؤكدة' : 'أحدث الطلبات'}:\n${lines}`, { reply_markup: inlineBackHome() });
  return orders;
};

const listChatOrders = async (chatId, botId, filter = {}, menuKeyboard) => {
  const query = { botId, ...filter };
  const orders = await ChatOrder.find(query).sort({ lastModifiedAt: -1, createdAt: -1 }).limit(10);
  if (!orders.length) {
    await sendTelegramMessage(chatId, 'لا توجد طلبات دردشة حالياً لهذا البوت.', { reply_markup: inlineBackHome() });
    return null;
  }
  const lines = orders.map((o, idx) => {
    const total = formatMoney(o.totalAmount, o.items?.[0]?.currency || 'EGP');
    const created = o.createdAt ? new Date(o.createdAt).toLocaleString('ar-EG') : '';
    const items = Array.isArray(o.items)
      ? o.items.map((p) => `${p.quantity || 1}x ${p.title || ''}`).slice(0, 6).join('، ')
      : '';
    const contact = [o.customerName, o.customerPhone].filter(Boolean).join(' | ');
    const address = o.customerAddress ? `العنوان: ${o.customerAddress}` : '';
    return [
      `${idx + 1}. رقم الطلب: ${o._id}`,
      `الحالة: ${statusLabel(o.status)}`,
      `الإجمالي: ${total}`,
      created ? `التاريخ: ${created}` : null,
      contact ? `العميل: ${contact}` : null,
      address || null,
      items ? `المطلوب: ${items}` : null,
    ].filter(Boolean).join('\n');
  }).join('\n\n');
  await sendTelegramMessage(chatId, `${filter.status ? 'طلبات الدردشة المؤكدة' : 'أحدث طلبات الدردشة'}:\n${lines}`, { reply_markup: inlineBackHome() });
  return orders;
};

const getBotQuickStats = async (botId) => {
  const [convAgg, chatOrdersCount, rulesCount] = await Promise.all([
    Conversation.aggregate([
      { $match: { botId } },
      { $project: { msgCount: { $size: { $ifNull: ['$messages', []] } } } },
      { $group: { _id: null, totalMessages: { $sum: '$msgCount' }, totalConversations: { $sum: 1 } } },
    ]),
    ChatOrder.countDocuments({ botId }),
    Rule.countDocuments({ botId }),
  ]);

  const totalMessages = convAgg?.[0]?.totalMessages || 0;
  const totalConversations = convAgg?.[0]?.totalConversations || 0;
  return {
    totalMessages,
    totalConversations,
    chatOrdersCount: chatOrdersCount || 0,
    rulesCount: rulesCount || 0,
  };
};

const listAllOrdersCombined = async (chatId, { storeId, botId }, menuKeyboard) => {
  const [storeOrders, chatOrders] = await Promise.all([
    storeId ? Order.find({ storeId }).sort({ createdAt: -1 }).limit(10) : [],
    botId ? ChatOrder.find({ botId }).sort({ lastModifiedAt: -1, createdAt: -1 }).limit(10) : [],
  ]);

  const combined = [];
  storeOrders.forEach((o) => {
    combined.push({
      type: 'store',
      id: o._id,
      status: o.status,
      total: formatMoney(o.totalPrice, o.currency),
      ts: o.createdAt || o.updatedAt || new Date(0),
    });
  });
  chatOrders.forEach((o) => {
    combined.push({
      type: 'chat',
      id: o._id,
      status: o.status,
      total: formatMoney(o.totalAmount, o.items?.[0]?.currency || 'EGP'),
      ts: o.lastModifiedAt || o.createdAt || new Date(0),
    });
  });

  combined.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  const limited = combined.slice(0, 15);

  if (!limited.length) {
    await sendTelegramMessage(chatId, 'لا توجد طلبات حالياً.', { reply_markup: inlineBackHome() });
    return null;
  }

  const lines = limited.map((o, idx) => {
    const kind = o.type === 'store' ? 'متجر' : 'دردشة';
    const created = o.ts ? new Date(o.ts).toLocaleString('ar-EG') : '';
    return `${idx + 1}. [${kind}] رقم: ${o.id}\nالحالة: ${statusLabel(o.status)} | الإجمالي: ${o.total}${created ? `\nالتاريخ: ${created}` : ''}`;
  }).join('\n');

  await sendTelegramMessage(chatId, `أحدث الطلبات (متجر + دردشة):\n${lines}`, { reply_markup: inlineBackHome() });
  return limited;
};

const ensureBotAccess = async (botId, user) => {
  if (!botId) return null;
  const bot = await Bot.findById(botId).select('userId name telegramUserId telegramUsername telegramLinkCode telegramLinkExpiresAt telegramNotifications telegramLanguage');
  if (!bot) return null;
  if (String(bot.userId) !== String(user.userId) && user.role !== 'superadmin') return null;
  return bot;
};

const CHANNEL_OPTIONS = [
  { key: 'facebook', label: 'فيسبوك', isLinked: (bot) => Boolean(bot.facebookPageId) },
  { key: 'instagram', label: 'إنستجرام', isLinked: (bot) => Boolean(bot.instagramPageId) },
  { key: 'whatsapp', label: 'واتساب', isLinked: (bot) => Boolean(bot.whatsappBusinessAccountId) },
];

const basePauseFields = [
  { prop: 'ownerPauseKeyword', label: 'الكلمة التي يرسلها المالك لإيقاف الردود', type: 'string' },
  { prop: 'ownerPauseDurationMinutes', label: 'مدة الإيقاف بالدقائق', type: 'number' },
];

const channelFieldsMap = {
  facebook: [
    { prop: 'messagingOptinsEnabled', label: 'رسائل الترحيب (Opt-ins)', type: 'boolean' },
    { prop: 'messageReactionsEnabled', label: 'ردود الفعل (Reactions)', type: 'boolean' },
    { prop: 'messagingReferralsEnabled', label: 'تتبع المصدر (Referrals)', type: 'boolean' },
    { prop: 'messageEditsEnabled', label: 'تعديلات الرسائل (Edits)', type: 'boolean' },
    { prop: 'commentsRepliesEnabled', label: 'الرد على التعليقات (Comments)', type: 'boolean' },
    ...basePauseFields,
  ],
  instagram: [
    { prop: 'instagramMessagingOptinsEnabled', label: 'رسائل الترحيب (Opt-ins)', type: 'boolean' },
    { prop: 'instagramMessageReactionsEnabled', label: 'ردود الفعل (Reactions)', type: 'boolean' },
    { prop: 'instagramMessagingReferralsEnabled', label: 'تتبع المصدر (Referrals)', type: 'boolean' },
    { prop: 'instagramMessageEditsEnabled', label: 'تعديلات الرسائل (Edits)', type: 'boolean' },
    { prop: 'instagramCommentsRepliesEnabled', label: 'الرد على التعليقات (Comments)', type: 'boolean' },
    ...basePauseFields,
  ],
  whatsapp: [
    { prop: 'whatsappMessagingOptinsEnabled', label: 'رسائل الترحيب (Opt-ins)', type: 'boolean' },
    { prop: 'whatsappMessageReactionsEnabled', label: 'ردود الفعل (Reactions)', type: 'boolean' },
    { prop: 'whatsappMessagingReferralsEnabled', label: 'تتبع المصدر (Referrals)', type: 'boolean' },
    { prop: 'whatsappMessageEditsEnabled', label: 'تعديلات الرسائل (Edits)', type: 'boolean' },
    ...basePauseFields,
  ],
};

const formatSettingValue = (bot, field) => {
  const value = bot[field.prop];
  if (field.type === 'boolean') return value ? 'مفعل ✅' : 'متوقف ⛔';
  if (field.type === 'number') return `${Number.isFinite(Number(value)) ? Number(value) : 0} دقيقة`;
  return value ? `"${value}"` : 'غير محددة';
};

const parseBooleanInput = (value) => {
  const normalized = value.trim().toLowerCase();
  const trueWords = ['on', 'تشغيل', 'تفعيل', 'yes', 'نعم', 'مفعل', 'enable', 'enabled'];
  const falseWords = ['off', 'ايقاف', 'إيقاف', 'تعطيل', 'no', 'لا', 'متوقف', 'disable', 'disabled', 'stop'];
  if (trueWords.includes(normalized)) return true;
  if (falseWords.includes(normalized)) return false;
  return null;
};

const getLinkedChannels = (bot) => CHANNEL_OPTIONS.filter((ch) => ch.isLinked(bot));

const sendStoreActionsMenu = async (chatId, botName) => {
  await sendTelegramMessage(
    chatId,
    'اختر إجراء لطلبات المتجر:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ الطلبات المؤكدة', callback_data: '✅ الطلبات المؤكدة' }],
          [{ text: '✏️ تعديل حالة طلب', callback_data: '✏️ تعديل حالة طلب' }],
          [{ text: '🏠 القائمة الرئيسية', callback_data: 'إلغاء' }],
        ],
      },
    }
  );
};

const sendChatActionsMenu = async (chatId) => {
  await sendTelegramMessage(
    chatId,
    'اختر إجراء لطلبات الدردشة:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💬 طلبات الدردشة', callback_data: '💬 طلبات الدردشة' }],
          [{ text: '💬 الطلبات المؤكدة (دردشة)', callback_data: '💬 الطلبات المؤكدة (دردشة)' }],
          [{ text: '✏️ تعديل حالة طلب دردشة', callback_data: '✏️ تعديل حالة طلب دردشة' }],
          [{ text: '🏠 القائمة الرئيسية', callback_data: 'إلغاء' }],
        ],
      },
    }
  );
};

const sendChannelPicker = async (chatId, channels, botName) => {
  const inline = {
    inline_keyboard: [
      ...channels.map((c, idx) => ([{ text: `${idx + 1}) ${c.label}`, callback_data: c.label }])),
      [{ text: '🏠 القائمة الرئيسية', callback_data: 'إلغاء' }],
    ],
  };
  await sendTelegramMessage(
    chatId,
    `اختر قناة الربط المراد تعديل إعداداتها للبوت ${botName}:`,
    { reply_markup: inline }
  );
};

const sendChannelSettings = async (chatId, bot, channelKey) => {
  const fields = channelFieldsMap[channelKey] || [];
  const channelLabel = CHANNEL_OPTIONS.find((c) => c.key === channelKey)?.label || channelKey;
  const lines = fields.map((f, idx) => `${idx + 1}) ${f.label}: ${formatSettingValue(bot, f)}`).join('\n');
  const tips = [
    'اكتب الرقم ثم القيمة. أمثلة: 1 on | 3 off | 6 stop | 7 90',
    'on/تشغيل/تفعيل = تشغيل، off/إيقاف/تعطيل/stop = إيقاف',
    'اكتب "مسح" لمسح كلمة الإيقاف، و"رجوع" للعودة لاختيار القناة',
  ].join('\n');
  await sendTelegramMessage(
    chatId,
    `إعدادات ${channelLabel} للبوت ${bot.name}:\n${lines}\n\n${tips}`,
    { reply_markup: inlineBackHome() }
  );
  return fields;
};

exports.getStatus = async (req, res) => {
  try {
    const { botId } = req.query;
    const bot = await ensureBotAccess(botId, req.user);
    if (!bot) return res.status(404).json({ message: 'البوت غير موجود أو غير مصرح بالوصول إليه' });

    res.json({
      linked: Boolean(bot.telegramUserId),
      username: bot.telegramUsername || '',
      linkCode: bot.telegramLinkCode || '',
      linkExpiresAt: bot.telegramLinkExpiresAt || null,
      notifications: bot.telegramNotifications || {},
      language: bot.telegramLanguage || 'ar',
      botUsername: BOT_USERNAME,
      botName: bot.name,
    });
  } catch (err) {
    logger.error('telegram_get_status_error', { err: err.message, botId: req.query?.botId });
    res.status(500).json({ message: 'خطأ في جلب حالة تيليجرام' });
  }
};

exports.generateLinkCode = async (req, res) => {
  try {
    const { botId } = req.body || {};
    const bot = await ensureBotAccess(botId, req.user);
    if (!bot) return res.status(404).json({ message: 'البوت غير موجود أو غير مصرح بالوصول إليه' });

    const { code, expiresAt } = await generateLinkCode({ botId });
    res.json({ code, expiresAt, botUsername: BOT_USERNAME, botName: bot.name });
  } catch (err) {
    logger.error('telegram_generate_link_error', { err: err.message, botId: req.body?.botId });
    res.status(500).json({ message: 'خطأ في توليد كود الربط' });
  }
};

exports.updatePreferences = async (req, res) => {
  try {
    const { botId, newOrder, orderStatus, chatOrder, dailySummary, language } = req.body || {};
    const bot = await ensureBotAccess(botId, req.user);
    if (!bot) return res.status(404).json({ message: 'البوت غير موجود أو غير مصرح بالوصول إليه' });

    const prefs = {};
    if (newOrder !== undefined) prefs.newOrder = !!newOrder;
    if (orderStatus !== undefined) prefs.orderStatus = !!orderStatus;
    if (chatOrder !== undefined) prefs.chatOrder = !!chatOrder;
    if (dailySummary !== undefined) prefs.dailySummary = !!dailySummary;

    const updated = await updateBotPrefs(botId, prefs, language);
    res.json({
      notifications: updated?.telegramNotifications || {},
      language: updated?.telegramLanguage || 'ar',
    });
  } catch (err) {
    logger.error('telegram_update_preferences_error', { err: err.message, botId: req.body?.botId });
    res.status(500).json({ message: 'خطأ في تحديث الإعدادات' });
  }
};

exports.unlink = async (req, res) => {
  try {
    const { botId } = req.body || {};
    const bot = await ensureBotAccess(botId, req.user);
    if (!bot) return res.status(404).json({ message: 'البوت غير موجود أو غير مصرح بالوصول إليه' });
    await unlinkBot(botId);
    res.json({ success: true });
  } catch (err) {
    logger.error('telegram_unlink_error', { err: err.message, botId: req.body?.botId });
    res.status(500).json({ message: 'خطأ في إلغاء الربط' });
  }
};

exports.handleWebhook = async (req, res) => {
  try {
    const update = req.body;
    const callback = update?.callback_query;
    if (callback?.data) {
      // حوّل ضغط زر inline إلى رسالة نصية موحدة للتعامل مع نفس المنطق
      const pseudoMsg = {
        chat: callback.message?.chat,
        from: callback.from,
        text: callback.data,
      };
      update.message = pseudoMsg;
    }

    const message = update?.message;
    if (!message || !message.chat) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const username = message.from?.username || '';
    const text = (message.text || '').trim();

    if (!text) {
      await sendTelegramMessage(chatId, 'مرحباً! أرسل كود الربط من لوحة التحكم لإتمام الربط.');
      return res.status(200).json({ ok: true });
    }

    const linkedBot = await Bot.findOne({ telegramUserId: String(chatId) }).select('name userId telegramUserId storeId');
    const codeMatch = text.match(/\b\d{6}\b/);
    const code = codeMatch ? codeMatch[0] : null;

    if (/^\/start/i.test(text) && !code) {
      if (linkedBot) {
              await sendTelegramMessage(chatId, 'تم الربط بالفعل. استخدم الأزرار للتحكم بالقواعد.', { reply_markup: buildInlineMainMenu(linkedBot.name) });
      } else {
        const msg = BOT_USERNAME
          ? `مرحباً! أرسل كود الربط الذي يظهر لك في لوحة المنصة لربط حساب تيليجرام بهذا البوت @${BOT_USERNAME}.`
          : 'مرحباً! أرسل كود الربط الذي يظهر لك في لوحة المنصة لربط حساب تيليجرام.';
        await sendTelegramMessage(chatId, msg);
      }
      return res.status(200).json({ ok: true });
    }

    // لو الحساب مرتبط ببوت مستخدم (قديم)
    const existingUser = await User.findOne({ telegramUserId: String(chatId) }).select('username');
    if (existingUser && !code && !linkedBot) {
      await sendTelegramMessage(chatId, 'هذا الحساب مرتبط بالفعل. لو عاوز تربطه ببوت آخر، أرسل كود الربط الجديد من لوحة التحكم للبوت المطلوب.');
      return res.status(200).json({ ok: true });
    }

    // لو مرتبط ببوت حالي وتعامل مع الأوامر
    if (linkedBot && !code) {
      let state = chatStates.get(chatId) || {};
      const inlineMenuKeyboard = buildInlineMainMenu(linkedBot.name);
      const settingsLabel = settingsButtonLabel(linkedBot.name);

      const isMainMenuButton = inlineMenuKeyboard.inline_keyboard.flat().some((btn) => btn.text === text);

      // تأكيد وجود متجر للبوت قبل أوامر الطلبات
      const storeId = linkedBot.storeId;
      const ensureStore = async () => {
        if (!storeId) {
          await sendTelegramMessage(chatId, 'هذا البوت غير مربوط بمتجر بعد. اربطه بمتجر لاستخدام أوامر الطلبات.', { reply_markup: inlineBackHome() });
          return false;
        }
        return true;
      };

      if (text === 'إلغاء') {
        chatStates.delete(chatId);
        await sendMainMenu(chatId, linkedBot.name);
        return res.status(200).json({ ok: true });
      }
      if (['رجوع', 'رجوع للقائمة'].includes(text) && !(state.step || '').startsWith('settings_')) {
        chatStates.delete(chatId);
        await sendMainMenu(chatId, linkedBot.name);
        return res.status(200).json({ ok: true });
      }

      // لو المستخدم ضغط زر من القائمة الرئيسية أثناء وجوده داخل تدفق الإعدادات، نخرج من الحالة ونعتبر الضغط أمر جديد
      if ((state.step || '').startsWith('settings_') && isMainMenuButton) {
        chatStates.delete(chatId);
        state = {};
      }

      // الدخول إلى إعدادات الربط (قناة الاتصال)
      if (text === settingsLabel) {
        const botFull = await Bot.findById(linkedBot._id).lean();
        if (!botFull) {
          await sendTelegramMessage(chatId, 'تعذر جلب بيانات البوت.', { reply_markup: inlineBackHome() });
          return res.status(200).json({ ok: true });
        }
        const availableChannels = getLinkedChannels(botFull);
        if (!availableChannels.length) {
          await sendTelegramMessage(chatId, 'لا توجد قنوات ربط مفعلة حالياً لهذا البوت.', { reply_markup: inlineBackHome() });
          return res.status(200).json({ ok: true });
        }
        chatStates.set(chatId, { step: 'settings_waiting_channel', channels: availableChannels, botName: botFull.name });
        await sendChannelPicker(chatId, availableChannels, botFull.name);
        return res.status(200).json({ ok: true });
      }

      if (text === botStatsButtonLabel) {
        const stats = await getBotQuickStats(linkedBot._id);
        const lines = [
          'أرقام سريعة من نشاط البوت:',
          `إجمالي الرسائل: ${stats.totalMessages}`,
          `إجمالي المحادثات: ${stats.totalConversations}`,
          `طلبات صادرة من المحادثات: ${stats.chatOrdersCount}`,
          `القواعد الفعالة: ${stats.rulesCount}`,
        ].join('\n');
        await sendTelegramMessage(chatId, lines, { reply_markup: inlineBackHome() });
        return res.status(200).json({ ok: true });
      }

      // إدارة طلبات المتجر (مؤكدة + تعديل حالة) في زر واحد
      if (text === '🛍 إدارة طلبات المتجر') {
        await sendStoreActionsMenu(chatId, linkedBot.name);
        return res.status(200).json({ ok: true });
      }

      if (text === '💬 إدارة طلبات الدردشة') {
        await sendChatActionsMenu(chatId);
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'settings_waiting_channel') {
        if (['رجوع', 'رجوع للقائمة'].includes(text)) {
          chatStates.delete(chatId);
          await sendMainMenu(chatId, linkedBot.name);
          return res.status(200).json({ ok: true });
        }
        const channels = state.channels || [];
        const matched = channels.find((c, idx) => c.label === text || String(idx + 1) === text.trim());
        if (!matched) {
          await sendChannelPicker(chatId, channels, state.botName || linkedBot.name);
          return res.status(200).json({ ok: true });
        }
        const botFull = await Bot.findById(linkedBot._id);
        if (!botFull) {
          chatStates.delete(chatId);
          await sendTelegramMessage(chatId, 'تعذر جلب بيانات البوت.', { reply_markup: inlineBackHome() });
          return res.status(200).json({ ok: true });
        }
        const fields = await sendChannelSettings(chatId, botFull, matched.key);
        chatStates.set(chatId, { step: 'settings_waiting_field', channels, channelKey: matched.key, botName: botFull.name, fields });
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'settings_waiting_field') {
        if (['شكرا', 'خلاص', 'تمام'].includes(text)) {
          chatStates.delete(chatId);
          await sendMainMenu(chatId, linkedBot.name);
          return res.status(200).json({ ok: true });
        }

        if (['رجوع', 'رجوع للقائمة'].includes(text)) {
          const channels = state.channels || [];
          chatStates.set(chatId, { step: 'settings_waiting_channel', channels, botName: state.botName });
          await sendChannelPicker(chatId, channels, state.botName || linkedBot.name);
          return res.status(200).json({ ok: true });
        }

        const { channelKey, fields = [] } = state;
        const tokens = text.split(/\s+/);
        const idx = parseInt(tokens.shift(), 10) - 1;
        const valueStr = tokens.join(' ').trim();
        if (Number.isNaN(idx) || idx < 0 || idx >= fields.length || !valueStr) {
          await sendTelegramMessage(chatId, 'صيغة غير صحيحة. أرسل الرقم متبوعاً بالقيمة (on/off أو القيمة الجديدة).', { reply_markup: inlineBackHome() });
          return res.status(200).json({ ok: true });
        }

        const field = fields[idx];
        const botFull = await Bot.findById(linkedBot._id);
        if (!botFull) {
          chatStates.delete(chatId);
          await sendTelegramMessage(chatId, 'تعذر جلب بيانات البوت.', { reply_markup: inlineBackHome() });
          return res.status(200).json({ ok: true });
        }

        if (field.type === 'boolean') {
          const parsed = parseBooleanInput(valueStr);
          if (parsed === null) {
            await sendTelegramMessage(chatId, 'اكتب on/تشغيل للتفعيل أو off/إيقاف للتعطيل.', { reply_markup: inlineBackHome() });
            return res.status(200).json({ ok: true });
          }
          botFull[field.prop] = parsed;
        } else if (field.type === 'number') {
          const num = parseInt(valueStr, 10);
          if (Number.isNaN(num) || num < 0) {
            await sendTelegramMessage(chatId, 'أدخل رقم دقائق صحيح (0 أو أكثر).', { reply_markup: inlineBackHome() });
            return res.status(200).json({ ok: true });
          }
          botFull[field.prop] = num;
        } else {
          if (['مسح', 'حذف', 'إزالة', 'مسحها'].includes(valueStr)) {
            botFull[field.prop] = '';
          } else {
            botFull[field.prop] = valueStr;
          }
        }

        try {
          await botFull.save();
          await sendTelegramMessage(chatId, '✅ تم تحديث الإعداد.', { reply_markup: inlineBackHome() });
          const refreshedFields = await sendChannelSettings(chatId, botFull, channelKey);
          chatStates.set(chatId, { ...state, fields: refreshedFields });
        } catch (err) {
          logger.error('telegram_update_channel_setting_error', { err: err.message, botId: botFull?._id, field: field?.prop });
          await sendTelegramMessage(chatId, 'تعذر حفظ الإعداد. حاول مرة أخرى.', { reply_markup: inlineBackHome() });
        }
        return res.status(200).json({ ok: true });
      }

      if (text === '➕ إضافة قاعدة جديدة') {
        chatStates.set(chatId, { step: 'add_rule_waiting_content' });
        await sendTelegramMessage(chatId, 'أرسل نص القاعدة الجديدة الآن (سيتم حفظها كنوع general).', { reply_markup: inlineBackHome() });
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'add_rule_waiting_content') {
        const content = text;
        try {
          const rule = new Rule({ botId: linkedBot._id, type: 'general', content });
          await rule.save();
          chatStates.delete(chatId);
          await sendTelegramMessage(chatId, `✅ تم إضافة القاعدة بنجاح. (ID: ${rule._id})`, { reply_markup: inlineBackHome() });
        } catch (err) {
          logger.error('telegram_add_rule_error', { err: err.message, botId: linkedBot._id });
          await sendTelegramMessage(chatId, 'تعذر حفظ القاعدة. حاول مرة أخرى.', { reply_markup: inlineBackHome() });
        }
        return res.status(200).json({ ok: true });
      }

      if (text === '✏️ تعديل قاعدة موجودة') {
        const rules = await listRulesForSelection(chatId, linkedBot._id, 'تعديلها', inlineMenuKeyboard);
        if (rules) chatStates.set(chatId, { step: 'edit_rule_waiting_selection', rules });
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'edit_rule_waiting_selection') {
        const idx = parseInt(text, 10) - 1;
        const rules = state.rules || [];
        if (Number.isNaN(idx) || idx < 0 || idx >= rules.length) {
          await sendTelegramMessage(chatId, 'رقم غير صحيح، حاول مرة أخرى.', { reply_markup: inlineBackHome() });
          return res.status(200).json({ ok: true });
        }
        const selectedRule = rules[idx];
        chatStates.set(chatId, { step: 'edit_rule_waiting_newcontent', selectedRuleId: selectedRule._id });
        const oldContent = typeof selectedRule.content === 'string' ? selectedRule.content : JSON.stringify(selectedRule.content);
        await sendTelegramMessage(chatId, `النص الحالي:\n${oldContent}\n\nأرسل النص الجديد بالكامل لاستبداله.`, { reply_markup: inlineBackHome() });
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'edit_rule_waiting_newcontent') {
        const ruleId = state.selectedRuleId;
        try {
          const rule = await Rule.findById(ruleId);
          if (!rule || String(rule.botId) !== String(linkedBot._id)) {
            await sendTelegramMessage(chatId, 'تعذر العثور على القاعدة أو ليست لهذا البوت.', { reply_markup: inlineBackHome() });
            chatStates.delete(chatId);
            return res.status(200).json({ ok: true });
          }
          rule.content = text;
          await rule.save();
          await sendTelegramMessage(chatId, '✅ تم تحديث القاعدة بنجاح.', { reply_markup: inlineBackHome() });
        } catch (err) {
          logger.error('telegram_update_rule_error', { err: err.message, botId: linkedBot._id, ruleId });
          await sendTelegramMessage(chatId, 'تعذر تحديث القاعدة. حاول مرة أخرى.', { reply_markup: inlineBackHome() });
        }
        chatStates.delete(chatId);
        return res.status(200).json({ ok: true });
      }

      if (text === '🗑 حذف قاعدة') {
        const rules = await listRulesForSelection(chatId, linkedBot._id, 'حذفها', inlineMenuKeyboard);
        if (rules) chatStates.set(chatId, { step: 'delete_rule_waiting_selection', rules });
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'delete_rule_waiting_selection') {
        const idx = parseInt(text, 10) - 1;
        const rules = state.rules || [];
        if (Number.isNaN(idx) || idx < 0 || idx >= rules.length) {
          await sendTelegramMessage(chatId, 'رقم غير صحيح، حاول مرة أخرى.', { reply_markup: inlineBackHome() });
          return res.status(200).json({ ok: true });
        }
        const selectedRule = rules[idx];
        try {
          await Rule.deleteOne({ _id: selectedRule._id, botId: linkedBot._id });
          await sendTelegramMessage(chatId, '✅ تم حذف القاعدة.', { reply_markup: inlineBackHome() });
        } catch (err) {
          logger.error('telegram_delete_rule_error', { err: err.message, botId: linkedBot._id, ruleId: selectedRule?._id });
          await sendTelegramMessage(chatId, 'تعذر حذف القاعدة. حاول مرة أخرى.', { reply_markup: inlineBackHome() });
        }
        chatStates.delete(chatId);
        return res.status(200).json({ ok: true });
      }

      // استعراض الطلبات (متجر + دردشة)
      if (text === '📦 استعراض كل الطلبات') {
        const any = await listAllOrdersCombined(chatId, { storeId, botId: linkedBot._id }, inlineMenuKeyboard);
        if (!any && !storeId) {
          await sendTelegramMessage(chatId, 'لا توجد طلبات دردشة، ولَم يتم ربط متجر بعد.', { reply_markup: inlineBackHome() });
        }
        return res.status(200).json({ ok: true });
      }

      if (text === '✅ الطلبات المؤكدة') {
        if (!(await ensureStore())) return res.status(200).json({ ok: true });
        await listOrders(chatId, storeId, { status: 'confirmed' }, inlineMenuKeyboard);
        return res.status(200).json({ ok: true });
      }

      // تعديل حالة طلب
      if (text === '✏️ تعديل حالة طلب') {
        if (!(await ensureStore())) return res.status(200).json({ ok: true });
        const orders = await listOrders(chatId, storeId, {}, inlineMenuKeyboard);
        if (orders) chatStates.set(chatId, { step: 'order_status_waiting_selection', orders });
        if (!orders) chatStates.delete(chatId);
        else await sendTelegramMessage(chatId, 'أرسل رقم الطلب المراد تعديل حالته.', { reply_markup: inlineBackHome() });
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'order_status_waiting_selection') {
        const idx = parseInt(text, 10) - 1;
        const orders = state.orders || [];
        if (Number.isNaN(idx) || idx < 0 || idx >= orders.length) {
          await sendTelegramMessage(chatId, 'رقم غير صحيح، حاول مرة أخرى.', { reply_markup: inlineBackHome() });
          return res.status(200).json({ ok: true });
        }
        const selectedOrder = orders[idx];
        chatStates.set(chatId, { step: 'order_status_waiting_new', orderId: selectedOrder._id, storeId });
        const optionsLines = ORDER_STATUS_OPTIONS.map((o, i) => `${i + 1}) ${o.label} (${o.key})`).join('\n');
        await sendTelegramMessage(
          chatId,
          `اختر رقم الحالة الجديدة أو اكتبها بالعربية/الإنجليزية:\n${optionsLines}`,
          { reply_markup: inlineBackHome() }
        );
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'order_status_waiting_new') {
        const { orderId, storeId: stId } = state;
        const parsedStatus = parseOrderStatusInput(text);
        if (!parsedStatus) {
          const optionsLines = ORDER_STATUS_OPTIONS.map((o, i) => `${i + 1}) ${o.label} (${o.key})`).join('\n');
          await sendTelegramMessage(chatId, `حالة غير مدعومة. الحالات المسموحة بالأرقام أو بالأسماء:\n${optionsLines}`, { reply_markup: inlineBackHome() });
          return res.status(200).json({ ok: true });
        }
        try {
          const order = await Order.findOne({ _id: orderId, storeId: stId });
          if (!order) {
            await sendTelegramMessage(chatId, 'تعذر العثور على الطلب.', { reply_markup: inlineBackHome() });
            chatStates.delete(chatId);
            return res.status(200).json({ ok: true });
          }
          const prev = order.status;
          order.status = parsedStatus;
          if (!Array.isArray(order.history)) order.history = [];
          order.history.push({ status: parsedStatus, changedBy: linkedBot.userId, changedAt: new Date(), note: `تغيير من ${prev} إلى ${parsedStatus} (تيليجرام)` });
          await order.save();
          const human = ORDER_STATUS_OPTIONS.find((o) => o.key === parsedStatus)?.label || parsedStatus;
          await sendTelegramMessage(chatId, `✅ تم تحديث حالة الطلب إلى ${human}.`, { reply_markup: inlineBackHome() });
        } catch (err) {
          logger.error('telegram_update_order_status_error', { err: err.message, orderId, botId: linkedBot._id });
          await sendTelegramMessage(chatId, 'تعذر تحديث حالة الطلب.', { reply_markup: inlineBackHome() });
        }
        chatStates.delete(chatId);
        return res.status(200).json({ ok: true });
      }

      // طلبات الدردشة
      if (text === '💬 طلبات الدردشة') {
        const orders = await listChatOrders(chatId, linkedBot._id, {}, inlineMenuKeyboard);
        if (!orders) chatStates.delete(chatId);
        return res.status(200).json({ ok: true });
      }

      if (text === '💬 الطلبات المؤكدة (دردشة)') {
        const orders = await listChatOrders(chatId, linkedBot._id, { status: 'confirmed' }, inlineMenuKeyboard);
        if (!orders) chatStates.delete(chatId);
        return res.status(200).json({ ok: true });
      }

      if (text === '✏️ تعديل حالة طلب دردشة') {
        const orders = await listChatOrders(chatId, linkedBot._id, {}, inlineMenuKeyboard);
        if (orders) chatStates.set(chatId, { step: 'chat_order_status_waiting_selection', orders });
        if (!orders) chatStates.delete(chatId);
        else await sendTelegramMessage(chatId, 'أرسل رقم طلب الدردشة المراد تعديل حالته.', { reply_markup: inlineBackHome() });
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'chat_order_status_waiting_selection') {
        const idx = parseInt(text, 10) - 1;
        const orders = state.orders || [];
        if (Number.isNaN(idx) || idx < 0 || idx >= orders.length) {
          await sendTelegramMessage(chatId, 'رقم غير صحيح، حاول مرة أخرى.', { reply_markup: inlineBackHome() });
          return res.status(200).json({ ok: true });
        }
        const selectedOrder = orders[idx];
        chatStates.set(chatId, { step: 'chat_order_status_waiting_new', orderId: selectedOrder._id });
        const optionsLines = ORDER_STATUS_OPTIONS.map((o, i) => `${i + 1}) ${o.label} (${o.key})`).join('\n');
        await sendTelegramMessage(
          chatId,
          `اختر رقم الحالة الجديدة أو اكتبها بالعربية/الإنجليزية:\n${optionsLines}`,
          { reply_markup: inlineBackHome() }
        );
        return res.status(200).json({ ok: true });
      }

      if (state.step === 'chat_order_status_waiting_new') {
        const { orderId } = state;
        const parsedStatus = parseOrderStatusInput(text);
        if (!parsedStatus) {
          const optionsLines = ORDER_STATUS_OPTIONS.map((o, i) => `${i + 1}) ${o.label} (${o.key})`).join('\n');
          await sendTelegramMessage(chatId, `حالة غير مدعومة. الحالات المسموحة بالأرقام أو بالأسماء:\n${optionsLines}`, { reply_markup: inlineBackHome() });
          return res.status(200).json({ ok: true });
        }
        try {
          const order = await ChatOrder.findOne({ _id: orderId, botId: linkedBot._id });
          if (!order) {
            await sendTelegramMessage(chatId, 'تعذر العثور على طلب الدردشة.', { reply_markup: inlineBackHome() });
            chatStates.delete(chatId);
            return res.status(200).json({ ok: true });
          }
          const prev = order.status;
          order.status = parsedStatus;
          if (!Array.isArray(order.history)) order.history = [];
          order.history.push({ status: parsedStatus, changedBy: linkedBot.userId, changedAt: new Date(), note: `تغيير من ${prev} إلى ${parsedStatus} (تيليجرام)` });
          await order.save();
          const human = ORDER_STATUS_OPTIONS.find((o) => o.key === parsedStatus)?.label || parsedStatus;
          await sendTelegramMessage(chatId, `✅ تم تحديث حالة طلب الدردشة إلى ${human}.`, { reply_markup: inlineBackHome() });

          // إشعار تيليجرام لصاحب البوت
          try {
            logger.info('telegram_notify_chat_order_status', { botId: linkedBot._id, userId: linkedBot.userId, orderId: order._id, status: order.status });
            await notifyOrderStatus(linkedBot.userId, {
              storeName: linkedBot.name,
              orderId: order._id,
              status: order.status,
              note: '',
            }, linkedBot._id);
          } catch (notifyErr) {
            logger.warn('telegram_notify_chat_order_failed', { orderId: order._id, err: notifyErr.message });
          }
        } catch (err) {
          logger.error('telegram_update_chat_order_status_error', { err: err.message, orderId, botId: linkedBot._id });
          await sendTelegramMessage(chatId, 'تعذر تحديث حالة طلب الدردشة.', { reply_markup: inlineBackHome() });
        }
        chatStates.delete(chatId);
        return res.status(200).json({ ok: true });
      }

      await sendShortcutHint(chatId, linkedBot.name, 'استخدم الأزرار لإدارة القواعد والطلبات.');
      return res.status(200).json({ ok: true });
    }

    if (!code) {
      await sendTelegramMessage(chatId, 'برجاء إرسال كود ربط مكوّن من 6 أرقام كما يظهر في لوحة التحكم.');
      return res.status(200).json({ ok: true });
    }

    const linkResult = await linkByCode(code, chatId, username);
    if (linkResult.status === 'linked_bot') {
      await sendTelegramMessage(chatId, `تم ربط البوت (${linkResult.bot.name || 'غير مسمى'}) بنجاح! ستستقبل إشعاراته على هذا الحساب.`, { reply_markup: buildInlineMainMenu(linkResult.bot.name) });
    } else if (linkResult.status === 'linked_user') {
      await sendTelegramMessage(chatId, 'تم الربط بنجاح! ستصلك إشعارات الطلبات على هذا الحساب.');
    } else if (linkResult.status === 'expired') {
      await sendTelegramMessage(chatId, 'الكود منتهي. برجاء توليد كود جديد من لوحة التحكم.');
    } else if (linkResult.status === 'not_found') {
      await sendTelegramMessage(chatId, 'الكود غير صحيح. تأكد من كتابته بالضبط كما في لوحة التحكم.');
    } else {
      await sendTelegramMessage(chatId, 'تعذر الربط، حاول بكود جديد من لوحة التحكم.');
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('telegram_webhook_error', { err: err.message });
    return res.status(200).json({ ok: false });
  }
};
