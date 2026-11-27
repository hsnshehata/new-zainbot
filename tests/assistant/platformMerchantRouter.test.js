'use strict';

// tests/assistant/platformMerchantRouter.test.js
// Slice 3 end-to-end integration tests (real MongoMemoryServer + Supertest +
// createPlatformWhatsappSession + createPlatformMerchantAssistantRouter):
// - Non-merchant visitor passthrough unchanged to botEngine.processMessage
// - Unverified User.whatsapp gets NO write access and NO merchant data access
// - LINK-XXXXXX binding via dashboard endpoint (valid, one-time reuse, expired,
//   unknown, unique partial index conflict, DELETE unlink) + audit records
// - @lid contact phone resolution + fail-closed when unresolvable
// - Guardrails: platform kill switch, merchant opt-in, per-tool toggle
// - Read-only fallback to assistantService.answer
// - Propose -> "تأكيد" -> execute round trip with deterministic Arabic card & receipt
// - Reject ("لا") -> no mutation + audit
// - Expiry (>5 min) -> blocked with Arabic notice + audit
// - Ambiguous message & wrong action code -> re-prompt, never execute
// - Duplicate messageId -> no double proposal and no double execution (even after restart)
// - Dashboard UI "ربط واتساب بمساعد زين" markup, JS wiring, and bilingual i18n keys.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-that-is-at-least-32-bytes-long';
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
process.env.CHANNELS_MODE = 'on';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../../server/server');
const User = require('../../server/models/User');
const Bot = require('../../server/models/Bot');
const Store = require('../../server/models/Store');
const Product = require('../../server/models/Product');
const PlatformSetting = require('../../server/models/PlatformSetting');
const PlatformWhatsAppSession = require('../../server/models/PlatformWhatsAppSession');
const AssistantPendingAction = require('../../server/models/AssistantPendingAction');
const AssistantActionAudit = require('../../server/models/AssistantActionAudit');
const { signAccessToken } = require('../../server/utils/authTokens');
const { invalidatePlatformSettingsCache } = require('../../server/services/platformSettingsService');
const { createAssistantWriteTools } = require('../../server/services/assistantWriteTools');
const { createAssistantPendingActionService } = require('../../server/services/assistantPendingActionService');
const { createPlatformMerchantAssistantRouter } = require('../../server/services/platformMerchantAssistantRouter');
const { createPlatformWhatsappSession, DEFAULT_PLATFORM_BOT_ID } = require('../../server/services/platformWhatsappSession');

let mongod;

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

const fakeFs = {
  existsSync: () => true,
  mkdirSync() {},
};

class FakeNoAuth {
  constructor() {
    this.client = null;
  }
}

class FakeWaClient extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.info = { me: { user: '201099998888' }, wid: { user: '201099998888' } };
    if (options?.authStrategy) options.authStrategy.client = this;
  }
  async inject() {}
  async initialize() {}
  async destroy() {}
  async logout() {}
}

