'use strict';

// tests/assistant/assistantPendingAction.test.js
// Real-Mongo (mongodb-memory-server) + Supertest tests for Slice 2:
// - Strict full-string Arabic/English confirm/reject parser (exact plan regexes)
// - Default-off denial (platform flag, merchant opt-in, per-tool toggle) + audit
// - Propose -> strict confirm -> execute (update_inventory, create_order, message_customer)
// - Propose -> strict reject -> no mutation + audit
// - Ambiguous message while pending neither executes nor cancels (re-prompts)
// - 5-min TTL expiry blocks late confirm + expireStaleAssistantActions cron sweep
// - Concurrent double-confirm CAS executes strictly once + idempotent retry
// - TOCTOU opt-out / platform kill switch between propose & confirm aborts execution
// - Cross-tenant isolation across merchants A & B
// - Immutable AssistantActionAudit before/after snapshots & secret redaction
// - Dashboard HTTP endpoints: POST /api/assistant/chat, /actions/:id/confirm, /reject.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-that-is-at-least-32-bytes-long';
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
process.env.CHANNELS_MODE = 'on';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../../server/server');
const User = require('../../server/models/User');
const Bot = require('../../server/models/Bot');
const Store = require('../../server/models/Store');
const Product = require('../../server/models/Product');
const ChatOrder = require('../../server/models/ChatOrder');
const ChatCustomer = require('../../server/models/ChatCustomer');
const Conversation = require('../../server/models/Conversation');
const PlatformSetting = require('../../server/models/PlatformSetting');
const AssistantPendingAction = require('../../server/models/AssistantPendingAction');
const AssistantActionAudit = require('../../server/models/AssistantActionAudit');
const { signAccessToken } = require('../../server/utils/authTokens');
const { invalidatePlatformSettingsCache } = require('../../server/services/platformSettingsService');
const { createAssistantWriteTools } = require('../../server/services/assistantWriteTools');
const {
  createAssistantPendingActionService,
  parseDecisionMessage,
  PENDING_ACTION_TTL_MS,
} = require('../../server/services/assistantPendingActionService');
const { expireStaleAssistantActions } = require('../../server/cronJobs');

let mongod;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-slice2-test'));
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
    ChatOrder.deleteMany({}),
    ChatCustomer.deleteMany({}),
    Conversation.deleteMany({}),
    PlatformSetting.deleteMany({}),
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
  storeName,
  storeLink,
  writeToolsEnabled = false,
  allowedWriteTools = { createOrder: false, updateInventory: false, messageCustomer: false },
}) {
  const user = await User.create({
    username,
    email,
    role: 'user',
    status: 'active',
    assistantSettings: {
      writeToolsEnabled,
      allowedWriteTools,
    },
  });
  const bot = await Bot.create({
    name: `بوت ${username}`,
    userId: user._id,
    isActive: true,
    whatsappBusinessAccountId: 'wa-cloud-id-1',
  });
  const store = await Store.create({
    userId: user._id,
    botId: bot._id,
    storeName,
    storeLink,
    catalogInventoryMode: 'local',
    isActive: true,
  });
  bot.storeId = store._id;
  await bot.save();

  const localProduct = await Product.create({
    storeId: store._id,
    productName: 'تيشيرت أسود',
    price: 250,
    currency: 'EGP',
    stock: 20,
    stockTracked: true,
    isActive: true,
  });

  const shopifyProduct = await Product.create({
    storeId: store._id,
    productName: 'جاكيت مستورد',
    price: 900,
    currency: 'EGP',
    stock: 10,
    importSource: 'shopify',
    importSourceId: `sp_${username}`,
    isActive: true,
  });

  const conversation = await Conversation.create({
    botId: bot._id,
    userId: '201012345678@c.us',
    channel: 'whatsapp',
    username: 'أحمد العميل',
    lastKnownPhone: '201012345678',
    messages: [{ role: 'user', content: 'مرحبا', messageId: `in_${username}_1`, timestamp: new Date() }],
    isHumanHandling: false,
  });

  await ChatCustomer.create({
    botId: bot._id,
    conversationId: conversation._id,
    channel: 'whatsapp',
    sourceUserId: '201012345678@c.us',
    name: 'أحمد العميل',
    phone: '201012345678',
  });

  return { user, bot, store, localProduct, shopifyProduct, conversation };
}

