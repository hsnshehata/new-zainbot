// server/models/WebhookLog.js
const mongoose = require('mongoose');

const webhookLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
  webhookId: { type: mongoose.Schema.Types.ObjectId, ref: 'WebhookConfig', required: true },
  event: { type: String, required: true },
  url: { type: String, required: true },
  payload: { type: Object, required: true },
  responseStatus: { type: Number },
  responseBody: { type: String },
  timestamp: { type: Date, default: Date.now },
  success: { type: Boolean, required: true },
  attempts: { type: Number, default: 1 }
});

module.exports = mongoose.model('WebhookLog', webhookLogSchema);
