'use strict';

// tests/assistant/assistantDataTools.test.js
// Registry behavior + per-tool aggregation, with fully fake models (no DB).

const test = require('node:test');
const assert = require('node:assert/strict');

const { createAssistantDataTools } = require('../../server/services/assistantDataTools');

const STORE_A = '507f191e810c19729de86011';
const STORE_B = '507f191e810c19729de86012';
const BOT_A = '507f191e810c19729de86021';

function fakeModels(overrides = {}) {
  return {
    Sale: {
      aggregate: async () => [{ _id: null, total: 250, count: 3 }],
      find: () => ({
        sort: () => ({
          limit: () => ({
            select: () => ({
              lean: async () => [
                { total: 100, createdAt: new Date('2026-11-21T10:00:00Z'), items: [{ name: 'Shirt', qty: 2 }] },
              ],
            }),
          }),
        }),
      }),
      ...overrides.Sale,
    },
    Expense: {
      aggregate: async () => [{ _id: null, total: 80, count: 2 }],
      find: () => ({
        sort: () => ({
          limit: () => ({
            select: () => ({
              lean: async () => [{ amount: 50, reason: 'Rent', payee: 'Landlord', createdAt: new Date() }],
            }),
          }),
        }),
      }),
      ...overrides.Expense,
    },
    Order: { aggregate: async () => [{ _id: 'pending', count: 2 }], ...overrides.Order },
    ChatOrder: {
      aggregate: async () => [{ _id: 'pending', count: 1 }],
      countDocuments: async () => 1,
      ...overrides.ChatOrder,
    },
    Booking: {
      countDocuments: async () => 2,
      find: () => ({
        sort: () => ({
          limit: () => ({
            select: () => ({
              lean: async () => [
                { customerName: 'Mona', serviceType: 'Consult', bookingDate: new Date('2026-11-23T10:00:00Z'), status: 'confirmed' },
              ],
            }),
          }),
        }),
      }),
      ...overrides.Booking,
    },
    Product: {
      find: () => ({
        select: () => ({
          lean: async () => [
            { name: 'Mug', stock: 2, lowStockThreshold: 5 },
            { name: 'Table', stock: 20, lowStockThreshold: 5 },
          ],
        }),
      }),
      ...overrides.Product,
    },
    Customer: {
      countDocuments: async () => 9,
      find: () => ({
        sort: () => ({
          limit: () => ({
            select: () => ({
              lean: async () => [{ name: 'Adel', totalSpent: 900, totalOrders: 4, currency: 'EGP' }],
            }),
          }),
        }),
      }),
      ...overrides.Customer,
    },
    Conversation: {
      countDocuments: async () => 7,
      aggregate: async () => [{ _id: 'whatsapp', count: 5 }],
      ...overrides.Conversation,
    },
    Bot: {
      find: () => ({
        select: () => ({
          lean: async () => [{ name: 'main', isActive: true }],
        }),
      }),
      ...overrides.Bot,
    },
    Store: { countDocuments: async () => 2, ...overrides.Store },
  };
}

const ctx = {
  now: new Date('2026-11-21T15:00:00Z'),
  storeIds: [STORE_A, STORE_B],
  botIds: [BOT_A],
};

test('selectTools always includes the snapshot and matches Arabic keywords', () => {
  const tools = createAssistantDataTools({ models: fakeModels() });
  const selected = tools.selectTools('كام مبيعات النهارده؟').map((tool) => tool.id);
  assert.ok(selected.includes('business_snapshot'));
  assert.ok(selected.includes('sales_summary'));
});

test('selectTools matches English keywords and caps extra tools at 3', () => {
  const tools = createAssistantDataTools({ models: fakeModels() });
  const selected = tools.selectTools('sales orders products customers expenses bookings').map((tool) => tool.id);
  assert.equal(selected.length, 4);
  assert.equal(selected[0], 'business_snapshot');
});

test('selectTools on unrelated question returns only the snapshot', () => {
  const tools = createAssistantDataTools({ models: fakeModels() });
  const selected = tools.selectTools('عامل ايه النهارده').map((tool) => tool.id);
  assert.deepEqual(selected, ['business_snapshot']);
});

test('business_snapshot scopes aggregations to the owner stores and bots', async () => {
  const models = fakeModels();
  const matches = [];
  models.Sale.aggregate = async (pipeline) => {
    matches.push(pipeline[0].$match);
    return [{ _id: null, total: 100, count: 1 }];
  };
  const tools = createAssistantDataTools({ models });
  const snapshot = await tools.byId.get('business_snapshot').run(ctx);
  assert.equal(matches[0].storeId.$in.length, 2);
  assert.ok(matches[0].createdAt.$gte instanceof Date);
  assert.equal(snapshot.salesToday.total, 100);
  assert.equal(snapshot.profitToday, 20); // 100 sales - 80 expenses
  assert.equal(snapshot.bots.active, 1);
  assert.equal(snapshot.stores, 2);
});

test('sales_summary returns today/week/month totals and recent sales', async () => {
  const tools = createAssistantDataTools({ models: fakeModels() });
  const data = await tools.byId.get('sales_summary').run(ctx);
  assert.equal(data.today.total, 250);
  assert.equal(data.thisMonth.count, 3);
  assert.equal(data.recent[0].items[0], 'Shirt x2');
});

test('top_products filters low stock against thresholds', async () => {
  const tools = createAssistantDataTools({ models: fakeModels() });
  const data = await tools.byId.get('top_products').run(ctx);
  assert.equal(data.lowStock.length, 1);
  assert.equal(data.lowStock[0].name, 'Mug');
});

test('tools degrade to empty payload when the owner has no stores or bots', async () => {
  const tools = createAssistantDataTools({ models: fakeModels() });
  const empty = { now: new Date(), storeIds: [], botIds: [] };
  const sales = await tools.byId.get('sales_summary').run(empty);
  assert.equal(sales.empty, true);
  const inbox = await tools.byId.get('inbox_stats').run(empty);
  assert.equal(inbox.empty, true);
});

test('runTools isolates a failing tool instead of failing the whole answer', async () => {
  const models = fakeModels();
  models.Sale.aggregate = async () => { throw new Error('db down'); };
  const tools = createAssistantDataTools({ models });
  const selected = tools.selectTools('مبيعات');
  const results = await tools.runTools(selected, ctx);
  assert.equal(results.sales_summary.error, 'unavailable');
  const rendered = tools.renderFallback(selected, results, 'ar');
  assert.ok(!rendered.includes('db down'));
});

test('renderFallback produces bilingual output', async () => {
  const tools = createAssistantDataTools({ models: fakeModels() });
  const selected = tools.selectTools('sales');
  const results = await tools.runTools(selected, ctx);
  const ar = tools.renderFallback(selected, results, 'ar');
  const en = tools.renderFallback(selected, results, 'en');
  assert.ok(ar.includes('المبيعات'));
  assert.ok(en.includes('Sales'));
});