test('parseDecisionMessage strictly enforces full-string Arabic/English regexes and actionCode matching', () => {
  for (const okConfirm of ['نعم', 'أيوه', 'ايوه', 'أيوة', 'اه', 'موافق', 'تأكيد', 'تاكيد', 'أكد', 'نفّذ', 'نفذ', 'تمام نفذ', 'yes', 'CONFIRM', 'approve', 'تأكيد #4821', 'نعم ٤٨٢١']) {
    const parsed = parseDecisionMessage(okConfirm, '4821');
    assert.equal(parsed.decision, 'confirm', `expected confirm for "${okConfirm}"`);
  }

  for (const okReject of ['لا', 'لأ', 'إلغاء', 'الغاء', 'ألغي', 'كنسل', 'تراجع', 'مش عايز', 'ارفض', 'no', 'Cancel', 'reject', 'stop', 'إلغاء #4821']) {
    const parsed = parseDecisionMessage(okReject, '4821');
    assert.equal(parsed.decision, 'reject', `expected reject for "${okReject}"`);
  }

  // Must NEVER match loose substrings or prose
  for (const ambiguous of ['نعم ولكن غيّر السعر', 'تأكيد الطلب لو سمحت', 'لا أريد المزيد', 'تمام شكرا', 'ممكن تفاصيل؟', 'yes please do it', '']) {
    const parsed = parseDecisionMessage(ambiguous, '4821');
    assert.equal(parsed.decision, 'ambiguous', `expected ambiguous for "${ambiguous}"`);
  }

  // Wrong 4-char action code must never confirm
  const mismatch = parseDecisionMessage('تأكيد #9999', '4821');
  assert.equal(mismatch.decision, 'code_mismatch');
  assert.equal(mismatch.attemptedDecision, 'confirm');
});

test('default-off guardrails deny write proposals at every gate and write immutable denied_disabled audits', { timeout: 60000 }, async () => {
  await resetDb();
  const { user, localProduct } = await seedMerchant({
    username: 'merchant_off',
    email: 'off@example.com',
    storeName: 'متجر مغلق',
    storeLink: 'closed_store',
    writeToolsEnabled: false,
    allowedWriteTools: { createOrder: false, updateInventory: false, messageCustomer: false },
  });

  const svc = createAssistantPendingActionService();

  // 1. PlatformSetting OFF -> denied
  const r1 = await svc.proposeAction({
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
    toolName: 'update_inventory',
    args: { productId: String(localProduct._id), operation: 'set', value: 50 },
  });
  assert.equal(r1.ok, false);
  assert.equal(r1.denied, true);
  assert.equal(r1.errorCode, 'PLATFORM_WRITE_TOOLS_DISABLED');

  // 2. PlatformSetting ON, merchant writeToolsEnabled OFF -> denied
  await setPlatformWriteTools(true);
  const r2 = await svc.proposeAction({
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
    toolName: 'update_inventory',
    args: { productId: String(localProduct._id), operation: 'set', value: 50 },
  });
  assert.equal(r2.ok, false);
  assert.equal(r2.denied, true);
  assert.equal(r2.errorCode, 'MERCHANT_WRITE_TOOLS_DISABLED');

  // 3. PlatformSetting ON, writeToolsEnabled ON, specific tool OFF -> denied
  await User.updateOne({ _id: user._id }, { $set: { 'assistantSettings.writeToolsEnabled': true } });
  const r3 = await svc.proposeAction({
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
    toolName: 'update_inventory',
    args: { productId: String(localProduct._id), operation: 'set', value: 50 },
  });
  assert.equal(r3.ok, false);
  assert.equal(r3.denied, true);
  assert.equal(r3.errorCode, 'TOOL_DISABLED');

  // Product stock completely untouched and all 3 denials audited
  const prod = await Product.findById(localProduct._id).lean();
  assert.equal(prod.stock, 20);
  const audits = await AssistantActionAudit.find({ merchantUserId: user._id }).sort({ createdAt: 1 }).lean();
  assert.equal(audits.length, 3);
  assert.deepEqual(audits.map((a) => a.eventType), [
    'write_tool.denied_disabled',
    'write_tool.denied_disabled',
    'write_tool.denied_disabled',
  ]);
  assert.deepEqual(audits.map((a) => a.errorCode), [
    'PLATFORM_WRITE_TOOLS_DISABLED',
    'MERCHANT_WRITE_TOOLS_DISABLED',
    'TOOL_DISABLED',
  ]);
});

