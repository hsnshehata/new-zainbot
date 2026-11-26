'use strict';

// tests/assistant/assistantWriteTools.test.js
// Pure unit tests for server/services/assistantWriteTools.js:
// - Joi validation (required fields, bounds, unknown/bulk field rejection)
// - create_order: authoritative catalog pricing, offer pricing, disambiguation,
//   chatInventoryHandoff/beginChatWrite block, imported-catalog refusal, tenant scope
// - update_inventory: set/increment/decrement, negative-stock block, Shopify/WooCommerce
//   importSource refusal (CATALOG_STOCK_REMOTE_MANAGED), store cache invalidation
// - message_customer: single-recipient disambiguation, web channel block,
//   channelGuard enforcement, channelDeliveryService-only delivery (never platformWhatsappSession),
//   deterministic Arabic confirmation cards.

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');

const {
  createAssistantWriteTools,
  buildConfirmationCard,
  detectWriteToolIntent,
  parseStructuredArgsDeterministically,
} = require('../../server/services/assistantWriteTools');
const { ChannelsDisabledError } = require('../../server/services/channelGuard');

const MERCHANT_A = new mongoose.Types.ObjectId('507f191e810c19729de86011');
const BOT_A1 = new mongoose.Types.ObjectId('507f191e810c19729de86101');
const BOT_A2 = new mongoose.Types.ObjectId('507f191e810c19729de86102');
const OTHER_BOT = new mongoose.Types.ObjectId('507f191e810c19729de86199');
const STORE_A1 = new mongoose.Types.ObjectId('507f191e810c19729de86201');
const OTHER_STORE = new mongoose.Types.ObjectId('507f191e810c19729de86299');
const PROD_1 = new mongoose.Types.ObjectId('507f191e810c19729de86301');
const PROD_2 = new mongoose.Types.ObjectId('507f191e810c19729de86302');
const PROD_SHOPIFY = new mongoose.Types.ObjectId('507f191e810c19729de86303');
const PROD_WOO = new mongoose.Types.ObjectId('507f191e810c19729de86304');
const CONV_1 = new mongoose.Types.ObjectId('507f191e810c19729de86401');
const CONV_2 = new mongoose.Types.ObjectId('507f191e810c19729de86402');
const CONV_WEB = new mongoose.Types.ObjectId('507f191e810c19729de86403');
const PENDING_ID = new mongoose.Types.ObjectId('507f191e810c19729de86501');

