const mongoose = require('mongoose');
const { AI_PROVIDERS } = require('./AiCredential');
const { AI_MODEL_CAPABILITIES } = require('./AiModelCatalog');

const AI_POLICY_SCOPES = Object.freeze(['global', 'tier', 'bot', 'user']);
const AI_USE_CASES = Object.freeze([
  'general',
  'chat',
  'vision',
  'classification',
  'automation',
]);
const AI_FALLBACK_CATEGORIES = Object.freeze([
  'timeout',
  'network',
  'rate_limit',
  'quota_exhausted',
  'provider_unavailable',
  'model_unavailable',
  'authentication',
  'unknown',
]);

const aiRoutingStepSchema = new mongoose.Schema({
  order: {
    type: Number,
    required: true,
    min: 0,
    max: 1000,
  },
  selector: {
    type: String,
    enum: ['auto', 'fixed'],
    default: 'fixed',
  },
  modelCatalogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiModelCatalog',
    default: null,
  },
  preferredModelCatalogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiModelCatalog',
    default: null,
  },
  provider: {
    type: String,
    enum: AI_PROVIDERS,
    default: undefined,
  },
  credentialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiCredential',
    required: true,
  },
  requiredCapabilities: [{
    type: String,
    enum: AI_MODEL_CAPABILITIES,
  }],
  maxAttempts: {
    type: Number,
    default: 1,
    min: 1,
    max: 3,
  },
  timeoutMs: {
    type: Number,
    default: 30000,
    min: 1000,
    max: 120000,
  },
  fallbackOn: [{
    type: String,
    enum: AI_FALLBACK_CATEGORIES,
  }],
}, {
  _id: false,
  strict: 'throw',
});

aiRoutingStepSchema.pre('validate', function validateFixedStep(next) {
  if (this.selector === 'fixed' && !this.modelCatalogId) {
    return next(new Error('Fixed AI routing steps require modelCatalogId'));
  }
  return next();
});

const aiRoutingPolicySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 120,
  },
  scopeType: {
    type: String,
    enum: AI_POLICY_SCOPES,
    required: true,
    index: true,
  },
  scopeKey: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    index: true,
  },
  useCase: {
    type: String,
    enum: AI_USE_CASES,
    default: 'general',
    index: true,
  },
  selectionMode: {
    type: String,
    enum: ['auto', 'fixed'],
    default: 'auto',
  },
  priority: {
    type: Number,
    default: 0,
    min: -100000,
    max: 100000,
  },
  enabled: {
    type: Boolean,
    default: true,
    index: true,
  },
  effectiveFrom: {
    type: Date,
    default: null,
  },
  effectiveUntil: {
    type: Date,
    default: null,
  },
  steps: {
    type: [aiRoutingStepSchema],
    required: true,
    validate: {
      validator(steps) {
        if (!Array.isArray(steps) || steps.length === 0) {
          return false;
        }
        const orders = steps.map((step) => step.order);
        return new Set(orders).size === orders.length;
      },
      message: 'AI routing policy steps must be non-empty with unique order values',
    },
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

aiRoutingPolicySchema.pre('validate', function normalizeGlobalScope(next) {
  if (this.scopeType === 'global') {
    this.scopeKey = 'global';
  }
  if (this.effectiveFrom && this.effectiveUntil
      && this.effectiveUntil <= this.effectiveFrom) {
    return next(new Error('effectiveUntil must be later than effectiveFrom'));
  }
  this.steps = [...(this.steps || [])].sort((left, right) => left.order - right.order);
  return next();
});

aiRoutingPolicySchema.index(
  { scopeType: 1, scopeKey: 1, useCase: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    name: 'ai_policy_scope_name_unique',
  }
);
aiRoutingPolicySchema.index(
  { enabled: 1, scopeType: 1, scopeKey: 1, useCase: 1, priority: -1 },
  { name: 'ai_policy_resolution' }
);

module.exports = mongoose.models.AiRoutingPolicy
  || mongoose.model('AiRoutingPolicy', aiRoutingPolicySchema);
module.exports.AI_POLICY_SCOPES = AI_POLICY_SCOPES;
module.exports.AI_USE_CASES = AI_USE_CASES;
module.exports.AI_FALLBACK_CATEGORIES = AI_FALLBACK_CATEGORIES;

