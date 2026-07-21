// server/models/ProviderKey.js
const mongoose = require('mongoose');

const providerKeySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  provider: { 
    type: String, 
    enum: ['openai', 'gemini', 'anthropic', 'openrouter', 'custom'], 
    required: true 
  },
  apiKey: { type: String, required: true, trim: true },
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
});

module.exports = mongoose.model('ProviderKey', providerKeySchema);
