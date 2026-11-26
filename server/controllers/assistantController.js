'use strict';

// server/controllers/assistantController.js
// HTTP layer for the owner assistant. Every query is scoped to
// req.user.userId (set by the authenticate middleware) — no store, bot,
// conversation or reminder id from the request is ever trusted for
// tenant scoping.

const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/User');
const AssistantConversation = require('../models/AssistantConversation');
const {
  ASSISTANT_AUDIT_EVENT_TYPES,
  ASSISTANT_AUDIT_OUTCOMES,
} = require('../models/AssistantActionAudit');
const { ASSISTANT_WRITE_TOOLS } = require('../models/AssistantPendingAction');
const PlatformWhatsAppSession = require('../models/PlatformWhatsAppSession');
const Reminder = require('../models/Reminder');
const Bot = require('../models/Bot');
const Store = require('../models/Store');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Order = require('../models/Order');
const ChatOrder = require('../models/ChatOrder');
const Booking = require('../models/Booking');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Conversation = require('../models/Conversation');
const AiCredential = require('../models/AiCredential');
const ProviderKey = require('../models/ProviderKey');
const AppError = require('../utils/appError');
const logger = require('../logger');
const { createAssistantService } = require('../services/assistantService');
const { createAssistantDataTools } = require('../services/assistantDataTools');
const { getAiCompletion } = require('../services/aiFailover');
const { createAiKeyResolver } = require('../services/aiKeyResolver');
const {
  isAssistantWriteToolsEnabled,
  isCopilotEnabled,
} = require('../services/platformSettingsService');
const { listMerchantAudits } = require('../services/assistantActionAuditService');
const {
  maskPhone,
  normalizePhoneToE164Digits,
} = require('../services/phoneNormalize');

const MAX_MESSAGE_LENGTH = 2000;
const MAX_REMINDER_LENGTH = 500;
const HISTORY_CAP = 40;
const MAX_REMINDERS_PER_USER = 100;
const WHATSAPP_LINK_CODE_TTL_MS = 10 * 60 * 1000;
const WHATSAPP_LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ALLOWED_WRITE_TOOL_KEYS = Object.freeze([
  'createOrder',
  'updateInventory',
  'messageCustomer',
]);
const PROTECTED_ASSISTANT_SETTING_FIELDS = Object.freeze([
  'verifiedWhatsappPhone',
  'whatsappVerifiedAt',
  'whatsappLinkCodeHash',
  'whatsappLinkExpiresAt',
]);

const keyResolver = createAiKeyResolver({ AiCredential, ProviderKey });

const dataTools = createAssistantDataTools({
  models: { Sale, Expense, Order, ChatOrder, Booking, Product, Customer, Conversation, Bot, Store },
});

async function findKeyBot(userId) {
  return Bot.findOne({ userId, isActive: true })
    .select('userId userApiKey userProvider userModel userBaseUrl backupApiKey backupProvider backupModel backupBaseUrl')
    .lean();
}

async function ownerHasAiKey({ userId }) {
  const bot = await findKeyBot(userId);
  if (bot?.userApiKey || bot?.backupApiKey) return true;
  const globalKeys = await keyResolver.listGlobalAiKeys();
  return globalKeys.length > 0;
}

const assistantService = createAssistantService({
  models: { Store, Bot, Sale, Expense, Order, ChatOrder, Booking, Product, Customer, Conversation },
  dataTools,
  hasAiKey: ownerHasAiKey,
  complete: async ({ messages, userId }) => {
    const bot = await findKeyBot(userId);
    return getAiCompletion({ messages, max_tokens: 900 }, bot);
  },
});

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function readMessage(body) {
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) {
    throw new AppError('الرسالة مطلوبة / Message is required', 400, 'AssistantMessageRequired');
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new AppError('الرسالة طويلة جدًا / Message too long', 400, 'AssistantMessageTooLong');
  }
  return message;
}

async function chat(req, res, next) {
  try {
    const userId = req.user.userId;
    const message = readMessage(req.body);
    const conversationId = req.body?.conversationId;

    let conversation = null;
    if (conversationId) {
      if (!isValidObjectId(conversationId)) {
        throw new AppError('محادثة غير صالحة / Invalid conversation', 400, 'AssistantConversationInvalid');
      }
      // Ownership check is part of the query itself.
      conversation = await AssistantConversation.findOne({ _id: conversationId, user: userId });
      if (!conversation) {
        throw new AppError('المحادثة غير موجودة / Conversation not found', 404, 'AssistantConversationNotFound');
      }
    } else {
      conversation = new AssistantConversation({
        user: userId,
        title: message.slice(0, 60),
        messages: [],
      });
    }

    const history = conversation.messages.map((turn) => ({ role: turn.role, content: turn.content }));
    const result = await assistantService.answer({ userId, question: message, history });

    conversation.messages.push({ role: 'user', content: message });
    conversation.messages.push({ role: 'assistant', content: result.answer });
    if (conversation.messages.length > HISTORY_CAP) {
      conversation.messages = conversation.messages.slice(-HISTORY_CAP);
    }
    conversation.updatedAt = new Date();
    await conversation.save();

    return res.json({
      success: true,
      conversationId: String(conversation._id),
      reply: result.answer,
      usedTools: result.usedTools,
      fallback: result.fallback,
      language: result.language,
    });
  } catch (error) {
    return next(error);
  }
}

