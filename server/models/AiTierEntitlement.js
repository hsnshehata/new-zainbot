const mongoose = require('mongoose');

const SUPPORTED_AI_TIERS = Object.freeze([
  'free',
  'growth_1k',
  'growth_10k',
  'growth_50k',
  'unlimited',
]);

const DEFAULT_FREE_ENTITLEMENT = Object.freeze({
  tier: 'free',
  enabled: true,
  allowAuto: true,
  allowedModelCatalogIds: Object.freeze([]),
  blockedModelCatalogIds: Object.freeze([]),
  requiredCapabilities: Object.freeze(['text_input', 'text_output']),
  maxFallbackSteps: 3,
  dailyRequestLimit: null,
  monthlyRequestLimit: null,
});

const aiTierEntitlementSchema = new mongoose.Schema({
  tier: {
    type: String,
    enum: SUPPORTED_AI_TIERS,
    required: true,
    unique: true,
    index: true,
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  allowAuto: {
    type: Boolean,
    default: true,
  },
  allowedModelCatalogIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiModelCatalog',
  }],
  blockedModelCatalogIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiModelCatalog',
  }],
  requiredCapabilities: [{
    type: String,
    enum: [
      'text_input',
      'text_output',
      'image_input',
      'audio_input',
      'audio_output',
      'tool_calling',
      'structured_output',
    ],
  }],
  maxFallbackSteps: {
    type: Number,
    default: 3,
    min: 1,
    max: 20,
  },
  dailyRequestLimit: {
    type: Number,
    default: null,
    min: 1,
  },
  monthlyRequestLimit: {
    type: Number,
    default: null,
    min: 1,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, {
  strict: 'throw',
  timestamps: true,
});

module.exports = mongoose.models.AiTierEntitlement
  || mongoose.model('AiTierEntitlement', aiTierEntitlementSchema);
module.exports.SUPPORTED_AI_TIERS = SUPPORTED_AI_TIERS;
module.exports.DEFAULT_FREE_ENTITLEMENT = DEFAULT_FREE_ENTITLEMENT;

