const mongoose = require('mongoose');

function redactAuditText(value) {
  return String(value || '')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(authorization|api[_ -]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]')
    .replace(/\s+/g, ' ')
    .trim();
}

const auditEventSchema = new mongoose.Schema({
  eventType: {
    type: String,
    enum: [
      'impersonation.started',
      'impersonation.ended',
      'impersonation.revoked',
      'impersonation.expired',
      'impersonation.token_issue_failed',
      'impersonated.write',
      'admin.write',
    ],
    required: true,
    immutable: true,
    index: true,
  },
  actorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
    index: true,
  },
  subjectUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
    index: true,
  },
  impersonationSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AdminImpersonationSession',
    required() {
      return this.eventType !== 'admin.write';
    },
    immutable: true,
    index: true,
  },
  outcome: {
    type: String,
    enum: ['success', 'denied', 'error'],
    required: true,
    immutable: true,
  },
  action: {
    type: String,
    maxlength: 160,
    default: '',
    immutable: true,
  },
  resourceType: {
    type: String,
    maxlength: 80,
    default: '',
    immutable: true,
  },
  resourceId: {
    type: String,
    maxlength: 128,
    default: '',
    immutable: true,
  },
  method: {
    type: String,
    enum: ['', 'POST', 'PUT', 'PATCH', 'DELETE'],
    default: '',
    immutable: true,
  },
  path: {
    type: String,
    maxlength: 300,
    default: '',
    immutable: true,
  },
  statusCode: {
    type: Number,
    min: 100,
    max: 599,
    default: undefined,
    immutable: true,
  },
  reason: {
    type: String,
    maxlength: 500,
    default: '',
    immutable: true,
  },
  scopes: {
    type: [{
      type: String,
      trim: true,
      maxlength: 80,
    }],
    default: undefined,
    immutable: true,
  },
  errorCode: {
    type: String,
    maxlength: 80,
    default: '',
    immutable: true,
  },
  requestId: {
    type: String,
    maxlength: 128,
    default: '',
    immutable: true,
  },
  createdAt: {
    type: Date,
    required: true,
    immutable: true,
    index: true,
  },
}, {
  strict: 'throw',
  versionKey: false,
});

auditEventSchema.pre('validate', function redactPotentialSecrets() {
  this.reason = redactAuditText(this.reason).slice(0, 500);
  this.errorCode = String(this.errorCode || '')
    .replace(/[^A-Z0-9_.-]/gi, '')
    .slice(0, 80);
  this.requestId = String(this.requestId || '')
    .replace(/[^A-Z0-9_.:-]/gi, '')
    .slice(0, 128);
  this.action = String(this.action || '')
    .replace(/[^A-Z0-9_.:-]/gi, '')
    .slice(0, 160);
  this.resourceType = String(this.resourceType || '')
    .replace(/[^A-Z0-9_.:-]/gi, '')
    .slice(0, 80);
  this.resourceId = String(this.resourceId || '')
    .replace(/[^A-Z0-9_.:-]/gi, '')
    .slice(0, 128);
  this.path = String(this.path || '')
    .replace(/[?#].*$/, '')
    .replace(/[\r\n\t]/g, '')
    .slice(0, 300);
});

auditEventSchema.index(
  { actorUserId: 1, createdAt: -1 },
  { name: 'audit_actor_timeline' }
);
auditEventSchema.index(
  { subjectUserId: 1, createdAt: -1 },
  { name: 'audit_subject_timeline' }
);
auditEventSchema.index(
  { impersonationSessionId: 1, createdAt: 1 },
  { name: 'audit_impersonation_timeline' }
);

module.exports = mongoose.model('AuditEvent', auditEventSchema);
