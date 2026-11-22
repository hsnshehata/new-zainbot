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


test('all assistant data tools isolate real-Mongo fixtures and preserve useful names', { timeout: 60000 }, async () => {
  const { createAssistantDataTools } = require('../../server/services/assistantDataTools');
  const models = { Store, Bot, Sale, Expense, Conversation, ChatOrder, Booking, Customer, Order, Product };
  const tools = createAssistantDataTools({ models });
  const now = new Date();
  const tenants = [];
  for (const [marker, amount] of [['SYNTH_ALPHA', 111], ['SYNTH_BRAVO', 9999]]) {
    const userId = new mongoose.Types.ObjectId();
    const store = await Store.create({ userId, storeName: marker, storeLink: marker.toLowerCase(), templateId: 1 });
    const bot = await Bot.create({ userId, name: marker, isActive: true });
    await Sale.create({ storeId: store._id, total: amount, items: [{ name: marker, qty: 2, total: amount }], createdAt: now });
    await Expense.create({ storeId: store._id, amount: amount - 100, reason: marker, payee: marker, createdAt: now });
    await Conversation.create({ botId: bot._id, userId: marker, channel: 'web', messages: [{ role: 'user', content: marker, timestamp: now }, { role: 'assistant', content: marker, timestamp: now }] });
    await Conversation.create({ botId: bot._id, userId: marker + '_old', channel: 'web', messages: [{ role: 'user', content: marker, timestamp: new Date(now.getTime() - 8 * 86400000) }] });
    await ChatOrder.create({ botId: bot._id, sourceUserId: marker, channel: 'web', status: 'pending', totalAmount: amount });
    // Only the real fields queried by the aggregate are required in these
    // synthetic order fixtures. No order hooks or fulfillment are run.
    await Order.collection.insertOne({ storeId: store._id, status: 'pending' });
    await Product.create({ storeId: store._id, productName: marker, price: amount, stock: 1, lowStockThreshold: 5, stockTracked: true });
    await Customer.create({ storeId: store._id, name: marker, phone: marker, totalSpent: amount, totalOrders: 1 });
    await Booking.create({ botId: bot._id, customerName: marker, serviceType: marker, bookingDate: new Date(now.getTime() + 3600000), status: 'confirmed' });
    tenants.push({ userId, marker, amount, store, bot });
  }
  for (const tenant of tenants) {
    const other = tenants.find(x => x !== tenant);
    const ctx = { now, storeIds: [tenant.store._id], botIds: [tenant.bot._id] };
    const results = await tools.runTools(tools.tools, ctx);
    for (const [id, result] of Object.entries(results)) {
      assert.notEqual(result.error, 'unavailable', id);
      assert.ok(!JSON.stringify(result).includes(other.marker), id + ' must exclude foreign names');
    }
    assert.equal(results.business_snapshot.stores, 1);
    assert.equal(results.business_snapshot.bots.total, 1);
    assert.equal(results.business_snapshot.salesToday.total, tenant.amount);
    assert.equal(results.business_snapshot.expensesToday.total, tenant.amount - 100);
    assert.equal(results.business_snapshot.pendingOrders, 1);
    assert.equal(results.business_snapshot.upcomingBookingsNext7Days, 1);
    assert.equal(results.sales_summary.today.total, tenant.amount);
    assert.equal(results.sales_summary.recent[0].items[0], tenant.marker + ' x2');
    assert.equal(results.expenses_summary.recent[0].reason, tenant.marker);
    assert.deepEqual(results.orders_status.chatOrders, { pending: 1 });
    assert.deepEqual(results.orders_status.storeOrders, { pending: 1 });
    assert.equal(results.orders_status.openOrdersValue, tenant.amount);
    assert.equal(results.top_products.top[0].name, tenant.marker);
    assert.equal(results.top_products.lowStock[0].name, tenant.marker);
    assert.equal(results.customers_summary.total, 1);
    assert.equal(results.customers_summary.top[0].name, tenant.marker);
    assert.equal(results.upcoming_bookings.upcoming[0].customer, tenant.marker);
    assert.deepEqual(results.inbox_stats.channels, { web: 2 });
    assert.equal(results.inbox_stats.today, 1);
    assert.equal(results.inbox_stats.last7Days, 1);
    assert.equal(results.business_snapshot.conversationsToday, 1);
    assert.equal(results.bots_status.bots[0].name, tenant.marker);
    // Exercise real service scope construction too. The completion is a
    // local stub, so inspect every prompt without an AI call or cost.
    const seen = new Set();
    const service = createAssistantService({ models, hasAiKey: async () => true,
      complete: async ({ messages, userId }) => {
        assert.equal(String(userId), String(tenant.userId));
        const payload = JSON.parse(messages.at(-1).content.split('\n')[1]);
        for (const id of Object.keys(payload)) seen.add(id);
        assert.ok(!JSON.stringify(payload).includes(other.marker));
        assert.ok(!JSON.stringify(payload).includes(String(other.amount)));
        return { choices: [{ message: { content: 'Synthetic completion' } }] };
      },
    });
    for (const question of ['sales', 'expenses', 'orders', 'products', 'customers', 'bookings', 'inbox', 'bots']) {
      const answer = await service.answer({ userId: tenant.userId, question });
      assert.equal(answer.fallback, false);
    }
    assert.deepEqual([...seen].sort(), tools.tools.map(x => x.id).sort());

  }
});
