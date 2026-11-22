'use strict';

// tests/tenantIsolationProvisioning.review.test.js
// Independent reviewer regression tests (parallel review agent), written
// against pushed master cefcb26. Scope: tenant selection + chat-page
// provisioning correctness.
//
// Tests marked [DESIRED] assert the behavior agreed for the in-flight fix;
// they FAIL on cefcb26 and must PASS once the fix lands. Tests marked
// [GUARD] pass on cefcb26 and protect already-correct behavior.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Bot = require('../server/models/Bot');
const ChatPage = require('../server/models/ChatPage');
const controller = require('../server/controllers/chatPageController');

const TENANT_ID = new mongoose.Types.ObjectId();
const OTHER_TENANT_ID = new mongoose.Types.ObjectId();
const ADMIN_ID = new mongoose.Types.ObjectId();

let mongod;
let tenantBot; // owned by TENANT_ID

function reqRes({ userId, role, actorRole, isImpersonating, params, body } = {}) {
  const uid = String(userId);
  const req = {
    user: { userId: uid, role: role || 'user' },
    auth: {
      actorUserId: uid,
      subjectUserId: uid,
      actorRole: actorRole || role || 'user',
      subjectRole: role || 'user',
      isImpersonating: Boolean(isImpersonating),
      impersonationSessionId: null,
      scopes: [],
      tokenType: 'access',
    },
    params: params || { botId: String(tenantBot._id) },
    body: body || {},
  };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
  return { req, res };
}

function asDirectSuperadmin() {
  return { userId: ADMIN_ID, role: 'superadmin', actorRole: 'superadmin', isImpersonating: false };
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  tenantBot = await Bot.create({
    userId: TENANT_ID,
    name: 'بوت المستأجر',
    workingHours: { start: '09:00', end: '21:00' },
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await ChatPage.deleteMany({});
});

// 1. [GUARD] Ordinary tenant isolation: foreign bot -> 404, zero side effects.
test('[GUARD] ordinary user GET chat page of another tenant bot: 404 and no writes', async () => {
  const { req, res } = reqRes({ userId: OTHER_TENANT_ID });
  await controller.getChatPageByBotId(req, res);
  assert.equal(res.statusCode, 404);
  assert.equal(await ChatPage.countDocuments({}), 0);
});

// 2. [DESIRED] GET must be read-only even for the owner: no page -> 404, no provisioning.
test('[DESIRED] owner GET chat page when none exists: 404 and zero writes (no GET provisioning)', async () => {
  const { req, res } = reqRes({ userId: TENANT_ID });
  await controller.getChatPageByBotId(req, res);
  assert.equal(res.statusCode, 404, 'GET must not auto-provision; expected 404');
  assert.equal(await ChatPage.countDocuments({}), 0, 'GET created a ChatPage document');
});

// 3. [DESIRED] Direct superadmin read-only navigation must not write into a foreign tenant.
test('[DESIRED] direct superadmin GET foreign bot without page: 404 and zero cross-tenant writes', async () => {
  const { req, res } = reqRes(asDirectSuperadmin());
  await controller.getChatPageByBotId(req, res);
  assert.equal(res.statusCode, 404, 'superadmin GET must not auto-provision; expected 404');
  assert.equal(await ChatPage.countDocuments({}), 0, 'superadmin navigation wrote a ChatPage owned by the foreign tenant');
});

// 4. [GUARD] Existing page reads stay side-effect free for every caller class.
test('[GUARD] GET existing page returns 200 with no additional writes (owner and superadmin)', async () => {
  await ChatPage.create({ userId: TENANT_ID, botId: tenantBot._id, linkId: 'existing01' });
  for (const who of [{ userId: TENANT_ID }, asDirectSuperadmin()]) {
    const { req, res } = reqRes(who);
    await controller.getChatPageByBotId(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.linkId, 'existing01');
    assert.equal(await ChatPage.countDocuments({}), 1, 'GET must never create or duplicate pages');
  }
});

// 5. [DESIRED] Creation-path ownership consistency: a page bound to a tenant's
// bot must be manageable by that tenant. On cefcb26 a superadmin POST creates a
// page owned by the ADMIN bound to the FOREIGN bot: the tenant can read it via
// GET by botId but updateChatPage 404s for them (gate is page.userId).
test('[DESIRED] page created for a tenant bot stays manageable by that tenant', async () => {
  const create = reqRes({ ...asDirectSuperadmin(), body: { botId: String(tenantBot._id) } });
  await controller.createChatPage(create.req, create.res);
  assert.equal(create.res.statusCode, 201);
  const page = await ChatPage.findOne({ botId: tenantBot._id });
  assert.ok(page, 'page exists after create');

  const upd = reqRes({
    userId: TENANT_ID,
    params: { id: String(page._id) },
    body: { title: 'عنوان جديد' },
  });
  await controller.updateChatPage(upd.req, upd.res);
  assert.equal(upd.res.statusCode, 200,
    'tenant owner must be able to update the page bound to their own bot');
});

// 7. [DESIRED] R1 contract: intentional creation must yield the brand default
// configuration the removed auto-provision used (dark theme, suggested
// questions enabled with Arabic defaults, image upload enabled) — not the
// stale light-theme schema defaults (#007bff). Fails on 2d7d5e3.
test('[DESIRED] createChatPage applies brand default configuration', async () => {
  const { req, res } = reqRes({ userId: TENANT_ID, body: { botId: String(tenantBot._id) } });
  await controller.createChatPage(req, res);
  assert.equal(res.statusCode, 201);
  const page = await ChatPage.findOne({ botId: tenantBot._id }).lean();
  assert.ok(page);
  assert.equal(page.colors?.header, '#0F172A', 'brand dark header expected');
  assert.equal(page.suggestedQuestionsEnabled, true);
  assert.ok(Array.isArray(page.suggestedQuestions) && page.suggestedQuestions.length >= 3,
    'default suggested questions expected');
  assert.equal(page.imageUploadEnabled, true);
});

// 6. [GUARD] Impersonating superadmin is scoped to the subject tenant: foreign
// bot -> 404 with zero side effects.
test('[GUARD] impersonating superadmin cannot reach third-party bot chat page', async () => {
  const { req, res } = reqRes({
    userId: OTHER_TENANT_ID,
    role: 'user',
    actorRole: 'superadmin',
    isImpersonating: true,
  });
  // subject is OTHER_TENANT_ID; tenantBot belongs to TENANT_ID
  await controller.getChatPageByBotId(req, res);
  assert.equal(res.statusCode, 404);
  assert.equal(await ChatPage.countDocuments({}), 0);
});
