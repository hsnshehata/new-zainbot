'use strict';

// server/models/AssistantPendingAction.js
// Pending write-action state machine with short TTL expiry, atomic CAS fencing,
// and idempotency key for merchant-confirmed assistant write tools.

const mongoose = require('mongoose');

const ASSISTANT_WRITE_TOOLS = Object.freeze([
  'create_order',
  'update_inventory',
  'message_customer',
]);

const PENDING_ACTION_CHANNELS = Object.freeze([
  'whatsapp_platform',
  'dashboard_assistant',
]);

const PENDING_ACTION_STATUSES = Object.freeze([
  'pending',
  'executing',
  'executed',
  'rejected',
  'expired',
  'failed',
]);

const assistantPendingActionSchema = new mongoose.Schema({
  actionCode: {
    type: String,
    required: true,
    trim: true,
    maxlength: 8,
  },
  merchantUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  botId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bot',
    default: null,
  },
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    default: null,
  },
  channel: {
    type: String,
    enum: PENDING_ACTION_CHANNELS,
    required: true,
  },
  senderJid: {
    type: String,
    trim: true,
    default: '',
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  toolName: {
    type: String,
    enum: ASSISTANT_WRITE_TOOLS,
    required: true,
  },
  status: {
    type: String,
    enum: PENDING_ACTION_STATUSES,
    default: 'pending',
    index: true,
  },
  proposedPayload: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  beforeSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  summaryText: {
    type: String,
    required: true,
    maxlength: 2000,
  },
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 160,
  },
  proposalMessageId: {
    type: String,
    trim: true,
    default: '',
  },
  decisionMessageId: {
    type: String,
    trim: true,
    default: '',
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  decidedAt: {
    type: Date,
    default: null,
  },
  executedAt: {
    type: Date,
    default: null,
  },
  executionResult: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  errorCode: {
    type: String,
    maxlength: 80,
    default: '',
  },
}, {
  timestamps: true,
});

assistantPendingActionSchema.index(
  { merchantUserId: 1, channel: 1, status: 1, createdAt: -1 },
  { name: 'assistant_pending_merchant_channel_status' }
);
assistantPendingActionSchema.index(
  { status: 1, expiresAt: 1 },
  { name: 'assistant_pending_expiry_sweep' }
);

const AssistantPendingAction = mongoose.models.AssistantPendingAction
  || mongoose.model('AssistantPendingAction', assistantPendingActionSchema);

module.exports = AssistantPendingAction;
module.exports.ASSISTANT_WRITE_TOOLS = ASSISTANT_WRITE_TOOLS;
module.exports.PENDING_ACTION_CHANNELS = PENDING_ACTION_CHANNELS;
module.exports.PENDING_ACTION_STATUSES = PENDING_ACTION_STATUSES;
