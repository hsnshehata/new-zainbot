const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, required: true, trim: true, maxlength: 500 },
  dueAt: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'claimed', 'sent', 'failed', 'done', 'cancelled'],
    default: 'pending',
    index: true,
  },
  sentAt: { type: Date, default: null },
  // تتبع محاولات الإرسال: كل استيلاء (claim) يرفع attempts، والفشل المتكرر
  // بعد maxAttempts ينقل التذكير إلى failed بدل أن يضيع أو يتكرر بلا حد.
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  lastError: { type: String, default: null, maxlength: 1000 },
  claimedAt: { type: Date, default: null },
  claimedBy: { type: String, default: null },
  nextAttemptAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

reminderSchema.index({ status: 1, dueAt: 1 });
reminderSchema.index({ status: 1, nextAttemptAt: 1 });

module.exports = mongoose.model('Reminder', reminderSchema);
