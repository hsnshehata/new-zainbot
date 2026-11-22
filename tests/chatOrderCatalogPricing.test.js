'use strict';

// tests/chatOrderCatalogPricing.test.js
// Truthful order persistence: prices come ONLY from the merchant's own store
// catalog (never model-invented, never hardcoded), and the bot may confirm an
// order only after a real durable save. Covers: catalog-priced save, unknown
// item, ambiguous item, missing store, persistence failure, repeated
// confirmation, tenant isolation, and the system-prompt note wiring.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Stub the AI completion BEFORE botEngine is required: botEngine destructures
// getAiCompletion from this module at require time.
const aiFailover = require('../server/services/aiFailover');
let aiJsonReply = { intent: false };
let aiMainReply = null; // when null, the main reply call also returns the JSON payload
const aiCalls = [];
aiFailover.getAiCompletion = async (payload) => {
  aiCalls.push(payload);
  const isJsonCall = payload.response_format?.type === 'json_object';
  const content = (isJsonCall || aiMainReply === null) ? JSON.stringify(aiJsonReply) : aiMainReply;
  return { choices: [{ message: { content } }] };
};

const {
  extractChatOrderIntent,
  buildOrderStateNote,
  findCatalogProductMatch,
  enforceTruthfulOrderReply,
  processMessage,
} = require('../server/botEngine');
const ChatOrder = require('../server/models/ChatOrder');
const Store = require('../server/models/Store');
const Product = require('../server/models/Product');

let mongod;
let storeSeq = 0;

const OWNER_ID = new mongoose.Types.ObjectId();

function fullOrderReply(items, status = 'confirmed') {
  return {
    intent: true,
    customerName: 'عميل اختبار',
    customerPhone: '01012345678',
    customerAddress: '١٢ شارع التحرير، القاهرة',
    customerNote: '',
    items,
    status,
    freeText: 'طلب اختبار',
  };
}

async function makeStoreWithProducts(products) {
  storeSeq += 1;
  const store = await Store.create({
    userId: OWNER_ID,
    storeName: `متجر اختبار ${storeSeq}`,
    storeLink: `teststore${storeSeq}`,
    templateId: 1,
  });
  const docs = await Product.insertMany(products.map((p) => ({
    storeId: store._id,
    productName: p.productName,
    price: p.price,
    currency: 'EGP',
    stock: 10,
    hasOffer: Boolean(p.discountedPrice != null),
    originalPrice: p.discountedPrice != null ? p.price : undefined,
    discountedPrice: p.discountedPrice,
    isActive: p.isActive !== false,
  })));
  return { store, products: docs };
}

function botFor(store) {
  return { _id: new mongoose.Types.ObjectId(), userId: OWNER_ID, storeId: store ? store._id : null, name: 'بوت اختبار' };
}

