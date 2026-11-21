// /server/models/Order.js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // اختياري لأن الزبون ممكن يكون زائر
  products: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { 
      type: Number, 
      required: true, // إصلاح الخطأ: إزالة الـ -
      min: [1, 'الكمية يجب أن تكون 1 على الأقل']
    },
    // اختيارات المنتج (مثلاً: المقاس/اللون) محفوظة مع كل عنصر
    selectedOptions: {
      type: [
        new mongoose.Schema({
          name: { type: String, trim: true, default: '' },
          value: { type: String, trim: true, default: '' }
        }, { _id: false })
      ],
      default: []
    },
    price: { 
      type: Number, 
      required: true, 
      min: [0, 'السعر يجب ألا يكون سالبًا']
    },
    currency: {
      type: String,
      trim: true,
      default: 'EGP'
    },
    name: {
      type: String,
      trim: true,
      default: ''
    },
    imageUrl: {
      type: String,
      trim: true,
      default: ''
    }
  }],
  totalPrice: { 
    type: Number, 
    required: true, 
    min: [0, 'الإجمالي يجب ألا يكون سالبًا']
  },
  currency: {
    type: String,
    trim: true,
    default: 'EGP'
  },
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'], 
    default: 'pending'
  },
  paymentMethod: { 
    type: String, 
    enum: ['cash_on_delivery', 'whatsapp_confirmation'], 
    default: 'cash_on_delivery'
  },
  customerName: {
    type: String,
    trim: true,
    default: ''
  },
  customerWhatsapp: {
    type: String,
    trim: true,
    default: ''
  },
  customerEmail: {
    type: String,
    trim: true,
    default: ''
  },
  customerAddress: {
    type: String,
    trim: true,
    default: ''
  },
  customerNote: {
    type: String,
    trim: true,
    default: ''
  },
  // سجل تغيّرات الحالة — يُحفظ كل تغيير مع من غيّره وتاريخ التغيير وملاحظة اختيارية
  history: [{
    status: { type: String, enum: ['pending','confirmed','shipped','delivered','cancelled'], required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    changedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' }
  }],
  // Guest-checkout idempotency: the storefront generates a key per
  // checkout attempt and resends it on retries; the server returns the
  // original order for a replay instead of creating a duplicate.
  idempotencyKey: { type: String, default: undefined },
  payloadHash: { type: String, default: '' },
  // Stock reservation protocol state. 'none' for orders that never reserved
  // stock through the protocol (legacy orders, pending whatsapp_confirmation
  // orders before confirmation). 'pending' means durable intent recorded and
  // reservation tokens may exist on products; a reconciliation sweep owns
  // orders stuck here. 'completed' means all lines reserved and tokens may
  // be pulled. 'failed' means reservation failed and every token was
  // released (idempotently).
  stockStatus: {
    type: String,
    enum: ['none', 'pending', 'completed', 'failed', 'restoring'],
    default: 'none'
  },
  // Generation fence: set to a fresh id on EVERY transition into
  // stockStatus 'pending' and required in the completion CAS filter, so a
  // stalled writer from an older generation can never complete (and adopt)
  // a newer generation of the same order.
  stockEpoch: { type: String, default: '' },
  // Ledger marker: true once a previously completed reservation has been
  // fully restored to stock (cancel / regression). Restoration itself is
  // idempotent per (product, order) via Product.restorations.
  stockReleased: { type: Boolean, default: false },
  // Durable post-commit ops flags: set when a post-save side effect
  // (stock decrement, owner notification) failed after the order was
  // already persisted. A reconciliation sweep can find and retry these
  // instead of the failure disappearing behind the shopper's 201.
  opsFlags: {
    stockReconciliationPending: { type: Boolean, default: false },
    stockError: { type: String, default: '' },
    notificationPending: { type: Boolean, default: false },
    notificationError: { type: String, default: '' },
    // Notification retry protocol: claim fencing (claimedAt) so only one
    // worker retries at a time, attempt budget, and dedup so the in-app
    // Notification document is created at most once. External channel
    // delivery stays at-least-once (providers offer no idempotency keys).
    notificationCreated: { type: Boolean, default: false },
    notificationAttempts: { type: Number, default: 0 },
    notificationClaimedAt: { type: Date, default: null },
    notificationRecoveredAt: { type: Date, default: null },
    notificationFailed: { type: Boolean, default: false }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

orderSchema.index(
  { storeId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

// تحديث تاريخ التعديل
orderSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// فهرس لتحسين البحث
orderSchema.index({ storeId: 1 });
orderSchema.index({ userId: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