function makeFixture(overrides = {}) {
  const bots = overrides.bots || [
    {
      _id: BOT_A1,
      userId: MERCHANT_A,
      name: 'متجر زين',
      storeId: STORE_A1,
      isActive: true,
      facebookApiKey: 'fb-token-secret',
      whatsappBusinessAccountId: 'wa-phone-id',
      whatsappApiKey: 'wa-cloud-token',
    },
  ];
  const stores = overrides.stores || [
    {
      _id: STORE_A1,
      userId: MERCHANT_A,
      botId: BOT_A1,
      storeName: 'متجر زين للملابس',
      catalogInventoryMode: 'local',
      isActive: true,
    },
  ];
  const products = overrides.products || [
    {
      _id: PROD_1,
      storeId: STORE_A1,
      productName: 'تيشيرت أسود',
      price: 300,
      hasOffer: true,
      originalPrice: 300,
      discountedPrice: 250,
      currency: 'EGP',
      stock: 20,
      stockTracked: true,
      isActive: true,
    },
    {
      _id: PROD_2,
      storeId: STORE_A1,
      productName: 'تيشيرت أبيض',
      price: 280,
      hasOffer: false,
      currency: 'EGP',
      stock: 5,
      stockTracked: true,
      isActive: true,
    },
    {
      _id: PROD_SHOPIFY,
      storeId: STORE_A1,
      productName: 'جاكيت شوبيفاي',
      price: 900,
      currency: 'EGP',
      stock: 15,
      importSource: 'shopify',
      importSourceId: 'sp_1',
      isActive: true,
    },
    {
      _id: PROD_WOO,
      storeId: STORE_A1,
      productName: 'حذاء ووكومرس',
      price: 750,
      currency: 'EGP',
      stock: 8,
      importSource: 'woocommerce',
      importSourceId: 'wc_1',
      isActive: true,
    },
  ];
  const conversations = overrides.conversations || [
    {
      _id: CONV_1,
      botId: BOT_A1,
      userId: '201012345678@c.us',
      channel: 'whatsapp',
      username: 'أحمد علي',
      lastKnownPhone: '201012345678',
      messages: [{ role: 'user', content: 'السلام عليكم', timestamp: new Date('2026-11-27T00:00:00Z') }],
      isHumanHandling: false,
    },
    {
      _id: CONV_2,
      botId: BOT_A1,
      userId: 'fb_999',
      channel: 'facebook',
      username: 'أحمد حسن',
      lastKnownPhone: '201122334455',
      messages: [],
      isHumanHandling: false,
    },
    {
      _id: CONV_WEB,
      botId: BOT_A1,
      userId: 'web_guest_1',
      channel: 'web',
      username: 'زائر الويب',
      lastKnownPhone: '201299887766',
      messages: [],
      isHumanHandling: false,
    },
  ];
  const chatCustomers = overrides.chatCustomers || [
    {
      _id: new mongoose.Types.ObjectId(),
      botId: BOT_A1,
      conversationId: CONV_1,
      channel: 'whatsapp',
      sourceUserId: '201012345678@c.us',
      name: 'أحمد علي',
      phone: '201012345678',
    },
    {
      _id: new mongoose.Types.ObjectId(),
      botId: BOT_A1,
      conversationId: CONV_2,
      channel: 'facebook',
      sourceUserId: 'fb_999',
      name: 'أحمد حسن',
      phone: '201122334455',
    },
  ];

  const createdOrders = [];
  const upsertedCustomers = [];
  const deliveredMessages = [];
  const pushedConvMessages = [];
  const invalidatedStores = [];
  let chatWriteBeginCalls = 0;
  let chatWriteEndCalls = 0;
  let guardAllowed = overrides.guardAllowed !== false;
  let beginBlocked = Boolean(overrides.beginBlocked);

  const filterByIn = (val, matcher) => {
    if (matcher && typeof matcher === 'object' && Array.isArray(matcher.$in)) {
      return matcher.$in.some((item) => String(item) === String(val));
    }
    return String(val) === String(matcher);
  };

  const BotModel = {
    find: (q) => bots.filter((b) => String(b.userId) === String(q.userId)),
    findOne: (q) => bots.find((b) => String(b._id) === String(q._id) && String(b.userId) === String(q.userId)) || null,
  };
  const StoreModel = {
    find: (q) => stores.filter((s) => String(s.userId) === String(q.userId)),
    findOne: (q) => stores.find((s) => String(s._id) === String(q._id) && String(s.userId) === String(q.userId)) || null,
  };
  const ProductModel = {
    find: (q) => products.filter((p) => filterByIn(p.storeId, q.storeId) && p.isActive !== false),
    findOne: (q) => products.find((p) => String(p._id) === String(q._id) && filterByIn(p.storeId, q.storeId)) || null,
    findOneAndUpdate: async (filter, update) => {
      const p = products.find((item) => String(item._id) === String(filter._id) && String(item.storeId) === String(filter.storeId));
      if (!p) return null;
      if (filter.importSource && p.importSource) return null;
      if (filter.stock?.$gte !== undefined && p.stock < filter.stock.$gte) return null;
      if (filter.stock?.$lte !== undefined && p.stock > filter.stock.$lte) return null;
      if (update.$set?.stock !== undefined) p.stock = update.$set.stock;
      if (update.$inc?.stock !== undefined) p.stock += update.$inc.stock;
      return { ...p };
    },
  };
  const ChatOrderModel = {
    countDocuments: async () => overrides.existingOpenOrderCount || 0,
    create: async (doc) => {
      const saved = { _id: new mongoose.Types.ObjectId(), createdAt: new Date(), ...doc };
      createdOrders.push(saved);
      return saved;
    },
  };
  const ChatCustomerModel = {
    find: (q) => chatCustomers.filter((c) => {
      if (!filterByIn(c.botId, q.botId)) return false;
      if (q.$or) {
        return q.$or.some((clause) => {
          if (clause.phone?.$in) return clause.phone.$in.includes(c.phone);
          if (clause.sourceUserId?.$in) return clause.sourceUserId.$in.includes(c.sourceUserId);
          return false;
        });
      }
      return true;
    }),
    findOne: (q) => chatCustomers.find((c) => String(c.botId) === String(q.botId) && (
      (q.$or || []).some((clause) => (
        (clause.sourceUserId && clause.sourceUserId === c.sourceUserId)
        || (clause.conversationId && String(clause.conversationId) === String(c.conversationId))
        || (clause.phone?.$in && clause.phone.$in.includes(c.phone))
      ))
    )) || null,
  };
  const ConversationModel = {
    find: (q) => conversations.filter((c) => {
      if (!filterByIn(c.botId, q.botId)) return false;
      if (q.$or) {
        return q.$or.some((clause) => {
          if (clause.lastKnownPhone?.$in) return clause.lastKnownPhone.$in.includes(c.lastKnownPhone);
          if (clause.userId?.$in) return clause.userId.$in.includes(c.userId);
          return false;
        });
      }
      return true;
    }),
    findOne: (q) => conversations.find((c) => {
      if (q._id && String(c._id) !== String(q._id)) return false;
      if (q.botId && !filterByIn(c.botId, q.botId)) return false;
      if (q.userId && c.userId !== q.userId) return false;
      if (q.channel && c.channel !== q.channel) return false;
      return true;
    }) || null,
    updateOne: async (filter, update) => {
      pushedConvMessages.push({ filter, update });
      return { modifiedCount: 1 };
    },
  };

  const tools = createAssistantWriteTools({
    Bot: BotModel,
    Store: StoreModel,
    Product: ProductModel,
    ChatOrder: ChatOrderModel,
    ChatCustomer: ChatCustomerModel,
    Conversation: ConversationModel,
    channelGuard: {
      assertBotAllowed(botId) {
        if (!guardAllowed) throw new ChannelsDisabledError(botId);
      },
    },
    channelDeliveryService: {
      deliverReply: async (conv, text) => {
        deliveredMessages.push({ convId: String(conv._id), botId: String(conv.botId), channel: conv.channel, text });
        return overrides.deliverResult !== undefined ? overrides.deliverResult : true;
      },
    },
    decryptChannelToken: (t) => String(t || ''),
    checkChannelReady: async () => (overrides.channelReady !== undefined ? overrides.channelReady : true),
    beginChatWrite: async () => {
      chatWriteBeginCalls += 1;
      if (beginBlocked) return { blocked: true };
      return { storeId: STORE_A1, id: 'guard-1' };
    },
    endChatWrite: async () => {
      chatWriteEndCalls += 1;
    },
    upsertChatCustomerProfile: async (p) => {
      upsertedCustomers.push(p);
      return p;
    },
    invalidateStoreCache: (storeId) => {
      invalidatedStores.push(String(storeId));
    },
  });

  return {
    tools,
    products,
    createdOrders,
    upsertedCustomers,
    deliveredMessages,
    pushedConvMessages,
    invalidatedStores,
    getChatWriteCounts: () => ({ begin: chatWriteBeginCalls, end: chatWriteEndCalls }),
  };
}

