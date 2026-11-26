'use strict';

// tests/assistant/phase3FoundationModels.test.js
// Verifies Phase 3 Slice 1 schema defaults (everything OFF / 'auto'),
// strict/immutable constraints, indexes, and serializer secret stripping.

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const User = require('../../server/models/User');
const Bot = require('../../server/models/Bot');
const PlatformSetting = require('../../server/models/PlatformSetting');
const AssistantPendingAction = require('../../server/models/AssistantPendingAction');
const AssistantActionAudit = require('../../server/models/AssistantActionAudit');
const CopilotDraft = require('../../server/models/CopilotDraft');
const { serializeUser, serializeBot } = require('../../server/utils/serializers');

test('User.assistantSettings defaults all write flags to false and hides link-code fields', () => {
  const user = new User({
    username: 'merchant_one',
    email: 'merchant1@example.com',
    assistantSettings: {
      whatsappLinkCodeHash: 'sha256-secret-hash',
      whatsappLinkExpiresAt: new Date(Date.now() + 60_000),
    },
  });

  assert.equal(user.assistantSettings.writeToolsEnabled, false);
  assert.equal(user.assistantSettings.allowedWriteTools.createOrder, false);
  assert.equal(user.assistantSettings.allowedWriteTools.updateInventory, false);
  assert.equal(user.assistantSettings.allowedWriteTools.messageCustomer, false);
  assert.equal(user.assistantSettings.verifiedWhatsappPhone, '');
  assert.equal(user.assistantSettings.whatsappVerifiedAt, null);
  assert.equal(user.assistantSettings.defaultBotId, null);
  assert.equal(user.assistantSettings.defaultStoreId, null);

  // select: false on link-code hash & expiry
  assert.equal(User.schema.path('assistantSettings.whatsappLinkCodeHash').options.select, false);
  assert.equal(User.schema.path('assistantSettings.whatsappLinkExpiresAt').options.select, false);

  // toJSON & toObject strip link-code hash & expiry
  const asJson = user.toJSON();
  assert.equal(asJson.assistantSettings.whatsappLinkCodeHash, undefined);
  assert.equal(asJson.assistantSettings.whatsappLinkExpiresAt, undefined);

  const asObj = user.toObject();
  assert.equal(asObj.assistantSettings.whatsappLinkCodeHash, undefined);
  assert.equal(asObj.assistantSettings.whatsappLinkExpiresAt, undefined);

  // Partial unique index on verifiedWhatsappPhone
  const indexes = User.schema.indexes();
  const phoneIdx = indexes.find(([spec]) => spec['assistantSettings.verifiedWhatsappPhone'] === 1);
  assert.ok(phoneIdx, 'Expected partial unique index on assistantSettings.verifiedWhatsappPhone');
  assert.equal(phoneIdx[1].unique, true);
  assert.deepEqual(phoneIdx[1].partialFilterExpression, {
    'assistantSettings.verifiedWhatsappPhone': { $type: 'string', $gt: '' },
  });
});

test('serializeUser strips assistantSettings link-code hash/expiry without mutating input', () => {
  const raw = {
    _id: 'u1',
    username: 'merchant_two',
    assistantSettings: {
      writeToolsEnabled: false,
      allowedWriteTools: { createOrder: false, updateInventory: false, messageCustomer: false },
      verifiedWhatsappPhone: '201012345678',
      whatsappLinkCodeHash: 'secret-hash-value',
      whatsappLinkExpiresAt: new Date('2026-11-27T01:00:00Z'),
    },
  };

  const serialized = serializeUser(raw);
  assert.equal(serialized.assistantSettings.whatsappLinkCodeHash, undefined);
  assert.equal(serialized.assistantSettings.whatsappLinkExpiresAt, undefined);
  assert.equal(serialized.assistantSettings.verifiedWhatsappPhone, '201012345678');
  assert.equal(raw.assistantSettings.whatsappLinkCodeHash, 'secret-hash-value', 'must not mutate caller object');
});

