'use strict';

// tests/assistant/assistantSettingsRoutes.test.js
// Supertest tests for:
// - Merchant endpoints: GET/PATCH /api/assistant/settings,
//   POST /api/assistant/whatsapp/link-code, GET /api/assistant/audit
// - Admin platform kill switches: GET/PUT /api/admin/platform-settings
//   (assistantWriteToolsEnabled, copilotEnabled) + fail-closed service getters.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-that-is-at-least-32-bytes-long';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const request = require('supertest');

const app = require('../../server/server');
const User = require('../../server/models/User');
const Bot = require('../../server/models/Bot');
const Store = require('../../server/models/Store');
const PlatformSetting = require('../../server/models/PlatformSetting');
const PlatformWhatsAppSession = require('../../server/models/PlatformWhatsAppSession');
const AssistantActionAudit = require('../../server/models/AssistantActionAudit');
const AuditEvent = require('../../server/models/AuditEvent');
const { signAccessToken } = require('../../server/utils/authTokens');
const {
  invalidatePlatformSettingsCache,
  isAssistantWriteToolsEnabled,
  isCopilotEnabled,
} = require('../../server/services/platformSettingsService');

const MERCHANT_A = '507f191e810c19729de86011';
const MERCHANT_B = '507f191e810c19729de86012';
const ADMIN_ID = '507f191e810c19729de86001';
const OWN_BOT_ID = '507f191e810c19729de86101';
const OTHER_BOT_ID = '507f191e810c19729de86102';
const OWN_STORE_ID = '507f191e810c19729de86201';
const OTHER_STORE_ID = '507f191e810c19729de86202';

const usersById = new Map();
const auditEvents = [];
let platformDoc = null;
let platformWaDoc = null;
let capturedAuditFindFilter = null;
let capturedAuditRows = [];
let lastUserUpdate = null;

function tokenFor(user) {
  usersById.set(String(user._id), user);
  return signAccessToken(user);
}

const originals = {
  userFindById: User.findById,
  userFindByIdAndUpdate: User.findByIdAndUpdate,
  botFindOne: Bot.findOne,
  storeFindOne: Store.findOne,
  platformGetConfig: PlatformSetting.getConfig,
  platformWaFindOne: PlatformWhatsAppSession.findOne,
  assistantAuditFind: AssistantActionAudit.find,
  assistantAuditCount: AssistantActionAudit.countDocuments,
  auditEventCreate: AuditEvent.create,
};

function applyDotSet(target, setObj) {
  for (const [dottedKey, value] of Object.entries(setObj || {})) {
    const parts = dottedKey.split('.');
    let cursor = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (!cursor[parts[i]] || typeof cursor[parts[i]] !== 'object') {
        cursor[parts[i]] = {};
      }
      cursor = cursor[parts[i]];
    }
    cursor[parts[parts.length - 1]] = value;
  }
}

test.beforeEach(() => {
  invalidatePlatformSettingsCache();
  usersById.clear();
  auditEvents.length = 0;
  capturedAuditFindFilter = null;
  capturedAuditRows = [];
  lastUserUpdate = null;

  platformDoc = {
    key: 'platform_settings',
    subscriptionWhatsappNumber: '',
    defaultOpenAiModel: '',
    assistantWriteToolsEnabled: false,
    copilotEnabled: false,
    updatedAt: new Date('2026-11-27T00:00:00.000Z'),
    async save() {
      this.updatedAt = new Date();
      return this;
    },
  };
  platformWaDoc = { sessionId: 'platform', phone: '201099998888', connected: true };

  User.findById = (id) => ({
    select: () => ({
      lean: async () => usersById.get(String(id)) || null,
    }),
  });

  User.findByIdAndUpdate = (id, update) => {
    lastUserUpdate = { id: String(id), update };
    const existing = usersById.get(String(id));
    if (existing && update?.$set) {
      applyDotSet(existing, update.$set);
    }
    return {
      select: () => ({
        lean: async () => existing || null,
      }),
    };
  };

  Bot.findOne = (query) => ({
    select: () => ({
      lean: async () => (
        String(query._id) === OWN_BOT_ID && String(query.userId) === MERCHANT_A
          ? { _id: OWN_BOT_ID }
          : null
      ),
    }),
  });

  Store.findOne = (query) => ({
    select: () => ({
      lean: async () => (
        String(query._id) === OWN_STORE_ID && String(query.userId) === MERCHANT_A
          ? { _id: OWN_STORE_ID }
          : null
      ),
    }),
  });

  PlatformSetting.getConfig = async () => platformDoc;

  PlatformWhatsAppSession.findOne = () => ({
    select: () => ({
      lean: async () => platformWaDoc,
    }),
  });

  AssistantActionAudit.find = (filter) => {
    capturedAuditFindFilter = filter;
    return {
      sort: () => ({
        skip: () => ({
          limit: () => ({
            lean: async () => capturedAuditRows,
          }),
        }),
      }),
    };
  };

  AssistantActionAudit.countDocuments = async () => capturedAuditRows.length;

  AuditEvent.create = async (evt) => {
    auditEvents.push(evt);
    return { _id: `admin-audit-${auditEvents.length}`, ...evt };
  };
});