test('static security check: assistantWriteTools never imports or references platformWhatsappSession', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../server/services/assistantWriteTools.js'),
    'utf8'
  );
  assert.equal(/require\([^)]*platformWhatsappSession/.test(src), false);
  assert.equal(/platformWhatsappSession\./.test(src), false);
});

test('Joi validation enforces required fields, bounds, and rejects bulk/unknown fields', () => {
  const { tools } = makeFixture();

  // create_order: missing address
  const badOrder = tools.validateArgs('create_order', {
    customerName: 'أحمد',
    customerPhone: '01012345678',
    customerAddress: 'قصير',
    items: [{ title: 'تيشيرت أسود', quantity: 1 }],
  });
  assert.equal(badOrder.valid, false);
  assert.equal(badOrder.errorCode, 'VALIDATION_ERROR');

  // update_inventory: negative set & 0 increment rejected
  const negSet = tools.validateArgs('update_inventory', {
    productName: 'تيشيرت أسود',
    operation: 'set',
    value: -5,
  });
  assert.equal(negSet.valid, false);

  const zeroInc = tools.validateArgs('update_inventory', {
    productName: 'تيشيرت أسود',
    operation: 'increment',
    value: 0,
  });
  assert.equal(zeroInc.valid, false);

  // message_customer: rejects bulk recipients field (single recipient invariant)
  const bulkMsg = tools.validateArgs('message_customer', {
    customerPhone: '01012345678',
    recipients: ['01012345678', '01112345678'],
    text: 'عرض خاص',
  });
  assert.equal(bulkMsg.valid, false);
});

