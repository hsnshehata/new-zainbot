'use strict';

// tests/assistant/assistantMongo.test.js
// Real-Mongo integration tests (mongodb-memory-server, MongoDB 7.0.24):
// 1. Reminder claim is atomic under concurrent runs — no duplicate dispatch.
// 2. Failed dispatch retries then succeeds; permanent failure lands in failed.
// 3. Tenant isolation: the owner assistant only reads the requesting owner's
//    stores/bots data, never another tenant's.
// 4. Assistant conversations persist and stay scoped to their owner.
// External side effects (notification dispatch, AI completion) are stubbed.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

function stubModule(relativePath, exportsObject) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObject,
  };
  return resolved;
}

const dispatchCalls = [];
const dispatchState = { impl: async () => ({ delivered: 1, failed: 0 }) };

stubModule('../../server/services/notificationDispatcher', {
  dispatchMultiChannelNotification: async (payload) => {
    dispatchCalls.push(payload);
    return dispatchState.impl(payload);
  },
});
stubModule('../../server/logger', { info() {}, warn() {}, error() {} });

const Reminder = require('../../server/models/Reminder');
const AssistantConversation = require('../../server/models/AssistantConversation');
const Bot = require('../../server/models/Bot');
const Store = require('../../server/models/Store');
const Sale = require('../../server/models/Sale');
const Expense = require('../../server/models/Expense');
const Conversation = require('../../server/models/Conversation');
const ChatOrder = require('../../server/models/ChatOrder');
const Booking = require('../../server/models/Booking');
const Customer = require('../../server/models/Customer');
const Order = require('../../server/models/Order');
const Product = require('../../server/models/Product');
const { sendDueReminders } = require('../../server/cronJobs');
const { createAssistantService } = require('../../server/services/assistantService');

let mongod;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-test'));
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function resetDispatch() {
  dispatchCalls.length = 0;
  dispatchState.impl = async () => ({ delivered: 1, failed: 0 });
}

test('concurrent runs never dispatch the same reminder twice', { timeout: 60000 }, async () => {
  await Reminder.deleteMany({});
  resetDispatch();
  const past = new Date(Date.now() - 60 * 1000);
  const userId = new mongoose.Types.ObjectId();
  await Reminder.insertMany(
    Array.from({ length: 10 }, (_, i) => ({ user: userId, text: `reminder-${i}`, dueAt: past }))
  );

  const [a, b] = await Promise.all([
    sendDueReminders({ now: new Date(), limit: 50 }),
    sendDueReminders({ now: new Date(), limit: 50 }),
  ]);

  assert.equal(a.sent + b.sent, 10, 'every reminder sent exactly once across both runs');
  assert.equal(dispatchCalls.length, 10, 'no duplicate dispatch');
  const texts = dispatchCalls.map((c) => c.data.message).sort();
  assert.equal(new Set(texts).size, 10);

  const remaining = await Reminder.countDocuments({ status: { $in: ['pending', 'claimed'] } });
  assert.equal(remaining, 0);
  const sent = await Reminder.countDocuments({ status: 'sent' });
  assert.equal(sent, 10);
});

test('failed dispatch retries after backoff, then succeeds', { timeout: 60000 }, async () => {
  await Reminder.deleteMany({});
  resetDispatch();
  const t0 = new Date('2027-01-01T10:00:00Z');
  const reminder = await Reminder.create({
    user: new mongoose.Types.ObjectId(),
    text: 'retry-flow',
    dueAt: t0,
  });

  dispatchState.impl = async () => {
    throw new Error('channel down');
  };
  const first = await sendDueReminders({ now: t0 });
  assert.deepEqual(first, { claimed: 1, sent: 0, failed: 0 });

  let stored = await Reminder.findById(reminder._id);
  assert.equal(stored.status, 'pending');
  assert.equal(stored.attempts, 1);
  assert.ok(stored.nextAttemptAt > t0, 'retry scheduled in the future');
  assert.equal(stored.lastError, 'channel down');

  // Before the retry time: nothing happens.
  const early = await sendDueReminders({ now: new Date(t0.getTime() + 60 * 1000) });
  assert.deepEqual(early, { claimed: 0, sent: 0, failed: 0 });

  // After the retry time with a healthy channel: sent.
  resetDispatch();
  const later = new Date(t0.getTime() + 10 * 60 * 1000);
  const second = await sendDueReminders({ now: later });
  assert.deepEqual(second, { claimed: 1, sent: 1, failed: 0 });
  stored = await Reminder.findById(reminder._id);
  assert.equal(stored.status, 'sent');
  assert.equal(stored.attempts, 2);
  assert.equal(stored.lastError, null);
});