async function runExtraction(bot, text, reply, extra = {}) {
  aiJsonReply = reply;
  return extractChatOrderIntent({
    bot,
    channel: 'web',
    userMessageContent: text,
    conversationId: extra.conversationId || new mongoose.Types.ObjectId(),
    sourceUserId: extra.sourceUserId || `web_test_${Math.random().toString(36).slice(2, 10)}`,
    sourceUsername: 'عميل',
    messageId: extra.messageId || `msg_${Math.random().toString(36).slice(2, 10)}`,
    transcript: extra.transcript || [],
  });
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('catalog-priced item saves with the CATALOG price, ignoring the model-invented price', async () => {
  const { store } = await makeStoreWithProducts([{ productName: 'كرة قدم', price: 250 }]);
  const bot = botFor(store);

  const result = await runExtraction(bot, 'تمام، أكد الطلب', fullOrderReply([{ title: 'كرة قدم', quantity: 2, price: 99999 }]));

  assert.equal(result.outcome, 'saved');
  assert.equal(result.saved, true);
  assert.equal(result.chatOrder.items[0].price, 250, 'catalog price wins over the model-invented 99999');
  assert.equal(result.chatOrder.totalAmount, 500);
  assert.equal(result.chatOrder.status, 'confirmed');

  const count = await ChatOrder.countDocuments({ botId: bot._id });
  assert.equal(count, 1);

  const note = buildOrderStateNote(result);
  assert.match(note, /تم حفظ طلب العميل بنجاح وتأكيده/);
  assert.match(note, /رقم الطلب/);
});

test('discounted catalog price is used when the product has an active offer', async () => {
  const { store } = await makeStoreWithProducts([{ productName: 'حذاء رياضي', price: 500, discountedPrice: 350 }]);
  const bot = botFor(store);

  const result = await runExtraction(bot, 'تمام، أكد الطلب', fullOrderReply([{ title: 'حذاء رياضي', quantity: 1 }]));

  assert.equal(result.outcome, 'saved');
  assert.equal(result.chatOrder.items[0].price, 350);
});

test('unknown item (not in catalog) is never saved and never confirmable', async () => {
  const { store } = await makeStoreWithProducts([{ productName: 'كرة قدم', price: 250 }]);
  const bot = botFor(store);

  const result = await runExtraction(bot, 'تمام، أكد الطلب', fullOrderReply([{ title: 'جهاز غير موجود', quantity: 1, price: 100 }]));

  assert.equal(result.outcome, 'unpriced_items');
  assert.equal(result.saved, false);
  assert.equal(result.chatOrder, null);
  assert.deepEqual(result.unpricedTitles, ['جهاز غير موجود']);
  assert.equal(await ChatOrder.countDocuments({ botId: bot._id }), 0);

  const note = buildOrderStateNote(result);
  assert.match(note, /لم يُحفظ أي طلب/);
  assert.match(note, /جهاز غير موجود/);
  assert.match(note, /لا تذكر أي سعر/);
  assert.match(note, /ممنوع منعًا باتًا/);
});

test('ambiguous item (multiple catalog matches) is never priced and never saved', async () => {
  const { store } = await makeStoreWithProducts([
    { productName: 'كرة قدم مقاس 5', price: 250 },
    { productName: 'كرة طائرة مقاس 5', price: 300 },
  ]);
  const bot = botFor(store);

  const result = await runExtraction(bot, 'تمام، أكد الطلب', fullOrderReply([{ title: 'كرة مقاس 5', quantity: 1 }]));

  assert.equal(result.outcome, 'unpriced_items');
  assert.deepEqual(result.ambiguousTitles, ['كرة مقاس 5']);
  assert.equal(await ChatOrder.countDocuments({ botId: bot._id }), 0);

  const note = buildOrderStateNote(result);
  assert.match(note, /أكثر من منتج/);
});

test('bot without a store cannot price or save any order', async () => {
  const bot = botFor(null);

  const result = await runExtraction(bot, 'تمام، أكد الطلب', fullOrderReply([{ title: 'أي منتج', quantity: 1 }]));

  assert.equal(result.outcome, 'unpriced_items');
  assert.equal(await ChatOrder.countDocuments({ botId: bot._id }), 0);
});

test('regression: the removed ball hardcode no longer prices كرة without a catalog entry', async () => {
  const { store } = await makeStoreWithProducts([]);
  const bot = botFor(store);

  const result = await runExtraction(bot, 'تمام، أكد الطلب', fullOrderReply([{ title: 'كرة', quantity: 3 }]));

  assert.equal(result.outcome, 'unpriced_items');
  assert.equal(await ChatOrder.countDocuments({ botId: bot._id }), 0);
});

test('a partially unpriced order (one priced + one unknown item) is blocked entirely', async () => {
  const { store } = await makeStoreWithProducts([{ productName: 'كرة قدم', price: 250 }]);
  const bot = botFor(store);

  const result = await runExtraction(bot, 'تمام، أكد الطلب', fullOrderReply([
    { title: 'كرة قدم', quantity: 1 },
    { title: 'منتج وهمي', quantity: 1 },
  ]));

  assert.equal(result.outcome, 'unpriced_items');
  assert.equal(await ChatOrder.countDocuments({ botId: bot._id }), 0, 'no zero-priced line may reach a saved order');
});

test('persistence failure surfaces as save_failed, never as a confirmation', async () => {
  const { store } = await makeStoreWithProducts([{ productName: 'كرة قدم', price: 250 }]);
  const bot = botFor(store);

  const originalCreate = ChatOrder.create;
  ChatOrder.create = async () => { throw new Error('simulated db outage'); };
  try {
    const result = await runExtraction(bot, 'تمام، أكد الطلب', fullOrderReply([{ title: 'كرة قدم', quantity: 1 }]));
    assert.equal(result.outcome, 'save_failed');
    assert.equal(result.saved, false);
    assert.equal(result.chatOrder, null);

    const note = buildOrderStateNote(result);
    assert.match(note, /خطأ تقني/);
    assert.match(note, /ممنوع منعًا باتًا/);
  } finally {
    ChatOrder.create = originalCreate;
  }
});

test('repeated confirmation reuses the existing order instead of duplicating it', async () => {
  const { store } = await makeStoreWithProducts([{ productName: 'كرة قدم', price: 250 }]);
  const bot = botFor(store);
  const conversationId = new mongoose.Types.ObjectId();
  const sourceUserId = 'web_repeat_customer';

  const first = await runExtraction(bot, 'تمام، أكد الطلب', fullOrderReply([{ title: 'كرة قدم', quantity: 1 }]), { conversationId, sourceUserId });
  assert.equal(first.outcome, 'saved');

  const second = await runExtraction(bot, 'تمام، أكد الطلب', fullOrderReply([{ title: 'كرة قدم', quantity: 1 }]), { conversationId, sourceUserId });
  assert.equal(second.outcome, 'already_confirmed');
  assert.equal(String(second.chatOrder._id), String(first.chatOrder._id));
  assert.equal(await ChatOrder.countDocuments({ botId: bot._id }), 1);

  const note = buildOrderStateNote(second);
  assert.match(note, /مسجل مسبقًا/);
});

test('tenant isolation: a bot never prices from another tenant\'s store catalog', async () => {
  const { store: storeA } = await makeStoreWithProducts([{ productName: 'منتج عادي', price: 100 }]);
  await makeStoreWithProducts([{ productName: 'منتج سري خاص', price: 999 }]); // store B, other tenant
  const botA = botFor(storeA);

  const result = await runExtraction(botA, 'تمام، أكد الطلب', fullOrderReply([{ title: 'منتج سري خاص', quantity: 1, price: 999 }]));

  assert.equal(result.outcome, 'unpriced_items');
  assert.equal(await ChatOrder.countDocuments({ botId: botA._id }), 0);
});

test('received/pending wording: a saved non-confirmed order must not be called confirmed', async () => {
  const { store } = await makeStoreWithProducts([{ productName: 'كرة قدم', price: 250 }]);
  const bot = botFor(store);

  const result = await runExtraction(bot, 'عايز اطلب المنتج ده لو سمحت', fullOrderReply([{ title: 'كرة قدم', quantity: 1 }], 'pending'));

  assert.equal(result.outcome, 'saved');
  assert.notEqual(result.chatOrder.status, 'confirmed');

  const note = buildOrderStateNote(result);
  assert.match(note, /ليس مؤكدًا نهائيًا/);
  assert.doesNotMatch(note, /يمكنك تأكيد الطلب للعميل/);
});

test('missing customer data yields missing_data with the exact missing fields', async () => {
  const { store } = await makeStoreWithProducts([{ productName: 'كرة قدم', price: 250 }]);
  const bot = botFor(store);

  const reply = fullOrderReply([{ title: 'كرة قدم', quantity: 1 }]);
  delete reply.customerName;
  delete reply.customerAddress;
  const result = await runExtraction(bot, 'تمام، أكد الطلب', reply);

  assert.equal(result.outcome, 'missing_data');
  assert.ok(result.missingFields.includes('اسم العميل'));
  assert.ok(result.missingFields.includes('العنوان'));
  assert.equal(await ChatOrder.countDocuments({ botId: bot._id }), 0);

  const note = buildOrderStateNote(result);
  assert.match(note, /اسم العميل/);
  assert.match(note, /ممنوع منعًا باتًا/);
});

test('matcher: exact match wins, single fuzzy subset prices, multiple fuzzy stays ambiguous', () => {
  const products = [
    { productName: 'كرة القدم', price: 100, isActive: true },
    { productName: 'كرة طائرة', price: 200, isActive: true },
  ];
  assert.equal(findCatalogProductMatch(products, 'كرة القدم').product.price, 100, 'exact normalized match');
  assert.equal(findCatalogProductMatch(products, 'كرة القدم مقاس خمسة').product.price, 100, 'single fuzzy superset match');
  assert.equal(findCatalogProductMatch(products, 'كرة').status, 'ambiguous', 'both products fuzzily match');
  assert.equal(findCatalogProductMatch(products, 'منتج آخر تماما').status, 'unknown');
  assert.equal(findCatalogProductMatch([{ productName: 'x', isActive: false }], 'x').status, 'unknown');
});

test('adversarial: an overclaiming model reply is neutralized when nothing was durably saved', async () => {
  // Simulates the original production bug: model says "تم تأكيد الطلب!" while
  // the order was never persisted (unknown product, empty catalog).
  const overclaiming = 'تم تأكيد طلبك بنجاح! 🎉 رقم الطلب: 12345. شكرًا لتسوقك معنا.';
  const result = { saved: false, outcome: 'unpriced_items', chatOrder: null, unpricedTitles: ['كرة'] };
  const enforced = enforceTruthfulOrderReply(overclaiming, result);
  assert.doesNotMatch(enforced, /تم تأكيد/);
  assert.doesNotMatch(enforced, /12345/);
  assert.match(enforced, /شكرًا لتسوقك معنا/, 'non-claim content is preserved');
  assert.match(enforced, /غير متوفر بسعر رسمي/, 'truthful sentence appended');
});

test('adversarial: overclaim neutralized even when extraction returned null (no order intent at all)', async () => {
  const enforced = enforceTruthfulOrderReply('تم تأكيد الطلب! هيوصلك خلال يومين.', null);
  assert.doesNotMatch(enforced, /تم تأكيد الطلب/);
  assert.match(enforced, /هيوصلك خلال يومين/);
  assert.match(enforced, /لم يتم تسجيل أي طلب/);
});

test('a durably confirmed order keeps the model confirmation reply verbatim', () => {
  const reply = 'تم تأكيد طلبك بنجاح! رقم الطلب: abc.';
  const result = { saved: true, outcome: 'saved', chatOrder: { _id: 'abc', status: 'confirmed' } };
  assert.equal(enforceTruthfulOrderReply(reply, result), reply);
});

test('a saved-but-pending order: every model status assertion is replaced by the deterministic durable-status line', () => {
  // Fail-closed: confirmation claims AND shipping promises are both model
  // assertions about unpersisted state; only the durable-status line renders.
  const reply = 'تم تأكيد طلبك! هيتم شحنه بكرة.';
  const result = { saved: true, outcome: 'saved', chatOrder: { _id: 'xyz', status: 'processing' } };
  const enforced = enforceTruthfulOrderReply(reply, result);
  assert.doesNotMatch(enforced, /تم تأكيد طلبك!/);
  assert.doesNotMatch(enforced, /هيتم شحنه بكرة/, 'shipping promises are assertions and must not render');
  assert.match(enforced, /استلام ومراجعة، وليس تأكيدًا نهائيًا/);
});

test('non-asserting replies keep their content and gain the deterministic status line for the outcome', () => {
  const result = { saved: false, outcome: 'unpriced_items', unpricedTitles: ['x'] };
  const enforced = enforceTruthfulOrderReply('عذرًا، هذا المنتج غير متوفر حاليًا. هل تريد منتجًا بديلًا؟', result);
  assert.match(enforced, /عذرًا، هذا المنتج غير متوفر حاليًا/, 'non-order content preserved');
  assert.match(enforced, /هل تريد منتجًا بديلًا؟/, 'questions preserved');
  assert.match(enforced, /غير متوفر بسعر رسمي في متجرنا حاليًا/, 'deterministic status line appended');
});

test('non-order chat without any order outcome passes through completely unchanged', () => {
  const reply = 'أهلاً بك! أقدر أساعدك في أي استفسار عن المنتجات.';
  assert.equal(enforceTruthfulOrderReply(reply, null), reply);
  assert.equal(enforceTruthfulOrderReply(reply, undefined), reply);
  assert.equal(enforceTruthfulOrderReply(reply, { saved: false }), reply);
});

test('mixed-language paraphrase assertions are stripped and replaced by durable truth', () => {
  const reply = 'Your order has been confirmed successfully! رقم الطلب: 999.';
  const result = { saved: false, outcome: 'missing_data', missingFields: ['الاسم'] };
  const enforced = enforceTruthfulOrderReply(reply, result);
  assert.doesNotMatch(enforced, /confirmed/i);
  assert.doesNotMatch(enforced, /999/);
  assert.match(enforced, /لم يُسجل بعد/);
});

test('processMessage end-to-end: overclaiming main reply is neutralized before reaching the customer', async () => {
  const { store } = await makeStoreWithProducts([]);
  const Bot = require('../server/models/Bot');
  const botDoc = await Bot.create({ name: 'بوت الحارس', userId: OWNER_ID, storeId: store._id });

  aiCalls.length = 0;
  aiJsonReply = fullOrderReply([{ title: 'كرة', quantity: 1 }]);
  aiMainReply = 'تم تأكيد طلبك بنجاح! 🎉';
  try {
    const reply = await processMessage(String(botDoc._id), 'web_guard_user', 'تمام، أكد الطلب', false, false, 'msg_guard_1', 'web');
    assert.doesNotMatch(reply, /تم تأكيد طلبك/);
    assert.match(reply, /غير متوفر بسعر رسمي/);
    const Conversation = require('../server/models/Conversation');
    const convo = await Conversation.findOne({ botId: botDoc._id, userId: 'web_guard_user' });
    const lastAssistant = convo.messages.filter((m) => m.role === 'assistant').slice(-1)[0];
    assert.doesNotMatch(lastAssistant.content, /تم تأكيد طلبك/, 'the persisted transcript is also truthful');
  } finally {
    aiMainReply = null;
  }
});

test('processMessage appends the truthful order-state note to the main reply system prompt', async () => {
  const { store } = await makeStoreWithProducts([{ productName: 'كرة قدم', price: 250 }]);
  const Bot = require('../server/models/Bot');
  const botDoc = await Bot.create({ name: 'بوت ملاحظة الطلب', userId: OWNER_ID, storeId: store._id });

  aiCalls.length = 0;
  aiJsonReply = fullOrderReply([{ title: 'كرة قدم', quantity: 1, price: 1 }]);

  const reply = await processMessage(String(botDoc._id), 'web_note_wiring_user', 'تمام، أكد الطلب', false, false, 'msg_note_wiring_1', 'web');

  assert.equal(reply, aiCalls.length >= 2 ? reply : reply); // reply came from the stub
  assert.ok(aiCalls.length >= 2, 'expected extraction + main reply AI calls');
  const mainCall = aiCalls[aiCalls.length - 1];
  const systemPrompt = mainCall.messages[0].content;
  assert.match(systemPrompt, /\[حالة الطلب الفعلية\]/);
  assert.match(systemPrompt, /تم حفظ طلب العميل بنجاح وتأكيده/);

  const saved = await ChatOrder.findOne({ botId: botDoc._id });
  assert.ok(saved, 'order persisted');
  assert.equal(saved.items[0].price, 250, 'catalog price, not the model-invented 1');
});

test('processMessage tells the model NOT to confirm when the order could not be priced', async () => {
  const { store } = await makeStoreWithProducts([]);
  const Bot = require('../server/models/Bot');
  const botDoc = await Bot.create({ name: 'بوت بلا كتالوج', userId: OWNER_ID, storeId: store._id });

  aiCalls.length = 0;
  aiJsonReply = fullOrderReply([{ title: 'كرة', quantity: 1 }]);

  await processMessage(String(botDoc._id), 'web_no_confirm_user', 'تمام، أكد الطلب', false, false, 'msg_no_confirm_1', 'web');

  assert.ok(aiCalls.length >= 2);
  const systemPrompt = aiCalls[aiCalls.length - 1].messages[0].content;
  assert.match(systemPrompt, /\[حالة الطلب الفعلية\]/);
  assert.match(systemPrompt, /لم يُحفظ أي طلب/);
  assert.match(systemPrompt, /ممنوع منعًا باتًا/);
  assert.equal(await ChatOrder.countDocuments({ botId: botDoc._id }), 0);
});