test('create_order uses authoritative catalog offer price (ignoring LLM price) and executes with begin/endChatWrite', async () => {
  const fx = makeFixture({ existingOpenOrderCount: 3 });

  const prepared = await fx.tools.prepareAction({
    merchantUserId: MERCHANT_A,
    toolName: 'create_order',
    args: {
      customerName: 'محمد سمير',
      customerPhone: '01012345678',
      customerAddress: '15 شارع التحرير، الدقي، الجيزة',
      items: [{ title: 'تيشيرت أسود', quantity: 2, price: 1 }], // fake LLM price 1 MUST be ignored
      deliveryFee: 50,
    },
  });

  assert.equal(prepared.ok, true);
  // Offer price is 250 (not 300, and definitely not fake 1); 2 * 250 + 50 = 550
  assert.equal(prepared.normalizedPayload.items[0].price, 250);
  assert.equal(prepared.normalizedPayload.totalAmount, 550);
  assert.equal(prepared.normalizedPayload.customerPhone, '201012345678');
  assert.deepEqual(prepared.beforeSnapshot, { existingOpenOrderCount: 3, customerExists: true });

  const card = buildConfirmationCard({
    toolName: 'create_order',
    actionCode: '4821',
    verifiedSummary: prepared.verifiedSummary,
  });
  assert.ok(card.includes('550 EGP'));
  assert.ok(card.includes('تيشيرت أسود'));
  assert.ok(card.includes('#4821'));

  const executed = await fx.tools.executeAction({
    merchantUserId: MERCHANT_A,
    pendingAction: {
      _id: PENDING_ID,
      toolName: 'create_order',
      proposedPayload: prepared.normalizedPayload,
    },
  });

  assert.equal(executed.targetModel, 'ChatOrder');
  assert.equal(fx.createdOrders.length, 1);
  assert.equal(fx.createdOrders[0].totalAmount, 550);
  assert.equal(fx.createdOrders[0].status, 'confirmed');
  assert.equal(fx.upsertedCustomers.length, 1);
  assert.deepEqual(fx.getChatWriteCounts(), { begin: 1, end: 1 });
  assert.equal(executed.afterState.totalAmount, 550);
});