test('Bot defaults replyMode to auto and copilotSettings safely', () => {
  const bot = new Bot({
    name: 'Test Bot',
    userId: new mongoose.Types.ObjectId(),
  });

  assert.equal(bot.replyMode, 'auto');
  assert.equal(bot.autoReplyEnabled, true);
  assert.equal(bot.copilotSettings.notifyChannels.inApp, true);
  assert.equal(bot.copilotSettings.notifyChannels.whatsappToMerchant, false);
  assert.equal(bot.copilotSettings.notifyChannels.telegramToMerchant, false);
  assert.equal(bot.copilotSettings.draftTtlMinutes, 60);

  const err = new Bot({
    name: 'Bad Mode Bot',
    userId: new mongoose.Types.ObjectId(),
    replyMode: 'invalid_mode',
  }).validateSync();
  assert.ok(err?.errors?.replyMode, 'Invalid replyMode enum must fail validation');

  const serialized = serializeBot(bot);
  assert.equal(serialized.replyMode, 'auto');
  assert.equal(serialized.copilotSettings.draftTtlMinutes, 60);
});

test('PlatformSetting defaults Phase 3 kill switches to false', () => {
  const doc = new PlatformSetting();
  assert.equal(doc.assistantWriteToolsEnabled, false);
  assert.equal(doc.copilotEnabled, false);
  assert.equal(PlatformSetting.schema.path('assistantWriteToolsEnabled').options.default, false);
  assert.equal(PlatformSetting.schema.path('copilotEnabled').options.default, false);
});

test('AssistantPendingAction schema validates required fields, enums, and defaults', () => {
  const doc = new AssistantPendingAction({
    actionCode: '4821',
    merchantUserId: new mongoose.Types.ObjectId(),
    channel: 'whatsapp_platform',
    toolName: 'update_inventory',
    proposedPayload: { productId: 'p1', op: 'set', value: 10 },
    summaryText: 'تحديث مخزون منتج',
    idempotencyKey: 'idem-1',
    expiresAt: new Date(Date.now() + 300_000),
  });

  assert.equal(doc.validateSync(), undefined);
  assert.equal(doc.status, 'pending');
  assert.equal(doc.beforeSnapshot, null);
  assert.equal(doc.executionResult, null);
  assert.equal(doc.errorCode, '');

  const bad = new AssistantPendingAction({
    actionCode: '1234',
    merchantUserId: new mongoose.Types.ObjectId(),
    channel: 'unknown_channel',
    toolName: 'delete_everything',
    proposedPayload: {},
    summaryText: 'bad',
    idempotencyKey: 'idem-2',
    expiresAt: new Date(),
  }).validateSync();
  assert.ok(bad?.errors?.channel);
  assert.ok(bad?.errors?.toolName);
});

test('CopilotDraft schema validates required fields, enums, and defaults', () => {
  const doc = new CopilotDraft({
    draftCode: '4821',
    botId: new mongoose.Types.ObjectId(),
    merchantUserId: new mongoose.Types.ObjectId(),
    conversationId: new mongoose.Types.ObjectId(),
    channel: 'whatsapp',
    customerUserId: '201012345678@c.us',
    suggestedReply: 'أهلاً بك! السعر 250 جنيه.',
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  assert.equal(doc.validateSync(), undefined);
  assert.equal(doc.status, 'pending');
  assert.equal(doc.editedReply, null);
  assert.equal(doc.approvedVia, '');
  assert.equal(doc.delivered, false);
});

test('AssistantActionAudit schema enforces strict: throw and immutable fields', () => {
  assert.equal(AssistantActionAudit.schema.options.strict, 'throw');
  assert.equal(AssistantActionAudit.schema.options.versionKey, false);

  for (const field of ['eventType', 'merchantUserId', 'actorUserId', 'channel', 'outcome', 'beforeState', 'afterState', 'summary', 'createdAt']) {
    assert.equal(AssistantActionAudit.schema.path(field).options.immutable, true, `${field} must be immutable`);
  }

  assert.throws(() => new AssistantActionAudit({
    eventType: 'write_tool.proposed',
    merchantUserId: new mongoose.Types.ObjectId(),
    actorUserId: new mongoose.Types.ObjectId(),
    channel: 'dashboard_assistant',
    outcome: 'proposed',
    unexpectedField: 'should-throw',
  }), /not in schema/i);
});
