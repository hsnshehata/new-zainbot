const mongoose = require('mongoose');
const { AI_PROVIDERS } = require('./AiCredential');

const AI_MODEL_CAPABILITIES = Object.freeze([
  'text_input',
  'text_output',
  'image_input',
  'audio_input',
  'audio_output',
  'tool_calling',
  'structured_output',
]);

const aiModelCatalogSchema = new mongoose.Schema({
  provider: {
    type: String,
    enum: AI_PROVIDERS,
    required: true,
    index: true,
  },
  modelId: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: '',
  },
  capabilities: [{
    type: String,
    enum: AI_MODEL_CAPABILITIES,
  }],
  enabled: {
    type: Boolean,
    default: true,
    index: true,
  },
  autoEligible: {
    type: Boolean,
    default: true,
    index: true,
  },
  autoPriority: {
    type: Number,
    default: 100,
    min: 0,
    max: 100000,
  },
  contextWindow: {
    type: Number,
    default: null,
    min: 1,
  },
  maxOutputTokens: {
    type: Number,
    default: null,
    min: 1,
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50,
  }],
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

aiModelCatalogSchema.index(
  { provider: 1, modelId: 1 },
  { unique: true, name: 'ai_model_provider_model_unique' }
);
aiModelCatalogSchema.index(
  { enabled: 1, autoEligible: 1, autoPriority: 1 },
  { name: 'ai_model_auto_selection' }
);

module.exports = mongoose.models.AiModelCatalog
  || mongoose.model('AiModelCatalog', aiModelCatalogSchema);
module.exports.AI_MODEL_CAPABILITIES = AI_MODEL_CAPABILITIES;