test.afterEach(() => {
  invalidatePlatformSettingsCache();
  User.findById = originals.userFindById;
  User.findByIdAndUpdate = originals.userFindByIdAndUpdate;
  Bot.findOne = originals.botFindOne;
  Store.findOne = originals.storeFindOne;
  PlatformSetting.getConfig = originals.platformGetConfig;
  PlatformWhatsAppSession.findOne = originals.platformWaFindOne;
  AssistantActionAudit.find = originals.assistantAuditFind;
  AssistantActionAudit.countDocuments = originals.assistantAuditCount;
  AuditEvent.create = originals.auditEventCreate;
});

test('all Phase 3 merchant assistant endpoints require authentication', async () => {
  const r1 = await request(app).get('/api/assistant/settings');
  const r2 = await request(app).patch('/api/assistant/settings').send({ writeToolsEnabled: true });
  const r3 = await request(app).post('/api/assistant/whatsapp/link-code');
  const r4 = await request(app).get('/api/assistant/audit');

  assert.equal(r1.status, 401);
  assert.equal(r2.status, 401);
  assert.equal(r3.status, 401);
  assert.equal(r4.status, 401);
});

test('GET /api/assistant/settings returns all-OFF defaults for legacy user docs and reflects platform switches', async () => {
  const token = tokenFor({
    _id: MERCHANT_A,
    username: 'legacy_merchant',
    role: 'user',
    status: 'active',
    sessionVersion: 0,
    // Intentionally omit assistantSettings to simulate pre-Phase-3 prod User doc
  });

  const res = await request(app)
    .get('/api/assistant/settings')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.settings, {
    writeToolsEnabled: false,
    allowedWriteTools: {
      createOrder: false,
      updateInventory: false,
      messageCustomer: false,
    },
    whatsappLinked: false,
    verifiedWhatsappPhoneMasked: '',
    whatsappVerifiedAt: null,
    defaultBotId: null,
    defaultStoreId: null,
    updatedAt: null,
  });
  assert.deepEqual(res.body.platform, {
    assistantWriteToolsEnabled: false,
    copilotEnabled: false,
  });
  assert.equal(res.body.settings.whatsappLinkCodeHash, undefined);
});

test('PATCH /api/assistant/settings updates toggles & owned defaults, enforces ownership, and blocks direct phone binding', async () => {
  const token = tokenFor({
    _id: MERCHANT_A,
    username: 'merchant_a',
    role: 'user',
    status: 'active',
    sessionVersion: 0,
    assistantSettings: {},
  });

  // Forbidden direct phone binding
  const spoofAttempt = await request(app)
    .patch('/api/assistant/settings')
    .set('Authorization', `Bearer ${token}`)
    .send({ verifiedWhatsappPhone: '201012345678' });
  assert.equal(spoofAttempt.status, 400);

  // Invalid boolean rejected
  const badBool = await request(app)
    .patch('/api/assistant/settings')
    .set('Authorization', `Bearer ${token}`)
    .send({ writeToolsEnabled: 'yes' });
  assert.equal(badBool.status, 400);

  // Unknown tool key rejected
  const badTool = await request(app)
    .patch('/api/assistant/settings')
    .set('Authorization', `Bearer ${token}`)
    .send({ allowedWriteTools: { dropDatabase: true } });
  assert.equal(badTool.status, 400);

  // Cross-tenant bot rejected with 404
  const foreignBot = await request(app)
    .patch('/api/assistant/settings')
    .set('Authorization', `Bearer ${token}`)
    .send({ defaultBotId: OTHER_BOT_ID });
  assert.equal(foreignBot.status, 404);

  // Cross-tenant store rejected with 404
  const foreignStore = await request(app)
    .patch('/api/assistant/settings')
    .set('Authorization', `Bearer ${token}`)
    .send({ defaultStoreId: OTHER_STORE_ID });
  assert.equal(foreignStore.status, 404);

  // Valid update succeeds
  const ok = await request(app)
    .patch('/api/assistant/settings')
    .set('Authorization', `Bearer ${token}`)
    .send({
      writeToolsEnabled: true,
      allowedWriteTools: { createOrder: true, updateInventory: false },
      defaultBotId: OWN_BOT_ID,
      defaultStoreId: OWN_STORE_ID,
    });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.success, true);
  assert.equal(ok.body.settings.writeToolsEnabled, true);
  assert.equal(ok.body.settings.allowedWriteTools.createOrder, true);
  assert.equal(ok.body.settings.allowedWriteTools.updateInventory, false);
  assert.equal(ok.body.settings.allowedWriteTools.messageCustomer, false);
  assert.equal(ok.body.settings.defaultBotId, OWN_BOT_ID);
  assert.equal(ok.body.settings.defaultStoreId, OWN_STORE_ID);
});

