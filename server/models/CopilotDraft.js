'use strict';

// server/models/CopilotDraft.js
// Pending/sent/edited/discarded AI reply drafts for human-in-the-loop Copilot mode.

const mongoose = require('mongoose');

const COPILOT_DRAFT_CHANNELS = Object.freeze([
  'whatsapp',
  'facebook',
  'instagram',
  'web',
  'telegram',
]);

const COPILOT_DRAFT_STATUSES = Object.freeze([
  'pending',
  'sending',
  'sent',
  'edited_and_sent',
  'discarded',
  'superseded',
  'expired',
  'failed',
]);

const COPILOT_APPROVED_VIA = Object.freeze([
  '',
  'dashboard_inbox',
  'whatsapp_platform',
  'telegram',
]);

const copilotDraftSchema = new mongoose.Schema({
  draftCode: {
    type: String,
    required: true,
    trim: true,
    maxlength: 8,
  },
  botId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bot',
    required: true,
    index: true,
  },
  merchantUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  },
  channel: {
    type: String,
    enum: COPILOT_DRAFT_CHANNELS,
    required: true,
  },
  customerUserId: {
    type: String,
    required: true,
    trim: true,
  },
  customerName: {
    type: String,
    trim: true,
    default: '',
  },
  triggerMessageId: {
    type: String,
    trim: true,
    default: '',
  },
  customerMessageSnippet: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
  suggestedReply: {
    type: String,
    required: true,
    maxlength: 4000,
  },
  editedReply: {
    type: String,
    maxlength: 4000,
    default: null,
  },
  status: {
    type: String,
    enum: COPILOT_DRAFT_STATUSES,
    default: 'pending',
    index: true,
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
  decidedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  approvedVia: {
    type: String,
    enum: COPILOT_APPROVED_VIA,
    default: '',
  },
  deliveredMessageId: {
    type: String,
    trim: true,
    default: '',
  },
  delivered: {
    type: Boolean,
    default: false,
  },
  errorCode: {
    type: String,
    maxlength: 80,
    default: '',
  },
}, {
  timestamps: true,
});

copilotDraftSchema.index(
  { botId: 1, status: 1, createdAt: -1 },
  { name: 'copilot_draft_bot_status' }
);
copilotDraftSchema.index(
  { conversationId: 1, status: 1, createdAt: -1 },
  { name: 'copilot_draft_conversation_status' }
);
copilotDraftSchema.index(
  { merchantUserId: 1, draftCode: 1, status: 1 },
  { name: 'copilot_draft_merchant_code' }
);
copilotDraftSchema.index(
  { status: 1, expiresAt: 1 },
  { name: 'copilot_draft_expiry_sweep' }
);

const CopilotDraft = mongoose.models.CopilotDraft
  || mongoose.model('CopilotDraft', copilotDraftSchema);

module.exports = CopilotDraft;
module.exports.COPILOT_DRAFT_CHANNELS = COPILOT_DRAFT_CHANNELS;
module.exports.COPILOT_DRAFT_STATUSES = COPILOT_DRAFT_STATUSES;
module.exports.COPILOT_APPROVED_VIA = COPILOT_APPROVED_VIA;