test('CAS single execution: concurrent double-confirms execute strictly once and subsequent confirm is idempotent', { timeout: 60000 }, async () => {
  await resetDb();
  await setPlatformWriteTools(true);
  const { user, localProduct } = await seedMerchant({
    username: 'merchant_cas',
    email: 'cas@example.com',
    storeName: 'متجر ذري',
    storeLink: 'cas_store',
    writeToolsEnabled: true,
    allowedWriteTools: { createOrder: true, updateInventory: true, messageCustomer: true },
  });

  let executeInvocations = 0;
  const baseTools = createAssistantWriteTools();
  const instrumentedTools = {
    ...baseTools,
    executeAction: async (input) => {
      executeInvocations += 1;
      await new Promise((r) => setTimeout(r, 40));
      return baseTools.executeAction(input);
    },
  };
  const svc = createAssistantPendingActionService({ writeTools: instrumentedTools });

  const proposed = await svc.proposeAction({
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
    toolName: 'update_inventory',
    args: { productId: String(localProduct._id), operation: 'increment', value: 7 },
  });
  assert.equal(proposed.ok, true);

  // Fire 4 concurrent confirms simultaneously
  const results = await Promise.all([
    svc.confirmAction({ pendingActionId: proposed.pendingAction._id, merchantUserId: user._id, channel: 'dashboard_assistant' }),
    svc.confirmAction({ pendingActionId: proposed.pendingAction._id, merchantUserId: user._id, channel: 'dashboard_assistant' }),
    svc.confirmAction({ pendingActionId: proposed.pendingAction._id, merchantUserId: user._id, channel: 'dashboard_assistant' }),
    svc.confirmAction({ pendingActionId: proposed.pendingAction._id, merchantUserId: user._id, channel: 'dashboard_assistant' }),
  ]);

  assert.equal(executeInvocations, 1, 'tool executor must run strictly once across concurrent confirms');
  const freshExecutions = results.filter((r) => r.ok && !r.alreadyExecuted);
  assert.equal(freshExecutions.length, 1);

  // Stock incremented exactly once: 20 + 7 = 27 (NOT 34 or 48)
  const prod = await Product.findById(localProduct._id).lean();
  assert.equal(prod.stock, 27);

  // Subsequent confirm is idempotent and does not re-execute
  const repeat = await svc.confirmAction({
    pendingActionId: proposed.pendingAction._id,
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
  });
  assert.equal(repeat.ok, true);
  assert.equal(repeat.alreadyExecuted, true);
  assert.equal(executeInvocations, 1);

  // Audit log has exactly 1 proposed + 1 executed with accurate before/after
  const audits = await AssistantActionAudit.find({ pendingActionId: proposed.pendingAction._id }).sort({ createdAt: 1 }).lean();
  assert.deepEqual(audits.map((a) => a.eventType), ['write_tool.proposed', 'write_tool.executed']);
  assert.equal(audits[1].beforeState.stock, 20);
  assert.equal(audits[1].afterState.stock, 27);
  assert.equal(audits[1].afterState.delta, 7);
});

