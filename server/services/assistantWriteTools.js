'use strict';

// server/services/assistantWriteTools.js
// Write Tools Engine for Merchant Assistant ("مساعد زين"):
//   1. create_order      — ChatOrder creation with catalog pricing & chatInventoryHandoff guard
//   2. update_inventory  — Local Product stock mutation with imported-catalog refusal & atomic bounds
//   3. message_customer  — Single-recipient customer message via channelDeliveryService ONLY
//                          (NEVER via platformWhatsappSession; enforces channelGuard)
//
// Security invariants:
// - Tenant scope is resolved exclusively from `merchantUserId`. IDs supplied by
//   the caller/LLM are never trusted without ownership verification.
// - Confirmation cards are deterministic Arabic text built strictly from
//   DB-verified values (never LLM prose).
// - All external dependencies are injectable for pure unit tests.

const Joi = require('joi');
const mongoose = require('mongoose');

const Bot = require('../models/Bot');
const Store = require('../models/Store');
const Product = require('../models/Product');
const ChatOrder = require('../models/ChatOrder');
const ChatCustomer = require('../models/ChatCustomer');
const Conversation = require('../models/Conversation');
const { redactAuditText } = require('../models/AuditEvent');
const channelGuard = require('./channelGuard');
const channelDeliveryService = require('./channelDeliveryService');
const { decryptChannelToken } = require('./channelTokenCrypto');
const { beginChatWrite, endChatWrite } = require('./catalogTransition');
const { effectiveProductPrice, normalize: normalizeCatalogText, tokens: catalogTokens } = require('./productContext');
const { upsertChatCustomerProfile } = require('../controllers/chatCustomersController');
const {
  normalizeArabicDigits,
  normalizePhoneToE164Digits,
  maskPhone,
  stripWhatsappJid,
} = require('./phoneNormalize');

const TOOL_NAMES = Object.freeze([
  'create_order',
  'update_inventory',
  'message_customer',
]);

const TOOL_TO_SETTING_KEY = Object.freeze({
  create_order: 'createOrder',
  update_inventory: 'updateInventory',
  message_customer: 'messageCustomer',
});

const TOOL_TARGET_MODELS = Object.freeze({
  create_order: 'ChatOrder',
  update_inventory: 'Product',
  message_customer: 'Conversation',
});

const ALLOWED_DELIVERY_CHANNELS = Object.freeze(['whatsapp', 'facebook', 'instagram']);
const MAX_STOCK_VALUE = 1_000_000;
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

// ---------------------------------------------------------------------------
// Joi schemas (strict: unknown fields rejected to block bulk/injection fields)
// ---------------------------------------------------------------------------

const objectIdString = Joi.string().trim().pattern(OBJECT_ID_RE);

const createOrderItemSchema = Joi.object({
  title: Joi.string().trim().min(1).max(150).required(),
  quantity: Joi.number().integer().min(1).max(10_000).default(1),
  price: Joi.number().min(0).max(10_000_000).optional(),
  currency: Joi.string().valid('EGP', 'USD', 'SAR').default('EGP'),
  note: Joi.string().trim().max(200).allow('').default(''),
}).unknown(false);

const createOrderSchema = Joi.object({
  botId: objectIdString.allow('', null).optional(),
  botName: Joi.string().trim().max(100).allow('', null).optional(),
  customerName: Joi.string().trim().min(1).max(100).required(),
  customerPhone: Joi.string().trim().min(7).max(40).required(),
  customerAddress: Joi.string().trim().min(5).max(300).required(),
  items: Joi.array().items(createOrderItemSchema).min(1).max(50).required(),
  deliveryFee: Joi.number().min(0).max(1_000_000).default(0),
  customerNote: Joi.string().trim().max(500).allow('').default(''),
  channel: Joi.string().valid('whatsapp', 'facebook', 'instagram', 'web', 'telegram').default('whatsapp'),
}).unknown(false);

const updateInventorySchema = Joi.object({
  storeId: objectIdString.allow('', null).optional(),
  productId: objectIdString.allow('', null).optional(),
  productName: Joi.string().trim().min(1).max(120).allow('', null).optional(),
  operation: Joi.string().valid('set', 'increment', 'decrement').required(),
  value: Joi.number().integer().min(0).max(MAX_STOCK_VALUE).required(),
})
  .or('productId', 'productName')
  .custom((val, helpers) => {
    if ((val.operation === 'increment' || val.operation === 'decrement') && val.value < 1) {
      return helpers.error('any.invalid', { message: 'Delta value must be >= 1 for increment/decrement' });
    }
    return val;
  }, 'inventory delta validation')
  .unknown(false);

const messageCustomerSchema = Joi.object({
  botId: objectIdString.allow('', null).optional(),
  conversationId: objectIdString.allow('', null).optional(),
  customerPhone: Joi.string().trim().min(4).max(40).allow('', null).optional(),
  customerName: Joi.string().trim().min(1).max(100).allow('', null).optional(),
  text: Joi.string().trim().min(1).max(1500).required(),
})
  .or('conversationId', 'customerPhone', 'customerName')
  .unknown(false);

const SCHEMAS = Object.freeze({
  create_order: createOrderSchema,
  update_inventory: updateInventorySchema,
  message_customer: messageCustomerSchema,
});

// ---------------------------------------------------------------------------
// Catalog matching (mirrors server/botEngine.js:findCatalogProductMatch so
// this module has zero circular dependency on botEngine)
// ---------------------------------------------------------------------------

