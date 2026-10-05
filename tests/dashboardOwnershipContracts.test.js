'use strict';

// D06b (A05 follow-up) — TEST-ONLY ownership/impersonation contracts for
// dashboard-consumed routes. READ-ONLY with respect to product code: this
// file changes no server behavior. Supertest against the exported app only
// (never startServer()); every model/provider is stubbed per test and
// restored in afterEach — no database, no provider sends.
//
// Where a test PROVES a server bug it asserts the CURRENT behavior and is
// marked [PROVEN-BUG → FPn]; the fix proposal lives in docs/qa/reports/D06b.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';
process.env.NODE_ENV = 'test';

// Stub outbound providers BEFORE the app loads (routes capture them at require).
const axiosPosts = [];
const waSends = [];
function stubModule(resolvedPath, exportsObject) {
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports: exportsObject,
  };
}
stubModule(require.resolve('axios'), {
  post: async (...args) => {
    axiosPosts.push(args);
    const err = new Error('SENTINEL_AXIOS_MUST_NOT_SEND');
    throw err;
  },
});
stubModule(require.resolve('../server/services/whatsappSessionManager'), {
  getWhatsAppSessionManager: () => ({
    sendMessage: async (...args) => {
      waSends.push(args);
      return { ok: true };
    },
    sendDirectText: async (...args) => {
      waSends.push(args);
      return { ok: true };
    },
  }),
});

const supertest = require('supertest');
const app = require('../server/server');
const { signAccessToken, JWT_ISSUER, JWT_AUDIENCE, JWT_ALGORITHM } = require('../server/utils/authTokens');
const { signImpersonationToken } = require('../server/services/impersonationTokenService');
const { getJwtSecret } = require('../server/config/env');

const User = require('../server/models/User');
const Bot = require('../server/models/Bot');
const Rule = require('../server/models/Rule');
const Conversation = require('../server/models/Conversation');
const ChatPage = require('../server/models/ChatPage');
const CatalogConnector = require('../server/models/CatalogConnector');
const AdminImpersonationSession = require('../server/models/AdminImpersonationSession');

const OWNER_ID = '507f191e810c19729de86001';
const OTHER_ID = '507f191e810c19729de86002';
const ADMIN_ID = '507f191e810c19729de86003';
const OWN_BOT_ID = '507f191e810c19729de86101';
const OTHER_BOT_ID = '507f191e810c19729de86102';
const RULE_ID = '507f191e810c19729de86201';
const CONV_ID = '507f191e810c19729de86301';
const PAGE_ID = '507f191e810c19729de86401';
const SESSION_ID = '507f191e810c19729de86501';

function chain(doc) {
  const c = { select: () => c, lean: async () => doc };
  c.then = (resolve, reject) => Promise.resolve(doc).then(resolve, reject);
  return c;
}

function castError(value) {
  const err = new Error(`Cast to ObjectId failed for value "${value}" (type string) at path "_id"`);
  err.name = 'CastError';
  return err;
}

function ownerDoc(overrides = {}) {
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
    bots: [],
    save: async function save() {
      this.__saved = (this.__saved || 0) + 1;
      return this;
    },
    ...overrides,
  };
}

function adminDoc() {
  return {
    _id: ADMIN_ID,
    username: 'contract_admin',
    email: 'admin@example.com',
    role: 'superadmin',
    status: 'active',
    sessionVersion: 0,
  };
}

// Per-test mutable fixtures.
let userById = {};
let sessionDoc = null;
let botFindOneImpl = async () => null;
let botFindByIdImpl = async () => null;
let botExistsImpl = async () => null;
let ruleDoc = null;
let convDoc = null;
let chatFindOneImpl = async () => null;
let chatFindByIdImpl = async () => null;
let connectorFauImpl = () => ({ select: async () => null });
let connectorExistsImpl = async () => false;

const originals = {
  userFindById: User.findById,
  botFindOne: Bot.findOne,
  botFindById: Bot.findById,
  botExists: Bot.exists,
  ruleFindById: Rule.findById,
  convFindById: Conversation.findById,
  chatFindOne: ChatPage.findOne,
  chatFindById: ChatPage.findById,
  chatSave: ChatPage.prototype.save,
  connectorFau: CatalogConnector.findOneAndUpdate,
  connectorExists: CatalogConnector.exists,
  sessionFindById: AdminImpersonationSession.findById,
};

