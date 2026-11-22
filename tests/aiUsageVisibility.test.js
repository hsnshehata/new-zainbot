'use strict';

// tests/aiUsageVisibility.test.js
// Boundary contracts for the tenant AI-usage summary and the admin-only
// chat-page ownership-issues surface:
// - tenants see only their own recorded usage; a foreign userId is 403
// - direct superadmin may inspect another tenant's usage
// - the summary never reports dollar pricing (rates are not tracked)
// - ownership-issues is 403 for non-superadmins and reports mismatched +
//   orphan chat pages from stored data only
// Uses the exported Express app with deterministic model stubs; no database,
// no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');

const app = require('../server/server');
const User = require('../server/models/User');
const ChatPage = require('../server/models/ChatPage');
const Bot = require('../server/models/Bot');
const AiUsageEvent = require('../server/models/AiUsageEvent');
const { signAccessToken } = require('../server/utils/authTokens');

const TEST_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';
const OWNER_ID = '507f191e810c19729de86001';
const ADMIN_ID = '507f191e810c19729de8600a';
const OTHER_USER_ID = '507f191e810c19729de8600b';

function chainOf(doc) {
  const chain = { select: () => ({ lean: async () => doc }) };
  chain.then = (resolve) => Promise.resolve(doc).then(resolve);
  return chain;
}

function listChainOf(docs) {
  return { select: () => ({ lean: async () => docs }) };
}

function stubAuthenticatedUser(doc) {
  User.findById = () => chainOf(doc);
}

function ownerToken() {
  return signAccessToken({ _id: OWNER_ID, username: 'owner', role: 'user', sessionVersion: 0 });
}

function adminToken() {
  return signAccessToken({ _id: ADMIN_ID, username: 'root', role: 'superadmin', sessionVersion: 0 });
}

const originals = {
  userFindById: User.findById,
  chatPageFind: ChatPage.find,
  botFind: Bot.find,
  usageAggregate: AiUsageEvent.aggregate,
};

test.beforeEach(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.NODE_ENV = 'test';
});

test.afterEach(() => {
  User.findById = originals.userFindById;
  ChatPage.find = originals.chatPageFind;
  Bot.find = originals.botFind;
  AiUsageEvent.aggregate = originals.usageAggregate;
});

function stubUsageAggregate() {
  const calls = [];
  AiUsageEvent.aggregate = async (pipeline) => {
    calls.push(pipeline);
    const isTotals = pipeline[1].$group._id === null;
    if (isTotals) {
      return [{ requests: 4, successes: 3, failures: 1, inputTokens: 100, outputTokens: 40, totalTokens: 140 }];
    }
    return [
      { _id: { provider: 'openai', modelId: 'gpt-4o-mini' }, requests: 4, failures: 1, inputTokens: 100, outputTokens: 40, totalTokens: 140 },
    ];
  };
  return calls;
}

test('usage summary without a token is 401', async () => {
  const res = await supertest(app).get('/api/ai-usage/summary');
  assert.equal(res.status, 401);
});

test('tenant sees their own aggregated usage with an explicit unknown-pricing caveat', async () => {
  stubAuthenticatedUser({ _id: OWNER_ID, role: 'user', status: 'active', sessionVersion: 0 });
  const calls = stubUsageAggregate();

  const res = await supertest(app)
    .get('/api/ai-usage/summary?days=30')
    .set('Authorization', `Bearer ${ownerToken()}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.totals.requests, 4);
  assert.equal(res.body.totals.totalTokens, 140);
  assert.equal(res.body.byModel[0].provider, 'openai');
  assert.equal(res.body.caveats.pricingKnown, false);
  assert.ok(res.body.caveats.message, 'unknown-rate caveat must be present');
  // No dollar amounts anywhere in the payload.
  assert.ok(!JSON.stringify(res.body).includes('$'), 'payload must contain no dollar amounts');
  // The aggregation must be scoped to the caller, never to someone else.
  assert.equal(String(calls[0][0].$match.userId), OWNER_ID);
});

test('a tenant asking for another userId is 403', async () => {
  stubAuthenticatedUser({ _id: OWNER_ID, role: 'user', status: 'active', sessionVersion: 0 });
  stubUsageAggregate();

  const res = await supertest(app)
    .get(`/api/ai-usage/summary?userId=${OTHER_USER_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`);

  assert.equal(res.status, 403);
});

test('direct superadmin may inspect another tenant usage', async () => {
  stubAuthenticatedUser({ _id: ADMIN_ID, role: 'superadmin', status: 'active', sessionVersion: 0 });
  const calls = stubUsageAggregate();

  const res = await supertest(app)
    .get(`/api/ai-usage/summary?userId=${OTHER_USER_ID}`)
    .set('Authorization', `Bearer ${adminToken()}`);

  assert.equal(res.status, 200);
  assert.equal(String(calls[0][0].$match.userId), OTHER_USER_ID);
});

test('ownership-issues is 403 for a regular tenant', async () => {
  stubAuthenticatedUser({ _id: OWNER_ID, role: 'user', status: 'active', sessionVersion: 0 });

  const res = await supertest(app)
    .get('/api/chat-page/admin/ownership-issues')
    .set('Authorization', `Bearer ${ownerToken()}`);

  assert.equal(res.status, 403);
});

test('ownership-issues for direct superadmin lists mismatched and orphan pages', async () => {
  stubAuthenticatedUser({ _id: ADMIN_ID, role: 'superadmin', status: 'active', sessionVersion: 0 });
  ChatPage.find = () => listChainOf([
    { _id: 'p1', userId: OTHER_USER_ID, botId: 'b1', linkId: 'link-one', title: 'A', createdAt: '2026-01-01T00:00:00Z' },
    { _id: 'p2', userId: OWNER_ID, botId: 'b2', linkId: 'link-two', title: 'B', createdAt: '2026-01-01T00:00:00Z' },
    { _id: 'p3', userId: OWNER_ID, botId: 'b-gone', linkId: 'link-three', title: 'C', createdAt: '2026-01-01T00:00:00Z' },
  ]);
  Bot.find = () => listChainOf([
    { _id: 'b1', userId: OWNER_ID, name: 'Bot One', archivedAt: null },
    { _id: 'b2', userId: OWNER_ID, name: 'Bot Two', archivedAt: null },
  ]);

  const res = await supertest(app)
    .get('/api/chat-page/admin/ownership-issues')
    .set('Authorization', `Bearer ${adminToken()}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.counts.mismatched, 1);
  assert.equal(res.body.counts.orphans, 1);
  assert.equal(res.body.mismatched[0].linkId, 'link-one');
  assert.equal(String(res.body.mismatched[0].pageUserId), OTHER_USER_ID);
  assert.equal(String(res.body.mismatched[0].botUserId), OWNER_ID);
  assert.equal(res.body.orphans[0].linkId, 'link-three');
  // 'admin' must not be swallowed by the public /:linkId route.
  assert.notEqual(res.status, 404);
});
