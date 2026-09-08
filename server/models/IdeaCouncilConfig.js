'use strict';

const mongoose = require('mongoose');

const ideaCouncilConfigSchema = new mongoose.Schema({
  singletonKey: {
    type: String,
    default: 'GLOBAL_CONFIG',
    unique: true,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  monthlyIdeaLimit: {
    type: Number,
    default: 3,
    min: 1,
  },
  maxFollowupRounds: {
    type: Number,
    default: 3,
    min: 1,
  },
  workerConcurrency: {
    type: Number,
    default: 2,
    min: 1,
  },
  agentConcurrencyPerRun: {
    type: Number,
    default: 3,
    min: 1,
  },
  researchEnabled: {
    type: Boolean,
    default: true,
  },
  maxSearchCallsPerRun: {
    type: Number,
    default: 4,
    min: 1,
  },
  maxSourcesPerRun: {
    type: Number,
    default: 10,
    min: 1,
  },
  maxIdeaLength: {
    type: Number,
    default: 8000,
    min: 100,
  },
  minIdeaLength: {
    type: Number,
    default: 100,
    min: 10,
  },
  agentTimeoutMs: {
    type: Number,
    default: 60000,
    min: 5000,
  },
  totalRunTimeoutMs: {
    type: Number,
    default: 480000,
    min: 30000,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, {
  timestamps: true,
  strict: 'throw',
});

// Singleton helper to fetch active config
ideaCouncilConfigSchema.statics.getActiveConfig = async function() {
  let config = await this.findOne({ singletonKey: 'GLOBAL_CONFIG' });
  if (!config) {
    config = await this.create({ singletonKey: 'GLOBAL_CONFIG' });
  }
  return config;
};

module.exports = mongoose.model('IdeaCouncilConfig', ideaCouncilConfigSchema);