function installStubs() {
  User.findById = (id) => {
    if (!mongoose.isValidObjectId(String(id))) throw castError(id);
    const key = String(id);
    if (!(key in userById)) return chain(null);
    return chain(userById[key]);
  };
  AdminImpersonationSession.findById = () => chain(sessionDoc);
  Bot.findOne = (...args) => botFindOneImpl(...args);
  Bot.findById = (...args) => botFindByIdImpl(...args);
  Bot.exists = (...args) => botExistsImpl(...args);
  Rule.findById = async (id) => {
    if (!mongoose.isValidObjectId(String(id))) throw castError(id);
    return ruleDoc;
  };
  Conversation.findById = async (id) => {
    if (!mongoose.isValidObjectId(String(id))) throw castError(id);
    return convDoc;
  };
  ChatPage.findOne = (...args) => chatFindOneImpl(...args);
  ChatPage.findById = (...args) => chatFindByIdImpl(...args);
  CatalogConnector.findOneAndUpdate = (...args) => connectorFauImpl(...args);
  CatalogConnector.exists = (...args) => connectorExistsImpl(...args);
}

test.beforeEach(() => {
  process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';
  process.env.NODE_ENV = 'test';
  axiosPosts.length = 0;
  waSends.length = 0;
  userById = { [OWNER_ID]: ownerDoc(), [ADMIN_ID]: adminDoc() };
  sessionDoc = null;
  botFindOneImpl = async () => null;
  botFindByIdImpl = async () => null;
  botExistsImpl = async () => null;
  ruleDoc = null;
  convDoc = null;
  chatFindOneImpl = async () => null;
  chatFindByIdImpl = async () => null;
  connectorFauImpl = () => ({ select: async () => null });
  connectorExistsImpl = async () => false;
  installStubs();
});

test.afterEach(() => {
  User.findById = originals.userFindById;
  Bot.findOne = originals.botFindOne;
  Bot.findById = originals.botFindById;
  Bot.exists = originals.botExists;
  Rule.findById = originals.ruleFindById;
  Conversation.findById = originals.convFindById;
  ChatPage.findOne = originals.chatFindOne;
  ChatPage.findById = originals.chatFindById;
  ChatPage.prototype.save = originals.chatSave;
  CatalogConnector.findOneAndUpdate = originals.connectorFau;
  CatalogConnector.exists = originals.connectorExists;
  AdminImpersonationSession.findById = originals.sessionFindById;
});

function ownerToken() {
  return signAccessToken({ _id: OWNER_ID, username: 'contract_owner', role: 'user', sessionVersion: 0 });
}

function expiredOwnerToken() {
  return jwt.sign(
    {
      userId: OWNER_ID,
      role: 'user',
      username: 'contract_owner',
      sessionVersion: 0,
      tokenType: 'access',
      exp: Math.floor(Date.now() / 1000) - 10,
    },
    getJwtSecret(),
    { algorithm: JWT_ALGORITHM, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, subject: OWNER_ID }
  );
}

function impersonationToken() {
  sessionDoc = {
    _id: SESSION_ID,
    actorUserId: ADMIN_ID,
    subjectUserId: OWNER_ID,
    status: 'active',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    actorSessionVersion: 0,
    subjectSessionVersion: 0,
    scopes: [],
  };
  return signImpersonationToken({
    actor: { _id: ADMIN_ID, role: 'superadmin', sessionVersion: 0 },
    subject: { _id: OWNER_ID, role: 'user', username: 'contract_owner', sessionVersion: 0 },
    session: { _id: SESSION_ID, expiresAt: sessionDoc.expiresAt, scopes: [] },
  });
}

// ---------- token boundary ----------

test('PUT without a token is 401 AUTH_REQUIRED (no body parsing side effects)', async () => {
  const res = await supertest(app).put(`/api/users/${OWNER_ID}`).send({ whatsapp: '0100' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'AUTH_REQUIRED');
});

test('expired access token is 401 INVALID_SESSION', async () => {
  const res = await supertest(app)
    .get('/api/users/profile')
    .set('Authorization', `Bearer ${expiredOwnerToken()}`);
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'INVALID_SESSION');
});

