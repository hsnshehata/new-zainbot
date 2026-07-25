// server/models/WebhookConfig.js
const mongoose = require('mongoose');

const webhookConfigSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
  url: { type: String, required: true, trim: true },
  secret: { type: String, required: true }, // e.g. whsec_...
  events: [{ type: String, enum: ['message.received', 'message.sent', 'order.created', 'customer.created'] }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WebhookConfig', webhookConfigSchema);
