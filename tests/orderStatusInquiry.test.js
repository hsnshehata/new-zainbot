'use strict';

// tests/orderStatusInquiry.test.js
// Pure status inquiries get a deterministic answer from durable state and
// never mutate the order (2026-11-22). Before this fix a "فين طلبي؟" turn
// either fell into the no-outcome backstop (truthful status claims stripped
// and replaced by a false "no order registered") or flowed into the
// update/save path and touched the order. Also covers Eastern Arabic digit
// normalization for Egyptian phone numbers (٠١٢٣… → 0123…).

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Stub the AI completion BEFORE botEngine is required (same harness as
// tests/chatOrderCatalogPricing.test.js).
const aiFailover = require('../server/services/aiFailover');
let aiJsonReply = { intent: false };
aiFailover.getAiCompletion = async () => ({ choices: [{ message: { content: JSON.stringify(aiJsonReply) } }] });

const {
  extractChatOrderIntent,
  enforceTruthfulOrderReply,
  customerTruthSentence,
  normalizeDigits,
  isValidPhone,
  extractPhoneFromText,
} = require('../server/botEngine');
const ChatOrder = require('../server/models/ChatOrder');
const Store = require('../server/models/Store');
const Product = require('../server/models/Product');

let mongod;
const OWNER_ID = new mongoose.Types.ObjectId();

function botFor(store) {
  return { _id: new mongoose.Types.ObjectId(), userId: OWNER_ID, storeId: store ? store._id : null, name: 'بوت اختبار' };
}

let storeSeq = 0;
async function makeStore() {
  storeSeq += 1;
  const store = await Store.create({
    userId: OWNER_ID,
    storeName: `متجر حالة ${storeSeq}`,
    storeLink: `statusstore${storeSeq}`,
    templateId: 1,
  });
  await Product.create({
    storeId: store._id,
    productName: 'كرة قدم',
    price: 250,
    currency: 'EGP',
    stock: 10,
    isActive: true,
  });
  return store;
}

async function runExtraction(bot, text, reply, extra = {}) {
  aiJsonReply = reply;
  return extractChatOrderIntent({
    bot,
    channel: 'web',
    userMessageContent: text,
    conversationId: extra.conversationId || new mongoose.Types.ObjectId(),
    sourceUserId: extra.sourceUserId || `web_status_${Math.random().toString(36).slice(2, 10)}`,
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

test.beforeEach(async () => {
  await ChatOrder.deleteMany({});
});

test('pure status inquiry answers from durable state and does not mutate the order', async () => {
  const store = await makeStore();
  const bot = botFor(store);
  const conversationId = new mongoose.Types.ObjectId();
  const sourceUserId = 'web_status_customer_1';

  const saved = await runExtraction(bot, 'تمام، أكد الطلب', {
    intent: true,
    customerName: 'عميل اختبار',
    customerPhone: '01012345678',
    customerAddress: '١٢ شارع التحرير',
    customerNote: '',
    items: [{ title: 'كرة قدم', quantity: 1 }],
    status: 'confirmed',
    freeText: 'طلب اختبار',
  }, { conversationId, sourceUserId });
  assert.equal(saved.outcome, 'saved');
  const orderId = saved.chatOrder._id;
  const updatedAtBefore = new Date(saved.chatOrder.updatedAt).getTime();

  await new Promise((r) => setTimeout(r, 5));
  const inquiry = await runExtraction(bot, 'فين طلبي؟', { intent: false }, { conversationId, sourceUserId });
  assert.equal(inquiry.outcome, 'status_inquiry');
  assert.equal(String(inquiry.chatOrder?._id), String(orderId));

  const after = await ChatOrder.findById(orderId);
  assert.equal(new Date(after.updatedAt).getTime(), updatedAtBefore, 'status inquiry must not touch the order');
  assert.equal(after.status, 'confirmed');
  assert.equal(await ChatOrder.countDocuments({ botId: bot._id }), 1, 'no new order created by an inquiry');

  const body = enforceTruthfulOrderReply('طلبك هيوصلك بكرة إن شاء الله، متقلقش!', inquiry);
  assert.match(body, new RegExp(String(orderId)));
  assert.match(body, /تم التأكيد/);
  assert.doesNotMatch(body, /هيوصلك بكرة/, 'model shipping promise must not reach the customer');
});

test('status inquiry with no order gets an honest deterministic answer', async () => {
  const bot = botFor(null);
  const inquiry = await runExtraction(bot, 'وصل طلبي؟', { intent: false });
  assert.equal(inquiry.outcome, 'status_inquiry');
  assert.equal(inquiry.chatOrder, null);
  const body = customerTruthSentence(inquiry);
  assert.match(body, /لا يوجد لديك طلب مسجل/);
});

test('confirm-plus-status wording is NOT treated as a pure inquiry', async () => {
  const store = await makeStore();
  const bot = botFor(store);
  const result = await runExtraction(bot, 'تمام أكد طلبي', {
    intent: true,
    customerName: 'عميل اختبار',
    customerPhone: '01012345678',
    customerAddress: '١٢ شارع التحرير',
    customerNote: '',
    items: [{ title: 'كرة قدم', quantity: 1 }],
    status: 'confirmed',
    freeText: 'طلب اختبار',
  });
  assert.notEqual(result.outcome, 'status_inquiry');
  assert.equal(result.outcome, 'saved');
});

test('Eastern Arabic digits: phone extracted, validated and stored as ASCII', async () => {
  assert.equal(normalizeDigits('٠١٠١٢٣٤٥٦٧٨'), '01012345678');
  assert.equal(normalizeDigits('۰۱۰۱۲۳۴۵۶۷۸'), '01012345678');
  assert.equal(isValidPhone('٠١٠١٢٣٤٥٦٧٨'), true);
  assert.equal(extractPhoneFromText('رقمي هو ٠١٠١٢٣٤٥٦٧٨ للتواصل'), '01012345678');
  assert.equal(isValidPhone('٠١٢٣'), false);

  const store = await makeStore();
  const bot = botFor(store);
  const saved = await runExtraction(bot, 'تمام، أكد الطلب', {
    intent: true,
    customerName: 'عميل اختبار',
    customerPhone: '٠١٠١٢٣٤٥٦٧٨',
    customerAddress: '١٢ شارع التحرير',
    customerNote: '',
    items: [{ title: 'كرة قدم', quantity: 1 }],
    status: 'confirmed',
    freeText: 'طلب اختبار',
  });
  assert.equal(saved.outcome, 'saved');
  const stored = await ChatOrder.findById(saved.chatOrder._id);
  assert.equal(stored.customerPhone, '01012345678', 'stored phone must be ASCII-normalized');
});