test('create_order refuses imported-catalog stores, beginChatWrite blocks, foreign botId, and ambiguous multi-bot', async () => {
  // Imported store mode blocked at prepare
  const importedFx = makeFixture({
    stores: [{
      _id: STORE_A1,
      userId: MERCHANT_A,
      botId: BOT_A1,
      storeName: 'Shopify Store',
      catalogInventoryMode: 'imported',
      isActive: true,
    }],
  });
  const impRes = await importedFx.tools.prepareAction({
    merchantUserId: MERCHANT_A,
    toolName: 'create_order',
    args: {
      customerName: 'سارة',
      customerPhone: '01098765432',
      customerAddress: 'مدينة نصر، القاهرة',
      items: [{ title: 'تيشيرت أسود', quantity: 1 }],
    },
  });
  assert.equal(impRes.ok, false);
  assert.equal(impRes.errorCode, 'CATALOG_INVENTORY_IMPORTED');

  // Foreign botId blocked (tenant isolation)
  const fx = makeFixture();
  const foreignRes = await fx.tools.prepareAction({
    merchantUserId: MERCHANT_A,
    toolName: 'create_order',
    args: {
      botId: String(OTHER_BOT),
      customerName: 'سارة',
      customerPhone: '01098765432',
      customerAddress: 'مدينة نصر، القاهرة',
      items: [{ title: 'تيشيرت أسود', quantity: 1 }],
    },
  });
  assert.equal(foreignRes.ok, false);
  assert.equal(foreignRes.errorCode, 'BOT_NOT_FOUND');

  // Multi-bot without defaultBotId asks for clarification
  const multiBotFx = makeFixture({
    bots: [
      { _id: BOT_A1, userId: MERCHANT_A, name: 'بوت 1', storeId: STORE_A1, isActive: true },
      { _id: BOT_A2, userId: MERCHANT_A, name: 'بوت 2', isActive: true },
    ],
  });
  const ambigBot = await multiBotFx.tools.prepareAction({
    merchantUserId: MERCHANT_A,
    toolName: 'create_order',
    args: {
      customerName: 'سارة',
      customerPhone: '01098765432',
      customerAddress: 'مدينة نصر، القاهرة',
      items: [{ title: 'تيشيرت أسود', quantity: 1 }],
    },
  });
  assert.equal(ambigBot.ok, false);
  assert.equal(ambigBot.needsClarification, true);
  assert.equal(ambigBot.errorCode, 'AMBIGUOUS_BOT');

  // beginChatWrite block at execution time
  const blockedFx = makeFixture({ beginBlocked: true });
  await assert.rejects(
    () => blockedFx.tools.executeAction({
      merchantUserId: MERCHANT_A,
      pendingAction: {
        _id: PENDING_ID,
        toolName: 'create_order',
        proposedPayload: {
          botId: String(BOT_A1),
          storeId: String(STORE_A1),
          customerName: 'سارة',
          customerPhone: '201098765432',
          customerAddress: 'مدينة نصر، القاهرة',
          items: [{ productId: String(PROD_1), title: 'تيشيرت أسود', quantity: 1, price: 250, currency: 'EGP' }],
          deliveryFee: 0,
        },
      },
    }),
    (err) => err.code === 'CATALOG_INVENTORY_IMPORTED'
  );
});

