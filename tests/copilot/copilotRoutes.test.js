'use strict';

// tests/copilot/copilotRoutes.test.js
// Supertest + mongodb-memory-server integration tests for Copilot routes & cron:
// - Auth required (401 without JWT)
// - GET /api/copilot/drafts lists only pending unexpired drafts owned by merchant
// - Cross-tenant ownership: 404 for another merchant's draft on send/edit-and-send/discard/regenerate
// - POST /api/copilot/drafts/:id/send delivers via channelDeliveryService, keeps isHumanHandling=false, writes audit
// - POST /api/copilot/drafts/:id/edit-and-send records BOTH suggestedReply and editedReply, writes audit
// - POST /api/copilot/drafts/:id/discard never delivers, writes audit
// - Concurrent double-click CAS sends strictly ONCE
// - CHANNELS_MODE=off returns 409 CHANNELS_DISABLED without marking sent
// - POST /api/copilot/drafts/:id/regenerate supersedes old pending draft and creates new one
// - expireStaleCopilotDrafts cron marks stale pending drafts expired & writes audit
// - PUT /api/bots/:id persists replyMode ('auto' | 'copilot' | 'manual')

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-that-is-at-least-32-bytes-long';
process.env.CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || `hex:${'a'.repeat(64)}`;
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
process.env.CHANNELS_MODE = 'on';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');
const axios = require('axios');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../server/models/User');
const Bot = require('../../server/models/Bot');
const Conversation = require('../../server/models/Conversation');
const CopilotDraft = require('../../server/models/CopilotDraft');
const PlatformSetting = require('../../server/models/PlatformSetting');
const AssistantActionAudit = require('../../server/models/AssistantActionAudit');
const { signAccessToken } = require('../../server/utils/authTokens');
const { invalidatePlatformSettingsCache } = require('../../server/services/platformSettingsService');
const aiFailover = require('../../server/services/aiFailover');

// Stub axios.post (used by real channelDeliveryService for Facebook/Instagram)
// and aiFailover.getAiCompletion (used by regenerate) BEFORE loading app
const outboundDeliveries = [];
let deliveryDelayMs = 0;

const originalAxiosPost = axios.post;
axios.post = async (url, body, config) => {
  if (deliveryDelayMs > 0) {
    await new Promise((r) => setTimeout(r, deliveryDelayMs));
  }
  outboundDeliveries.push({ url, body, config });
  return { data: { recipient_id: body?.recipient?.id || 'rcpt', message_id: `mid.${outboundDeliveries.length}` } };
};

const originalGetAiCompletion = aiFailover.getAiCompletion;
let regenReplyText = 'رد جديد مقترح بعد إعادة التوليد — سعر المنتج 250 جنيه.';
aiFailover.getAiCompletion = async () => ({
  choices: [{ message: { content: regenReplyText } }],
});

const app = require('../../server/server');
const { expireStaleCopilotDrafts } = require('../../server/cronJobs');

let mongod;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-slice4-routes-test'));
});

test.after(async () => {
  axios.post = originalAxiosPost;
  aiFailover.getAiCompletion = originalGetAiCompletion;
  process.env.CHANNELS_MODE = 'on';
  await mongoose.disconnect();
  await mongod.stop();
});

async function resetDb() {
  outboundDeliveries.length = 0;
  deliveryDelayMs = 0;
  process.env.CHANNELS_MODE = 'on';
  invalidatePlatformSettingsCache();
  await Promise.all([
    User.deleteMany({}),
    Bot.deleteMany({}),
    Conversation.deleteMany({}),
    CopilotDraft.deleteMany({}),
    PlatformSetting.deleteMany({}),
    AssistantActionAudit.deleteMany({}),
  ]);
}

async function setPlatformCopilot(enabled) {
  await PlatformSetting.findOneAndUpdate(
    { key: 'platform_settings' },
    { $set: { copilotEnabled: enabled } },
    { upsert: true, new: true }
  );
  invalidatePlatformSettingsCache();
}

