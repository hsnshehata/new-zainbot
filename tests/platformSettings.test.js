'use strict';

// tests/platformSettings.test.js
// Covers PlatformSetting singleton model (race-safe getConfig), admin CRUD
// routes (/api/admin/platform-settings) with Egyptian WhatsApp validation,
// public GET /api/config & GET /api/subscriptions/plans resolution + fallback,
// 60s in-memory TTL cache behavior, and admin dashboard UI wiring.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-that-is-at-least-32-bytes-long';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');

const app = require('../server/server');
const PlatformSetting = require('../server/models/PlatformSetting');
const AuditEvent = require('../server/models/AuditEvent');
const User = require('../server/models/User');
const { signAccessToken } = require('../server/utils/authTokens');
const {
  PLATFORM_SETTINGS_CACHE_TTL_MS,
  invalidatePlatformSettingsCache,
} = require('../server/services/platformSettingsService');

const authUsers = new Map();
function makeUser(id, role = 'user') {
  return { _id: id, username: `user_${id}`, role, status: 'active', sessionVersion: 0 };
}
function tokenFor(user) {
  authUsers.set(String(user._id), user);
  return signAccessToken(user);
}

const originals = {
  findOne: PlatformSetting.findOne,
  create: PlatformSetting.create,
  getConfig: PlatformSetting.getConfig,
  userFindById: User.findById,
  auditCreate: AuditEvent.create,
  dateNow: Date.now,
  envWhatsapp: process.env.SUBSCRIPTION_WHATSAPP_NUMBER,
};

let auditEvents = [];

test.beforeEach(() => {
  invalidatePlatformSettingsCache();
  authUsers.clear();
  auditEvents = [];
  Date.now = originals.dateNow;
  PlatformSetting.findOne = originals.findOne;
  PlatformSetting.create = originals.create;
  PlatformSetting.getConfig = originals.getConfig;
  User.findById = (id) => ({
    select: () => ({ lean: async () => authUsers.get(String(id)) || null }),
  });
  AuditEvent.create = async (evt) => {
    auditEvents.push(evt);
    return { _id: `audit-${auditEvents.length}`, ...evt };
  };
  delete process.env.SUBSCRIPTION_WHATSAPP_NUMBER;
});

test.afterEach(() => {
  invalidatePlatformSettingsCache();
  Date.now = originals.dateNow;
  PlatformSetting.findOne = originals.findOne;
  PlatformSetting.create = originals.create;
  PlatformSetting.getConfig = originals.getConfig;
  User.findById = originals.userFindById;
  AuditEvent.create = originals.auditCreate;
  if (originals.envWhatsapp === undefined) {
    delete process.env.SUBSCRIPTION_WHATSAPP_NUMBER;
  } else {
    process.env.SUBSCRIPTION_WHATSAPP_NUMBER = originals.envWhatsapp;
  }
});

test('PlatformSetting schema defines singleton key and subscriptionWhatsappNumber constraints', () => {
  const keyPath = PlatformSetting.schema.path('key');
  const waPath = PlatformSetting.schema.path('subscriptionWhatsappNumber');

  assert.equal(keyPath.options.default, 'platform_settings');
  assert.equal(keyPath.options.unique, true);
  assert.equal(keyPath.options.immutable, true);
  assert.equal(waPath.options.default, '');
  assert.equal(waPath.options.trim, true);
  assert.equal(waPath.options.maxlength, 32);
});

test('PlatformSetting.getConfig creates singleton on first read and handles duplicate-key race safely', async () => {
  // Normal first-read creation
  let createdArg = null;
  PlatformSetting.findOne = async () => null;
  PlatformSetting.create = async (payload) => {
    createdArg = payload;
    return { key: 'platform_settings', subscriptionWhatsappNumber: '' };
  };

  const first = await PlatformSetting.getConfig();
  assert.deepEqual(createdArg, { key: 'platform_settings' });
  assert.equal(first.key, 'platform_settings');

  // Race condition: first findOne misses, create fails with duplicate key,
  // second findOne returns the concurrent creator's document.
  let findCalls = 0;
  const winnerDoc = { key: 'platform_settings', subscriptionWhatsappNumber: '01099998888' };
  PlatformSetting.findOne = async (query) => {
    assert.deepEqual(query, { key: 'platform_settings' });
    findCalls += 1;
    return findCalls === 1 ? null : winnerDoc;
  };
  PlatformSetting.create = async () => {
    const dupErr = new Error('E11000 duplicate key error');
    dupErr.code = 11000;
    throw dupErr;
  };

  const raced = await PlatformSetting.getConfig();
  assert.equal(findCalls, 2);
  assert.equal(raced, winnerDoc);

  // Non-race error when retry findOne still finds nothing must rethrow.
  PlatformSetting.findOne = async () => null;
  PlatformSetting.create = async () => {
    throw new Error('database_down');
  };
  await assert.rejects(() => PlatformSetting.getConfig(), /database_down/);
});