test('deleted user resolves to 401 SESSION_USER_NOT_FOUND', async () => {
  userById[OWNER_ID] = null;
  const res = await supertest(app)
    .get('/api/users/profile')
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'SESSION_USER_NOT_FOUND');
});

test('suspended user is 403 ACCOUNT_SUSPENDED, never served data', async () => {
  userById[OWNER_ID] = ownerDoc({ status: 'suspended' });
  const res = await supertest(app)
    .get('/api/users/profile')
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'ACCOUNT_SUSPENDED');
  assert.equal(res.body.data, undefined);
});

// ---------- users PUT + reads ----------

test('PUT self succeeds and serializes without credentials', async () => {
  const res = await supertest(app)
    .put(`/api/users/${OWNER_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ whatsapp: '01001234567' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.whatsapp, '01001234567');
  for (const secret of ['password', 'sessionVersion', 'googleId', 'telegramLinkCode']) {
    assert.equal(res.body.data[secret], undefined, `PUT self must never expose ${secret}`);
  }
  assert.equal(userById[OWNER_ID].__saved, 1);
});

test('PUT another user is 403 with zero writes', async () => {
  const res = await supertest(app)
    .put(`/api/users/${OTHER_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ whatsapp: '01001234567' });
  assert.equal(res.status, 403);
  assert.equal(userById[OWNER_ID].__saved, undefined);
});

test('PUT with a malformed user id fails closed with 403 (gate precedes lookup)', async () => {
  // The cross-user gate runs before User.findById, so a malformed id never
  // reaches the database layer — fail-closed, no 500, no leak.
  const res = await supertest(app)
    .put('/api/users/not-an-id')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ whatsapp: '01001234567' });
  assert.equal(res.status, 403);
  assert.equal(userById[OWNER_ID].__saved, undefined);
});

test('GET /me returns safe fields only', async () => {
  const res = await supertest(app)
    .get('/api/users/me')
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['email', 'role', 'username', 'whatsapp']);
});

test('regular user cannot read admin user detail (403, no data)', async () => {
  const res = await supertest(app)
    .get(`/api/users/${OTHER_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 403);
  assert.equal(res.body.data, undefined);
});

// ---------- bots PUT ----------

function ownBotDoc() {
  return {
    _id: OWN_BOT_ID,
    userId: OWNER_ID,
    name: 'Old Name',
    facebookApiKey: 'SECRET_FB',
    userApiKey: 'SECRET_AI',
    save: async function save() {
      this.__saved = (this.__saved || 0) + 1;
      return this;
    },
  };
}

test('PUT own bot succeeds and strips secrets from the response', async () => {
  const bot = ownBotDoc();
  botFindOneImpl = async () => bot;
  const res = await supertest(app)
    .put(`/api/bots/${OWN_BOT_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ name: 'Renamed Bot' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.name, 'Renamed Bot');
  for (const secret of ['facebookApiKey', 'userApiKey', 'backupApiKey', 'whatsappApiKey']) {
    assert.equal(res.body.data[secret], undefined, `bot PUT must never expose ${secret}`);
  }
  assert.equal(bot.__saved, 1);
});

test("PUT another user's bot is 404 BOT_NOT_FOUND with zero writes", async () => {
  const bot = ownBotDoc();
  botFindOneImpl = async () => null;
  const res = await supertest(app)
    .put(`/api/bots/${OTHER_BOT_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ name: 'Hijacked Bot' });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'BOT_NOT_FOUND');
  assert.equal(bot.__saved, undefined);
});

test('PUT bot with a malformed id is 404 BOT_NOT_FOUND', async () => {
  const res = await supertest(app)
    .put('/api/bots/not-an-id')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ name: 'x' });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'BOT_NOT_FOUND');
});

test('non-superadmin cannot transfer bot ownership via PUT (403)', async () => {
  botFindOneImpl = async () => ownBotDoc();
  const res = await supertest(app)
    .put(`/api/bots/${OWN_BOT_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ name: 'Old Name', userId: OTHER_ID });
  assert.equal(res.status, 403);
});

// ---------- rules ----------

test('rules list for an unowned bot is 404, never an unfiltered read', async () => {
  botFindOneImpl = async () => null;
  const res = await supertest(app)
    .get(`/api/rules?botId=${OTHER_BOT_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'BOT_NOT_FOUND');
});

test("reading another user's rule is 404 with no rule data", async () => {
  ruleDoc = { _id: RULE_ID, type: 'qa', botId: OTHER_BOT_ID };
  botExistsImpl = async () => null;
  const res = await supertest(app)
    .get(`/api/rules/${RULE_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 404);
  assert.equal(res.body._id, undefined);
});

test('malformed rule id is 404 before any lookup', async () => {
  const res = await supertest(app)
    .get('/api/rules/not-an-id')
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 404);
});

// ---------- messages: handoff PATCH + reply POST ----------

function ownedConvDoc() {
  return {
    _id: CONV_ID,
    botId: OWN_BOT_ID,
    channel: 'whatsapp',
    userId: 'whatsapp_201001234567',
    isHumanHandling: false,
    messages: [],
    save: async function save() {
      this.__saved = (this.__saved || 0) + 1;
      return this;
    },
  };
}

test('handoff PATCH on an owned conversation succeeds', async () => {
  const conv = ownedConvDoc();
  convDoc = conv;
  botExistsImpl = async () => ({ _id: OWN_BOT_ID });
  const res = await supertest(app)
    .patch(`/api/messages/conversations/${CONV_ID}/handoff`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ isHumanHandling: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.isHumanHandling, true);
  assert.equal(conv.__saved, 1);
});

test("handoff PATCH on another user's conversation is 404 with zero writes", async () => {
  const conv = ownedConvDoc();
  conv.botId = OTHER_BOT_ID;
  convDoc = conv;
  botExistsImpl = async () => null;
  const res = await supertest(app)
    .patch(`/api/messages/conversations/${CONV_ID}/handoff`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ isHumanHandling: true });
  assert.equal(res.status, 404);
  assert.equal(conv.__saved, undefined);
});

