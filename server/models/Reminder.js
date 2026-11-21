const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, required: true, trim: true, maxlength: 500 },
  dueAt: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'sent', 'done', 'cancelled'],
    default: 'pending',
    index: true,
  },
  sentAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

reminderSchema.index({ status: 1, dueAt: 1 });

module.exports = mongoose.model('Reminder', reminderSchema);
