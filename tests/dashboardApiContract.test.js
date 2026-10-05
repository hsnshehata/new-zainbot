'use strict';

// A05 — API boundary contracts for dashboard-consumed endpoints
// (users/profile, bots, messages, chat-page link, catalog connectors).
// Read-only boundary assertions: no server behavior is changed by this file.
// Uses the exported Express app only (never startServer(), which has
// WhatsApp/job side effects). Mongoose models are stubbed deterministically
// per test and every stub is restored in afterEach — no database, no network,
// no providers, no read that can trigger a provider send.

const test = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');

const app = require('../server/server');
const User = require('../server/models/User');
const Bot = require('../server/models/Bot');
const ChatPage = require('../server/models/ChatPage');
const { signAccessToken } = require('../server/utils/authTokens');

const TEST_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';
const OWNER_ID = '507f191e810c19729de86001';
const OTHER_BOT_ID = '507f191e810c19729de86002';

function fakeUserDoc() {
  return {
    _id: OWNER_ID,
    username: 'contract_owner',
    email: 'owner@example.com',
    whatsapp: '',
    role: 'user',
    status: 'active',
    sessionVersion: 0,
    password: 'must-never-leak',
    googleId: 'must-never-leak',
    telegramLinkCode: 'must-never-leak',
    bots: [],
  };
}

// authenticate() calls `User.findById(id).select(...).lean()` while the
// users routes `await User.findById(id)` directly, so the stub must support
// both the select/lean chain and direct await (via then).
function stubAuthenticatedUser(doc) {
  const chain = {
    select() {
      return { lean: async () => doc };
    },
  };
  chain.then = (resolve) => Promise.resolve(doc).then(resolve);
  User.findById = () => chain;
}

function ownerToken() {
  return signAccessToken({
    _id: OWNER_ID,
    username: 'contract_owner',
    role: 'user',
    sessionVersion: 0,
  });
}

const originals = {
  userFindById: User.findById,
  botFindOne: Bot.findOne,
  chatPageFindOne: ChatPage.findOne,
};

test.beforeEach(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.NODE_ENV = 'test';
});

test.afterEach(() => {
  User.findById = originals.userFindById;
  Bot.findOne = originals.botFindOne;
  ChatPage.findOne = originals.chatPageFindOne;
});

test('profile without a token is 401 with a stable error code', async () => {
  const res = await supertest(app).get('/api/users/profile');

  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'AUTH_REQUIRED');
});

test('profile with a malformed token is 401 INVALID_SESSION', async () => {
  const res = await supertest(app)
    .get('/api/users/profile')
    .set('Authorization', 'Bearer not-a-real-token');

  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'INVALID_SESSION');
});

test('profile returns the envelope shape and never leaks credentials', async () => {
  stubAuthenticatedUser(fakeUserDoc());

  const res = await supertest(app)
    .get('/api/users/profile')
    .set('Authorization', `Bearer ${ownerToken()}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data, 'profile must use the { success, data } envelope');
  assert.equal(res.body.data.username, 'contract_owner');
  assert.equal(res.body.data.role, 'user');
  for (const secret of ['password', 'sessionVersion', 'googleId', 'telegramLinkCode']) {
    assert.equal(
      res.body.data[secret],
      undefined,
      `profile must never expose ${secret}`
    );
  }
});

test('bot detail with a malformed id is 404 BOT_NOT_FOUND, never 500', async () => {
  stubAuthenticatedUser(fakeUserDoc());

  const res = await supertest(app)
    .get('/api/bots/not-an-object-id')
    .set('Authorization', `Bearer ${ownerToken()}`);

  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'BOT_NOT_FOUND');
});

test("another user's bot is indistinguishable from a missing bot (404, no data)", async () => {
  stubAuthenticatedUser(fakeUserDoc());
  Bot.findOne = async () => null;

  const res = await supertest(app)
    .get(`/api/bots/${OTHER_BOT_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`);

  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'BOT_NOT_FOUND');
  assert.equal(res.body.data, undefined);
});

test('messages conversations without botId is 400 BOT_ID_REQUIRED, not an unfiltered read', async () => {
  stubAuthenticatedUser(fakeUserDoc());

  const res = await supertest(app)
    .get('/api/messages/conversations')
    .set('Authorization', `Bearer ${ownerToken()}`);

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'BOT_ID_REQUIRED');
});

test('public chat link lookup rejects a malformed bot id with 400 before any lookup', async () => {
  const res = await supertest(app).get('/api/chat-page/public/bot/not-an-id');

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('public chat link lookup for an unknown bot is 404 with linkId only on success', async () => {
  ChatPage.findOne = () => ({ select: () => ({ lean: async () => null }) });

  const res = await supertest(app).get(
    `/api/chat-page/public/bot/${OTHER_BOT_ID}`
  );

  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.linkId, undefined);
});

test('catalog connector status without a token is 401 JSON', async () => {
  const res = await supertest(app).get(
    `/api/catalog-connectors/bots/${OTHER_BOT_ID}/shopify`
  );

  assert.equal(res.status, 401);
  assert.match(res.headers['content-type'] || '', /application\/json/);
});

test('catalog connector status with a malformed bot id is 404, never a provider call', async () => {
  stubAuthenticatedUser(fakeUserDoc());

  const res = await supertest(app)
    .get('/api/catalog-connectors/bots/not-an-id/shopify')
    .set('Authorization', `Bearer ${ownerToken()}`);

  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'BOT_NOT_FOUND');
});

test('catalog connector status rejects an unknown provider with 404', async () => {
  stubAuthenticatedUser(fakeUserDoc());

  const res = await supertest(app)
    .get(`/api/catalog-connectors/bots/${OTHER_BOT_ID}/unknown-provider`)
    .set('Authorization', `Bearer ${ownerToken()}`);

  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'CONNECTOR_NOT_FOUND');
});

test('catalog connector status for an owned bot without a store reports unconfigured, no secrets', async () => {
  stubAuthenticatedUser(fakeUserDoc());
  Bot.findOne = async () => ({ _id: OTHER_BOT_ID, storeId: null });

  const res = await supertest(app)
    .get(`/api/catalog-connectors/bots/${OTHER_BOT_ID}/shopify`)
    .set('Authorization', `Bearer ${ownerToken()}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.configured, false);
  assert.equal(res.body.state, 'idle');
  for (const secret of ['token', 'consumerKey', 'consumerSecret']) {
    assert.equal(
      res.body[secret],
      undefined,
      `connector status must never embed ${secret}`
    );
  }
});