test('[PROVEN-BUG → FP3] handoff PATCH with a malformed id is 404, never 500 (FP3 fixed)', async () => {
  const res = await supertest(app)
    .patch('/api/messages/conversations/not-an-id/handoff')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ isHumanHandling: true });
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
});

test('manual reply on an owned conversation records without any provider send', async () => {
  const conv = ownedConvDoc();
  convDoc = conv;
  botExistsImpl = async () => ({ _id: OWN_BOT_ID });
  botFindByIdImpl = async () => chain(null); // no bot → deliverManualReply bails before any send
  const res = await supertest(app)
    .post('/api/messages/reply')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ conversationId: CONV_ID, content: 'أهلاً بك' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.delivered, false);
  assert.equal(axiosPosts.length, 0);
  assert.equal(waSends.length, 0);
  assert.equal(conv.messages.length, 1);
});

test("manual reply to another user's conversation is 404 with zero sends", async () => {
  const conv = ownedConvDoc();
  conv.botId = OTHER_BOT_ID;
  convDoc = conv;
  botExistsImpl = async () => null;
  const res = await supertest(app)
    .post('/api/messages/reply')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ conversationId: CONV_ID, content: 'أهلاً بك' });
  assert.equal(res.status, 404);
  assert.equal(axiosPosts.length, 0);
  assert.equal(waSends.length, 0);
  assert.equal(conv.messages.length, 0);
});

test('[PROVEN-BUG → FP3] manual reply with a malformed id is 404, never 500 (FP3 fixed)', async () => {
  const res = await supertest(app)
    .post('/api/messages/reply')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ conversationId: 'not-an-id', content: 'أهلاً بك' });
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(axiosPosts.length, 0);
  assert.equal(waSends.length, 0);
});

// ---------- chat-page: owner parity check ----------

function otherUserPage() {
  return {
    _id: PAGE_ID,
    userId: OTHER_ID,
    botId: OTHER_BOT_ID,
    linkId: 'victim-link',
    title: 'Victim Page',
    colors: {},
    save: async function save() {
      this.__saved = (this.__saved || 0) + 1;
      return this;
    },
  };
}