function findCatalogProductMatch(products, title) {
  const active = (products || []).filter((p) => p && p.isActive !== false);
  const nameOf = (p) => String(p.productName || '');
  const normTitle = normalizeCatalogText(title).trim();
  if (!normTitle) return { status: 'unknown', candidates: [], matchedProducts: [] };

  const exact = active.filter((p) => normalizeCatalogText(p.productName).trim() === normTitle);
  if (exact.length === 1) return { status: 'priced', product: exact[0], matchedProducts: exact };
  if (exact.length > 1) return { status: 'ambiguous', candidates: exact.map(nameOf), matchedProducts: exact };

  const titleTokens = new Set(catalogTokens(title));
  if (!titleTokens.size) return { status: 'unknown', candidates: [], matchedProducts: [] };

  const subset = (a, b) => [...a].every((x) => b.has(x));
  const scored = active.map((p) => {
    const pt = new Set(catalogTokens(p.productName));
    if (!pt.size) return { product: p, subsetMatch: false, overlap: 0 };
    const subsetMatch = subset(pt, titleTokens) || subset(titleTokens, pt);
    let overlap = 0;
    for (const token of titleTokens) {
      if (pt.has(token)) overlap += 1;
    }
    return { product: p, subsetMatch, overlap };
  });

  const fuzzy = scored.filter((s) => s.subsetMatch);
  if (fuzzy.length === 1) {
    return { status: 'priced', product: fuzzy[0].product, matchedProducts: [fuzzy[0].product] };
  }
  if (fuzzy.length > 1) {
    return {
      status: 'ambiguous',
      candidates: fuzzy.map((s) => nameOf(s.product)),
      matchedProducts: fuzzy.map((s) => s.product),
    };
  }

  const suggestions = scored
    .filter((s) => s.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 3);

  return {
    status: 'unknown',
    candidates: suggestions.map((s) => nameOf(s.product)),
    matchedProducts: suggestions.map((s) => s.product),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toolError(code, userMessage, extra = {}) {
  const err = new Error(userMessage || code);
  err.code = code;
  err.userMessage = userMessage || code;
  Object.assign(err, extra);
  return err;
}

async function runQuery(queryLike, selectFields) {
  let cursor = queryLike;
  if (cursor && typeof cursor.select === 'function' && selectFields) {
    cursor = cursor.select(selectFields);
  }
  if (cursor && typeof cursor.lean === 'function') {
    cursor = cursor.lean();
  }
  return cursor;
}

function defaultInvalidateStoreCache(storeId) {
  try {
    const botEngine = require('../botEngine');
    if (botEngine && typeof botEngine.invalidateStoreCache === 'function') {
      botEngine.invalidateStoreCache(storeId);
    }
  } catch {
    // Cache expires naturally if botEngine is not loaded in isolated tests.
  }
}

function phoneLookupVariants(normalizedE164) {
  const variants = new Set();
  if (!normalizedE164) return [];
  variants.add(normalizedE164);
  variants.add(`+${normalizedE164}`);
  variants.add(`${normalizedE164}@c.us`);
  variants.add(`${normalizedE164}@s.whatsapp.net`);
  variants.add(`whatsapp_${normalizedE164}`);
  if (/^201\d{9}$/.test(normalizedE164)) {
    const local = `0${normalizedE164.slice(2)}`;
    variants.add(local);
  }
  return [...variants];
}

function formatChannelLabelAr(channel) {
  switch (channel) {
    case 'whatsapp': return 'واتساب';
    case 'facebook': return 'فيسبوك';
    case 'instagram': return 'إنستجرام';
    case 'telegram': return 'تيليجرام';
    case 'web': return 'دردشة الويب';
    default: return String(channel || 'غير محدد');
  }
}

function formatImportSourceLabel(importSource) {
  if (importSource === 'shopify') return 'Shopify';
  if (importSource === 'woocommerce') return 'WooCommerce';
  return String(importSource || 'كتالوج خارجي');
}

function formatOperationLabelAr(operation) {
  if (operation === 'set') return 'تحديد المخزون';
  if (operation === 'increment') return 'زيادة المخزون';
  if (operation === 'decrement') return 'خصم من المخزون';
  return operation;
}

// ---------------------------------------------------------------------------
// Deterministic write-intent detection & lightweight structured arg parser
// ---------------------------------------------------------------------------

const CREATE_ORDER_INTENT_RE = /(?:سج[لّ]|اعمل|اضف|أضف|انشئ|أنشئ|ضيف|create|add|new|place)\s+(?:لي\s+)?(?:طلب|اوردر|أوردر|order)/i;
const UPDATE_INVENTORY_INTENT_RE = /(?:عد[لّ]|غي[رّ]|حد[ثّ]|خل[يّ]|اضبط|زود|زوّد|خصم|اخصم|انقص|نقص|قلل|update|set|adjust|change|increase|decrease|increment|decrement)\s+(?:(?:[0-9٠-٩]+\s*(?:قطعة|قطعه|وحدة|وحده|قطع|units?|pcs?)?\s*(?:من|على|علي|في|لـ|ل|to|from|of)?\s*)?(?:مخزون|الكمية|كمية|ستوك|stock|inventory))|(?:مخزون|ستوك|stock|inventory)\s+.{1,80}\s+(?:ل|الى|إلى|ب|to|=|\+|-)?\s*[0-9٠-٩]+/i;
const MESSAGE_CUSTOMER_INTENT_RE = /(?:ابعت|أبعت|ارسل|أرسل|راسل|بعت|send|message)\s+(?:رسالة|رساله|مسج|message|text)?\s*(?:للعميل|لعميل|للزبون|لـ|ل|to\s+customer|customer)/i;

function detectWriteToolIntent(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (UPDATE_INVENTORY_INTENT_RE.test(raw)) return 'update_inventory';
  if (CREATE_ORDER_INTENT_RE.test(raw)) return 'create_order';
  if (MESSAGE_CUSTOMER_INTENT_RE.test(raw)) return 'message_customer';
  return null;
}

/**
 * Best-effort deterministic extractor for clear structured Arabic/English commands.
 * When AI completion is available, callers may enrich missing fields via JSON LLM
 * extraction, then ALWAYS validate via Joi + DB resolvers before proposing.
 */
function parseStructuredArgsDeterministically(toolName, text) {
  const normalized = normalizeArabicDigits(String(text || '').trim());
  if (!normalized) return {};

  if (toolName === 'update_inventory') {
    let operation = 'set';
    if (/(?:زود|زوّد|اضف|أضف|زيادة|increase|increment|add|\+)/i.test(normalized)) {
      operation = 'increment';
    } else if (/(?:خصم|اخصم|نقص|انقص|قلل|طرح|decrease|decrement|subtract|deduct)/i.test(normalized)) {
      operation = 'decrement';
    }

    const numMatches = normalized.match(/\d+/g);
    const value = numMatches && numMatches.length ? Number.parseInt(numMatches[numMatches.length - 1], 10) : undefined;

    // Extract product name between inventory keywords and the trailing quantity
    let productName = '';
    const arMatch = normalized.match(/(?:مخزون|كمية|ستوك)\s+(?:المنتج\s+)?(.+?)(?:\s+(?:ل|الى|إلى|ليصبح|يبقى|ب|بـ|=|\+|-)?\s*\d+\s*(?:قطعة|قطعه|وحدة|وحده|قطع)?\s*$)/i);
    const arDeltaMatch = normalized.match(/(?:زود|زوّد|خصم|اخصم|نقص|قلل)\s+\d+\s*(?:قطعة|قطعه|وحدة|وحده|قطع)?\s+(?:من|على|علي|في|لـ|ل)?\s*(?:مخزون\s+)?(?:المنتج\s+)?(.+)$/i);
    const enMatch = normalized.match(/(?:stock|inventory)\s+(?:of|for)?\s*(.+?)\s+(?:to|by|=)\s*\d+\s*$/i);
    if (arDeltaMatch) {
      productName = arDeltaMatch[1].trim();
    } else if (arMatch) {
      productName = arMatch[1].trim();
    } else if (enMatch) {
      productName = enMatch[1].trim();
    }
    productName = productName.replace(/^["'«»]+|["'«»]+$/g, '').trim();

    const result = { operation };
    if (productName) result.productName = productName;
    if (Number.isInteger(value)) result.value = value;
    return result;
  }

  if (toolName === 'message_customer') {
    const out = {};
    const phoneMatch = normalized.match(/(?:\+?\d[\d\s-]{7,16}\d)/);
    if (phoneMatch) {
      out.customerPhone = phoneMatch[0].trim();
    }
    const quotedMatch = normalized.match(/[«"]([^»"]{1,1500})[»"]/) || normalized.match(/:\s*(.+)$/);
    if (quotedMatch) {
      out.text = quotedMatch[1].trim();
    }
    const nameMatch = normalized.match(/(?:للعميل|لعميل|للزبون|customer)\s+([^\d:«"\n]{2,60}?)(?:\s+(?:رقم|هاتف|موبايل|نص|رسالة|رساله|تقول|ان|أن|بـ|ب|:|«|"|$))/i);
    if (nameMatch) {
      out.customerName = nameMatch[1].trim();
    }
    return out;
  }

  return {};
}

// ---------------------------------------------------------------------------
// Deterministic Arabic Confirmation Cards (built ONLY from DB-verified values)
// ---------------------------------------------------------------------------

function buildConfirmationCard({ toolName, actionCode, verifiedSummary, ttlMinutes = 5 }) {
  const codeTag = actionCode ? ` (#${actionCode})` : '';
  const footer = `\n\n⏳ الصلاحية: ${ttlMinutes} دقائق.\nللمتابعة رد بـ «تأكيد» أو «تأكيد #${actionCode || ''}» — أو «إلغاء» للتراجع.`.replace(' #»', '»');

  if (toolName === 'create_order') {
    const itemsLines = verifiedSummary.items.map(
      (it) => `• ${it.title} × ${it.quantity} — ${it.price} ${it.currency}`
    );
    const lines = [
      `📝 تأكيد تسجيل طلب جديد${codeTag}`,
      `البوت: ${verifiedSummary.botName}`,
      `العميل: ${verifiedSummary.customerName}`,
      `الهاتف: ${verifiedSummary.customerPhoneMasked}`,
      `العنوان: ${verifiedSummary.customerAddress}`,
      'المنتجات:',
      ...itemsLines,
    ];
    if (verifiedSummary.deliveryFee > 0) {
      lines.push(`الشحن: ${verifiedSummary.deliveryFee} ${verifiedSummary.currency}`);
    }
    lines.push(`الإجمالي: ${verifiedSummary.totalAmount} ${verifiedSummary.currency}`);
    if (verifiedSummary.customerNote) {
      lines.push(`ملاحظة: ${verifiedSummary.customerNote}`);
    }
    return `${lines.join('\n')}${footer}`;
  }

  if (toolName === 'update_inventory') {
    const lines = [
      `📦 تأكيد تعديل المخزون${codeTag}`,
      `المتجر: ${verifiedSummary.storeName}`,
      `المنتج: ${verifiedSummary.productName}`,
      `العملية: ${formatOperationLabelAr(verifiedSummary.operation)} (${verifiedSummary.value})`,
      `المخزون الحالي: ${verifiedSummary.beforeStock}`,
      `المخزون بعد التعديل: ${verifiedSummary.afterStock}`,
    ];
    return `${lines.join('\n')}${footer}`;
  }

  if (toolName === 'message_customer') {
    const lines = [
      `💬 تأكيد إرسال رسالة لعميل${codeTag}`,
      `البوت: ${verifiedSummary.botName}`,
      `القناة: ${formatChannelLabelAr(verifiedSummary.channel)}`,
      `العميل: ${verifiedSummary.customerName || 'عميل'}${verifiedSummary.customerPhoneMasked ? ` (${verifiedSummary.customerPhoneMasked})` : ''}`,
      'نص الرسالة الحرفي:',
      `«${verifiedSummary.text}»`,
    ];
    return `${lines.join('\n')}${footer}`;
  }

  return `تأكيد الإجراء${codeTag}${footer}`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function createAssistantWriteTools(deps = {}) {
  const models = {
    Bot: deps.Bot || Bot,
    Store: deps.Store || Store,
    Product: deps.Product || Product,
    ChatOrder: deps.ChatOrder || ChatOrder,
    ChatCustomer: deps.ChatCustomer || ChatCustomer,
    Conversation: deps.Conversation || Conversation,
  };
  const guard = deps.channelGuard || channelGuard;
  const deliveryService = deps.channelDeliveryService || channelDeliveryService;
  const decrypt = deps.decryptChannelToken || decryptChannelToken;
  const chatWriteBegin = deps.beginChatWrite || beginChatWrite;
  const chatWriteEnd = deps.endChatWrite || endChatWrite;
  const upsertCustomer = deps.upsertChatCustomerProfile || upsertChatCustomerProfile;
  const invalidateStoreCache = deps.invalidateStoreCache || defaultInvalidateStoreCache;
  const checkChannelReady = deps.checkChannelReady || defaultCheckChannelReady;
  const env = deps.env || process.env;

  async function defaultCheckChannelReady(bot, channel) {
    if (channel === 'facebook') {
      const token = decrypt(bot.facebookApiKey);
      return Boolean(token && String(token).trim());
    }
    if (channel === 'instagram') {
      const token = decrypt(bot.instagramApiKey);
      return Boolean(token && String(token).trim());
    }
    if (channel === 'whatsapp') {
      const hasCloud = Boolean(
        String(bot.whatsappBusinessAccountId || '').trim()
        && (decrypt(bot.whatsappApiKey) || String(env.WHATSAPP_ACCESS_TOKEN || '').trim())
      );
      if (hasCloud) return true;
      try {
        const { getWhatsAppSessionManager } = require('./whatsappSessionManager');
        const manager = getWhatsAppSessionManager();
        if (manager && typeof manager.getSessionStatus === 'function') {
          const status = await manager.getSessionStatus(String(bot._id));
          if (status && (status.connected || status.ready || status.status === 'connected' || status.status === 'ready')) {
            return true;
          }
        }
        if (manager && manager.sessions && typeof manager.sessions.get === 'function') {
          const session = manager.sessions.get(String(bot._id));
          if (session && (session.ready || session.isReady || session.status === 'connected' || session.status === 'ready')) {
            return true;
          }
        }
      } catch {
        // Fall through to false when session manager is unavailable/not connected.
      }
      return false;
    }
    return false;
  }

  function validateArgs(toolName, rawArgs) {
    const schema = SCHEMAS[toolName];
    if (!schema) {
      return {
        valid: false,
        errorCode: 'UNKNOWN_TOOL',
        message: 'الأداة المطلوبة غير معروفة.',
      };
    }
    const { error, value } = schema.validate(rawArgs || {}, {
      abortEarly: false,
      stripUnknown: false,
      convert: true,
    });
    if (error) {
      const details = error.details.map((d) => d.message).join('; ');
      return {
        valid: false,
        errorCode: 'VALIDATION_ERROR',
        details,
        message: `بيانات الإجراء غير مكتملة أو غير صالحة: ${details}`,
      };
    }
    return { valid: true, value };
  }

  async function loadMerchantBots(merchantUserId) {
    const rows = await runQuery(
      models.Bot.find({ userId: merchantUserId, archivedAt: null }),
      '_id name userId storeId isActive facebookApiKey instagramApiKey whatsappApiKey whatsappBusinessAccountId'
    );
    return Array.isArray(rows) ? rows : [];
  }

  async function loadMerchantStores(merchantUserId) {
    const rows = await runQuery(
      models.Store.find({ userId: merchantUserId }),
      '_id userId botId storeName isActive +catalogInventoryMode'
    );
    return Array.isArray(rows) ? rows : [];
  }

  // -------------------------------------------------------------------------
  // Tool 1: create_order
  // -------------------------------------------------------------------------

  async function prepareCreateOrder({ merchantUserId, args, user }) {
    const validation = validateArgs('create_order', args);
    if (!validation.valid) {
      return { ok: false, errorCode: validation.errorCode, message: validation.message };
    }
    const v = validation.value;

    const normalizedPhone = normalizePhoneToE164Digits(v.customerPhone);
    if (!normalizedPhone) {
      return {
        ok: false,
        errorCode: 'INVALID_CUSTOMER_PHONE',
        message: 'رقم هاتف العميل غير صالح. يرجى إدخال رقم صحيح (مثال: 01012345678 أو +201012345678).',
      };
    }

    const [bots, stores] = await Promise.all([
      loadMerchantBots(merchantUserId),
      loadMerchantStores(merchantUserId),
    ]);

    if (!bots.length) {
      return {
        ok: false,
        errorCode: 'NO_BOT_AVAILABLE',
        message: 'لا يوجد بوت نشط مرتبط بحسابك لتسجيل الطلب عليه.',
      };
    }

    let bot = null;
    if (v.botId) {
      bot = bots.find((b) => String(b._id) === String(v.botId)) || null;
      if (!bot) {
        return {
          ok: false,
          errorCode: 'BOT_NOT_FOUND',
          message: 'البوت المحدد غير موجود أو لا يتبع حسابك.',
        };
      }
    } else if (v.botName) {
      const normBot = normalizeCatalogText(v.botName).trim();
      const matched = bots.filter((b) => normalizeCatalogText(b.name).trim() === normBot);
      if (matched.length === 1) {
        bot = matched[0];
      } else {
        return {
          ok: false,
          needsClarification: true,
          errorCode: 'AMBIGUOUS_BOT',
          candidates: bots.map((b) => b.name),
          message: `حدّد اسم البوت بدقة من البوتات المتاحة: ${bots.map((b) => b.name).join('، ')}`,
        };
      }
    } else if (bots.length === 1) {
      bot = bots[0];
    } else if (user?.assistantSettings?.defaultBotId) {
      bot = bots.find((b) => String(b._id) === String(user.assistantSettings.defaultBotId)) || null;
    }

    if (!bot) {
      return {
        ok: false,
        needsClarification: true,
        errorCode: 'AMBIGUOUS_BOT',
        candidates: bots.map((b) => b.name),
        message: `لديك أكثر من بوت — حدّد اسم البوت المطلوب تسجيل الطلب عليه: ${bots.map((b) => b.name).join('، ')}`,
      };
    }

    const store = stores.find(
      (s) => (bot.storeId && String(s._id) === String(bot.storeId))
        || (s.botId && String(s.botId) === String(bot._id))
    ) || null;

    if (store && (store.catalogInventoryMode === 'imported' || store.catalogInventoryMode === 'transitioning')) {
      return {
        ok: false,
        errorCode: 'CATALOG_INVENTORY_IMPORTED',
        message: 'المتجر مربوط بكتالوج مستورد (Shopify/WooCommerce) — سجّل الطلب مباشرة من المتجر المتصل.',
      };
    }

    let resolvedItems = [];
    if (store) {
      const products = await runQuery(
        models.Product.find({ storeId: store._id, isActive: { $ne: false } }),
        '_id storeId productName price hasOffer originalPrice discountedPrice currency stock stockTracked importSource isActive'
      );
      const productList = Array.isArray(products) ? products : [];

      for (const item of v.items) {
        const match = findCatalogProductMatch(productList, item.title);
        if (match.status === 'ambiguous') {
          return {
            ok: false,
            needsClarification: true,
            errorCode: 'AMBIGUOUS_PRODUCT',
            candidates: match.candidates,
            message: `المنتج «${item.title}» يطابق أكثر من منتج في المتجر. اختر الاسم الدقيق: ${match.candidates.join('، ')}`,
          };
        }
        if (match.status !== 'priced' || !match.product) {
          const hint = match.candidates.length ? ` أقرب المنتجات: ${match.candidates.join('، ')}` : '';
          return {
            ok: false,
            needsClarification: true,
            errorCode: 'PRODUCT_NOT_FOUND',
            candidates: match.candidates,
            message: `لم يتم العثور على المنتج «${item.title}» في كتالوج المتجر.${hint}`,
          };
        }
        if (match.product.importSource) {
          return {
            ok: false,
            errorCode: 'CATALOG_STOCK_REMOTE_MANAGED',
            message: `المنتج «${match.product.productName}» مستورد من ${formatImportSourceLabel(match.product.importSource)} — سجّل الطلب من المتجر المتصل.`,
          };
        }
        const catalogPrice = effectiveProductPrice(match.product);
        const currency = ['EGP', 'USD', 'SAR'].includes(match.product.currency) ? match.product.currency : 'EGP';
        resolvedItems.push({
          productId: String(match.product._id),
          title: match.product.productName,
          quantity: item.quantity,
          price: catalogPrice,
          currency,
          note: item.note || '',
        });
      }
    } else {
      // Chat-only merchant without a linked store: require explicit positive merchant-stated price.
      for (const item of v.items) {
        if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price <= 0) {
          return {
            ok: false,
            needsClarification: true,
            errorCode: 'PRICE_REQUIRED',
            message: `لا يوجد كتالوج مرتبط بالبوت — يرجى تحديد سعر موجب للمنتج «${item.title}».`,
          };
        }
        resolvedItems.push({
          productId: null,
          title: item.title,
          quantity: item.quantity,
          price: item.price,
          currency: item.currency || 'EGP',
          note: item.note || '',
        });
      }
    }

    const subtotal = resolvedItems.reduce((sum, it) => sum + (it.price * it.quantity), 0);
    const deliveryFee = Number(v.deliveryFee) || 0;
    const totalAmount = Math.round((subtotal + deliveryFee) * 100) / 100;
    const currency = resolvedItems[0]?.currency || 'EGP';

    const [existingOpenOrderCount, existingCustomer] = await Promise.all([
      models.ChatOrder.countDocuments({
        botId: bot._id,
        status: { $in: ['pending', 'processing', 'confirmed'] },
      }),
      runQuery(
        models.ChatCustomer.findOne({
          botId: bot._id,
          $or: [
            { sourceUserId: normalizedPhone },
            { phone: { $in: phoneLookupVariants(normalizedPhone) } },
          ],
        }),
        '_id'
      ),
    ]);

    const beforeSnapshot = {
      existingOpenOrderCount: Number(existingOpenOrderCount) || 0,
      customerExists: Boolean(existingCustomer),
    };

    const normalizedPayload = {
      botId: String(bot._id),
      storeId: store ? String(store._id) : null,
      channel: v.channel || 'whatsapp',
      customerName: v.customerName,
      customerPhone: normalizedPhone,
      customerAddress: v.customerAddress,
      customerNote: v.customerNote || '',
      items: resolvedItems,
      deliveryFee,
      totalAmount,
      currency,
    };

    const verifiedSummary = {
      botName: bot.name,
      customerName: v.customerName,
      customerPhoneMasked: maskPhone(normalizedPhone),
      customerAddress: v.customerAddress,
      customerNote: v.customerNote || '',
      items: resolvedItems,
      deliveryFee,
      totalAmount,
      currency,
    };

    return {
      ok: true,
      toolName: 'create_order',
      botId: bot._id,
      storeId: store ? store._id : null,
      targetModel: 'ChatOrder',
      targetId: '',
      normalizedPayload,
      beforeSnapshot,
      verifiedSummary,
    };
  }

  async function executeCreateOrder({ merchantUserId, pendingAction }) {
    const payload = pendingAction.proposedPayload || {};
    const bot = await runQuery(
      models.Bot.findOne({ _id: payload.botId, userId: merchantUserId, archivedAt: null }),
      '_id name userId storeId isActive'
    );
    if (!bot) {
      throw toolError('BOT_NOT_FOUND', 'البوت المحدد غير موجود أو لا يتبع حسابك.');
    }

    let store = null;
    if (payload.storeId) {
      store = await runQuery(
        models.Store.findOne({ _id: payload.storeId, userId: merchantUserId }),
        '_id userId botId storeName +catalogInventoryMode'
      );
      if (!store) {
        throw toolError('STORE_NOT_FOUND', 'المتجر المحدد غير موجود أو لا يتبع حسابك.');
      }
      if (store.catalogInventoryMode === 'imported' || store.catalogInventoryMode === 'transitioning') {
        throw toolError(
          'CATALOG_INVENTORY_IMPORTED',
          'المتجر مربوط بكتالوج مستورد (Shopify/WooCommerce) — سجّل الطلب مباشرة من المتجر المتصل.'
        );
      }
    }

    const chatGuard = await chatWriteBegin(bot);
    if (chatGuard?.blocked) {
      throw toolError(
        'CATALOG_INVENTORY_IMPORTED',
        'المتجر في وضع الكتالوج المستورد — لا يمكن إنشاء طلب دردشة محلي.'
      );
    }

    try {
      // Freshly verify catalog prices if store-linked so stale prices are never written.
      let itemsToPersist = (payload.items || []).map((it) => ({
        title: it.title,
        quantity: it.quantity,
        price: it.price,
        currency: it.currency || 'EGP',
        note: it.note || '',
      }));

      if (store) {
        const products = await runQuery(
          models.Product.find({ storeId: store._id, isActive: { $ne: false } }),
          '_id storeId productName price hasOffer originalPrice discountedPrice currency importSource isActive'
        );
        const productList = Array.isArray(products) ? products : [];
        itemsToPersist = [];
        for (const it of payload.items || []) {
          const byId = it.productId
            ? productList.find((p) => String(p._id) === String(it.productId))
            : null;
          const match = byId ? { status: 'priced', product: byId } : findCatalogProductMatch(productList, it.title);
          if (match.status !== 'priced' || !match.product) {
            throw toolError('PRODUCT_NOT_FOUND', `المنتج «${it.title}» لم يعد متاحًا في الكتالوج.`);
          }
          if (match.product.importSource) {
            throw toolError(
              'CATALOG_STOCK_REMOTE_MANAGED',
              `المنتج «${match.product.productName}» مستورد من ${formatImportSourceLabel(match.product.importSource)}.`
            );
          }
          itemsToPersist.push({
            title: match.product.productName,
            quantity: it.quantity,
            price: effectiveProductPrice(match.product),
            currency: ['EGP', 'USD', 'SAR'].includes(match.product.currency) ? match.product.currency : 'EGP',
            note: it.note || '',
          });
        }
      }

      const [existingOpenOrderCount, existingCustomer] = await Promise.all([
        models.ChatOrder.countDocuments({
          botId: bot._id,
          status: { $in: ['pending', 'processing', 'confirmed'] },
        }),
        runQuery(
          models.ChatCustomer.findOne({
            botId: bot._id,
            $or: [
              { sourceUserId: payload.customerPhone },
              { phone: { $in: phoneLookupVariants(payload.customerPhone) } },
            ],
          }),
          '_id'
        ),
      ]);

      const beforeState = {
        existingOpenOrderCount: Number(existingOpenOrderCount) || 0,
        customerExists: Boolean(existingCustomer),
      };

      const subtotal = itemsToPersist.reduce((sum, it) => sum + (it.price * it.quantity), 0);
      const deliveryFee = Number(payload.deliveryFee) || 0;
      const totalAmount = Math.round((subtotal + deliveryFee) * 100) / 100;
      const currency = itemsToPersist[0]?.currency || payload.currency || 'EGP';

      const createdOrder = await models.ChatOrder.create({
        botId: bot._id,
        channel: payload.channel || 'whatsapp',
        sourceUserId: payload.customerPhone,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        customerAddress: payload.customerAddress,
        customerNote: payload.customerNote || '',
        items: itemsToPersist,
        deliveryFee,
        totalAmount,
        status: 'confirmed',
        history: [{
          status: 'confirmed',
          changedBy: merchantUserId,
          note: 'تم التسجيل عبر مساعد زين',
          changedAt: new Date(),
        }],
        lastMessageId: `assistant_order_${pendingAction._id}`,
      });

      // Upsert ChatCustomer profile; ignore unique-phone collision edge cases gracefully.
      try {
        await upsertCustomer({
          botId: bot._id,
          channel: payload.channel || 'whatsapp',
          sourceUserId: payload.customerPhone,
          name: payload.customerName,
          phone: payload.customerPhone,
          address: payload.customerAddress,
          lastOrderId: createdOrder._id,
          lastOrderAt: createdOrder.createdAt || new Date(),
        });
      } catch {
        // Order is already durably created; profile sync is best-effort.
      }

      const afterState = {
        chatOrderId: String(createdOrder._id),
        status: createdOrder.status,
        totalAmount: createdOrder.totalAmount,
        currency,
        itemsCount: itemsToPersist.length,
        customerPhoneMasked: maskPhone(payload.customerPhone),
      };

      const receiptText = [
        '✅ تم تسجيل الطلب بنجاح.',
        `رقم الطلب: ${String(createdOrder._id)}`,
        `العميل: ${payload.customerName} (${maskPhone(payload.customerPhone)})`,
        `الإجمالي: ${totalAmount} ${currency}`,
      ].join('\n');

      return {
        targetModel: 'ChatOrder',
        targetId: String(createdOrder._id),
        botId: bot._id,
        storeId: store ? store._id : null,
        beforeState,
        afterState,
        receiptText,
      };
    } finally {
      await chatWriteEnd(chatGuard);
    }
  }

  // -------------------------------------------------------------------------
  // Tool 2: update_inventory
  // -------------------------------------------------------------------------

  async function prepareUpdateInventory({ merchantUserId, args, user }) {
    const validation = validateArgs('update_inventory', args);
    if (!validation.valid) {
      return { ok: false, errorCode: validation.errorCode, message: validation.message };
    }
    const v = validation.value;

    const stores = await loadMerchantStores(merchantUserId);
    if (!stores.length) {
      return {
        ok: false,
        errorCode: 'NO_STORE_AVAILABLE',
        message: 'لا يوجد متجر مرتبط بحسابك لتعديل المخزون.',
      };
    }

    let scopedStores = stores;
    if (v.storeId) {
      const matchedStore = stores.find((s) => String(s._id) === String(v.storeId));
      if (!matchedStore) {
        return {
          ok: false,
          errorCode: 'STORE_NOT_FOUND',
          message: 'المتجر المحدد غير موجود أو لا يتبع حسابك.',
        };
      }
      scopedStores = [matchedStore];
    } else if (!v.productId && stores.length > 1 && user?.assistantSettings?.defaultStoreId) {
      const defStore = stores.find((s) => String(s._id) === String(user.assistantSettings.defaultStoreId));
      if (defStore) scopedStores = [defStore];
    }

    const allowedStoreIds = scopedStores.map((s) => s._id);
    const storeById = new Map(stores.map((s) => [String(s._id), s]));

    let product = null;
    if (v.productId) {
      product = await runQuery(
        models.Product.findOne({ _id: v.productId, storeId: { $in: allowedStoreIds } }),
        '_id storeId productName stock stockTracked importSource importSourceId isActive'
      );
      if (!product) {
        return {
          ok: false,
          errorCode: 'PRODUCT_NOT_FOUND',
          message: 'المنتج المحدد غير موجود أو لا يتبع متاجرك.',
        };
      }
    } else {
      const products = await runQuery(
        models.Product.find({ storeId: { $in: allowedStoreIds }, isActive: { $ne: false } }),
        '_id storeId productName stock stockTracked importSource importSourceId isActive'
      );
      const productList = Array.isArray(products) ? products : [];
      const match = findCatalogProductMatch(productList, v.productName);

      if (match.status === 'ambiguous') {
        const candidateLines = (match.matchedProducts || []).map(
          (p) => `${p.productName} (المخزون: ${Number(p.stock) || 0})`
        );
        return {
          ok: false,
          needsClarification: true,
          errorCode: 'AMBIGUOUS_PRODUCT',
          candidates: match.candidates,
          message: `يوجد أكثر من منتج مطابق — اختر الاسم الدقيق:\n${candidateLines.map((l) => `• ${l}`).join('\n')}`,
        };
      }
      if (match.status !== 'priced' || !match.product) {
        const hint = match.candidates.length ? ` أقرب المنتجات: ${match.candidates.join('، ')}` : '';
        return {
          ok: false,
          needsClarification: true,
          errorCode: 'PRODUCT_NOT_FOUND',
          candidates: match.candidates,
          message: `لم يتم العثور على المنتج «${v.productName}» في متجرك.${hint}`,
        };
      }
      product = match.product;
    }

    const ownerStore = storeById.get(String(product.storeId)) || null;
    if (!ownerStore) {
      return {
        ok: false,
        errorCode: 'PRODUCT_NOT_FOUND',
        message: 'المنتج المحدد لا يتبع متاجرك.',
      };
    }

    // Hard invariant: imported-catalog stock refusal
    if (product.importSource) {
      return {
        ok: false,
        errorCode: 'CATALOG_STOCK_REMOTE_MANAGED',
        message: `المنتج ده مستورد من ${formatImportSourceLabel(product.importSource)} — عدّل مخزونه من المتجر المتصل وزامن الكتالوج.`,
      };
    }
    if (ownerStore.catalogInventoryMode === 'imported' || ownerStore.catalogInventoryMode === 'transitioning') {
      return {
        ok: false,
        errorCode: 'CATALOG_STOCK_REMOTE_MANAGED',
        message: 'المتجر مربوط بكتالوج مستورد — عدّل المخزون من المتجر المتصل وزامن الكتالوج.',
      };
    }

    const beforeStock = Number(product.stock) || 0;
    let projectedStock = beforeStock;
    if (v.operation === 'set') projectedStock = v.value;
    else if (v.operation === 'increment') projectedStock = beforeStock + v.value;
    else if (v.operation === 'decrement') projectedStock = beforeStock - v.value;

    if (!Number.isInteger(projectedStock) || projectedStock < 0) {
      return {
        ok: false,
        errorCode: 'NEGATIVE_STOCK_FORBIDDEN',
        message: `لا يمكن أن يصبح المخزون أقل من 0 (المخزون الحالي لـ «${product.productName}» هو ${beforeStock}).`,
      };
    }
    if (projectedStock > MAX_STOCK_VALUE) {
      return {
        ok: false,
        errorCode: 'STOCK_LIMIT_EXCEEDED',
        message: `القيمة المطلوبة تتجاوز الحد الأقصى المسموح للمخزون (${MAX_STOCK_VALUE}).`,
      };
    }

    const beforeSnapshot = {
      productId: String(product._id),
      productName: product.productName,
      stock: beforeStock,
      stockTracked: product.stockTracked !== false,
    };

    const normalizedPayload = {
      storeId: String(ownerStore._id),
      productId: String(product._id),
      productName: product.productName,
      operation: v.operation,
      value: v.value,
    };

    const verifiedSummary = {
      storeName: ownerStore.storeName || '',
      productName: product.productName,
      operation: v.operation,
      value: v.value,
      beforeStock,
      afterStock: projectedStock,
    };

    return {
      ok: true,
      toolName: 'update_inventory',
      botId: ownerStore.botId || null,
      storeId: ownerStore._id,
      targetModel: 'Product',
      targetId: String(product._id),
      normalizedPayload,
      beforeSnapshot,
      verifiedSummary,
    };
  }

  async function executeUpdateInventory({ merchantUserId, pendingAction }) {
    const payload = pendingAction.proposedPayload || {};
    const store = await runQuery(
      models.Store.findOne({ _id: payload.storeId, userId: merchantUserId }),
      '_id userId botId storeName +catalogInventoryMode'
    );
    if (!store) {
      throw toolError('STORE_NOT_FOUND', 'المتجر المحدد غير موجود أو لا يتبع حسابك.');
    }
    if (store.catalogInventoryMode === 'imported' || store.catalogInventoryMode === 'transitioning') {
      throw toolError(
        'CATALOG_STOCK_REMOTE_MANAGED',
        'المتجر مربوط بكتالوج مستورد — عدّل المخزون من المتجر المتصل وزامن الكتالوج.'
      );
    }

    const freshProduct = await runQuery(
      models.Product.findOne({ _id: payload.productId, storeId: store._id }),
      '_id storeId productName stock stockTracked importSource'
    );
    if (!freshProduct) {
      throw toolError('PRODUCT_NOT_FOUND', 'المنتج غير موجود أو لا يتبع متاجرك.');
    }
    if (freshProduct.importSource) {
      throw toolError(
        'CATALOG_STOCK_REMOTE_MANAGED',
        `المنتج ده مستورد من ${formatImportSourceLabel(freshProduct.importSource)} — عدّل مخزونه من المتجر المتصل وزامن الكتالوج.`
      );
    }

    const beforeStock = Number(freshProduct.stock) || 0;
    const beforeState = {
      productId: String(freshProduct._id),
      productName: freshProduct.productName,
      stock: beforeStock,
      stockTracked: freshProduct.stockTracked !== false,
    };

    const now = new Date();
    const baseFilter = {
      _id: freshProduct._id,
      storeId: store._id,
      importSource: { $in: [null, ''] },
    };

    let updated = null;
    if (payload.operation === 'set') {
      if (!Number.isInteger(payload.value) || payload.value < 0 || payload.value > MAX_STOCK_VALUE) {
        throw toolError('NEGATIVE_STOCK_FORBIDDEN', 'قيمة المخزون خارج النطاق المسموح.', { beforeState });
      }
      updated = await models.Product.findOneAndUpdate(
        baseFilter,
        { $set: { stock: payload.value, updatedAt: now } },
        { new: true }
      );
    } else if (payload.operation === 'increment') {
      const delta = payload.value;
      if (beforeStock + delta > MAX_STOCK_VALUE) {
        throw toolError('STOCK_LIMIT_EXCEEDED', 'القيمة المطلوبة تتجاوز الحد الأقصى للمخزون.', { beforeState });
      }
      updated = await models.Product.findOneAndUpdate(
        { ...baseFilter, stock: { $lte: MAX_STOCK_VALUE - delta } },
        { $inc: { stock: delta }, $set: { updatedAt: now } },
        { new: true }
      );
    } else if (payload.operation === 'decrement') {
      const delta = payload.value;
      updated = await models.Product.findOneAndUpdate(
        { ...baseFilter, stock: { $gte: delta } },
        { $inc: { stock: -delta }, $set: { updatedAt: now } },
        { new: true }
      );
      if (!updated) {
        throw toolError(
          'NEGATIVE_STOCK_FORBIDDEN',
          `المخزون الحالي لا يكفي لخصم ${delta} (لا يمكن أن يصبح المخزون أقل من 0).`,
          { beforeState }
        );
      }
    } else {
      throw toolError('INVALID_OPERATION', 'عملية المخزون غير مدعومة.', { beforeState });
    }

    if (!updated) {
      throw toolError(
        'CATALOG_STOCK_REMOTE_MANAGED',
        'تعذّر تعديل المخزون — ربما أصبح المنتج مستوردًا أو خارج الحدود المسموحة.',
        { beforeState }
      );
    }

    invalidateStoreCache(store._id);

    const afterStock = Number(updated.stock) || 0;
    const afterState = {
      productId: String(updated._id),
      productName: updated.productName,
      stock: afterStock,
      delta: afterStock - beforeStock,
    };

    const receiptText = [
      '✅ تم تحديث المخزون بنجاح.',
      `المنتج: ${updated.productName}`,
      `المخزون السابق: ${beforeStock} ← المخزون الجديد: ${afterStock}`,
    ].join('\n');

    return {
      targetModel: 'Product',
      targetId: String(updated._id),
      botId: store.botId || null,
      storeId: store._id,
      beforeState,
      afterState,
      receiptText,
    };
  }

  // -------------------------------------------------------------------------
  // Tool 3: message_customer
  // -------------------------------------------------------------------------

  async function resolveCustomerCandidates({ allowedBotIds, botById, args }) {
    const candidatesByConvId = new Map();

    const addCandidate = (conv, customerDoc) => {
      if (!conv || !conv._id) return;
      const convKey = String(conv._id);
      if (candidatesByConvId.has(convKey)) return;
      const bot = botById.get(String(conv.botId));
      if (!bot) return;
      const rawPhone = customerDoc?.phone || conv.lastKnownPhone || (conv.channel === 'whatsapp' ? stripWhatsappJid(conv.userId) : '');
      const normalizedPhone = normalizePhoneToE164Digits(rawPhone);
      candidatesByConvId.set(convKey, {
        conversation: conv,
        bot,
        customerName: customerDoc?.name || conv.username || '',
        customerPhone: normalizedPhone,
        customerPhoneMasked: normalizedPhone ? maskPhone(normalizedPhone) : '',
      });
    };

    if (args.conversationId) {
      const conv = await runQuery(
        models.Conversation.findOne({ _id: args.conversationId, botId: { $in: allowedBotIds } }),
        '_id botId userId channel username lastKnownPhone messages isHumanHandling'
      );
      if (conv) {
        const customerDoc = await runQuery(
          models.ChatCustomer.findOne({
            botId: conv.botId,
            $or: [{ conversationId: conv._id }, { sourceUserId: conv.userId }],
          }),
          '_id name phone sourceUserId conversationId'
        );
        addCandidate(conv, customerDoc);
      }
      return [...candidatesByConvId.values()];
    }

    if (args.customerPhone) {
      const normalized = normalizePhoneToE164Digits(args.customerPhone);
      if (!normalized) return [];
      const variants = phoneLookupVariants(normalized);

      const [chatCustomers, directConvs] = await Promise.all([
        runQuery(
          models.ChatCustomer.find({
            botId: { $in: allowedBotIds },
            $or: [{ phone: { $in: variants } }, { sourceUserId: { $in: variants } }],
          }),
          '_id botId conversationId channel sourceUserId name phone'
        ),
        runQuery(
          models.Conversation.find({
            botId: { $in: allowedBotIds },
            $or: [{ lastKnownPhone: { $in: variants } }, { userId: { $in: variants } }],
          }),
          '_id botId userId channel username lastKnownPhone messages isHumanHandling'
        ),
      ]);

      const customerList = Array.isArray(chatCustomers) ? chatCustomers : [];
      const convList = Array.isArray(directConvs) ? directConvs : [];
      const convById = new Map(convList.map((c) => [String(c._id), c]));

      for (const cc of customerList) {
        let conv = cc.conversationId ? convById.get(String(cc.conversationId)) : null;
        if (!conv && cc.conversationId) {
          conv = await runQuery(
            models.Conversation.findOne({ _id: cc.conversationId, botId: cc.botId }),
            '_id botId userId channel username lastKnownPhone messages isHumanHandling'
          );
        }
        if (!conv) {
          conv = await runQuery(
            models.Conversation.findOne({ botId: cc.botId, userId: cc.sourceUserId, channel: cc.channel }),
            '_id botId userId channel username lastKnownPhone messages isHumanHandling'
          );
        }
        if (conv) addCandidate(conv, cc);
      }

      for (const conv of convList) {
        addCandidate(conv, null);
      }

      return [...candidatesByConvId.values()];
    }

    if (args.customerName) {
      const normQuery = normalizeCatalogText(args.customerName).trim();
      const queryTokens = new Set(catalogTokens(args.customerName));

      const [chatCustomers, convs] = await Promise.all([
        runQuery(
          models.ChatCustomer.find({ botId: { $in: allowedBotIds } }),
          '_id botId conversationId channel sourceUserId name phone'
        ),
        runQuery(
          models.Conversation.find({ botId: { $in: allowedBotIds } }),
          '_id botId userId channel username lastKnownPhone messages isHumanHandling'
        ),
      ]);

      const customerList = Array.isArray(chatCustomers) ? chatCustomers : [];
      const convList = Array.isArray(convs) ? convs : [];
      const convById = new Map(convList.map((c) => [String(c._id), c]));

      const matchesName = (candidateName) => {
        const norm = normalizeCatalogText(candidateName).trim();
        if (!norm) return 0;
        if (norm === normQuery) return 3;
        if (norm.includes(normQuery) || normQuery.includes(norm)) return 2;
        if (queryTokens.size > 0) {
          const candTokens = new Set(catalogTokens(candidateName));
          if ([...queryTokens].every((tok) => candTokens.has(tok))) return 1;
        }
        return 0;
      };

      const scored = [];
      for (const cc of customerList) {
        const score = matchesName(cc.name);
        if (score <= 0) continue;
        let conv = cc.conversationId ? convById.get(String(cc.conversationId)) : null;
        if (!conv) {
          conv = convList.find(
            (c) => String(c.botId) === String(cc.botId) && c.userId === cc.sourceUserId && c.channel === cc.channel
          ) || null;
        }
        if (conv) scored.push({ score, conv, cc });
      }
      for (const conv of convList) {
        const score = matchesName(conv.username);
        if (score > 0) scored.push({ score, conv, cc: null });
      }

      if (!scored.length) return [];
      const bestScore = Math.max(...scored.map((s) => s.score));
      for (const entry of scored.filter((s) => s.score === bestScore)) {
        addCandidate(entry.conv, entry.cc);
      }
      return [...candidatesByConvId.values()];
    }

    return [];
  }

  async function prepareMessageCustomer({ merchantUserId, args }) {
    const validation = validateArgs('message_customer', args);
    if (!validation.valid) {
      return { ok: false, errorCode: validation.errorCode, message: validation.message };
    }
    const v = validation.value;

    const bots = await loadMerchantBots(merchantUserId);
    if (!bots.length) {
      return {
        ok: false,
        errorCode: 'NO_BOT_AVAILABLE',
        message: 'لا يوجد بوت نشط مرتبط بحسابك لإرسال الرسالة منه.',
      };
    }

    let scopedBots = bots;
    if (v.botId) {
      const owned = bots.find((b) => String(b._id) === String(v.botId));
      if (!owned) {
        return {
          ok: false,
          errorCode: 'BOT_NOT_FOUND',
          message: 'البوت المحدد غير موجود أو لا يتبع حسابك.',
        };
      }
      scopedBots = [owned];
    }

    const allowedBotIds = scopedBots.map((b) => b._id);
    const botById = new Map(scopedBots.map((b) => [String(b._id), b]));

    const candidates = await resolveCustomerCandidates({
      allowedBotIds,
      botById,
      args: v,
    });

    if (!candidates.length) {
      return {
        ok: false,
        errorCode: 'CUSTOMER_NOT_FOUND',
        message: 'لم يتم العثور على عميل مطابق في محادثات بوتاتك.',
      };
    }

    if (candidates.length > 1) {
      const top3 = candidates.slice(0, 3).map((c) => ({
        name: c.customerName || 'عميل',
        phoneMasked: c.customerPhoneMasked,
        channel: c.conversation.channel,
        botName: c.bot.name,
      }));
      const lines = top3.map((c) =>
        `• ${c.name}${c.phoneMasked ? ` (${c.phoneMasked})` : ''} — ${formatChannelLabelAr(c.channel)} [${c.botName}]`
      );
      return {
        ok: false,
        needsClarification: true,
        errorCode: 'AMBIGUOUS_CUSTOMER',
        candidates: top3,
        message: `يوجد أكثر من عميل مطابق — حدّد العميل بدقة (رقم الهاتف أو القناة):\n${lines.join('\n')}`,
      };
    }

    const target = candidates[0];
    const conv = target.conversation;
    const bot = target.bot;

    if (!ALLOWED_DELIVERY_CHANNELS.includes(conv.channel)) {
      return {
        ok: false,
        errorCode: 'UNSUPPORTED_DELIVERY_CHANNEL',
        message: `لا يمكن إرسال رسائل مباشرة عبر قناة «${formatChannelLabelAr(conv.channel)}»؛ الإرسال متاح عبر واتساب وفيسبوك وإنستجرام فقط.`,
      };
    }

    // Channel guard check at proposal time (prevents asking merchant to confirm blocked sends)
    try {
      guard.assertBotAllowed(bot._id);
    } catch (err) {
      return {
        ok: false,
        errorCode: err?.code || 'CHANNELS_DISABLED',
        message: 'إرسال الرسائل عبر القنوات الخارجية معطّل حاليًا على هذا الخادم.',
      };
    }

    const channelReady = await checkChannelReady(bot, conv.channel);
    if (!channelReady) {
      return {
        ok: false,
        errorCode: 'CHANNEL_NOT_CONFIGURED',
        message: `قناة «${formatChannelLabelAr(conv.channel)}» للبوت «${bot.name}» غير متصلة أو غير مهيأة حاليًا.`,
      };
    }

    const lastMsg = Array.isArray(conv.messages) && conv.messages.length
      ? conv.messages[conv.messages.length - 1]
      : null;

    const beforeSnapshot = {
      conversationId: String(conv._id),
      botId: String(bot._id),
      channel: conv.channel,
      customerName: target.customerName,
      lastMessageAt: lastMsg?.timestamp || null,
    };

    const normalizedPayload = {
      botId: String(bot._id),
      conversationId: String(conv._id),
      channel: conv.channel,
      recipientId: conv.userId,
      customerName: target.customerName,
      customerPhoneMasked: target.customerPhoneMasked,
      text: v.text,
    };

    const verifiedSummary = {
      botName: bot.name,
      channel: conv.channel,
      customerName: target.customerName,
      customerPhoneMasked: target.customerPhoneMasked,
      text: v.text,
    };

    return {
      ok: true,
      toolName: 'message_customer',
      botId: bot._id,
      storeId: bot.storeId || null,
      targetModel: 'Conversation',
      targetId: String(conv._id),
      normalizedPayload,
      beforeSnapshot,
      verifiedSummary,
    };
  }

  async function executeMessageCustomer({ merchantUserId, pendingAction }) {
    const payload = pendingAction.proposedPayload || {};
    const bot = await runQuery(
      models.Bot.findOne({ _id: payload.botId, userId: merchantUserId, archivedAt: null }),
      '_id name userId storeId isActive facebookApiKey instagramApiKey whatsappApiKey whatsappBusinessAccountId'
    );
    if (!bot) {
      throw toolError('BOT_NOT_FOUND', 'البوت المحدد غير موجود أو لا يتبع حسابك.');
    }

    const conv = await runQuery(
      models.Conversation.findOne({ _id: payload.conversationId, botId: bot._id }),
      '_id botId userId channel username lastKnownPhone messages isHumanHandling'
    );
    if (!conv) {
      throw toolError('CUSTOMER_NOT_FOUND', 'المحادثة غير موجودة أو لا تتبع بوتاتك.');
    }
    if (!ALLOWED_DELIVERY_CHANNELS.includes(conv.channel)) {
      throw toolError('UNSUPPORTED_DELIVERY_CHANNEL', 'القناة غير مدعومة للإرسال المباشر.');
    }

    guard.assertBotAllowed(bot._id);

    const lastMsg = Array.isArray(conv.messages) && conv.messages.length
      ? conv.messages[conv.messages.length - 1]
      : null;

    const beforeState = {
      conversationId: String(conv._id),
      botId: String(bot._id),
      channel: conv.channel,
      customerName: payload.customerName || conv.username || '',
      lastMessageAt: lastMsg?.timestamp || null,
    };

    // Deliver strictly through merchant's own bot via channelDeliveryService (NEVER platformWhatsappSession).
    const delivered = await deliveryService.deliverReply(conv, payload.text);
    if (!delivered) {
      throw toolError(
        'CHANNEL_DELIVERY_FAILED',
        'تعذّر تسليم الرسالة عبر قناة البوت. تأكد من اتصال القناة وحاول مرة أخرى.',
        { beforeState }
      );
    }

    const messageId = `assistant_msg_${pendingAction._id}`;
    await models.Conversation.updateOne(
      { _id: conv._id, botId: bot._id },
      {
        $push: {
          messages: {
            role: 'assistant',
            content: payload.text,
            messageId,
            timestamp: new Date(),
          },
        },
      }
    );

    const afterState = {
      conversationId: String(conv._id),
      messageId,
      delivered: true,
      textLength: payload.text.length,
      previewRedacted: redactAuditText(payload.text).slice(0, 120),
    };

    const receiptText = [
      '✅ تم إرسال الرسالة للعميل بنجاح.',
      `العميل: ${payload.customerName || conv.username || 'عميل'}`,
      `القناة: ${formatChannelLabelAr(conv.channel)} (${bot.name})`,
    ].join('\n');

    return {
      targetModel: 'Conversation',
      targetId: String(conv._id),
      botId: bot._id,
      storeId: bot.storeId || null,
      beforeState,
      afterState,
      receiptText,
    };
  }

  // -------------------------------------------------------------------------
  // Public Dispatchers
  // -------------------------------------------------------------------------

  async function prepareAction({ merchantUserId, toolName, args, user }) {
    if (!merchantUserId || !mongoose.Types.ObjectId.isValid(String(merchantUserId))) {
      return { ok: false, errorCode: 'INVALID_MERCHANT', message: 'هوية التاجر غير صالحة.' };
    }
    if (toolName === 'create_order') {
      return prepareCreateOrder({ merchantUserId, args, user });
    }
    if (toolName === 'update_inventory') {
      return prepareUpdateInventory({ merchantUserId, args, user });
    }
    if (toolName === 'message_customer') {
      return prepareMessageCustomer({ merchantUserId, args, user });
    }
    return { ok: false, errorCode: 'UNKNOWN_TOOL', message: 'الأداة المطلوبة غير معروفة.' };
  }

  async function executeAction({ merchantUserId, pendingAction }) {
    const toolName = pendingAction?.toolName;
    if (toolName === 'create_order') {
      return executeCreateOrder({ merchantUserId, pendingAction });
    }
    if (toolName === 'update_inventory') {
      return executeUpdateInventory({ merchantUserId, pendingAction });
    }
    if (toolName === 'message_customer') {
      return executeMessageCustomer({ merchantUserId, pendingAction });
    }
    throw toolError('UNKNOWN_TOOL', 'الأداة المطلوبة غير معروفة.');
  }

  return {
    validateArgs,
    prepareAction,
    executeAction,
    buildConfirmationCard,
    detectWriteToolIntent,
    parseStructuredArgsDeterministically,
    findCatalogProductMatch,
    TOOL_NAMES,
    TOOL_TO_SETTING_KEY,
    TOOL_TARGET_MODELS,
    SCHEMAS,
  };
}

const defaultWriteTools = createAssistantWriteTools();

module.exports = {
  createAssistantWriteTools,
  validateArgs: defaultWriteTools.validateArgs,
  prepareAction: defaultWriteTools.prepareAction,
  executeAction: defaultWriteTools.executeAction,
  buildConfirmationCard,
  detectWriteToolIntent,
  parseStructuredArgsDeterministically,
  findCatalogProductMatch,
  TOOL_NAMES,
  TOOL_TO_SETTING_KEY,
  TOOL_TARGET_MODELS,
  SCHEMAS,
  ALLOWED_DELIVERY_CHANNELS,
  MAX_STOCK_VALUE,
};