test('update_inventory supports set/increment/decrement, blocks negative stock, refuses Shopify/WooCommerce imports, and invalidates store cache', async () => {
  const fx = makeFixture();

  // Imported Shopify product refused
  const shopifyRes = await fx.tools.prepareAction({
    merchantUserId: MERCHANT_A,
    toolName: 'update_inventory',
    args: { productId: String(PROD_SHOPIFY), operation: 'set', value: 10 },
  });
  assert.equal(shopifyRes.ok, false);
  assert.equal(shopifyRes.errorCode, 'CATALOG_STOCK_REMOTE_MANAGED');

  // Imported WooCommerce product refused
  const wooRes = await fx.tools.prepareAction({
    merchantUserId: MERCHANT_A,
    toolName: 'update_inventory',
    args: { productId: String(PROD_WOO), operation: 'increment', value: 5 },
  });
  assert.equal(wooRes.ok, false);
  assert.equal(wooRes.errorCode, 'CATALOG_STOCK_REMOTE_MANAGED');

  // Ambiguous product name ("تيشيرت" matches both أسود and أبيض) -> clarifies instead of guessing
  const ambigProd = await fx.tools.prepareAction({
    merchantUserId: MERCHANT_A,
    toolName: 'update_inventory',
    args: { productName: 'تيشيرت', operation: 'set', value: 10 },
  });
  assert.equal(ambigProd.ok, false);
  assert.equal(ambigProd.needsClarification, true);
  assert.equal(ambigProd.errorCode, 'AMBIGUOUS_PRODUCT');

  // Decrement below 0 refused at prepare time
  const negDec = await fx.tools.prepareAction({
    merchantUserId: MERCHANT_A,
    toolName: 'update_inventory',
    args: { productId: String(PROD_2), operation: 'decrement', value: 9 }, // stock is 5
  });
  assert.equal(negDec.ok, false);
  assert.equal(negDec.errorCode, 'NEGATIVE_STOCK_FORBIDDEN');

  // Foreign storeId refused (tenant isolation)
  const foreignStore = await fx.tools.prepareAction({
    merchantUserId: MERCHANT_A,
    toolName: 'update_inventory',
    args: { storeId: String(OTHER_STORE), productId: String(PROD_1), operation: 'set', value: 5 },
  });
  assert.equal(foreignStore.ok, false);
  assert.equal(foreignStore.errorCode, 'STORE_NOT_FOUND');

  // Valid set -> execute -> invalidates store cache + accurate before/after
  const prepSet = await fx.tools.prepareAction({
    merchantUserId: MERCHANT_A,
    toolName: 'update_inventory',
    args: { productName: 'تيشيرت أسود', operation: 'set', value: 35 },
  });
  assert.equal(prepSet.ok, true);
  assert.equal(prepSet.beforeSnapshot.stock, 20);
  assert.equal(prepSet.verifiedSummary.afterStock, 35);

  const execSet = await fx.tools.executeAction({
    merchantUserId: MERCHANT_A,
    pendingAction: { _id: PENDING_ID, toolName: 'update_inventory', proposedPayload: prepSet.normalizedPayload },
  });
  assert.equal(execSet.beforeState.stock, 20);
  assert.equal(execSet.afterState.stock, 35);
  assert.equal(execSet.afterState.delta, 15);
  assert.deepEqual(fx.invalidatedStores, [String(STORE_A1)]);

  // Increment by 10 -> 45
  const execInc = await fx.tools.executeAction({
    merchantUserId: MERCHANT_A,
    pendingAction: {
      _id: PENDING_ID,
      toolName: 'update_inventory',
      proposedPayload: { storeId: String(STORE_A1), productId: String(PROD_1), operation: 'increment', value: 10 },
    },
  });
  assert.equal(execInc.beforeState.stock, 35);
  assert.equal(execInc.afterState.stock, 45);

  // Decrement by 5 -> 40
  const execDec = await fx.tools.executeAction({
    merchantUserId: MERCHANT_A,
    pendingAction: {
      _id: PENDING_ID,
      toolName: 'update_inventory',
      proposedPayload: { storeId: String(STORE_A1), productId: String(PROD_1), operation: 'decrement', value: 5 },
    },
  });
  assert.equal(execDec.beforeState.stock, 45);
  assert.equal(execDec.afterState.stock, 40);
  assert.equal(execDec.afterState.delta, -5);
});