test('/api/admin/platform-settings requires direct superadmin authentication', async () => {
  const unauth = await request(app).get('/api/admin/platform-settings');
  assert.equal(unauth.status, 401);

  const regularToken = tokenFor(makeUser('507f191e810c19729de86011', 'user'));
  const forbidden = await request(app)
    .get('/api/admin/platform-settings')
    .set('Authorization', `Bearer ${regularToken}`);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, 'DIRECT_SUPERADMIN_REQUIRED');
});

test('GET /api/admin/platform-settings reports database, env, and empty sources', async () => {
  const adminToken = tokenFor(makeUser('507f191e810c19729de86001', 'superadmin'));
  const updatedAt = new Date('2026-11-26T10:00:00.000Z');
  const stored = { subscriptionWhatsappNumber: '01012345678', updatedAt };
  PlatformSetting.getConfig = async () => stored;
  process.env.SUBSCRIPTION_WHATSAPP_NUMBER = '01122334455';

  // 1) Database override wins over env
  const fromDb = await request(app)
    .get('/api/admin/platform-settings')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(fromDb.status, 200);
  assert.equal(fromDb.body.success, true);
  assert.equal(fromDb.body.data.subscriptionWhatsappNumber, '01012345678');
  assert.equal(fromDb.body.data.effectiveWhatsappNumber, '01012345678');
  assert.equal(fromDb.body.data.source, 'database');

  // 2) Empty DB falls back to env
  stored.subscriptionWhatsappNumber = '';
  const fromEnv = await request(app)
    .get('/api/admin/platform-settings')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(fromEnv.status, 200);
  assert.equal(fromEnv.body.data.subscriptionWhatsappNumber, '');
  assert.equal(fromEnv.body.data.effectiveWhatsappNumber, '01122334455');
  assert.equal(fromEnv.body.data.source, 'env');

  // 3) Both empty -> source: 'empty'
  delete process.env.SUBSCRIPTION_WHATSAPP_NUMBER;
  const fromEmpty = await request(app)
    .get('/api/admin/platform-settings')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(fromEmpty.status, 200);
  assert.equal(fromEmpty.body.data.effectiveWhatsappNumber, '');
  assert.equal(fromEmpty.body.data.source, 'empty');
});

test('PUT /api/admin/platform-settings accepts and normalizes Egyptian formats, rejects invalid inputs, and clears on empty', async () => {
  const adminToken = tokenFor(makeUser('507f191e810c19729de86002', 'superadmin'));
  process.env.SUBSCRIPTION_WHATSAPP_NUMBER = '01500001111';

  let saveCount = 0;
  const doc = {
    key: 'platform_settings',
    subscriptionWhatsappNumber: '',
    updatedAt: new Date('2026-11-26T12:00:00.000Z'),
    async save() {
      saveCount += 1;
      this.updatedAt = new Date('2026-11-26T12:05:00.000Z');
      return this;
    },
  };
  PlatformSetting.getConfig = async () => doc;

  const validVariants = [
    '01012345678',
    '201012345678',
    '+201012345678',
    '010 1234 5678',
    '010-1234-5678',
    '+20 101-234-5678',
    '  20 10-1234-5678  ',
  ];

  for (const input of validVariants) {
    const res = await request(app)
      .put('/api/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ subscriptionWhatsappNumber: input });
    assert.equal(res.status, 200, `Expected 200 for "${input}", got ${res.status}`);
    assert.equal(res.body.success, true);
    assert.equal(doc.subscriptionWhatsappNumber, '01012345678', `Expected normalized stored value for "${input}"`);
    assert.equal(res.body.data.subscriptionWhatsappNumber, '01012345678');
    assert.equal(res.body.data.effectiveWhatsappNumber, '01012345678');
    assert.equal(res.body.data.source, 'database');
  }
  assert.equal(saveCount, validVariants.length);

  // Invalid inputs must return 400 with a clear Arabic error message and never save
  const invalidVariants = [
    '0101234abcd',     // letters
    '0101234567',      // too short (10 digits)
    '010123456789',    // too long (12 digits)
    '+2001012345678',  // extra leading zero after +20
    '+14155552671',    // non-Egyptian
    '02012345678',     // landline / non-01 prefix
    '---',             // punctuation only
    1012345678,        // non-string
  ];

  for (const bad of invalidVariants) {
    const beforeSaves = saveCount;
    const res = await request(app)
      .put('/api/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ subscriptionWhatsappNumber: bad });
    assert.equal(res.status, 400, `Expected 400 for "${bad}", got ${res.status}`);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error, 'INVALID_WHATSAPP_NUMBER');
    assert.match(res.body.message, /[\u0600-\u06FF]/, 'Error message must be in Arabic');
    assert.equal(saveCount, beforeSaves, 'Invalid input must not save');
  }

  // Empty string clears override and falls back to env
  const cleared = await request(app)
    .put('/api/admin/platform-settings')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ subscriptionWhatsappNumber: '' });
  assert.equal(cleared.status, 200);
  assert.equal(doc.subscriptionWhatsappNumber, '');
  assert.equal(cleared.body.data.subscriptionWhatsappNumber, '');
  assert.equal(cleared.body.data.effectiveWhatsappNumber, '01500001111');
  assert.equal(cleared.body.data.source, 'env');

  // Whitespace-only also clears override
  doc.subscriptionWhatsappNumber = '01012345678';
  const clearedSpaces = await request(app)
    .put('/api/admin/platform-settings')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ subscriptionWhatsappNumber: '   ' });
  assert.equal(clearedSpaces.status, 200);
  assert.equal(doc.subscriptionWhatsappNumber, '');
  assert.equal(clearedSpaces.body.data.source, 'env');
  assert.ok(auditEvents.length > 0, 'PUT mutations must be audited');
  assert.equal(auditEvents[0].eventType, 'admin.write');
});

