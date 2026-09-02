// server/models/NotificationRecipient.js
const mongoose = require('mongoose');

const notificationRecipientSchema = new mongoose.Schema({
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
  channel: {
    type: String,
    enum: ['whatsapp', 'telegram'],
    required: true,
  },
  target: {
    type: String,
    required: true,
    trim: true,
  },
  label: {
    type: String,
    trim: true,
    default: 'General Alerts',
  },
  events: [{
    type: String,
    enum: [
      'order_created',
      'order_status',
      'booking_created',
      'booking_rescheduled',
      'booking_cancelled',
      'handoff',
    ],
    default: ['order_created', 'booking_created'],
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

notificationRecipientSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

notificationRecipientSchema.index({ userId: 1, channel: 1, target: 1 });

module.exports = mongoose.models.NotificationRecipient || mongoose.model('NotificationRecipient', notificationRecipientSchema);