test("[PROVEN-BUG → FP1] cross-user chat PUT is 404 with zero writes (FP1 fixed)", async () => {
  const page = otherUserPage();
  let findOneFilter = null;
  chatFindOneImpl = async (filter) => {
    findOneFilter = filter;
    return null; // not the caller's page
  };
  chatFindByIdImpl = async () => page; // an unscoped lookup must not grant access
  const res = await supertest(app)
    .put(`/api/chat-page/${PAGE_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ title: 'Hijacked title' });
  assert.equal(res.status, 404);
  assert.deepEqual(findOneFilter, { _id: PAGE_ID, userId: OWNER_ID });
  assert.equal(page.__saved, undefined);
  assert.equal(page.title, 'Victim Page');
});

function adminToken() {
  return signAccessToken({ _id: ADMIN_ID, username: 'contract_admin', role: 'superadmin', sessionVersion: 0 });
}

test('direct superadmin keeps PUT access to any chat page (FP1 bypass)', async () => {
  const page = otherUserPage();
  chatFindByIdImpl = async () => page;
  const res = await supertest(app)
    .put(`/api/chat-page/${PAGE_ID}`)
    .set('Authorization', `Bearer ${adminToken()}`)
    .send({ title: 'Admin-updated title' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(page.__saved, 1);
  assert.equal(page.title, 'Admin-updated title');
});

test('PUT chat page with a malformed id is 404, never 500', async () => {
  const res = await supertest(app)
    .put('/api/chat-page/not-an-id')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ title: 'x' });
  assert.equal(res.status, 404);
});

test('[PROVEN-BUG → FP2] cross-user chat config read is 404 with no data and no side effects (FP2 fixed)', async () => {
  const page = otherUserPage();
  chatFindOneImpl = async () => page; // would leak if the gate did not run first
  let existsFilter = null;
  botExistsImpl = async (filter) => {
    existsFilter = filter;
    return null;
  };
  let saves = 0;
  ChatPage.prototype.save = async function save() {
    saves += 1;
    return this;
  };
  const res = await supertest(app)
    .get(`/api/chat-page/bot/${OTHER_BOT_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 404);
  assert.deepEqual(existsFilter, { _id: OTHER_BOT_ID, userId: OWNER_ID });
  assert.equal(res.body.linkId, undefined);
  assert.equal(res.body.success, undefined);
  assert.equal(saves, 0);
});

test('direct superadmin keeps chat-config read for any bot (FP2 bypass)', async () => {
  const page = otherUserPage();
  let existsFilter = null;
  botExistsImpl = async (filter) => {
    existsFilter = filter;
    return { _id: OTHER_BOT_ID };
  };
  chatFindOneImpl = async () => page;
  const res = await supertest(app)
    .get(`/api/chat-page/bot/${OTHER_BOT_ID}`)
    .set('Authorization', `Bearer ${adminToken()}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.linkId, 'victim-link');
  assert.deepEqual(existsFilter, { _id: OTHER_BOT_ID });
});

test('chat config with a malformed bot id is 404 with no side effects', async () => {
  let saves = 0;
  ChatPage.prototype.save = async function save() {
    saves += 1;
    return this;
  };
  const res = await supertest(app)
    .get('/api/chat-page/bot/not-an-id')
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 404);
  assert.equal(saves, 0);
});

test('[PROVEN-BUG → FP2] no auto-provision for an unowned bot: 404 with zero saves (FP2 fixed)', async () => {
  chatFindOneImpl = async () => null;
  botFindByIdImpl = async () => ({ _id: OTHER_BOT_ID, userId: OTHER_ID, name: 'Victim Bot' });
  let saves = 0;
  ChatPage.prototype.save = async function save() {
    saves += 1;
    return this;
  };
  const res = await supertest(app)
    .get(`/api/chat-page/bot/${OTHER_BOT_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 404);
  assert.equal(saves, 0);
});

// ---------- chat-page create (D06d / FP4): ownership gate + forced caller userId ----------

test('[PROVEN-BUG → FP4] cross-user chat create is 404 with zero reads and zero saves', async () => {
  let existsFilter = null;
  botExistsImpl = async (filter) => {
    existsFilter = filter;
    return null;
  };
  let findOneCalls = 0;
  chatFindOneImpl = async () => {
    findOneCalls += 1;
    return otherUserPage(); // would provision/leak if the gate did not run first
  };
  let saves = 0;
  ChatPage.prototype.save = async function save() {
    saves += 1;
    return this;
  };
  const res = await supertest(app)
    .post('/api/chat-page/')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ userId: OTHER_ID, botId: OTHER_BOT_ID, linkId: 'attackerlink1' });
  assert.equal(res.status, 404);
  assert.deepEqual(existsFilter, { _id: OTHER_BOT_ID, userId: OWNER_ID });
  assert.equal(findOneCalls, 0);
  assert.equal(saves, 0);
});

