// server/routes/subscriptions.js
// Manual subscription flow (Instapay / cash wallet + WhatsApp confirmation).
const express = require('express');

const router = express.Router();
const SubscriptionRequest = require('../models/SubscriptionRequest');
const User = require('../models/User');
const authenticate = require('../middleware/authenticate');
const { requireDirectActorRole } = require('../middleware/authorize');
const { validateBody, Joi } = require('../middleware/validate');
const logger = require('../logger');
const { getPlan } = require('../config/plans');

const TIERS = ['growth_1k', 'growth_10k', 'growth_50k', 'unlimited'];

const createRequestSchema = Joi.object({
  tier: Joi.string().valid(...TIERS).required(),
  billingPeriod: Joi.string().valid('monthly', 'yearly').default('monthly'),
  paymentMethod: Joi.string()
    .valid('instapay', 'vodafone_cash', 'orange_money', 'etisalat_cash', 'other')
    .required(),
  paymentReference: Joi.string().max(300).allow('', null).optional(),
  receiptUrl: Joi.string().uri().allow('', null).optional(),
});

function monthsForPeriod(billingPeriod) {
  return billingPeriod === 'yearly' ? 12 : 1;
}

// POST /api/subscriptions/request — user submits a manual payment request
router.post('/request', authenticate, validateBody(createRequestSchema), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { tier, billingPeriod, paymentMethod, paymentReference, receiptUrl } = req.body;

    const existing = await SubscriptionRequest.findOne({ userId, status: 'pending' });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'PENDING_REQUEST_EXISTS',
        message: 'لديك طلب اشتراك قيد المراجعة بالفعل. تواصل معنا على واتساب للمتابعة.',
        data: existing,
      });
    }

    const doc = await SubscriptionRequest.create({
      userId,
      tier,
      billingPeriod: billingPeriod || 'monthly',
      paymentMethod,
      paymentReference: (paymentReference || '').trim(),
      receiptUrl: (receiptUrl || '').trim(),
      status: 'pending',
    });
    logger.info('subscription_request_created', { userId, tier, billingPeriod });
    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    logger.error('subscription_request_error', { err: err.message });
    return res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

// GET /api/subscriptions/mine — my requests
router.get('/mine', authenticate, async (req, res) => {
  const docs = await SubscriptionRequest.find({ userId: req.user.userId }).sort({ createdAt: -1 }).limit(20);
  return res.json({ success: true, data: docs });
});

// GET /api/subscriptions/requests — superadmin list
router.get('/requests', authenticate, requireDirectActorRole('superadmin'), async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const docs = await SubscriptionRequest.find(filter)
    .populate('userId', 'username email whatsapp subscriptionTier subscriptionType')
    .sort({ createdAt: -1 })
    .limit(200);
  return res.json({ success: true, data: docs });
});

const reviewSchema = Joi.object({
  action: Joi.string().valid('approve', 'reject').required(),
  adminNote: Joi.string().max(1000).allow('', null).optional(),
});

// PUT /api/subscriptions/requests/:id — approve (activates tier) or reject
router.put('/requests/:id', authenticate, requireDirectActorRole('superadmin'), validateBody(reviewSchema), async (req, res) => {
  try {
    const doc = await SubscriptionRequest.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
    if (doc.status !== 'pending') {
      return res.status(409).json({ success: false, message: 'تمت مراجعة هذا الطلب مسبقاً' });
    }
    const { action, adminNote } = req.body;
    doc.status = action === 'approve' ? 'approved' : 'rejected';
    doc.adminNote = (adminNote || '').trim();
    doc.reviewedBy = req.auth?.actorUserId || req.user.userId;
    doc.reviewedAt = new Date();
    await doc.save();

    if (doc.status === 'approved') {
      const plan = getPlan(doc.tier);
      const months = monthsForPeriod(doc.billingPeriod);
      const now = new Date();
      const end = new Date(now);
      end.setMonth(end.getMonth() + months);
      await User.findByIdAndUpdate(doc.userId, {
        subscriptionTier: doc.tier,
        subscriptionType: doc.billingPeriod === 'yearly' ? 'yearly' : 'monthly',
        subscriptionEndDate: end,
        monthlyMessagesUsed: 0,
        dailyMessagesUsed: 0,
        lastUsageReset: now,
      });
      logger.info('subscription_approved', { userId: String(doc.userId), tier: doc.tier, months });
    }
    return res.json({ success: true, data: doc });
  } catch (err) {
    logger.error('subscription_review_error', { err: err.message });
    return res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

// GET /api/subscriptions/plans — public plans + payment info (no auth)
router.get('/plans', (req, res) => {
  const { PLANS, subscriptionConfig } = require('../config/plans');
  const cfg = subscriptionConfig();
  return res.json({
    success: true,
    data: {
      plans: Object.values(PLANS),
      payment: {
        methods: ['instapay', 'vodafone_cash', 'orange_money', 'etisalat_cash'],
        whatsappNumber: cfg.whatsappNumber,
        instapayAccount: cfg.instapayAccount,
        cashWallet: cfg.cashWallet,
        note: 'التفعيل يدوي حالياً: ادفع ثم أرسل صورة التحويل على واتساب.',
      },
    },
  });
});

module.exports = router;
