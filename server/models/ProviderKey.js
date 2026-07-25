// server/models/ProviderKey.js
const mongoose = require('mongoose');

const providerKeySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  provider: { 
    type: String, 
    enum: ['openai', 'gemini', 'anthropic', 'openrouter', 'custom'], 
    required: true 
  },
  apiKey: { type: String, required: true, trim: true, select: false },
  baseUrl: { type: String, trim: true },
  defaultModel: { type: String, required: true, trim: true },
  priority: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
  status: { 
    type: String, 
    enum: ['working', 'failed'], 
    default: 'working' 
  },
  lastTested: { type: Date, default: Date.now },
  errorMessage: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
}, {
  toJSON: {
    transform: (_document, result) => {
      delete result.apiKey;
      return result;
    }
  },
  toObject: {
    transform: (_document, result) => {
      delete result.apiKey;
      return result;
    }
  }
});

module.exports = mongoose.model('ProviderKey', providerKeySchema);