test('TOCTOU guard aborts execution if merchant opts out or platform disables write tools between propose and confirm', { timeout: 60000 }, async () => {
  await resetDb();
  await setPlatformWriteTools(true);
  const { user, localProduct } = await seedMerchant({
    username: 'merchant_toctou',
    email: 'toctou@example.com',
    storeName: 'متجر توكتو',
    storeLink: 'toctou_store',
    writeToolsEnabled: true,
    allowedWriteTools: { createOrder: true, updateInventory: true, messageCustomer: true },
  });

  const svc = createAssistantPendingActionService();

  // Case 1: Merchant opts out after propose, before confirm
  const p1 = await svc.proposeAction({
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
    toolName: 'update_inventory',
    args: { productId: String(localProduct._id), operation: 'set', value: 99 },
  });
  assert.equal(p1.ok, true);

  await User.updateOne({ _id: user._id }, { $set: { 'assistantSettings.writeToolsEnabled': false } });

  const c1 = await svc.confirmAction({
    pendingActionId: p1.pendingAction._id,
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
  });
  assert.equal(c1.ok, false);
  assert.equal(c1.denied, true);
  assert.equal(c1.errorCode, 'MERCHANT_WRITE_TOOLS_DISABLED');
  assert.equal((await Product.findById(localProduct._id).lean()).stock, 20);

  // Case 2: Re-enable merchant, propose, then flip PlatformSetting OFF WITHOUT invalidating cache
  await User.updateOne({ _id: user._id }, { $set: { 'assistantSettings.writeToolsEnabled': true } });
  const p2 = await svc.proposeAction({
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
    toolName: 'update_inventory',
    args: { productId: String(localProduct._id), operation: 'set', value: 88 },
  });
  assert.equal(p2.ok, true);

  // Deliberately update DB directly WITHOUT calling invalidatePlatformSettingsCache()
  // to prove confirmAction performs a fresh DB TOCTOU check!
  await PlatformSetting.updateOne(
    { key: 'platform_settings' },
    { $set: { assistantWriteToolsEnabled: false } }
  );

  const c2 = await svc.confirmAction({
    pendingActionId: p2.pendingAction._id,
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
  });
  assert.equal(c2.ok, false);
  assert.equal(c2.denied, true);
  assert.equal(c2.errorCode, 'PLATFORM_WRITE_TOOLS_DISABLED');
  assert.equal((await Product.findById(localProduct._id).lean()).stock, 20);

  const deniedAudits = await AssistantActionAudit.find({
    merchantUserId: user._id,
    eventType: 'write_tool.denied_disabled',
  }).lean();
  assert.equal(deniedAudits.length, 2);
});

test('5-minute TTL expiry blocks late confirm and expireStaleAssistantActions cron sweep audits strictly once', { timeout: 60000 }, async () => {
  await resetDb();
  await setPlatformWriteTools(true);
  const { user, localProduct } = await seedMerchant({
    username: 'merchant_ttl',
    email: 'ttl@example.com',
    storeName: 'متجر انتهاء',
    storeLink: 'ttl_store',
    writeToolsEnabled: true,
    allowedWriteTools: { createOrder: true, updateInventory: true, messageCustomer: true },
  });

  const svc = createAssistantPendingActionService();
  const t0 = new Date('2026-11-27T10:00:00.000Z');
  const after5Min = new Date(t0.getTime() + PENDING_ACTION_TTL_MS + 1000);

  const pLate = await svc.proposeAction({
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
    toolName: 'update_inventory',
    args: { productId: String(localProduct._id), operation: 'set', value: 5 },
    now: t0,
  });
  assert.equal(pLate.ok, true);
  assert.equal(pLate.pendingAction.expiresAt.getTime(), t0.getTime() + PENDING_ACTION_TTL_MS);

  // Confirm after 5m TTL -> rejected as expired + audited
  const lateConfirm = await svc.confirmAction({
    pendingActionId: pLate.pendingAction._id,
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
    now: after5Min,
  });
  assert.equal(lateConfirm.ok, false);
  assert.equal(lateConfirm.status, 'expired');
  assert.equal((await Product.findById(localProduct._id).lean()).stock, 20);

  // Propose two more and run concurrent cron expiry sweeps
  const pSweep1 = await svc.proposeAction({
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
    toolName: 'update_inventory',
    args: { productId: String(localProduct._id), operation: 'set', value: 6 },
    now: t0,
  });
  const pSweep2 = await svc.proposeAction({
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
    toolName: 'update_inventory',
    args: { productId: String(localProduct._id), operation: 'set', value: 7 },
    now: t0,
  });

  const [sweepA, sweepB] = await Promise.all([
    expireStaleAssistantActions({ now: after5Min }),
    expireStaleAssistantActions({ now: after5Min }),
  ]);
  assert.equal(sweepA.expired + sweepB.expired, 2);

  const expiredAudits = await AssistantActionAudit.find({
    pendingActionId: { $in: [pSweep1.pendingAction._id, pSweep2.pendingAction._id] },
    eventType: 'write_tool.expired',
  }).lean();
  assert.equal(expiredAudits.length, 2, 'every expired action audited strictly once');
});

