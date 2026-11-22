'use strict';

// tests/chatPageOwnerMismatch.test.js
// Protective handling for legacy chat pages whose recorded owner (userId)
// differs from the bot's owner (live finding 2026-11-22: page
// 68d6aa735685f609e327964a serves a bot owned by a different user).
// Policy: public serving continues with a warning log (live customer links
// must not break), but updates on an inconsistent page are denied to
// non-superadmin callers — no party gains control over another party's
// data while the record awaits an explicit ownership decision. The record
// itself is never silently migrated.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Bot = require('../server/models/Bot');
const ChatPage = require('../server/models/ChatPage');
const controller = require('../server/controllers/chatPageController');

const BOT_OWNER = new mongoose.Types.ObjectId();
const STRAY_PAGE_OWNER = new mongoose.Types.ObjectId();
const ADMIN_ID = new mongoose.Types.ObjectId();

let mongod;
let bot;

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
    params: params || {},
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

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  bot = await Bot.create({
    userId: BOT_OWNER,
    name: 'بوت صاحب المتجر',
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

test('mismatched legacy page: update denied to the recorded page owner (no cross-party control)', async () => {
  const page = await ChatPage.create({ userId: STRAY_PAGE_OWNER, botId: bot._id, linkId: 'legacy01', title: 'قديمة' });
  const { req, res } = reqRes({ userId: STRAY_PAGE_OWNER, params: { id: String(page._id) }, body: { title: 'عنوان جديد' } });
  await controller.updateChatPage(req, res);
  assert.equal(res.statusCode, 403);
  const after = await ChatPage.findById(page._id);
  assert.equal(after.title, 'قديمة', 'denied update must not mutate the record');
  assert.equal(String(after.userId), String(STRAY_PAGE_OWNER), 'record ownership must not be silently migrated');
});

test('mismatched legacy page: update denied to the bot owner too while undecided', async () => {
  const page = await ChatPage.create({ userId: STRAY_PAGE_OWNER, botId: bot._id, linkId: 'legacy02', title: 'قديمة' });
  // The bot owner is not the recorded page owner, so the scoped lookup
  // already misses; the explicit guard is what protects the stray path.
  const { req, res } = reqRes({ userId: BOT_OWNER, params: { id: String(page._id) }, body: { title: 'عنوان' } });
  await controller.updateChatPage(req, res);
  assert.equal(res.statusCode, 404, 'scoped lookup excludes pages outside the caller ownership');
});

test('mismatched legacy page: direct superadmin may still update for support handling', async () => {
  const page = await ChatPage.create({ userId: STRAY_PAGE_OWNER, botId: bot._id, linkId: 'legacy03', title: 'قديمة' });
  const { req, res } = reqRes({
    userId: ADMIN_ID,
    role: 'superadmin',
    actorRole: 'superadmin',
    isImpersonating: false,
    params: { id: String(page._id) },
    body: { title: 'معالجة الدعم' },
  });
  await controller.updateChatPage(req, res);
  assert.equal(res.statusCode, 200);
  const after = await ChatPage.findById(page._id);
  assert.equal(after.title, 'معالجة الدعم');
  assert.equal(String(after.userId), String(STRAY_PAGE_OWNER), 'even superadmin update must not migrate ownership');
});

test('mismatched legacy page: public serving continues (live customer links must not break)', async () => {
  await ChatPage.create({ userId: STRAY_PAGE_OWNER, botId: bot._id, linkId: 'legacy04', title: 'قديمة' });
  const { req, res } = reqRes({ userId: STRAY_PAGE_OWNER, params: { linkId: 'legacy04' } });
  await controller.getChatPageByLinkId(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.linkId, 'legacy04');
});

test('consistent page: owner update unaffected (no regression)', async () => {
  const page = await ChatPage.create({ userId: BOT_OWNER, botId: bot._id, linkId: 'normal01', title: 'قديمة' });
  const { req, res } = reqRes({ userId: BOT_OWNER, params: { id: String(page._id) }, body: { title: 'جديدة' } });
  await controller.updateChatPage(req, res);
  assert.equal(res.statusCode, 200);
  const after = await ChatPage.findById(page._id);
  assert.equal(after.title, 'جديدة');
});

test('new pages are always provisioned with the bot tenant as owner', async () => {
  const { req, res } = reqRes({
    userId: BOT_OWNER,
    params: {},
    body: { botId: String(bot._id), linkId: 'fresh01' },
  });
  await controller.createChatPage(req, res);
  assert.equal(res.statusCode, 201);
  const created = await ChatPage.findOne({ linkId: 'fresh01' });
  assert.equal(String(created.userId), String(BOT_OWNER));
});