test('permanent failure after maxAttempts lands in failed', { timeout: 60000 }, async () => {
  await Reminder.deleteMany({});
  resetDispatch();
  const t0 = new Date('2027-02-01T10:00:00Z');
  const reminder = await Reminder.create({
    user: new mongoose.Types.ObjectId(),
    text: 'always-fails',
    dueAt: t0,
    maxAttempts: 2,
  });
  dispatchState.impl = async () => {
    throw new Error('permanent outage');
  };

  await sendDueReminders({ now: t0 });
  const second = await sendDueReminders({ now: new Date(t0.getTime() + 10 * 60 * 1000) });
  assert.deepEqual(second, { claimed: 1, sent: 0, failed: 1 });

  const stored = await Reminder.findById(reminder._id);
  assert.equal(stored.status, 'failed');
  assert.equal(stored.attempts, 2);

  // Failed reminders are not picked up again.
  const third = await sendDueReminders({ now: new Date(t0.getTime() + 60 * 60 * 1000) });
  assert.deepEqual(third, { claimed: 0, sent: 0, failed: 0 });
});

test('assistant answers only from the requesting owner tenant data', { timeout: 60000 }, async () => {
  const ownerA = new mongoose.Types.ObjectId();
  const ownerB = new mongoose.Types.ObjectId();

  const storeA = await Store.create({ userId: ownerA, storeName: 'Store Alpha', storeLink: 'store-alpha', templateId: 1 });
  const storeB = await Store.create({ userId: ownerB, storeName: 'Store Bravo', storeLink: 'store-bravo', templateId: 1 });
  await Bot.create({ userId: ownerA, name: 'Bot A' });
  await Bot.create({ userId: ownerB, name: 'Bot B' });
  await Sale.create({ storeId: storeA._id, total: 500, createdAt: new Date() });
  await Sale.create({ storeId: storeB._id, total: 99999, createdAt: new Date() });
  await Expense.create({ storeId: storeB._id, amount: 7777, description: 'B expense', date: new Date() });

  const service = createAssistantService({
    models: { Store, Bot, Sale, Expense, Conversation, ChatOrder, Booking, Customer, Order, Product },
    hasAiKey: async () => false,
  });

  const answerA = await service.answer({ userId: ownerA, question: 'كام مبيعات النهارده؟' });
  assert.equal(answerA.fallback, true);
  assert.ok(answerA.answer.includes('500'), 'owner A sees own sales total');
  assert.ok(!answerA.answer.includes('99999'), 'owner A never sees owner B sales');
  assert.ok(!answerA.answer.includes('7777'), 'owner A never sees owner B expenses');
  assert.ok(!JSON.stringify(answerA).includes('Store Bravo'), 'no cross-tenant names leak');

  const answerB = await service.answer({ userId: ownerB, question: 'كام مبيعات النهارده؟' });
  assert.ok(answerB.answer.includes('99999'), 'owner B sees own total');
});

test('assistant conversations persist per owner and reload intact', { timeout: 60000 }, async () => {
  const ownerA = new mongoose.Types.ObjectId();
  const ownerB = new mongoose.Types.ObjectId();
  const conv = await AssistantConversation.create({
    user: ownerA,
    title: 'متابعة المخزون',
    messages: [
      { role: 'user', content: 'كام المبيعات؟' },
      { role: 'assistant', content: '٥٠٠ جنيه النهارده.' },
    ],
  });

  // Fresh read through a new query simulates a later request/process.
  const reloaded = await AssistantConversation.findOne({ _id: conv._id, user: ownerA }).lean();
  assert.ok(reloaded, 'conversation persisted');
  assert.equal(reloaded.messages.length, 2);
  assert.equal(reloaded.title, 'متابعة المخزون');

  const cross = await AssistantConversation.findOne({ _id: conv._id, user: ownerB }).lean();
  assert.equal(cross, null, 'another owner cannot read it by id');
});