function flush(ticks = 6) {
  let chain = Promise.resolve();
  for (let i = 0; i < ticks; i += 1) {
    chain = chain.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return chain;
}

function createFakeSessionModel() {
  const docs = new Map();
  return {
    async findOneAndUpdate(filter, update) {
      const key = filter.sessionId || 'platform';
      const existing = docs.get(key) || { sessionId: key, status: 'disconnected', connected: false };
      Object.assign(existing, update.$set || update);
      docs.set(key, existing);
      return existing;
    },
    async findOne(filter) {
      return docs.get(filter.sessionId || 'platform') || null;
    },
    async updateOne() {
      return { modifiedCount: 1 };
    },
  };
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-slice3-test'));
  await User.syncIndexes();
  await AssistantPendingAction.syncIndexes();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function resetDb() {
  invalidatePlatformSettingsCache();
  await Promise.all([
    User.deleteMany({}),
    Bot.deleteMany({}),
    Store.deleteMany({}),
    Product.deleteMany({}),
    PlatformSetting.deleteMany({}),
    PlatformWhatsAppSession.deleteMany({}),
    AssistantPendingAction.deleteMany({}),
    AssistantActionAudit.deleteMany({}),
  ]);
}

async function setPlatformWriteTools(enabled) {
  await PlatformSetting.findOneAndUpdate(
    { key: 'platform_settings' },
    { $set: { assistantWriteToolsEnabled: enabled, updatedAt: new Date() } },
    { upsert: true, new: true }
  );
  invalidatePlatformSettingsCache();
}

async function seedMerchant({
  username,
  email,
  whatsapp = '',
  verifiedWhatsappPhone = '',
  writeToolsEnabled = false,
  allowedWriteTools = { createOrder: false, updateInventory: false, messageCustomer: false },
  stock = 20,
}) {
  const user = await User.create({
    username,
    email,
    role: 'user',
    status: 'active',
    whatsapp,
    assistantSettings: {
      writeToolsEnabled,
      allowedWriteTools,
      verifiedWhatsappPhone,
      whatsappVerifiedAt: verifiedWhatsappPhone ? new Date() : null,
    },
  });

  const bot = await Bot.create({
    name: `بوت ${username}`,
    userId: user._id,
    isActive: true,
  });

  const store = await Store.create({
    userId: user._id,
    botId: bot._id,
    storeName: `متجر ${username}`,
    storeLink: `store-${username}-${Date.now()}`,
    catalogInventoryMode: 'local',
    isActive: true,
  });
  bot.storeId = store._id;
  await bot.save();

  const product = await Product.create({
    storeId: store._id,
    productName: 'تيشيرت أسود',
    price: 250,
    currency: 'EGP',
    stock,
    stockTracked: true,
    isActive: true,
  });

  return { user, bot, store, product };
}

function buildTestHarness({ nowRef = { value: new Date() }, assistantAnswerSpy } = {}) {
  const writeTools = createAssistantWriteTools({
    invalidateStoreCache: () => {},
  });
  const pendingActionService = createAssistantPendingActionService({
    writeTools,
    generateActionCode: () => '4821',
  });
  const assistantCalls = [];
  const assistantService = {
    async answer(params) {
      assistantCalls.push(params);
      if (assistantAnswerSpy) return assistantAnswerSpy(params);
      return {
        answer: 'ملخص مبيعات اليوم: 1500 جنيه من 4 طلبات.',
        usedTools: ['sales_summary'],
        fallback: false,
        language: 'ar',
      };
    },
  };

  const router = createPlatformMerchantAssistantRouter({
    pendingActionService,
    writeTools,
    assistantService,
    extractWriteArgs: null,
    logger: silentLogger,
    now: () => nowRef.value,
  });

  const visitorEngineCalls = [];
  const loggedErrors = [];
  const testLogger = {
    info() {},
    warn() {},
    error(msg, meta) {
      loggedErrors.push({ msg, meta });
    },
  };
  let pendingTask = Promise.resolve();
  const track = (promise) => {
    pendingTask = pendingTask.then(() => promise.catch(() => {}));
    return promise;
  };

  const session = createPlatformWhatsappSession({
    ClientClass: FakeWaClient,
    NoAuthClass: FakeNoAuth,
    SessionModel: createFakeSessionModel(),
    ConversationModel: { async exists() { return false; } },
    getBot: async () => ({ agentTools: { whatsappReactionsTool: { enabled: false } } }),
    handlePlatformMerchantMessage: (payload) => track(router.handleIncomingPlatformMessage(payload)),
    processIncomingMessage: (...args) => track((async () => {
      visitorEngineCalls.push(args);
      return 'أهلاً بيك في زين بوت! إزاي أقدر أساعدك؟';
    })()),
    fsModule: fakeFs,
    logger: testLogger,
    browserlessUrl: '',
    now: () => nowRef.value,
  });

  async function emitAndWait(client, opts) {
    const replies = [];
    let resolveReply;
    const replyDone = new Promise((resolve) => { resolveReply = resolve; });
    const msg = {
      fromMe: false,
      isStatus: false,
      from: opts.from,
      type: opts.type || 'chat',
      body: opts.body,
      id: { _serialized: opts.id },
      reply: async (text) => {
        replies.push(text);
        resolveReply();
      },
    };
    if (opts.getContact) {
      msg.getContact = opts.getContact;
    }
    client.emit('message', msg);
    await flush(6);
    await pendingTask;
    await Promise.race([replyDone, new Promise((resolve) => setTimeout(resolve, 25))]);
    await flush(4);
    assert.deepEqual(loggedErrors, [], `unexpected session/router errors: ${JSON.stringify(loggedErrors)}`);
    return replies;
  }

  return { router, session, visitorEngineCalls, assistantCalls, pendingActionService, writeTools, emitAndWait };
}

test('non-merchant visitor passes through untouched to botEngine.processMessage', async () => {
  await resetDb();
  const { session, visitorEngineCalls, assistantCalls, emitAndWait } = buildTestHarness();
  const client = await session.init();

  const replies = await emitAndWait(client, {
    from: '201112223344@c.us',
    body: 'عايز أعرف تفاصيل باقات زين بوت',
    id: 'visitor-msg-1',
  });

  assert.equal(visitorEngineCalls.length, 1);
  assert.deepEqual(visitorEngineCalls[0], [
    DEFAULT_PLATFORM_BOT_ID,
    '201112223344@c.us',
    'عايز أعرف تفاصيل باقات زين بوت',
    false,
    false,
    'visitor-msg-1',
    'whatsapp',
    null,
  ]);
  assert.equal(assistantCalls.length, 0);
  assert.deepEqual(replies, ['أهلاً بيك في زين بوت! إزاي أقدر أساعدك؟']);

  await session.disconnect();
});

test('unverified User.whatsapp NEVER grants merchant assistant or write-tool access', async () => {
  await resetDb();
  await setPlatformWriteTools(true);
  const { product } = await seedMerchant({
    username: 'unverified_m',
    email: 'unverified@example.com',
    whatsapp: '01012345678',
    verifiedWhatsappPhone: '',
    writeToolsEnabled: true,
    allowedWriteTools: { createOrder: true, updateInventory: true, messageCustomer: true },
    stock: 20,
  });

  const { session, visitorEngineCalls, assistantCalls, emitAndWait } = buildTestHarness();
  const client = await session.init();

  const replies = await emitAndWait(client, {
    from: '201012345678@c.us',
    body: 'عدّل مخزون تيشيرت أسود ل 99',
    id: 'unverified-msg-1',
  });

  assert.equal(visitorEngineCalls.length, 1, 'unverified phone must fall through to visitor flow');
  assert.equal(assistantCalls.length, 0);
  assert.equal(replies[0], 'أهلاً بيك في زين بوت! إزاي أقدر أساعدك؟');
  assert.equal(await AssistantPendingAction.countDocuments({}), 0);
  const freshProduct = await Product.findById(product._id).lean();
  assert.equal(freshProduct.stock, 20);

  await session.disconnect();
});

test('LINK-XXXXXX binds verifiedWhatsappPhone, rejects reuse/expired/unknown/duplicate-phone, and DELETE unlinks with audit', async () => {
  await resetDb();
  await PlatformWhatsAppSession.create({
    sessionId: 'platform',
    status: 'connected',
    connected: true,
    phone: '201099998888',
  });

  const { user: merchantA } = await seedMerchant({
    username: 'link_merchant_a',
    email: 'link_a@example.com',
  });
  const { user: merchantB } = await seedMerchant({
    username: 'link_merchant_b',
    email: 'link_b@example.com',
  });

  const tokenA = signAccessToken(merchantA);
  const tokenB = signAccessToken(merchantB);

  // 1. Issue code for Merchant A via dashboard HTTP endpoint
  const codeResA = await request(app)
    .post('/api/assistant/whatsapp/link-code')
    .set('Authorization', `Bearer ${tokenA}`);
  assert.equal(codeResA.status, 201);
  assert.match(codeResA.body.code, /^LINK-[A-Z2-9]{6}$/);

  const nowRef = { value: new Date() };
  const { session, visitorEngineCalls, emitAndWait } = buildTestHarness({ nowRef });
  const client = await session.init();

  // 2. Unknown code rejected
  const unknownReplies = await emitAndWait(client, {
    from: '201055551111@c.us',
    body: 'LINK-ZZZZZZ',
    id: 'link-unknown-1',
  });
  assert.equal(visitorEngineCalls.length, 0);
  assert.match(unknownReplies[0], /غير صالح/);

  // 3. Valid code binds Merchant A
  const bindReplies = await emitAndWait(client, {
    from: '201055551111@c.us',
    body: codeResA.body.code,
    id: 'link-valid-a-1',
  });
  assert.equal(visitorEngineCalls.length, 0);
  assert.match(bindReplies[0], /تم ربط رقمك/);
  assert.match(bindReplies[0], /\*{8}1111/);
  assert.match(bindReplies[0], /مغلقة افتراضيًا/);

  const updatedA = await User.findById(merchantA._id)
    .select('+assistantSettings.whatsappLinkCodeHash +assistantSettings.whatsappLinkExpiresAt')
    .lean();
  assert.equal(updatedA.assistantSettings.verifiedWhatsappPhone, '201055551111');
  assert.equal(updatedA.assistantSettings.whatsappLinkCodeHash, '');
  assert.equal(updatedA.assistantSettings.whatsappLinkExpiresAt, null);

  // 4. Re-sending the already-used code with a new messageId is rejected (one-time code)
  const reuseReplies = await emitAndWait(client, {
    from: '201055551111@c.us',
    body: codeResA.body.code,
    id: 'link-reuse-a-2',
  });
  assert.match(reuseReplies[0], /غير صالح|تم استخدامه/);

  // 5. Merchant B issues a code and attempts to bind Merchant A's already-bound phone -> rejected (unique index)
  const codeResB = await request(app)
    .post('/api/assistant/whatsapp/link-code')
    .set('Authorization', `Bearer ${tokenB}`);
  assert.equal(codeResB.status, 201);

  const conflictReplies = await emitAndWait(client, {
    from: '201055551111@c.us',
    body: codeResB.body.code,
    id: 'link-conflict-b-1',
  });
  assert.match(conflictReplies[0], /مربوط بالفعل بحساب تاجر آخر/);

  const freshB = await User.findById(merchantB._id).lean();
  assert.equal(freshB.assistantSettings.verifiedWhatsappPhone, '');

  // 6. Expired code rejected
  nowRef.value = new Date(Date.now() + 15 * 60 * 1000);
  const expiredReplies = await emitAndWait(client, {
    from: '201066662222@c.us',
    body: codeResB.body.code,
    id: 'link-expired-b-2',
  });
  assert.match(expiredReplies[0], /انتهت صلاحية رمز الربط/);
  const freshBAfterExpiry = await User.findById(merchantB._id).lean();
  assert.equal(freshBAfterExpiry.assistantSettings.verifiedWhatsappPhone, '');

  // 7. Dashboard DELETE /api/assistant/whatsapp/link unlinks Merchant A
  const unlinkRes = await request(app)
    .delete('/api/assistant/whatsapp/link')
    .set('Authorization', `Bearer ${tokenA}`);
  assert.equal(unlinkRes.status, 200);
  assert.equal(unlinkRes.body.success, true);
  assert.equal(unlinkRes.body.settings.whatsappLinked, false);
  assert.equal(unlinkRes.body.settings.verifiedWhatsappPhoneMasked, '');

  // Verify audit trail recorded code_issued, bound, rejected (conflict + expired), and unlinked
  const auditsA = await AssistantActionAudit.find({ merchantUserId: merchantA._id }).lean();
  const eventsA = auditsA.map((a) => a.eventType);
  assert.ok(eventsA.includes('whatsapp_link.code_issued'), 'expected code_issued audit');
  assert.ok(eventsA.includes('whatsapp_link.bound'), 'expected bound audit');
  assert.ok(eventsA.includes('whatsapp_link.unlinked'), 'expected unlinked audit');

  const auditsB = await AssistantActionAudit.find({ merchantUserId: merchantB._id }).lean();
  const rejectedB = auditsB.filter((a) => a.eventType === 'whatsapp_link.rejected');
  assert.ok(rejectedB.some((a) => a.errorCode === 'PHONE_ALREADY_LINKED'));
  assert.ok(rejectedB.some((a) => a.errorCode === 'LINK_CODE_EXPIRED'));

  await session.disconnect();
});

test('@lid JID resolves phone via message.getContact().number and fails closed when unresolvable', async () => {
  await resetDb();
  const { user } = await seedMerchant({
    username: 'lid_merchant',
    email: 'lid@example.com',
    verifiedWhatsappPhone: '201077773333',
  });
  const token = signAccessToken(user);

  const { session, visitorEngineCalls, assistantCalls, emitAndWait } = buildTestHarness();
  const client = await session.init();

  // Resolvable @lid -> routed to merchant assistant read-only answer
  const resolvedReplies = await emitAndWait(client, {
    from: '198765432109876@lid',
    body: 'كام مبيعات النهارده؟',
    id: 'lid-ok-1',
    getContact: async () => ({
      number: '201077773333',
      id: { user: '201077773333', server: 'c.us' },
    }),
  });
  assert.equal(visitorEngineCalls.length, 0);
  assert.equal(assistantCalls.length, 1);
  assert.equal(String(assistantCalls[0].userId), String(user._id));
  assert.match(resolvedReplies[0], /1500 جنيه/);

  // Unresolvable @lid (server still 'lid') -> fails closed to visitor flow
  const failClosedReplies = await emitAndWait(client, {
    from: '198765432109876@lid',
    body: 'عدّل مخزون تيشيرت أسود ل 10',
    id: 'lid-fail-1',
    getContact: async () => ({
      number: '198765432109876',
      id: { user: '198765432109876', server: 'lid' },
    }),
  });
  assert.equal(visitorEngineCalls.length, 1, 'unresolvable @lid must fail closed to visitor flow');
  assert.equal(assistantCalls.length, 1);
  assert.equal(failClosedReplies[0], 'أهلاً بيك في زين بوت! إزاي أقدر أساعدك؟');

  // Unresolvable @lid trying to bind a LINK-XXXXXX code -> fails closed, does NOT bind
  const codeRes = await request(app)
    .post('/api/assistant/whatsapp/link-code')
    .set('Authorization', `Bearer ${token}`);
  const lidLinkReplies = await emitAndWait(client, {
    from: '999888777666555@lid',
    body: codeRes.body.code,
    id: 'lid-link-fail-1',
    getContact: async () => { throw new Error('contact fetch failed'); },
  });
  assert.equal(visitorEngineCalls.length, 1);
  assert.match(lidLinkReplies[0], /تعذّر التحقق من رقم هاتفك/);

  await session.disconnect();
});

test('propose -> "تأكيد" -> execute round trip, plus default-off guardrail enforcement', async () => {
  await resetDb();
  // Platform switch starts OFF
  await setPlatformWriteTools(false);

  const { user, product } = await seedMerchant({
    username: 'roundtrip_m',
    email: 'rt@example.com',
    verifiedWhatsappPhone: '201088884444',
    writeToolsEnabled: true,
    allowedWriteTools: { createOrder: false, updateInventory: true, messageCustomer: false },
    stock: 20,
  });

  const { session, visitorEngineCalls, emitAndWait } = buildTestHarness();
  const client = await session.init();

  // 1. Platform kill switch OFF -> denied & audited, no mutation
  const deniedReplies = await emitAndWait(client, {
    from: '201088884444@c.us',
    body: 'عدّل مخزون تيشيرت أسود ل 35',
    id: 'rt-denied-1',
  });
  assert.equal(visitorEngineCalls.length, 0);
  assert.match(deniedReplies[0], /غير مفعّلة/);
  assert.equal((await Product.findById(product._id).lean()).stock, 20);

  // 2. Flip platform kill switch ON -> propose creates deterministic Arabic card, stock still 20
  await setPlatformWriteTools(true);
  const propReplies = await emitAndWait(client, {
    from: '201088884444@c.us',
    body: 'عدّل مخزون تيشيرت أسود ل 35',
    id: 'rt-prop-1',
  });
  assert.match(propReplies[0], /تأكيد تعديل المخزون/);
  assert.match(propReplies[0], /#4821/);
  assert.match(propReplies[0], /المخزون الحالي: 20/);
  assert.match(propReplies[0], /المخزون بعد التعديل: 35/);
  assert.equal((await Product.findById(product._id).lean()).stock, 20, 'must NOT mutate before confirm');

  // 3. Strict Arabic confirmation "تأكيد" executes and replies with receipt
  const execReplies = await emitAndWait(client, {
    from: '201088884444@c.us',
    body: 'تأكيد',
    id: 'rt-confirm-1',
  });
  assert.match(execReplies[0], /تم تحديث المخزون بنجاح/);
  assert.match(execReplies[0], /المخزون السابق: 20/);
  assert.match(execReplies[0], /المخزون الجديد: 35/);

  const updatedProduct = await Product.findById(product._id).lean();
  assert.equal(updatedProduct.stock, 35);

  const audits = await AssistantActionAudit.find({ merchantUserId: user._id }).sort({ createdAt: 1 }).lean();
  assert.deepEqual(
    audits.map((a) => a.eventType),
    ['write_tool.denied_disabled', 'write_tool.proposed', 'write_tool.executed']
  );
  assert.equal(audits[2].beforeState.stock, 20);
  assert.equal(audits[2].afterState.stock, 35);

  await session.disconnect();
});

test('reject ("لا"), expiry (>5m), and ambiguous/wrong-code re-prompt never execute', async () => {
  await resetDb();
  await setPlatformWriteTools(true);

  const { product } = await seedMerchant({
    username: 'states_m',
    email: 'states@example.com',
    verifiedWhatsappPhone: '201099991111',
    writeToolsEnabled: true,
    allowedWriteTools: { createOrder: false, updateInventory: true, messageCustomer: false },
    stock: 20,
  });

  const nowRef = { value: new Date('2026-11-27T10:00:00.000Z') };
  const { session, emitAndWait } = buildTestHarness({ nowRef });
  const client = await session.init();

  // --- Reject flow ---
  await emitAndWait(client, {
    from: '201099991111@c.us',
    body: 'عدّل مخزون تيشيرت أسود ل 50',
    id: 'st-prop-reject',
  });
  const rejectReplies = await emitAndWait(client, {
    from: '201099991111@c.us',
    body: 'لا',
    id: 'st-reject-1',
  });
  assert.match(rejectReplies[0], /تم إلغاء الإجراء/);
  assert.equal((await Product.findById(product._id).lean()).stock, 20);

  // --- Ambiguous + wrong-code flow ---
  await emitAndWait(client, {
    from: '201099991111@c.us',
    body: 'عدّل مخزون تيشيرت أسود ل 40',
    id: 'st-prop-ambig',
  });
  const ambigReplies = await emitAndWait(client, {
    from: '201099991111@c.us',
    body: 'نعم بس استنى شوية',
    id: 'st-ambig-1',
  });
  assert.match(ambigReplies[0], /يوجد إجراء معلّق/);
  assert.match(ambigReplies[0], /لم يتم تنفيذه أو إلغاؤه/);
  assert.equal((await Product.findById(product._id).lean()).stock, 20);

  const wrongCodeReplies = await emitAndWait(client, {
    from: '201099991111@c.us',
    body: 'تأكيد #9999',
    id: 'st-wrongcode-1',
  });
  assert.match(wrongCodeReplies[0], /رمز التأكيد غير مطابق/);
  assert.equal((await Product.findById(product._id).lean()).stock, 20);

  // Still pending — advance clock past 5 minutes -> late "تأكيد" blocked!
  nowRef.value = new Date('2026-11-27T10:06:00.000Z');
  const expiredConfirmReplies = await emitAndWait(client, {
    from: '201099991111@c.us',
    body: 'تأكيد',
    id: 'st-expired-confirm',
  });
  assert.match(expiredConfirmReplies[0], /انتهت صلاحية الإجراء المقترح/);
  assert.equal((await Product.findById(product._id).lean()).stock, 20);

  const expiredAudits = await AssistantActionAudit.find({ eventType: 'write_tool.expired' }).lean();
  assert.equal(expiredAudits.length, 1);

  await session.disconnect();
});

test('duplicate messageId never double-proposes or double-executes (in-memory and across router restart)', async () => {
  await resetDb();
  await setPlatformWriteTools(true);

  const { product } = await seedMerchant({
    username: 'dedup_m',
    email: 'dedup@example.com',
    verifiedWhatsappPhone: '201044445555',
    writeToolsEnabled: true,
    allowedWriteTools: { createOrder: false, updateInventory: true, messageCustomer: false },
    stock: 20,
  });

  const { router: router1, pendingActionService, writeTools } = buildTestHarness();

  // 1. Replay same proposal messageId twice -> only ONE pending action created
  const propMsg = { from: '201044445555@c.us', body: 'زود 5 قطع من مخزون تيشيرت أسود', id: { _serialized: 'dup-prop-1' } };
  const p1 = await router1.handleIncomingPlatformMessage({ message: propMsg, messageText: propMsg.body, messageId: 'dup-prop-1' });
  const p2 = await router1.handleIncomingPlatformMessage({ message: propMsg, messageText: propMsg.body, messageId: 'dup-prop-1' });
  assert.equal(p1.reason, 'action_proposed');
  assert.equal(p2.duplicate, true);
  assert.equal(p2.reply, null);
  assert.equal(await AssistantPendingAction.countDocuments({}), 1);

  // 2. Confirm with messageId 'dup-confirm-1' -> stock increments ONCE (20 -> 25)
  const confirmMsg = { from: '201044445555@c.us', body: 'تأكيد', id: { _serialized: 'dup-confirm-1' } };
  const c1 = await router1.handleIncomingPlatformMessage({ message: confirmMsg, messageText: 'تأكيد', messageId: 'dup-confirm-1' });
  assert.equal(c1.reason, 'action_executed');
  assert.equal((await Product.findById(product._id).lean()).stock, 25);

  // 3. Replay exact same confirmation messageId in-memory AND on a brand-new router instance (simulating process restart!)
  const c2 = await router1.handleIncomingPlatformMessage({ message: confirmMsg, messageText: 'تأكيد', messageId: 'dup-confirm-1' });
  assert.equal(c2.duplicate, true);
  assert.equal(c2.reply, null);

  const routerAfterRestart = createPlatformMerchantAssistantRouter({
    pendingActionService,
    writeTools,
    assistantService: { async answer() { throw new Error('must not fall through on replayed messageId'); } },
    extractWriteArgs: null,
    logger: silentLogger,
  });
  const c3 = await routerAfterRestart.handleIncomingPlatformMessage({ message: confirmMsg, messageText: 'تأكيد', messageId: 'dup-confirm-1' });
  assert.equal(c3.duplicate, true);
  assert.equal(c3.reply, null);

  // Replay proposal messageId after restart -> still suppressed by persistent DB check
  const p3 = await routerAfterRestart.handleIncomingPlatformMessage({ message: propMsg, messageText: propMsg.body, messageId: 'dup-prop-1' });
  assert.equal(p3.duplicate, true);
  assert.equal(p3.reply, null);

  assert.equal((await Product.findById(product._id).lean()).stock, 25, 'stock must only increment once');
  assert.equal(await AssistantPendingAction.countDocuments({}), 1);
});

test('Dashboard UI includes "ربط واتساب بمساعد زين" section, unlink button, and bilingual translations', () => {
  const workspace = path.resolve(__dirname, '..', '..');
  const html = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
  const assistantJs = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard-assistant.js'), 'utf8');
  const dashboardJs = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');

  assert.match(html, /id="assistantWhatsappLinkCard"/);
  assert.match(html, /id="assistantWaGenerateCodeBtn"/);
  assert.match(html, /id="assistantWaUnlinkBtn"/);
  assert.match(html, /id="assistantWaCodeBox"/);
  assert.match(html, /id="assistantWaLinkedPhone"/);
  assert.match(html, /data-i18n="assistant_wa_link_title"/);

  assert.match(assistantJs, /\/api\/assistant\/settings/);
  assert.match(assistantJs, /\/api\/assistant\/whatsapp\/link-code/);
  assert.match(assistantJs, /\/api\/assistant\/whatsapp\/link/);

  assert.match(dashboardJs, /assistant_wa_link_title:\s*'ربط واتساب بمساعد زين'/);
  assert.match(dashboardJs, /assistant_wa_link_title:\s*'Link WhatsApp to Zain Assistant'/);
});
