const mongoose = require('mongoose');

const AI_PROVIDERS = Object.freeze([
  'openai',
  'google',
  'gemini',
  'anthropic',
  'openrouter',
  'custom',
]);

function removeEncryptedSecret(_document, result) {
  delete result.secretCiphertext;
  delete result.secretIv;
  delete result.secretAuthTag;
  delete result.encryptionKeyId;
  return result;
}

const aiCredentialSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100,
  },
  provider: {
    type: String,
    enum: AI_PROVIDERS,
    required: true,
    index: true,
  },
  baseUrl: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
    validate: {
      validator(value) {
        if (!value) {
          return true;
        }
        try {
          const parsed = new URL(value);
          return parsed.protocol === 'https:'
            && !parsed.username
            && !parsed.password;
        } catch (_error) {
          return false;
        }
      },
      message: 'AI credential baseUrl must be an HTTPS URL without credentials',
    },
  },
  secretCiphertext: {
    type: String,
    required: true,
    select: false,
  },
  secretIv: {
    type: String,
    required: true,
    select: false,
  },
  secretAuthTag: {
    type: String,
    required: true,
    select: false,
  },
  encryptionKeyId: {
    type: String,
    required: true,
    select: false,
  },
  encryptionVersion: {
    type: Number,
    enum: [1],
    default: 1,
    immutable: true,
  },
  hasSecret: {
    type: Boolean,
    default: true,
    immutable: true,
  },
  status: {
    type: String,
    enum: ['active', 'disabled', 'error'],
    default: 'active',
    index: true,
  },
  failureCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  lastUsedAt: {
    type: Date,
    default: null,
  },
  lastValidatedAt: {
    type: Date,
    default: null,
  },
  lastFailureAt: {
    type: Date,
    default: null,
  },
  lastErrorCode: {
    type: String,
    trim: true,
    maxlength: 100,
    default: '',
  },
  labels: [{
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
  minimize: true,
  toJSON: { transform: removeEncryptedSecret },
  toObject: { transform: removeEncryptedSecret },
});

aiCredentialSchema.index(
  { provider: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    name: 'ai_credential_provider_name_unique',
  }
);

module.exports = mongoose.models.AiCredential
  || mongoose.model('AiCredential', aiCredentialSchema);
module.exports.AI_PROVIDERS = AI_PROVIDERS;
