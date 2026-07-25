const mongoose = require('mongoose');
const { AI_PROVIDERS } = require('./AiCredential');

const AI_USAGE_ERROR_CLASSES = Object.freeze([
  'none',
  'timeout',
  'network',
  'rate_limit',
  'quota_exhausted',
  'provider_unavailable',
  'model_unavailable',
  'authentication',
  'invalid_request',
  'content_policy',
  'unknown',
]);

const aiUsageEventSchema = new mongoose.Schema({
  requestId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  botId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bot',
    default: null,
    index: true,
  },
  policyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiRoutingPolicy',
    default: null,
  },
  credentialId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiCredential',
    required: true,
  },
  modelCatalogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiModelCatalog',
    required: true,
  },
  provider: {
    type: String,
    enum: AI_PROVIDERS,
    required: true,
  },
  modelId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  tier: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
    default: 'free',
  },
  useCase: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
    default: 'general',
  },
  attempt: {
    type: Number,
    default: 1,
    min: 1,
    max: 100,
  },
  success: {
    type: Boolean,
    required: true,
    index: true,
  },
  inputTokens: {
    type: Number,
    default: 0,
    min: 0,
  },
  outputTokens: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalTokens: {
    type: Number,
    default: 0,
    min: 0,
  },
  latencyMs: {
    type: Number,
    default: 0,
    min: 0,
  },
  errorClass: {
    type: String,
    enum: AI_USAGE_ERROR_CLASSES,
    default: 'none',
  },
  retryable: {
    type: Boolean,
    default: false,
  },
  fallbackUsed: {
    type: Boolean,
    default: false,
  },
  expiresAt: {
    type: Date,
    default: null,
  },
}, {
  strict: 'throw',
  timestamps: { createdAt: true, updatedAt: false },
});

aiUsageEventSchema.pre('validate', function calculateTotalTokens(next) {
  this.totalTokens = Number(this.inputTokens || 0) + Number(this.outputTokens || 0);
  if (this.success) {
    this.errorClass = 'none';
    this.retryable = false;
  }
  return next();
});

aiUsageEventSchema.index(
  { requestId: 1, attempt: 1 },
  { unique: true, name: 'ai_usage_request_attempt_unique' }
);
aiUsageEventSchema.index(
  { userId: 1, createdAt: -1 },
  { name: 'ai_usage_user_time' }
);
aiUsageEventSchema.index(
  { tier: 1, provider: 1, modelId: 1, createdAt: -1 },
  { name: 'ai_usage_reporting' }
);
aiUsageEventSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { expiresAt: { $type: 'date' } },
    name: 'ai_usage_expiry',
  }
);

module.exports = mongoose.models.AiUsageEvent
  || mongoose.model('AiUsageEvent', aiUsageEventSchema);
module.exports.AI_USAGE_ERROR_CLASSES = AI_USAGE_ERROR_CLASSES;