async function seedMerchantWithDraft({
  username,
  email,
  suggestedReply = 'أهلاً بحضرتك! السعر 250 جنيه والتوصيل خلال 24 ساعة.',
  channel = 'facebook',
  expiresInMs = 60 * 60 * 1000,
  status = 'pending',
}) {
  const user = await User.create({
    username,
    email,
    role: 'user',
    status: 'active',
    sessionVersion: 0,
  });
  const token = signAccessToken(user);

  const bot = await Bot.create({
    name: `${username}_bot`,
    userId: user._id,
    isActive: true,
    replyMode: 'copilot',
    facebookPageId: 'page_12345',
    facebookApiKey: 'test-fb-page-token-xyz',
  });

  const conversation = await Conversation.create({
    botId: bot._id,
    userId: 'facebook_99887766',
    channel,
    username: 'أحمد عميل',
    isHumanHandling: false,
    messages: [
      {
        role: 'user',
        content: 'بكام المنتج ده؟',
        messageId: `in_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date(),
      },
    ],
  });

  const draft = await CopilotDraft.create({
    draftCode: '4821',
    botId: bot._id,
    merchantUserId: user._id,
    conversationId: conversation._id,
    channel,
    customerUserId: conversation.userId,
    customerName: conversation.username,
    triggerMessageId: conversation.messages[0].messageId,
    customerMessageSnippet: 'بكام المنتج ده؟',
    suggestedReply,
    status,
    expiresAt: new Date(Date.now() + expiresInMs),
  });

  return { user, token, bot, conversation, draft };
}

test('unauthenticated requests to /api/copilot/* return 401', async () => {
  await resetDb();
  const fakeId = new mongoose.Types.ObjectId();

  const r1 = await request(app).get('/api/copilot/drafts');
  const r2 = await request(app).post(`/api/copilot/drafts/${fakeId}/send`);
  const r3 = await request(app).post(`/api/copilot/drafts/${fakeId}/edit-and-send`).send({ editedReply: 'hi' });
  const r4 = await request(app).post(`/api/copilot/drafts/${fakeId}/discard`);
  const r5 = await request(app).post(`/api/copilot/drafts/${fakeId}/regenerate`);

  assert.equal(r1.status, 401);
  assert.equal(r2.status, 401);
  assert.equal(r3.status, 401);
  assert.equal(r4.status, 401);
  assert.equal(r5.status, 401);
});

test('GET /api/copilot/drafts lists only pending unexpired drafts owned by merchant, and ownership enforces 404 for another merchant', async () => {
  await resetDb();
  await setPlatformCopilot(true);

  const merchantA = await seedMerchantWithDraft({
    username: 'merchant_a',
    email: 'a@test.local',
    suggestedReply: 'مسودة التاجر أ',
  });
  const merchantB = await seedMerchantWithDraft({
    username: 'merchant_b',
    email: 'b@test.local',
    suggestedReply: 'مسودة التاجر ب',
  });

  // Also add an expired draft for merchant A (must not show up in pending list)
  await CopilotDraft.create({
    draftCode: '1111',
    botId: merchantA.bot._id,
    merchantUserId: merchantA.user._id,
    conversationId: merchantA.conversation._id,
    channel: 'facebook',
    customerUserId: 'facebook_old',
    suggestedReply: 'مسودة منتهية',
    status: 'pending',
    expiresAt: new Date(Date.now() - 60_000),
  });

  const listA = await request(app)
    .get('/api/copilot/drafts')
    .set('Authorization', `Bearer ${merchantA.token}`);
  assert.equal(listA.status, 200);
  assert.equal(listA.body.success, true);
  assert.equal(listA.body.drafts.length, 1);
  assert.equal(String(listA.body.drafts[0]._id), String(merchantA.draft._id));

  // Cross-tenant attempts by merchant B on merchant A's draft -> ALWAYS 404
  const sendOther = await request(app)
    .post(`/api/copilot/drafts/${merchantA.draft._id}/send`)
    .set('Authorization', `Bearer ${merchantB.token}`);
  const editOther = await request(app)
    .post(`/api/copilot/drafts/${merchantA.draft._id}/edit-and-send`)
    .set('Authorization', `Bearer ${merchantB.token}`)
    .send({ editedReply: 'اختراق' });
  const discardOther = await request(app)
    .post(`/api/copilot/drafts/${merchantA.draft._id}/discard`)
    .set('Authorization', `Bearer ${merchantB.token}`);
  const regenOther = await request(app)
    .post(`/api/copilot/drafts/${merchantA.draft._id}/regenerate`)
    .set('Authorization', `Bearer ${merchantB.token}`);

  assert.equal(sendOther.status, 404);
  assert.equal(editOther.status, 404);
  assert.equal(discardOther.status, 404);
  assert.equal(regenOther.status, 404);
  assert.equal(outboundDeliveries.length, 0, 'cross-tenant attempt must never deliver');

  const untouched = await CopilotDraft.findById(merchantA.draft._id).lean();
  assert.equal(untouched.status, 'pending');
});

test('1-tap POST /api/copilot/drafts/:id/send delivers via channelDeliveryService, keeps isHumanHandling=false, and writes audit', async () => {
  await resetDb();
  const { user, token, conversation, draft } = await seedMerchantWithDraft({
    username: 'send_merchant',
    email: 'send@test.local',
    suggestedReply: 'السعر 250 جنيه والتوصيل مجاني!',
  });

  const res = await request(app)
    .post(`/api/copilot/drafts/${draft._id}/send`)
    .set('Authorization', `Bearer ${token}`)
    .send({ mode: 'approve' });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.delivered, true);
  assert.equal(res.body.draft.status, 'sent');
  assert.equal(res.body.draft.editedReply, null);

  // Delivered through real channelDeliveryService -> Facebook Graph API
  assert.equal(outboundDeliveries.length, 1);
  assert.equal(outboundDeliveries[0].body.message.text, 'السعر 250 جنيه والتوصيل مجاني!');
  assert.equal(outboundDeliveries[0].body.recipient.id, '99887766');

  // Conversation updated WITHOUT flipping isHumanHandling
  const updatedConv = await Conversation.findById(conversation._id).lean();
  assert.equal(updatedConv.isHumanHandling, false, '1-tap copilot send MUST NOT flip isHumanHandling');
  assert.equal(updatedConv.messages.length, 2);
  assert.equal(updatedConv.messages[1].role, 'assistant');
  assert.equal(updatedConv.messages[1].content, 'السعر 250 جنيه والتوصيل مجاني!');
  assert.equal(updatedConv.messages[1].messageId, `copilot_${draft._id}`);

  // Audit entry created
  const audits = await AssistantActionAudit.find({
    merchantUserId: user._id,
    copilotDraftId: draft._id,
    eventType: 'copilot.draft.sent',
  }).lean();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, 'success');
  assert.equal(audits[0].afterState.isHumanHandling, false);
});

test('POST /api/copilot/drafts/:id/edit-and-send records BOTH suggestedReply and editedReply and writes edited_and_sent audit', async () => {
  await resetDb();
  const { user, token, conversation, draft } = await seedMerchantWithDraft({
    username: 'edit_merchant',
    email: 'edit@test.local',
    suggestedReply: 'الرد الأصلي المقترح 250 جنيه.',
  });

  const editedText = 'الرد المعدّل: السعر 220 جنيه لفترة محدودة!';
  const res = await request(app)
    .post(`/api/copilot/drafts/${draft._id}/edit-and-send`)
    .set('Authorization', `Bearer ${token}`)
    .send({ editedReply: editedText });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.delivered, true);

  const savedDraft = await CopilotDraft.findById(draft._id).lean();
  assert.equal(savedDraft.status, 'edited_and_sent');
  assert.equal(savedDraft.suggestedReply, 'الرد الأصلي المقترح 250 جنيه.');
  assert.equal(savedDraft.editedReply, editedText);
  assert.equal(savedDraft.delivered, true);

  assert.equal(outboundDeliveries.length, 1);
  assert.equal(outboundDeliveries[0].body.message.text, editedText);

  const updatedConv = await Conversation.findById(conversation._id).lean();
  assert.equal(updatedConv.isHumanHandling, false);
  assert.equal(updatedConv.messages[1].content, editedText);

  const audits = await AssistantActionAudit.find({
    merchantUserId: user._id,
    copilotDraftId: draft._id,
    eventType: 'copilot.draft.edited_and_sent',
  }).lean();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, 'success');
  assert.equal(audits[0].afterState.suggestedReply, 'الرد الأصلي المقترح 250 جنيه.');
  assert.equal(audits[0].afterState.editedReply, editedText);
});

test('POST /api/copilot/drafts/:id/discard never delivers and writes discarded audit', async () => {
  await resetDb();
  const { user, token, conversation, draft } = await seedMerchantWithDraft({
    username: 'discard_merchant',
    email: 'discard@test.local',
  });

  const res = await request(app)
    .post(`/api/copilot/drafts/${draft._id}/discard`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.draft.status, 'discarded');
  assert.equal(outboundDeliveries.length, 0, 'discard MUST NEVER deliver');

  const conv = await Conversation.findById(conversation._id).lean();
  assert.equal(conv.messages.length, 1, 'discard must not append message to conversation');

  const audits = await AssistantActionAudit.find({
    merchantUserId: user._id,
    copilotDraftId: draft._id,
    eventType: 'copilot.draft.discarded',
  }).lean();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, 'rejected');
});

test('concurrent double-click on POST /api/copilot/drafts/:id/send delivers strictly ONCE (atomic CAS)', async () => {
  await resetDb();
  deliveryDelayMs = 40; // widen window to exercise concurrent in-flight race
  const { token, conversation, draft } = await seedMerchantWithDraft({
    username: 'cas_merchant',
    email: 'cas@test.local',
    suggestedReply: 'رسالة تُرسل مرة واحدة فقط',
  });

  const [r1, r2] = await Promise.all([
    request(app)
      .post(`/api/copilot/drafts/${draft._id}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mode: 'approve' }),
    request(app)
      .post(`/api/copilot/drafts/${draft._id}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mode: 'approve' }),
  ]);

  const statuses = [r1.status, r2.status].sort((a, b) => a - b);
  assert.deepEqual(statuses, [200, 409], `expected one 200 and one 409, got ${statuses}`);
  assert.equal(outboundDeliveries.length, 1, 'CAS must ensure strictly ONE external delivery');

  const conv = await Conversation.findById(conversation._id).lean();
  assert.equal(conv.messages.length, 2, 'strictly one assistant message pushed');
});

test('CHANNELS_MODE=off returns 409 CHANNELS_DISABLED without marking draft sent', async () => {
  await resetDb();
  process.env.CHANNELS_MODE = 'off';

  const { user, token, conversation, draft } = await seedMerchantWithDraft({
    username: 'guard_merchant',
    email: 'guard@test.local',
  });

  const res = await request(app)
    .post(`/api/copilot/drafts/${draft._id}/send`)
    .set('Authorization', `Bearer ${token}`)
    .send({ mode: 'approve' });

  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'CHANNELS_DISABLED');
  assert.equal(outboundDeliveries.length, 0);

  const reloaded = await CopilotDraft.findById(draft._id).lean();
  assert.equal(reloaded.status, 'pending', 'CHANNELS_MODE=off must NOT mark draft sent');
  assert.equal(reloaded.delivered, false);

  const conv = await Conversation.findById(conversation._id).lean();
  assert.equal(conv.messages.length, 1, 'must not append unsent reply');
  assert.equal(conv.isHumanHandling, false);

  const audits = await AssistantActionAudit.find({
    merchantUserId: user._id,
    copilotDraftId: draft._id,
    eventType: 'copilot.draft.send_failed',
  }).lean();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].errorCode, 'CHANNELS_DISABLED');
});

test('POST /api/copilot/drafts/:id/regenerate supersedes old draft when enabled and refuses when copilotEnabled=false', async () => {
  await resetDb();
  const { token, draft } = await seedMerchantWithDraft({
    username: 'regen_merchant',
    email: 'regen@test.local',
    suggestedReply: 'مسودة قديمة',
  });

  // Fail closed when kill switch is off
  await setPlatformCopilot(false);
  const disabledRes = await request(app)
    .post(`/api/copilot/drafts/${draft._id}/regenerate`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(disabledRes.status, 403);
  assert.equal(disabledRes.body.code, 'COPILOT_DISABLED');

  // Enable kill switch -> regenerate succeeds and supersedes old draft
  await setPlatformCopilot(true);
  const res = await request(app)
    .post(`/api/copilot/drafts/${draft._id}/regenerate`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.draft.suggestedReply, regenReplyText);
  assert.notEqual(String(res.body.draft._id), String(draft._id));

  const oldDraft = await CopilotDraft.findById(draft._id).lean();
  assert.equal(oldDraft.status, 'superseded');
});

test('expireStaleCopilotDrafts cron marks expired pending drafts as expired and audits them', async () => {
  await resetDb();
  const stale = await seedMerchantWithDraft({
    username: 'stale_merchant',
    email: 'stale@test.local',
    expiresInMs: -10_000,
  });
  const fresh = await seedMerchantWithDraft({
    username: 'fresh_merchant',
    email: 'fresh@test.local',
    expiresInMs: 60 * 60 * 1000,
  });

  const result = await expireStaleCopilotDrafts();
  assert.equal(result.expired, 1);

  const staleReloaded = await CopilotDraft.findById(stale.draft._id).lean();
  const freshReloaded = await CopilotDraft.findById(fresh.draft._id).lean();
  assert.equal(staleReloaded.status, 'expired');
  assert.equal(freshReloaded.status, 'pending');

  const audits = await AssistantActionAudit.find({
    copilotDraftId: stale.draft._id,
    eventType: 'copilot.draft.expired',
  }).lean();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].outcome, 'expired');
});

test('PUT /api/bots/:id persists replyMode (auto / copilot / manual)', async () => {
  await resetDb();
  const { token, bot } = await seedMerchantWithDraft({
    username: 'botmode_merchant',
    email: 'botmode@test.local',
  });

  const resCopilot = await request(app)
    .put(`/api/bots/${bot._id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ replyMode: 'copilot' });
  assert.equal(resCopilot.status, 200);
  assert.equal(resCopilot.body.data.replyMode, 'copilot');

  const resManual = await request(app)
    .put(`/api/bots/${bot._id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ replyMode: 'manual' });
  assert.equal(resManual.status, 200);
  assert.equal(resManual.body.data.replyMode, 'manual');

  const dbBot = await Bot.findById(bot._id).lean();
  assert.equal(dbBot.replyMode, 'manual');
});
