'use strict';

const mongoose = require('mongoose');

const IDEA_AGENT_ROLES = Object.freeze([
  'STRUCTURER',
  'MARKET_RESEARCHER',
  'COLD_CUSTOMER',
  'HARSH_AUDITOR',
  'EXECUTION_EXPERT',
  'DEVILS_ADVOCATE',
  'WEDGE_HUNTER',
  'UX_DESIGNER',
  'CANDID_CHAMPION',
  'CHAIRPERSON',
]);

const IDEA_AGENT_STATUSES = Object.freeze([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
]);

const ideaAgentResultSchema = new mongoose.Schema({
  runId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IdeaEvaluationRun',
    required: true,
    index: true,
  },
  ideaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IdeaProject',
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  role: {
    type: String,
    enum: IDEA_AGENT_ROLES,
    required: true,
  },
  attempt: {
    type: Number,
    default: 1,
    min: 1,
  },
  status: {
    type: String,
    enum: IDEA_AGENT_STATUSES,
    default: 'PENDING',
  },
  schemaVersion: {
    type: Number,
    default: 1,
  },
  encryptedInputHash: {
    type: String,
    required: true,
  },
  encryptedOutput: {
    type: String,
    default: null,
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 1,
  },
  modelUsed: {
    type: String,
    default: null,
  },
  providerUsed: {
    type: String,
    default: null,
  },
  tokenUsage: {
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
  },
  latencyMs: {
    type: Number,
    default: 0,
  },
  errorClass: {
    type: String,
    default: 'none',
  },
  startedAt: {
    type: Date,
    default: null,
  },
  completedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  strict: 'throw',
});

ideaAgentResultSchema.index({ runId: 1, role: 1 }, { unique: true });

module.exports = mongoose.model('IdeaAgentResult', ideaAgentResultSchema);
module.exports.IDEA_AGENT_ROLES = IDEA_AGENT_ROLES;
module.exports.IDEA_AGENT_STATUSES = IDEA_AGENT_STATUSES;
