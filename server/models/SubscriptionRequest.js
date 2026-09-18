// server/models/SubscriptionRequest.js
// Manual subscription requests: user pays via Instapay/cash wallet, contacts owner on WhatsApp,
// then submits a request here. Superadmin approves -> tier activated with expiry.
const mongoose = require('mongoose');

const subscriptionRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tier: {
      type: String,
      enum: ['growth_1k', 'growth_10k', 'growth_50k', 'unlimited'],
      required: true,
    },
    billingPeriod: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    paymentMethod: {
      type: String,
      enum: ['instapay', 'vodafone_cash', 'orange_money', 'etisalat_cash', 'other'],
      required: true,
    },
    paymentReference: { type: String, trim: true, maxlength: 300, default: '' },
    receiptUrl: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    adminNote: { type: String, trim: true, maxlength: 1000, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.SubscriptionRequest
  || mongoose.model('SubscriptionRequest', subscriptionRequestSchema);
