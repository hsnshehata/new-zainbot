const mongoose = require('mongoose');
const { SUPPORTED_AI_TIERS } = require('./AiTierEntitlement');

const aiUserOverrideSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  enabled: {
    type: Boolean,
    default: true,
    index: true,
  },
  tierOverride: {
    type: String,
    enum: [...SUPPORTED_AI_TIERS, null],
    default: null,
  },
  routingMode: {
    type: String,
    enum: ['inherit', 'auto', 'fixed'],
    default: 'inherit',
  },
  policyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiRoutingPolicy',
    default: null,
  },
  modelCatalogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiModelCatalog',
    default: null,
  },
  credentialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiCredential',
    default: null,
  },
  allowedModelCatalogIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiModelCatalog',
  }],
  blockedModelCatalogIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiModelCatalog',
  }],
  expiresAt: {
    type: Date,
    default: null,
    index: true,
  },
  reason: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
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

aiUserOverrideSchema.pre('validate', function validateFixedOverride(next) {
  if (this.routingMode === 'fixed' && !this.modelCatalogId) {
    return next(new Error('Fixed AI user overrides require modelCatalogId'));
  }
  return next();
});

module.exports = mongoose.models.AiUserOverride
  || mongoose.model('AiUserOverride', aiUserOverrideSchema);

