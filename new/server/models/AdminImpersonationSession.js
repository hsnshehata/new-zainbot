const mongoose = require('mongoose');

const adminImpersonationSessionSchema = new mongoose.Schema({
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
  reason: {
    type: String,
    required: true,
    minlength: 3,
    maxlength: 500,
    immutable: true,
  },
  scopes: {
    type: [{
      type: String,
      trim: true,
      maxlength: 80,
    }],
    required: true,
    immutable: true,
  },
  status: {
    type: String,
    enum: ['active', 'ended', 'revoked', 'expired'],
    default: 'active',
    required: true,
    index: true,
  },
  actorSessionVersion: {
    type: Number,
    required: true,
    min: 0,
    immutable: true,
    select: false,
  },
  subjectSessionVersion: {
    type: Number,
    required: true,
    min: 0,
    immutable: true,
    select: false,
  },
  createdAt: {
    type: Date,
    required: true,
    immutable: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    immutable: true,
    index: true,
  },
  endedAt: {
    type: Date,
    default: null,
  },
  revokedAt: {
    type: Date,
    default: null,
  },
  purgeAt: {
    type: Date,
    required: true,
    immutable: true,
    select: false,
  },
}, {
  strict: 'throw',
  versionKey: false,
  toJSON: {
    transform: (_document, result) => {
      delete result.actorSessionVersion;
      delete result.subjectSessionVersion;
      delete result.purgeAt;
      return result;
    },
  },
  toObject: {
    transform: (_document, result) => {
      delete result.actorSessionVersion;
      delete result.subjectSessionVersion;
      delete result.purgeAt;
      return result;
    },
  },
});

adminImpersonationSessionSchema.index(
  { actorUserId: 1, status: 1, expiresAt: 1 },
  { name: 'impersonation_actor_status_expiry' }
);
adminImpersonationSessionSchema.index(
  { subjectUserId: 1, status: 1, expiresAt: 1 },
  { name: 'impersonation_subject_status_expiry' }
);
adminImpersonationSessionSchema.index(
  { purgeAt: 1 },
  {
    expireAfterSeconds: 0,
    name: 'impersonation_session_retention_ttl',
  }
);

module.exports = mongoose.model(
  'AdminImpersonationSession',
  adminImpersonationSessionSchema
);
