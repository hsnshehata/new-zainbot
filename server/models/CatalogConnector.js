const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  provider: { type: String, enum: ['shopify', 'woocommerce'], required: true },
  origin: { type: String, required: true },
  currency: { type: String, enum: ['EGP', 'USD', 'SAR'], required: true },
  token: { type: mongoose.Schema.Types.Mixed, select: false },
  consumerKey: { type: mongoose.Schema.Types.Mixed, select: false },
  consumerSecret: { type: mongoose.Schema.Types.Mixed, select: false },
  state: { type: String, enum: ['idle', 'running', 'succeeded', 'failed'], default: 'idle' },
  leaseUntil: Date,
  lastError: String,
  lastSucceededAt: Date,
  lastImportedCount: Number,
}, { timestamps: true });
schema.index({ botId: 1, provider: 1 }, { unique: true });
module.exports = mongoose.model('CatalogConnector', schema);
