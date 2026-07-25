const mongoose = require('mongoose');

const channelConnectionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  botId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bot',
    required: true,
    index: true,
  },
  channel: {
    type: String,
    enum: ['whatsapp', 'facebook', 'instagram', 'telegram', 'website'],
    required: true,
    index: true,
  },
  mode: {
    type: String,
    enum: [
      'whatsapp_web_qr',
      'cloud_api',
      'manual_token',
      'oauth',
      'central_bot',
      'widget',
    ],
    required: true,
  },
  status: {
    type: String,
    enum: [
      'disconnected',
      'initializing',
      'qr_required',
      'connecting',
      'connected',
      'degraded',
      'error',
      'relink_required',
    ],
    default: 'disconnected',
    required: true,
    index: true,
  },
  externalAccountId: {
    type: String,
    trim: true,
    default: '',
  },
  externalDisplayName: {
    type: String,
    trim: true,
    maxlength: 200,
    default: '',
  },
  clientId: {
    type: String,
    trim: true,
    maxlength: 160,
    default: '',
  },
  credentialId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },
  sessionStore: {
    type: {
      type: String,
      enum: ['none', 'mongo_remote_auth', 'coolify_volume', 'external'],
      default: 'none',
    },
    sessionName: {
      type: String,
      maxlength: 200,
      default: '',
    },
  },
  capabilities: [{
    type: String,
    trim: true,
    maxlength: 80,
  }],
  requiresRelink: {
    type: Boolean,
    default: false,
    index: true,
  },
  restoredFromLegacy: {
    type: Boolean,
    default: false,
  },
  health: {
    lastCheckAt: { type: Date, default: null },
    lastSuccessAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
    errorCode: { type: String, maxlength: 100, default: '' },
  },
  lastQrAt: { type: Date, default: null },
  qrExpiresAt: { type: Date, default: null },
  lastReadyAt: { type: Date, default: null },
  lastDisconnectedAt: { type: Date, default: null },
  lastMessageAt: { type: Date, default: null },
}, {
  strict: 'throw',
  timestamps: true,
  versionKey: false,
});

channelConnectionSchema.index(
  { botId: 1, channel: 1 },
  { unique: true, name: 'channel_connection_per_bot' }
);
channelConnectionSchema.index(
  { userId: 1, channel: 1, status: 1 },
  { name: 'channel_connection_owner_status' }
);

module.exports = mongoose.model('ChannelConnection', channelConnectionSchema);