test('[PROVEN-BUG → FP4] cross-user chat create oracle leaks nothing (no link, no id, no exists flag)', async () => {
  botExistsImpl = async () => null;
  chatFindOneImpl = async () => otherUserPage(); // existing victim page must stay hidden
  let saves = 0;
  ChatPage.prototype.save = async function save() {
    saves += 1;
    return this;
  };
  const res = await supertest(app)
    .post('/api/chat-page/')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ userId: OTHER_ID, botId: OTHER_BOT_ID });
  assert.equal(res.status, 404);
  assert.equal(res.body.link, undefined);
  assert.equal(res.body.chatPageId, undefined);
  assert.equal(res.body.exists, undefined);
  assert.equal(saves, 0);
});

test('owner chat create succeeds and forces userId to the caller (body userId ignored)', async () => {
  let existsFilter = null;
  botExistsImpl = async (filter) => {
    existsFilter = filter;
    return { _id: OWN_BOT_ID };
  };
  chatFindOneImpl = async () => null; // no existing page, no link clash
  let savedDoc = null;
  ChatPage.prototype.save = async function save() {
    this.__saved = (this.__saved || 0) + 1;
    savedDoc = this;
    return this;
  };
  const res = await supertest(app)
    .post('/api/chat-page/')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ userId: OTHER_ID, botId: OWN_BOT_ID, linkId: 'ownerlink123' });
  assert.equal(res.status, 201);
  assert.equal(res.body.exists, false);
  assert.ok(res.body.chatPageId);
  assert.deepEqual(existsFilter, { _id: OWN_BOT_ID, userId: OWNER_ID });
  assert.equal(String(savedDoc.userId), OWNER_ID);
  assert.equal(String(savedDoc.botId), OWN_BOT_ID);
});

test('owner chat create for an existing page returns 200 exists:true without a new save', async () => {
  botExistsImpl = async () => ({ _id: OWN_BOT_ID });
  chatFindOneImpl = async () => otherUserPage();
  let saves = 0;
  ChatPage.prototype.save = async function save() {
    saves += 1;
    return this;
  };
  const res = await supertest(app)
    .post('/api/chat-page/')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ userId: OTHER_ID, botId: OWN_BOT_ID });
  assert.equal(res.status, 200);
  assert.equal(res.body.exists, true);
  assert.ok(res.body.link);
  assert.equal(saves, 0);
});

test('direct superadmin keeps chat create for any bot (FP4 bypass, userId forced to caller)', async () => {
  let existsFilter = null;
  botExistsImpl = async (filter) => {
    existsFilter = filter;
    return { _id: OTHER_BOT_ID };
  };
  chatFindOneImpl = async () => null;
  let savedDoc = null;
  ChatPage.prototype.save = async function save() {
    savedDoc = this;
    return this;
  };
  const res = await supertest(app)
    .post('/api/chat-page/')
    .set('Authorization', `Bearer ${adminToken()}`)
    .send({ userId: OTHER_ID, botId: OTHER_BOT_ID, linkId: 'adminlink123' });
  assert.equal(res.status, 201);
  assert.deepEqual(existsFilter, { _id: OTHER_BOT_ID });
  assert.equal(String(savedDoc.userId), ADMIN_ID);
});

test('chat create with a malformed bot id is 404 with no side effects', async () => {
  let saves = 0;
  ChatPage.prototype.save = async function save() {
    saves += 1;
    return this;
  };
  const res = await supertest(app)
    .post('/api/chat-page/')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ userId: OWNER_ID, botId: 'not-an-id' });
  assert.equal(res.status, 404);
  assert.equal(saves, 0);
});

// ---------- catalog: owner-only reference ----------

test('catalog PUT for an unowned bot is 404 with no writes or provider calls', async () => {
  botFindOneImpl = async () => null;
  const res = await supertest(app)
    .put(`/api/catalog-connectors/bots/${OTHER_BOT_ID}/shopify`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ origin: 'https://x.myshopify.com', currency: 'EGP', token: 'long-enough-token' });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'BOT_NOT_FOUND');
  assert.equal(axiosPosts.length, 0);
});