test('POST /api/assistant/whatsapp/link-code issues LINK-XXXXXX and stores only its SHA-256 hash', async () => {
  const token = tokenFor({
    _id: MERCHANT_A,
    username: 'merchant_a',
    role: 'user',
    status: 'active',
    sessionVersion: 0,
    assistantSettings: {},
  });

  const res = await request(app)
    .post('/api/assistant/whatsapp/link-code')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.match(res.body.code, /^LINK-[A-Z2-9]{6}$/);
  assert.equal(res.body.ttlSeconds, 600);
  assert.equal(res.body.platformWhatsappPhone, '201099998888');
  assert.equal(
    res.body.waMeUrl,
    `https://wa.me/201099998888?text=${encodeURIComponent(res.body.code)}`
  );

  // Stored DB update must contain SHA-256 hash, never plaintext code
  const expectedHash = crypto.createHash('sha256').update(res.body.code).digest('hex');
  assert.equal(lastUserUpdate.id, MERCHANT_A);
  assert.equal(lastUserUpdate.update.$set['assistantSettings.whatsappLinkCodeHash'], expectedHash);
  assert.notEqual(lastUserUpdate.update.$set['assistantSettings.whatsappLinkCodeHash'], res.body.code);
  assert.ok(lastUserUpdate.update.$set['assistantSettings.whatsappLinkExpiresAt'] instanceof Date);
});

test('GET /api/assistant/audit scopes strictly to authenticated merchant and applies whitelisted filters', async () => {
  const tokenB = tokenFor({
    _id: MERCHANT_B,
    username: 'merchant_b',
    role: 'user',
    status: 'active',
    sessionVersion: 0,
  });

  capturedAuditRows = [
    { _id: 'aud-1', merchantUserId: MERCHANT_B, eventType: 'write_tool.executed', outcome: 'success' },
  ];

  const res = await request(app)
    .get('/api/assistant/audit?eventType=write_tool.executed&toolName=update_inventory&outcome=success&limit=10&page=1')
    .set('Authorization', `Bearer ${tokenB}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(String(capturedAuditFindFilter.merchantUserId), MERCHANT_B);
  assert.equal(capturedAuditFindFilter.eventType, 'write_tool.executed');
  assert.equal(capturedAuditFindFilter.toolName, 'update_inventory');
  assert.equal(capturedAuditFindFilter.outcome, 'success');
  assert.equal(res.body.items.length, 1);

  // Unrecognized filter values are ignored
  const resInvalid = await request(app)
    .get('/api/assistant/audit?eventType=bogus&toolName=evil&outcome=nope')
    .set('Authorization', `Bearer ${tokenB}`);
  assert.equal(resInvalid.status, 200);
  assert.equal(capturedAuditFindFilter.eventType, undefined);
  assert.equal(capturedAuditFindFilter.toolName, undefined);
  assert.equal(capturedAuditFindFilter.outcome, undefined);
});

test('Admin /api/admin/platform-settings toggles Phase 3 kill switches, validates booleans, and fails closed on DB error', async () => {
  const adminToken = tokenFor({
    _id: ADMIN_ID,
    username: 'superadmin_1',
    role: 'superadmin',
    status: 'active',
    sessionVersion: 0,
  });

  // Initial GET shows both switches false
  const initial = await request(app)
    .get('/api/admin/platform-settings')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(initial.status, 200);
  assert.equal(initial.body.data.assistantWriteToolsEnabled, false);
  assert.equal(initial.body.data.copilotEnabled, false);

  // Non-boolean values rejected with 400 + Arabic message
  for (const badBody of [
    { assistantWriteToolsEnabled: 'true' },
    { copilotEnabled: 1 },
    { copilotEnabled: null },
  ]) {
    const badRes = await request(app)
      .put('/api/admin/platform-settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(badBody);
    assert.equal(badRes.status, 400);
    assert.equal(badRes.body.error, 'INVALID_BOOLEAN_SETTING');
    assert.match(badRes.body.message, /[\u0600-\u06FF]/);
  }

  // Valid toggle ON
  const enabled = await request(app)
    .put('/api/admin/platform-settings')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ assistantWriteToolsEnabled: true, copilotEnabled: true });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.data.assistantWriteToolsEnabled, true);
  assert.equal(enabled.body.data.copilotEnabled, true);
  assert.equal(await isAssistantWriteToolsEnabled(), true);
  assert.equal(await isCopilotEnabled(), true);
  assert.ok(auditEvents.some((e) => e.eventType === 'admin.write'));

  // Toggle back OFF
  const disabled = await request(app)
    .put('/api/admin/platform-settings')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ assistantWriteToolsEnabled: false, copilotEnabled: false });
  assert.equal(disabled.status, 200);
  assert.equal(await isAssistantWriteToolsEnabled(), false);
  assert.equal(await isCopilotEnabled(), false);

  // Fail closed to false on DB error
  invalidatePlatformSettingsCache();
  PlatformSetting.getConfig = async () => { throw new Error('mongo unreachable'); };
  assert.equal(await isAssistantWriteToolsEnabled(), false);
  assert.equal(await isCopilotEnabled(), false);
});