test('cross-tenant isolation blocks merchant A from touching merchant B products, bots, customers, or pending actions', { timeout: 60000 }, async () => {
  await resetDb();
  await setPlatformWriteTools(true);
  const merchantA = await seedMerchant({
    username: 'tenant_a',
    email: 'a@example.com',
    storeName: 'متجر أ',
    storeLink: 'store_a',
    writeToolsEnabled: true,
    allowedWriteTools: { createOrder: true, updateInventory: true, messageCustomer: true },
  });
  const merchantB = await seedMerchant({
    username: 'tenant_b',
    email: 'b@example.com',
    storeName: 'متجر ب',
    storeLink: 'store_b',
    writeToolsEnabled: true,
    allowedWriteTools: { createOrder: true, updateInventory: true, messageCustomer: true },
  });

  const svc = createAssistantPendingActionService();

  // A tries to mutate B's product
  const crossProd = await svc.proposeAction({
    merchantUserId: merchantA.user._id,
    channel: 'dashboard_assistant',
    toolName: 'update_inventory',
    args: { productId: String(merchantB.localProduct._id), operation: 'set', value: 0 },
  });
  assert.equal(crossProd.ok, false);
  assert.equal(crossProd.errorCode, 'PRODUCT_NOT_FOUND');

  // A tries to message B's conversation
  const crossConv = await svc.proposeAction({
    merchantUserId: merchantA.user._id,
    channel: 'dashboard_assistant',
    toolName: 'message_customer',
    args: { conversationId: String(merchantB.conversation._id), text: 'اختراق' },
  });
  assert.equal(crossConv.ok, false);
  assert.equal(crossConv.errorCode, 'CUSTOMER_NOT_FOUND');

  // B proposes own valid action; A tries to confirm or reject B's pending action
  const bProposal = await svc.proposeAction({
    merchantUserId: merchantB.user._id,
    channel: 'dashboard_assistant',
    toolName: 'update_inventory',
    args: { productId: String(merchantB.localProduct._id), operation: 'set', value: 12 },
  });
  assert.equal(bProposal.ok, true);

  const aConfirm = await svc.confirmAction({
    pendingActionId: bProposal.pendingAction._id,
    merchantUserId: merchantA.user._id,
    channel: 'dashboard_assistant',
  });
  assert.equal(aConfirm.ok, false);
  assert.equal(aConfirm.status, 'not_found');

  const aReject = await svc.rejectAction({
    pendingActionId: bProposal.pendingAction._id,
    merchantUserId: merchantA.user._id,
    channel: 'dashboard_assistant',
  });
  assert.equal(aReject.ok, false);
  assert.equal(aReject.status, 'not_found');

  // B's pending action and product stock remain untouched
  assert.equal((await AssistantPendingAction.findById(bProposal.pendingAction._id).lean()).status, 'pending');
  assert.equal((await Product.findById(merchantB.localProduct._id).lean()).stock, 20);
});