test('message_customer enforces single-recipient disambiguation, channelGuard, channel support, and delivers via channelDeliveryService', async () => {
  const fx = makeFixture();

  // Two customers named "أحمد" -> AMBIGUOUS_CUSTOMER with masked phones
  const ambig = await fx.tools.prepareAction({
    merchantUserId: MERCHANT_A,
    toolName: 'message_customer',
    args: { customerName: 'أحمد', text: 'طلبك جاهز للشحن' },
  });
  assert.equal(ambig.ok, false);
  assert.equal(ambig.needsClarification, true);
  assert.equal(ambig.errorCode, 'AMBIGUOUS_CUSTOMER');
  assert.equal(ambig.candidates.length, 2);

  // Web channel refused
  const webRes = await fx.tools.prepareAction({
    merchantUserId: MERCHANT_A,
    toolName: 'message_customer',
    args: { conversationId: String(CONV_WEB), text: 'أهلاً بك' },
  });
  assert.equal(webRes.ok, false);
  assert.equal(webRes.errorCode, 'UNSUPPORTED_DELIVERY_CHANNEL');

  // channelGuard disabled blocks proposal
  const guardOffFx = makeFixture({ guardAllowed: false });
  const guardBlocked = await guardOffFx.tools.prepareAction({
    merchantUserId: MERCHANT_A,
    toolName: 'message_customer',
    args: { customerPhone: '01012345678', text: 'طلبك في الطريق' },
  });
  assert.equal(guardBlocked.ok, false);
  assert.equal(guardBlocked.errorCode, 'CHANNELS_DISABLED');

  // Unambiguous phone lookup -> confirmation card echoes verbatim text -> execute delivers via channelDeliveryService
  const prepMsg = await fx.tools.prepareAction({
    merchantUserId: MERCHANT_A,
    toolName: 'message_customer',
    args: { customerPhone: '01012345678', text: 'تم تجهيز طلبك وسيصل غدًا بإذن الله' },
  });
  assert.equal(prepMsg.ok, true);
  const card = buildConfirmationCard({
    toolName: 'message_customer',
    actionCode: '7712',
    verifiedSummary: prepMsg.verifiedSummary,
  });
  assert.ok(card.includes('«تم تجهيز طلبك وسيصل غدًا بإذن الله»'));

  const execMsg = await fx.tools.executeAction({
    merchantUserId: MERCHANT_A,
    pendingAction: { _id: PENDING_ID, toolName: 'message_customer', proposedPayload: prepMsg.normalizedPayload },
  });
  assert.equal(fx.deliveredMessages.length, 1);
  assert.equal(fx.deliveredMessages[0].botId, String(BOT_A1));
  assert.equal(fx.deliveredMessages[0].channel, 'whatsapp');
  assert.equal(fx.pushedConvMessages.length, 1);
  assert.equal(fx.pushedConvMessages[0].update.$push.messages.messageId, `assistant_msg_${PENDING_ID}`);
  assert.equal(fx.pushedConvMessages[0].update.$set, undefined, 'must not flip isHumanHandling');
  assert.equal(execMsg.afterState.delivered, true);
});

test('intent detection and deterministic arg parsing handle Arabic & English write prompts without catching read queries', () => {
  assert.equal(detectWriteToolIntent('كام مبيعات النهارده؟'), null);
  assert.equal(detectWriteToolIntent('تابع'), null);
  assert.equal(detectWriteToolIntent('عدّل مخزون تيشيرت أسود ل 25'), 'update_inventory');
  assert.equal(detectWriteToolIntent('سجل طلب جديد لعميل'), 'create_order');
  assert.equal(detectWriteToolIntent('ابعت رسالة للعميل أحمد'), 'message_customer');

  const parsedSet = parseStructuredArgsDeterministically('update_inventory', 'خلي مخزون تيشيرت أسود ٢٥');
  assert.equal(parsedSet.operation, 'set');
  assert.equal(parsedSet.productName, 'تيشيرت أسود');
  assert.equal(parsedSet.value, 25);

  const parsedInc = parseStructuredArgsDeterministically('update_inventory', 'زود 10 قطع على مخزون تيشيرت أسود');
  assert.equal(parsedInc.operation, 'increment');
  assert.equal(parsedInc.productName, 'تيشيرت أسود');
  assert.equal(parsedInc.value, 10);
});