async function listConversations(req, res, next) {
  try {
    const conversations = await AssistantConversation.find({ user: req.user.userId })
      .sort({ updatedAt: -1 })
      .limit(20)
      .select('title messages updatedAt createdAt')
      .lean();
    return res.json({
      success: true,
      conversations: conversations.map((conversation) => {
        const last = conversation.messages[conversation.messages.length - 1];
        return {
          id: String(conversation._id),
          title: conversation.title || '',
          updatedAt: conversation.updatedAt,
          messageCount: conversation.messages.length,
          lastMessage: last ? String(last.content).slice(0, 120) : '',
        };
      }),
    });
  } catch (error) {
    return next(error);
  }
}

async function getConversation(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new AppError('محادثة غير صالحة / Invalid conversation', 400, 'AssistantConversationInvalid');
    }
    const conversation = await AssistantConversation.findOne({
      _id: req.params.id,
      user: req.user.userId,
    }).lean();
    if (!conversation) {
      throw new AppError('المحادثة غير موجودة / Conversation not found', 404, 'AssistantConversationNotFound');
    }
    return res.json({
      success: true,
      conversation: {
        id: String(conversation._id),
        title: conversation.title || '',
        messages: conversation.messages,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteConversation(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new AppError('محادثة غير صالحة / Invalid conversation', 400, 'AssistantConversationInvalid');
    }
    const result = await AssistantConversation.deleteOne({ _id: req.params.id, user: req.user.userId });
    if (!result.deletedCount) {
      throw new AppError('المحادثة غير موجودة / Conversation not found', 404, 'AssistantConversationNotFound');
    }
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
}

async function listReminders(req, res, next) {
  try {
    const filter = { user: req.user.userId };
    if (req.query.status && ['pending', 'sent', 'done', 'cancelled'].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const reminders = await Reminder.find(filter).sort({ dueAt: 1 }).limit(100).lean();
    return res.json({
      success: true,
      reminders: reminders.map((reminder) => ({
        id: String(reminder._id),
        text: reminder.text,
        dueAt: reminder.dueAt,
        status: reminder.status,
        createdAt: reminder.createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
}

async function createReminder(req, res, next) {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > MAX_REMINDER_LENGTH) {
      throw new AppError('نص التذكير مطلوب (بحد أقصى 500 حرف) / Reminder text is required (max 500 chars)', 400, 'ReminderTextInvalid');
    }
    const dueAt = new Date(req.body?.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      throw new AppError('موعد التذكير غير صالح / Invalid reminder date', 400, 'ReminderDateInvalid');
    }
    if (dueAt.getTime() < Date.now() - 60 * 1000) {
      throw new AppError('موعد التذكير لازم يكون في المستقبل / Reminder must be in the future', 400, 'ReminderDatePast');
    }
    const pendingCount = await Reminder.countDocuments({ user: req.user.userId, status: 'pending' });
    if (pendingCount >= MAX_REMINDERS_PER_USER) {
      throw new AppError('وصلت للحد الأقصى من التذكيرات / Reminder limit reached', 429, 'ReminderLimitReached');
    }
    const reminder = await Reminder.create({
      user: req.user.userId,
      text,
      dueAt,
    });
    logger.info('assistant_reminder_created', { userId: req.user.userId, reminderId: String(reminder._id) });
    return res.status(201).json({
      success: true,
      reminder: {
        id: String(reminder._id),
        text: reminder.text,
        dueAt: reminder.dueAt,
        status: reminder.status,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function completeReminder(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new AppError('تذكير غير صالح / Invalid reminder', 400, 'ReminderInvalid');
    }
    const reminder = await Reminder.findOneAndUpdate(
      { _id: req.params.id, user: req.user.userId, status: { $in: ['pending', 'sent'] } },
      { $set: { status: 'done' } },
      { new: true }
    );
    if (!reminder) {
      throw new AppError('التذكير غير موجود / Reminder not found', 404, 'ReminderNotFound');
    }
    return res.json({ success: true, reminder: { id: String(reminder._id), status: reminder.status } });
  } catch (error) {
    return next(error);
  }
}

async function deleteReminder(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new AppError('تذكير غير صالح / Invalid reminder', 400, 'ReminderInvalid');
    }
    const result = await Reminder.deleteOne({ _id: req.params.id, user: req.user.userId });
    if (!result.deletedCount) {
      throw new AppError('التذكير غير موجود / Reminder not found', 404, 'ReminderNotFound');
    }
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
}

function formatAssistantSettings(rawSettings) {
  const s = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const tools = s.allowedWriteTools && typeof s.allowedWriteTools === 'object'
    ? s.allowedWriteTools
    : {};
  const verifiedPhone = String(s.verifiedWhatsappPhone || '').trim();
  return {
    writeToolsEnabled: Boolean(s.writeToolsEnabled),
    allowedWriteTools: {
      createOrder: Boolean(tools.createOrder),
      updateInventory: Boolean(tools.updateInventory),
      messageCustomer: Boolean(tools.messageCustomer),
    },
    whatsappLinked: Boolean(verifiedPhone),
    verifiedWhatsappPhoneMasked: verifiedPhone ? maskPhone(verifiedPhone) : '',
    whatsappVerifiedAt: s.whatsappVerifiedAt || null,
    defaultBotId: s.defaultBotId ? String(s.defaultBotId) : null,
    defaultStoreId: s.defaultStoreId ? String(s.defaultStoreId) : null,
    updatedAt: s.updatedAt || null,
  };
}

function generateWhatsappLinkCode() {
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += WHATSAPP_LINK_CODE_ALPHABET[crypto.randomInt(0, WHATSAPP_LINK_CODE_ALPHABET.length)];
  }
  return `LINK-${suffix}`;
}

function hashWhatsappLinkCode(code) {
  return crypto.createHash('sha256').update(String(code || '')).digest('hex');
}

async function getSettings(req, res, next) {
  try {
    const userId = req.user.userId;
    const [user, platformWriteToolsEnabled, platformCopilotEnabled] = await Promise.all([
      User.findById(userId).select('assistantSettings').lean(),
      isAssistantWriteToolsEnabled(),
      isCopilotEnabled(),
    ]);
    if (!user) {
      throw new AppError('المستخدم غير موجود / User not found', 404, 'UserNotFound');
    }

    return res.json({
      success: true,
      settings: formatAssistantSettings(user.assistantSettings),
      platform: {
        assistantWriteToolsEnabled: platformWriteToolsEnabled,
        copilotEnabled: platformCopilotEnabled,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateSettings(req, res, next) {
  try {
    const userId = req.user.userId;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    for (const forbidden of PROTECTED_ASSISTANT_SETTING_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, forbidden)) {
        throw new AppError(
          'لا يمكن تعديل ربط واتساب مباشرة من هذا المسار / WhatsApp verification cannot be modified directly',
          400,
          'AssistantWhatsappBindForbidden'
        );
      }
    }

    const $set = {};

    if (body.writeToolsEnabled !== undefined) {
      if (typeof body.writeToolsEnabled !== 'boolean') {
        throw new AppError('قيمة writeToolsEnabled يجب أن تكون منطقية', 400, 'AssistantSettingsInvalid');
      }
      $set['assistantSettings.writeToolsEnabled'] = body.writeToolsEnabled;
    }

    if (body.allowedWriteTools !== undefined) {
      if (!body.allowedWriteTools || typeof body.allowedWriteTools !== 'object' || Array.isArray(body.allowedWriteTools)) {
        throw new AppError('قيمة allowedWriteTools غير صالحة', 400, 'AssistantSettingsInvalid');
      }
      for (const [key, val] of Object.entries(body.allowedWriteTools)) {
        if (!ALLOWED_WRITE_TOOL_KEYS.includes(key) || typeof val !== 'boolean') {
          throw new AppError(`إعداد الأداة غير صالح: ${key}`, 400, 'AssistantSettingsInvalid');
        }
        $set[`assistantSettings.allowedWriteTools.${key}`] = val;
      }
    }

    if (body.defaultBotId !== undefined) {
      if (body.defaultBotId === null || body.defaultBotId === '') {
        $set['assistantSettings.defaultBotId'] = null;
      } else {
        if (!isValidObjectId(body.defaultBotId)) {
          throw new AppError('معرّف البوت غير صالح / Invalid botId', 400, 'AssistantBotInvalid');
        }
        const ownedBot = await Bot.findOne({
          _id: body.defaultBotId,
          userId,
          archivedAt: null,
        }).select('_id').lean();
        if (!ownedBot) {
          throw new AppError('البوت غير موجود / Bot not found', 404, 'AssistantBotNotFound');
        }
        $set['assistantSettings.defaultBotId'] = ownedBot._id;
      }
    }

    if (body.defaultStoreId !== undefined) {
      if (body.defaultStoreId === null || body.defaultStoreId === '') {
        $set['assistantSettings.defaultStoreId'] = null;
      } else {
        if (!isValidObjectId(body.defaultStoreId)) {
          throw new AppError('معرّف المتجر غير صالح / Invalid storeId', 400, 'AssistantStoreInvalid');
        }
        const ownedStore = await Store.findOne({
          _id: body.defaultStoreId,
          userId,
        }).select('_id').lean();
        if (!ownedStore) {
          throw new AppError('المتجر غير موجود / Store not found', 404, 'AssistantStoreNotFound');
        }
        $set['assistantSettings.defaultStoreId'] = ownedStore._id;
      }
    }

    if (Object.keys($set).length === 0) {
      throw new AppError('لا توجد إعدادات صالحة للتحديث / No valid settings provided', 400, 'AssistantSettingsEmpty');
    }

    $set['assistantSettings.updatedAt'] = new Date();

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set },
      { new: true }
    ).select('assistantSettings').lean();

    if (!updatedUser) {
      throw new AppError('المستخدم غير موجود / User not found', 404, 'UserNotFound');
    }

    const [platformWriteToolsEnabled, platformCopilotEnabled] = await Promise.all([
      isAssistantWriteToolsEnabled(),
      isCopilotEnabled(),
    ]);

    logger.info('assistant_settings_updated', {
      userId: String(userId),
      updatedKeys: Object.keys($set).length,
    });

    return res.json({
      success: true,
      settings: formatAssistantSettings(updatedUser.assistantSettings),
      platform: {
        assistantWriteToolsEnabled: platformWriteToolsEnabled,
        copilotEnabled: platformCopilotEnabled,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function createWhatsappLinkCode(req, res, next) {
  try {
    const userId = req.user.userId;
    const code = generateWhatsappLinkCode();
    const codeHash = hashWhatsappLinkCode(code);
    const expiresAt = new Date(Date.now() + WHATSAPP_LINK_CODE_TTL_MS);

    const updated = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'assistantSettings.whatsappLinkCodeHash': codeHash,
          'assistantSettings.whatsappLinkExpiresAt': expiresAt,
        },
      },
      { new: true }
    ).select('_id').lean();

    if (!updated) {
      throw new AppError('المستخدم غير موجود / User not found', 404, 'UserNotFound');
    }

    let platformPhoneDigits = '';
    try {
      const session = await PlatformWhatsAppSession.findOne({ sessionId: 'platform' })
        .select('phone connected')
        .lean();
      if (session?.phone) {
        platformPhoneDigits = normalizePhoneToE164Digits(session.phone);
      }
    } catch (err) {
      logger.warn('assistant_link_code_platform_phone_lookup_failed', { err: err?.message });
    }

    const waMeUrl = platformPhoneDigits
      ? `https://wa.me/${platformPhoneDigits}?text=${encodeURIComponent(code)}`
      : '';

    logger.info('assistant_whatsapp_link_code_issued', {
      userId: String(userId),
      expiresAt: expiresAt.toISOString(),
    });

    return res.status(201).json({
      success: true,
      code,
      expiresAt,
      ttlSeconds: Math.floor(WHATSAPP_LINK_CODE_TTL_MS / 1000),
      platformWhatsappPhone: platformPhoneDigits,
      waMeUrl,
    });
  } catch (error) {
    return next(error);
  }
}

async function listAudit(req, res, next) {
  try {
    const userId = req.user.userId;
    const eventType = ASSISTANT_AUDIT_EVENT_TYPES.includes(req.query?.eventType)
      ? req.query.eventType
      : '';
    const toolName = ASSISTANT_WRITE_TOOLS.includes(req.query?.toolName)
      ? req.query.toolName
      : '';
    const outcome = ASSISTANT_AUDIT_OUTCOMES.includes(req.query?.outcome)
      ? req.query.outcome
      : '';

    const result = await listMerchantAudits({
      merchantUserId: userId,
      page: req.query?.page,
      limit: req.query?.limit,
      eventType,
      toolName,
      outcome,
    });

    return res.json({
      success: true,
      items: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  chat,
  listConversations,
  getConversation,
  deleteConversation,
  listReminders,
  createReminder,
  completeReminder,
  deleteReminder,
  getSettings,
  updateSettings,
  createWhatsappLinkCode,
  listAudit,
  _internals: {
    formatAssistantSettings,
    generateWhatsappLinkCode,
    hashWhatsappLinkCode,
  },
};