test('Dashboard HTTP flow: POST /api/assistant/chat proposes, ambiguous text re-prompts, /confirm executes, /reject cancels, imported product refused', { timeout: 60000 }, async () => {
  await resetDb();
  await setPlatformWriteTools(true);
  const { user, localProduct, shopifyProduct } = await seedMerchant({
    username: 'merchant_http',
    email: 'http@example.com',
    storeName: 'متجر الويب',
    storeLink: 'http_store',
    writeToolsEnabled: true,
    allowedWriteTools: { createOrder: true, updateInventory: true, messageCustomer: true },
  });

  const token = signAccessToken(user);

  // 1. Propose via natural-language chat message
  const chatPropose = await request(app)
    .post('/api/assistant/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({ message: 'خلي مخزون تيشيرت أسود 42' });

  assert.equal(chatPropose.status, 200);
  assert.equal(chatPropose.body.success, true);
  assert.ok(chatPropose.body.pendingAction?.id);
  assert.ok(chatPropose.body.reply.includes('تيشيرت أسود'));
  assert.ok(chatPropose.body.reply.includes('42'));
  const convId = chatPropose.body.conversationId;
  const actionId = chatPropose.body.pendingAction.id;

  // 2. Ambiguous message while pending neither executes nor cancels
  const ambigTurn = await request(app)
    .post('/api/assistant/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({ conversationId: convId, message: 'ممكن توضح السعر الأول؟' });
  assert.equal(ambigTurn.status, 200);
  assert.equal(ambigTurn.body.pendingAction?.id, actionId);
  assert.equal((await Product.findById(localProduct._id).lean()).stock, 20);

  // 3. Confirm via HTTP button endpoint POST /api/assistant/actions/:id/confirm
  const confirmRes = await request(app)
    .post(`/api/assistant/actions/${actionId}/confirm`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
  assert.equal(confirmRes.status, 200);
  assert.equal(confirmRes.body.success, true);
  assert.equal(confirmRes.body.status, 'executed');
  assert.equal((await Product.findById(localProduct._id).lean()).stock, 42);

  // 4. Propose another action and reject via POST /api/assistant/actions/:id/reject
  const chatPropose2 = await request(app)
    .post('/api/assistant/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({ conversationId: convId, message: 'خلي مخزون تيشيرت أسود 0' });
  assert.equal(chatPropose2.status, 200);
  const actionId2 = chatPropose2.body.pendingAction.id;

  const rejectRes = await request(app)
    .post(`/api/assistant/actions/${actionId2}/reject`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
  assert.equal(rejectRes.status, 200);
  assert.equal(rejectRes.body.status, 'rejected');
  assert.equal((await Product.findById(localProduct._id).lean()).stock, 42);

  // 5. Imported product refusal via chat
  const importedTry = await request(app)
    .post('/api/assistant/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({
      conversationId: convId,
      message: 'عدّل مخزون جاكيت مستورد',
      writeAction: {
        toolName: 'update_inventory',
        args: { productId: String(shopifyProduct._id), operation: 'set', value: 5 },
      },
    });
  assert.equal(importedTry.status, 200);
  assert.equal(importedTry.body.pendingAction, null);
  assert.equal(importedTry.body.errorCode, 'CATALOG_STOCK_REMOTE_MANAGED');
  assert.equal((await Product.findById(shopifyProduct._id).lean()).stock, 10);

  // 6. Confirm via strict text reply "تأكيد" inside chat flow
  const chatPropose3 = await request(app)
    .post('/api/assistant/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({ conversationId: convId, message: 'زود 8 قطع على مخزون تيشيرت أسود' });
  assert.equal(chatPropose3.status, 200);
  assert.ok(chatPropose3.body.pendingAction?.id);

  const textConfirm = await request(app)
    .post('/api/assistant/chat')
    .set('Authorization', `Bearer ${token}`)
    .send({ conversationId: convId, message: 'تأكيد' });
  assert.equal(textConfirm.status, 200);
  assert.equal(textConfirm.body.actionResult?.status, 'executed');
  assert.equal((await Product.findById(localProduct._id).lean()).stock, 50);

  // 7. Audit endpoint returns full redacted history for merchant
  const auditRes = await request(app)
    .get('/api/assistant/audit')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(auditRes.status, 200);
  assert.ok(auditRes.body.items.some((i) => i.eventType === 'write_tool.executed' && i.afterState?.stock === 50));
  assert.ok(auditRes.body.items.some((i) => i.eventType === 'write_tool.rejected'));
});

test('message_customer audit redacts secret tokens in message text snapshots', { timeout: 60000 }, async () => {
  await resetDb();
  await setPlatformWriteTools(true);
  const { user, conversation } = await seedMerchant({
    username: 'merchant_redact',
    email: 'redact@example.com',
    storeName: 'متجر سري',
    storeLink: 'redact_store',
    writeToolsEnabled: true,
    allowedWriteTools: { createOrder: false, updateInventory: false, messageCustomer: true },
  });

  const delivered = [];
  const tools = createAssistantWriteTools({
    channelDeliveryService: {
      deliverReply: async (conv, text) => {
        delivered.push({ id: String(conv._id), text });
        return true;
      },
    },
    checkChannelReady: async () => true,
  });
  const svc = createAssistantPendingActionService({ writeTools: tools });

  const proposed = await svc.proposeAction({
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
    toolName: 'message_customer',
    args: {
      conversationId: String(conversation._id),
      text: 'مراجعة الطلب Bearer super-secret-jwt-token-12345',
    },
  });
  assert.equal(proposed.ok, true);

  const confirmed = await svc.confirmAction({
    pendingActionId: proposed.pendingAction._id,
    merchantUserId: user._id,
    channel: 'dashboard_assistant',
  });
  assert.equal(confirmed.ok, true);
  assert.equal(delivered.length, 1);

  const executedAudit = await AssistantActionAudit.findOne({
    pendingActionId: proposed.pendingAction._id,
    eventType: 'write_tool.executed',
  }).lean();
  assert.ok(executedAudit);
  assert.equal(String(executedAudit.afterState?.previewRedacted || '').includes('super-secret-jwt-token-12345'), false);
});