test('GET /api/config prefers DB over env, falls back when cleared, and respects 60s cache TTL', async () => {
  const adminToken = tokenFor(makeUser('507f191e810c19729de86003', 'superadmin'));
  process.env.SUBSCRIPTION_WHATSAPP_NUMBER = '01111111111';

  let nowMs = 1_700_000_000_000;
  Date.now = () => nowMs;

  let getConfigCalls = 0;
  const doc = {
    key: 'platform_settings',
    subscriptionWhatsappNumber: '01222222222',
    updatedAt: new Date(nowMs),
    async save() {
      this.updatedAt = new Date(nowMs);
      return this;
    },
  };
  PlatformSetting.getConfig = async () => {
    getConfigCalls += 1;
    return doc;
  };

  // First read hits model and prefers DB over env
  const r1 = await request(app).get('/api/config');
  assert.equal(r1.status, 200);
  assert.equal(r1.body.subscribeWhatsapp, '01222222222');
  assert.equal(getConfigCalls, 1);

  // Second read within 60s TTL serves from cache without re-hitting the model
  nowMs += PLATFORM_SETTINGS_CACHE_TTL_MS - 1000;
  const r2 = await request(app).get('/api/config');
  assert.equal(r2.status, 200);
  assert.equal(r2.body.subscribeWhatsapp, '01222222222');
  assert.equal(getConfigCalls, 1, 'Second read within TTL must not re-hit PlatformSetting.getConfig');

  // Underlying DB changes externally; once TTL expires, next read refreshes naturally
  doc.subscriptionWhatsappNumber = '01555555555';
  nowMs += 2000; // past 60s TTL
  const r3 = await request(app).get('/api/config');
  assert.equal(r3.status, 200);
  assert.equal(r3.body.subscribeWhatsapp, '01555555555');
  assert.equal(getConfigCalls, 2, 'Read after TTL expiration must re-hit PlatformSetting.getConfig');

  // Clearing via admin PUT invalidates cache immediately and /api/config falls back to env
  const clearRes = await request(app)
    .put('/api/admin/platform-settings')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ subscriptionWhatsappNumber: '' });
  assert.equal(clearRes.status, 200);

  const r4 = await request(app).get('/api/config');
  assert.equal(r4.status, 200);
  assert.equal(r4.body.subscribeWhatsapp, '01111111111');

  // When env is also unset, returns empty string
  delete process.env.SUBSCRIPTION_WHATSAPP_NUMBER;
  const r5 = await request(app).get('/api/config');
  assert.equal(r5.status, 200);
  assert.equal(r5.body.subscribeWhatsapp, '');
});

test('GET /api/subscriptions/plans exposes the same effective WhatsApp number', async () => {
  process.env.SUBSCRIPTION_WHATSAPP_NUMBER = '01199998888';
  const doc = { key: 'platform_settings', subscriptionWhatsappNumber: '01077776666' };
  PlatformSetting.getConfig = async () => doc;

  const withDb = await request(app).get('/api/subscriptions/plans');
  assert.equal(withDb.status, 200);
  assert.equal(withDb.body.data.payment.whatsappNumber, '01077776666');

  invalidatePlatformSettingsCache();
  doc.subscriptionWhatsappNumber = '';
  const withEnv = await request(app).get('/api/subscriptions/plans');
  assert.equal(withEnv.status, 200);
  assert.equal(withEnv.body.data.payment.whatsappNumber, '01199998888');
});

test('Admin dashboard markup and i18n include Platform Settings subtab with real Arabic copy', () => {
  const workspace = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
  const js = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');

  assert.match(html, /id="adminTabPlatformSettingsBtn"[\s\S]*data-i18n="admin_subtab_platform_settings"/);
  assert.match(html, /id="adminSectionPlatformSettings"/);
  assert.match(html, /id="platformSettingsWhatsappInput"/);
  assert.match(html, /id="platformSettingsEffectiveVal"/);
  assert.match(html, /id="platformSettingsSourceVal"/);
  assert.match(html, /id="platformSettingsSaveBtn"/);

  assert.match(js, /admin_subtab_platform_settings:\s*'Platform Settings'/);
  assert.match(js, /admin_subtab_platform_settings:\s*'إعدادات المنصة'/);
  assert.match(js, /platform_settings_whatsapp_label:\s*'رقم واتساب الاشتراكات'/);
  assert.match(js, /\/api\/admin\/platform-settings/);
});
