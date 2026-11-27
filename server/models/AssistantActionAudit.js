'use strict';

// server/models/AssistantActionAudit.js
// Immutable append-only audit ledger for merchant assistant write tools and
// Copilot draft decisions. Reuses redactAuditText() from AuditEvent.js so
// tokens, passwords, and JWTs are never persisted in audit records.

const mongoose = require('mongoose');
const { redactAuditText } = require('./AuditEvent');

const ASSISTANT_AUDIT_EVENT_TYPES = Object.freeze([
  'write_tool.proposed',
  'write_tool.executed',
  'write_tool.rejected',
  'write_tool.expired',
  'write_tool.failed',
  'write_tool.denied_disabled',
  'whatsapp_link.code_issued',
  'whatsapp_link.bound',
  'whatsapp_link.rejected',
  'whatsapp_link.unlinked',
  'copilot.draft.created',
  'copilot.draft.sent',
  'copilot.draft.edited_and_sent',
  'copilot.draft.discarded',
  'copilot.draft.expired',
  'copilot.draft.send_failed',
]);

const ASSISTANT_AUDIT_CHANNELS = Object.freeze([
  'whatsapp_platform',
  'dashboard_assistant',
  'dashboard_inbox',
  'telegram',
  'system',
]);

const ASSISTANT_AUDIT_OUTCOMES = Object.freeze([
  'proposed',
  'success',
  'rejected',
  'expired',
  'denied',
  'error',
]);

const SENSITIVE_SNAPSHOT_KEY = /token|secret|password|authorization|api[-_]?key|access[-_]?code|session|cookie|hash|credential|private[-_]?key/i;
const MAX_SNAPSHOT_DEPTH = 5;
const MAX_SNAPSHOT_ARRAY_ITEMS = 50;
const MAX_SNAPSHOT_STRING = 500;

function sanitizeAuditSnapshot(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > MAX_SNAPSHOT_DEPTH) return '[TRUNCATED_DEPTH]';

  if (typeof value === 'string') {
    const redacted = redactAuditText(value);
    return redacted.length > MAX_SNAPSHOT_STRING
      ? `${redacted.slice(0, MAX_SNAPSHOT_STRING)}...[TRUNCATED]`
      : redacted;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (value instanceof mongoose.Types.ObjectId || value?._bsontype === 'ObjectId') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_SNAPSHOT_ARRAY_ITEMS)
      .map((item) => sanitizeAuditSnapshot(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (SENSITIVE_SNAPSHOT_KEY.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = sanitizeAuditSnapshot(val, depth + 1);
      }
    }
    return out;
  }

  return redactAuditText(String(value)).slice(0, MAX_SNAPSHOT_STRING);
}

const assistantActionAuditSchema = new mongoose.Schema({
  eventType: {
    type: String,
    enum: ASSISTANT_AUDIT_EVENT_TYPES,
    required: true,
    immutable: true,
    index: true,
  },
  merchantUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
    index: true,
  },
  actorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
  },
  botId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bot',
    default: null,
    immutable: true,
  },
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    default: null,
    immutable: true,
  },
  channel: {
    type: String,
    enum: ASSISTANT_AUDIT_CHANNELS,
    required: true,
    immutable: true,
  },
  toolName: {
    type: String,
    maxlength: 60,
    default: '',
    immutable: true,
  },
  pendingActionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AssistantPendingAction',
    default: null,
    immutable: true,
    index: true,
  },
  copilotDraftId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CopilotDraft',
    default: null,
    immutable: true,
    index: true,
  },
  targetModel: {
    type: String,
    maxlength: 60,
    default: '',
    immutable: true,
  },
  targetId: {
    type: String,
    maxlength: 128,
    default: '',
    immutable: true,
  },
  outcome: {
    type: String,
    enum: ASSISTANT_AUDIT_OUTCOMES,
    required: true,
    immutable: true,
  },
  beforeState: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
    immutable: true,
  },
  afterState: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
    immutable: true,
  },
  summary: {
    type: String,
    maxlength: 600,
    default: '',
    immutable: true,
  },
  errorCode: {
    type: String,
    maxlength: 80,
    default: '',
    immutable: true,
  },
  triggerMessageId: {
    type: String,
    maxlength: 160,
    default: '',
    immutable: true,
  },
  decisionMessageId: {
    type: String,
    maxlength: 160,
    default: '',
    immutable: true,
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
    immutable: true,
    index: true,
  },
}, {
  strict: 'throw',
  versionKey: false,
});

assistantActionAuditSchema.pre('validate', function sanitizeAuditFields() {
  this.summary = redactAuditText(this.summary).slice(0, 600);
  this.errorCode = String(this.errorCode || '')
    .replace(/[^A-Z0-9_.-]/gi, '')
    .slice(0, 80);
  this.toolName = String(this.toolName || '')
    .replace(/[^A-Z0-9_.-]/gi, '')
    .slice(0, 60);
  this.targetModel = String(this.targetModel || '')
    .replace(/[^A-Z0-9_.-]/gi, '')
    .slice(0, 60);
  this.targetId = String(this.targetId || '')
    .replace(/[^A-Z0-9_.:@-]/gi, '')
    .slice(0, 128);
  this.triggerMessageId = redactAuditText(this.triggerMessageId).slice(0, 160);
  this.decisionMessageId = redactAuditText(this.decisionMessageId).slice(0, 160);
  if (this.beforeState !== null && this.beforeState !== undefined) {
    this.beforeState = sanitizeAuditSnapshot(this.beforeState);
  }
  if (this.afterState !== null && this.afterState !== undefined) {
    this.afterState = sanitizeAuditSnapshot(this.afterState);
  }
});

assistantActionAuditSchema.index(
  { merchantUserId: 1, createdAt: -1 },
  { name: 'assistant_audit_merchant_timeline' }
);
assistantActionAuditSchema.index(
  { pendingActionId: 1, createdAt: 1 },
  { name: 'assistant_audit_pending_action' }
);
assistantActionAuditSchema.index(
  { copilotDraftId: 1, createdAt: 1 },
  { name: 'assistant_audit_copilot_draft' }
);

const AssistantActionAudit = mongoose.models.AssistantActionAudit
  || mongoose.model('AssistantActionAudit', assistantActionAuditSchema);

module.exports = AssistantActionAudit;
module.exports.ASSISTANT_AUDIT_EVENT_TYPES = ASSISTANT_AUDIT_EVENT_TYPES;
module.exports.ASSISTANT_AUDIT_CHANNELS = ASSISTANT_AUDIT_CHANNELS;
module.exports.ASSISTANT_AUDIT_OUTCOMES = ASSISTANT_AUDIT_OUTCOMES;
module.exports.sanitizeAuditSnapshot = sanitizeAuditSnapshot;
