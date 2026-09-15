'use strict';

const mongoose = require('mongoose');

const IDEA_RUN_TYPES = Object.freeze(['INITIAL', 'FOLLOW_UP']);
const IDEA_FOLLOWUP_TYPES = Object.freeze([
  'DEFEND',
  'PIVOT',
  'VALIDATION_PLAN',
  'VOTE',
  'DEEP_DIVE',
  'COMPARE',
  'MVP',
]);
const IDEA_RUN_STATUSES = Object.freeze([
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'CANCELED',
]);
const IDEA_RUN_STAGES = Object.freeze([
  'PENDING',
  'STRUCTURING',
  'RESEARCH',
  'ANALYSIS',
  'SYNTHESIS',
  'FINALIZING',
]);

const sourceReferenceSchema = new mongoose.Schema({
  sourceId: { type: String, required: true },
  title: { type: String, required: true },
  url: { type: String, required: true },
  domain: { type: String, required: true },
  publishedDate: { type: String, default: null },
  accessedDate: { type: Date, default: Date.now },
  qualityScore: { type: Number, default: 1 },
  isPrimary: { type: Boolean, default: false },
  claimsSupported: [{ type: String }],
}, { _id: false });

const ideaEvaluationRunSchema = new mongoose.Schema({
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
    index: true,
  },
  runType: {
    type: String,
    enum: IDEA_RUN_TYPES,
    required: true,
  },
  roundNumber: {
    type: Number,
    default: 1,
  },
  followupType: {
    type: String,
    enum: [...IDEA_FOLLOWUP_TYPES, null],
    default: null,
  },
  followupPrompt: {
    type: String,
    default: null,
    maxlength: 4000,
  },
  targetCritic: {
    type: String,
    default: 'ALL',
  },
  status: {
    type: String,
    enum: IDEA_RUN_STATUSES,
    default: 'QUEUED',
    index: true,
  },
  idempotencyKey: {
    type: String,
    required: true,
    index: true,
    maxlength: 120,
  },
  pipelineVersion: {
    type: Number,
    default: 1,
  },
  ideaSnapshotVersion: {
    type: Number,
    required: true,
  },
  currentStage: {
    type: String,
    enum: IDEA_RUN_STAGES,
    default: 'PENDING',
  },
  stageProgress: {
    researchCompleted: { type: Boolean, default: false },
    agentsTotal: { type: Number, default: 8 },
    agentsCompleted: { type: Number, default: 0 },
    agentsFailed: { type: Number, default: 0 },
    synthesisCompleted: { type: Boolean, default: false },
  },
  encryptedFinalReport: {
    type: String,
    default: null,
  },
  encryptedTruthBoard: {
    type: String,
    default: null,
  },
  sourceReferences: [sourceReferenceSchema],
  usageSummary: {
    totalInputTokens: { type: Number, default: 0 },
    totalOutputTokens: { type: Number, default: 0 },
    totalSearchCalls: { type: Number, default: 0 },
    totalLatencyMs: { type: Number, default: 0 },
  },
  errorSummary: {
    code: { type: String, default: null },
    message: { type: String, default: null },
    failedAgents: [{ type: String }],
  },
  workerId: {
    type: String,
    default: null,
    maxlength: 120,
  },
  heartbeatAt: {
    type: Date,
    default: null,
    index: true,
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

ideaEvaluationRunSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
ideaEvaluationRunSchema.index({ ideaId: 1, createdAt: -1 });

module.exports = mongoose.model('IdeaEvaluationRun', ideaEvaluationRunSchema);
module.exports.IDEA_RUN_TYPES = IDEA_RUN_TYPES;
module.exports.IDEA_FOLLOWUP_TYPES = IDEA_FOLLOWUP_TYPES;
module.exports.IDEA_RUN_STATUSES = IDEA_RUN_STATUSES;
module.exports.IDEA_RUN_STAGES = IDEA_RUN_STAGES;