test('catalog PUT with an invalid config is 400 before any provider/store work', async () => {
  botFindOneImpl = async () => ({ _id: OWN_BOT_ID, userId: OWNER_ID, storeId: null, archivedAt: null });
  const res = await supertest(app)
    .put(`/api/catalog-connectors/bots/${OWN_BOT_ID}/shopify`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ origin: 'https://x.myshopify.com', currency: 'EGP', token: 'short' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'INVALID_CONNECTOR_CONFIG');
});

test('catalog sync for an unconfigured bot is 404, single lookup only', async () => {
  botFindOneImpl = async () => ({ _id: OWN_BOT_ID, userId: OWNER_ID, storeId: null, archivedAt: null });
  const res = await supertest(app)
    .post(`/api/catalog-connectors/bots/${OWN_BOT_ID}/shopify/sync`)
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'CONNECTOR_NOT_CONFIGURED');
  assert.equal(axiosPosts.length, 0);
});

// ---------- impersonation scoping ----------

test('impersonated admin reads the SUBJECT profile, never the actor', async () => {
  const token = impersonationToken();
  const res = await supertest(app)
    .get('/api/users/profile')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.username, 'contract_owner');
  assert.equal(String(res.body.data._id), OWNER_ID);
});

test('impersonated sessions are rejected from catalog (403 OWNER_ONLY)', async () => {
  botFindOneImpl = async () => ({ _id: OWN_BOT_ID, userId: OWNER_ID, storeId: null, archivedAt: null });
  const token = impersonationToken();
  const res = await supertest(app)
    .get(`/api/catalog-connectors/bots/${OWN_BOT_ID}/shopify`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'OWNER_ONLY');
});

test('impersonated admin cannot use direct-admin user routes (403, end impersonation first)', async () => {
  const token = impersonationToken();
  const res = await supertest(app)
    .get('/api/users')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'DIRECT_ADMIN_SESSION_REQUIRED');
  assert.equal(res.body.data, undefined);
});

test('impersonated session cannot reach outside the subject scope (third-party bot is 404)', async () => {
  botFindOneImpl = async (filter) => {
    assert.equal(String(filter.userId), OWNER_ID);
    return null;
  };
  const token = impersonationToken();
  const res = await supertest(app)
    .get(`/api/bots/${OTHER_BOT_ID}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'BOT_NOT_FOUND');
});

test('chat create without botId is 400 with zero saves', async () => {
  let existsCalls = 0;
  botExistsImpl = async () => {
    existsCalls += 1;
    return { _id: OWN_BOT_ID };
  };
  let findOneCalls = 0;
  chatFindOneImpl = async () => {
    findOneCalls += 1;
    return null;
  };
  let saves = 0;
  ChatPage.prototype.save = async function save() {
    saves += 1;
    return this;
  };
  const res = await supertest(app)
    .post('/api/chat-page/')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ userId: OWNER_ID });
  assert.equal(res.status, 400);
  assert.equal(existsCalls, 0);
  assert.equal(findOneCalls, 0);
  assert.equal(saves, 0);
});

test('impersonated superadmin chat create is scoped to the subject (201, no actor leak)', async () => {
  const token = impersonationToken();
  let existsFilter = null;
  botExistsImpl = async (filter) => {
    existsFilter = filter;
    return { _id: OWN_BOT_ID };
  };
  chatFindOneImpl = async () => null; // no existing page, no link clash
  let savedDoc = null;
  ChatPage.prototype.save = async function save() {
    savedDoc = this;
    return this;
  };
  const res = await supertest(app)
    .post('/api/chat-page/')
    .set('Authorization', `Bearer ${token}`)
    .send({ userId: ADMIN_ID, botId: OWN_BOT_ID, linkId: 'impersonated1' });
  assert.equal(res.status, 201);
  assert.equal(res.body.exists, false);
  assert.ok(res.body.chatPageId);
  assert.deepEqual(existsFilter, { _id: OWN_BOT_ID, userId: OWNER_ID });
  assert.equal(String(savedDoc.userId), OWNER_ID);
  assert.equal(String(savedDoc.botId), OWN_BOT_ID);
  assert.equal(JSON.stringify(res.body).includes(ADMIN_ID), false);
});
