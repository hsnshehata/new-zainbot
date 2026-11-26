const mongoose = require('mongoose');

const platformWhatsAppSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    default: 'platform',
  },
  status: {
    type: String,
    enum: ['disconnected', 'loading', 'qr_ready', 'authenticating', 'connected'],
    default: 'disconnected',
  },
  qrCodeData: {
    type: String,
    default: null,
  },
  connected: {
    type: Boolean,
    default: false,
  },
  phone: {
    type: String,
    default: '',
  },
  healthStatus: {
    type: String,
    enum: ['healthy', 'unresponsive', 'recovering', 'disconnected'],
    default: 'disconnected',
  },
  lastHeartbeat: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  versionKey: false,
});

module.exports = mongoose.model('PlatformWhatsAppSession', platformWhatsAppSessionSchema);
