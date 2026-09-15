// server/models/Booking.js
const mongoose = require('mongoose');

const bookingHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'rescheduled', 'cancelled'],
    required: true,
  },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  note: { type: String, trim: true, default: '' },
  changedAt: { type: Date, default: Date.now },
}, { _id: false });

const bookingSchema = new mongoose.Schema({
  botId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true, index: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', index: true },
  channel: {
    type: String,
    enum: ['facebook', 'instagram', 'whatsapp', 'web', 'telegram'],
    default: 'web',
  },
  sourceUserId: { type: String, trim: true, default: '' },
  sourceUsername: { type: String, trim: true, default: '' },
  customerName: { type: String, trim: true, required: true },
  customerPhone: { type: String, trim: true, default: '' },
  customerEmail: { type: String, trim: true, default: '' },
  serviceType: { type: String, trim: true, default: 'General Appointment' },
  bookingDate: { type: Date, required: true, index: true },
  slotDurationMinutes: { type: Number, min: 5, default: 30 },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'rescheduled', 'cancelled'],
    default: 'pending',
    index: true,
  },
  notes: { type: String, trim: true, default: '' },
  reminderSent: { type: Boolean, default: false },
  history: { type: [bookingHistorySchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

bookingSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

bookingSchema.index({ botId: 1, bookingDate: 1 });
bookingSchema.index({ botId: 1, status: 1, bookingDate: -1 });

module.exports = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
