'use strict';

const mongoose = require('mongoose');

const IDEA_PROJECT_STATUSES = Object.freeze([
  'DRAFT',
  'STRUCTURING',
  'AWAITING_CONFIRMATION',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'CANCELED',
]);

const ideaProjectSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  encryptedTitle: {
    type: String,
    required: true,
  },
  encryptedOriginalText: {
    type: String,
    required: true,
  },
  encryptedStructuredIdea: {
    type: String,
    default: null,
  },
  outputLanguage: {
    type: String,
    enum: ['ar', 'en'],
    default: 'ar',
  },
  targetMarket: {
    type: String,
    default: null,
    maxlength: 200,
  },
  targetAudience: {
    type: String,
    default: null,
    maxlength: 300,
  },
  primaryConcern: {
    type: String,
    default: null,
    maxlength: 500,
  },
  status: {
    type: String,
    enum: IDEA_PROJECT_STATUSES,
    default: 'DRAFT',
    index: true,
  },
  version: {
    type: Number,
    default: 1,
    min: 1,
  },
  initialEvaluationsUsed: {
    type: Number,
    default: 0,
    min: 0,
  },
  followupRoundsUsed: {
    type: Number,
    default: 0,
    min: 0,
    max: 3,
  },
  latestRunId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IdeaEvaluationRun',
    default: null,
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  strict: 'throw',
});

ideaProjectSchema.index({ userId: 1, isDeleted: 1, updatedAt: -1 });

module.exports = mongoose.model('IdeaProject', ideaProjectSchema);
module.exports.IDEA_PROJECT_STATUSES = IDEA_PROJECT_STATUSES;
