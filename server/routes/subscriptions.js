// server/routes/subscriptions.js
// Manual subscription flow (Instapay / cash wallet + WhatsApp confirmation).
const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const SubscriptionRequest = require('../models/SubscriptionRequest');
const Notification = require('../models/Notification');
const User = require('../models/User');
const authenticate = require('../middleware/authenticate');
const { requireDirectActorRole } = require('../middleware/authorize');
const { validateBody, Joi } = require('../middleware/validate');
const logger = require('../logger');
const { getPlan } = require('../config/plans');

const TIERS = ['growth_1k', 'growth_10k', 'growth_50k', 'unlimited'];
const STATUSES = ['pending', 'approved', 'rejected'];

// Admin list pagination bounds (GET /api/subscriptions/requests).
const ADMIN_LIST_DEFAULT_LIMIT = 20;
const ADMIN_LIST_MAX_LIMIT = 100;

// Request-creation rate limit: 5 attempts per user per day (double-submit
// guard below still returns 409 for an existing pending request).
const CREATE_REQUESTS_PER_DAY = 5;

// Bilingual status notes for GET /api/subscriptions/mine (read-only —
// no auto-activation; the tier only changes on superadmin approval).
const STATUS_NOTES = {
  pending: {
    ar: 'طلبك قيد المراجعة. سنخطرك هنا فور التفعيل.',
    en: 'Your request is under review. We will notify you here once it is activated.',
  },
  approved: {
    ar: 'تمت الموافقة على طلبك وتفعيل باقتك.',
    en: 'Your request was approved and your plan is now active.',
  },
  rejected: {
    ar: 'تم رفض الطلب. تواصل معنا على واتساب للمتابعة.',
    en: 'Your request was rejected. Please contact us on WhatsApp for follow-up.',
  },
};

function statusNoteFor(status) {
  return STATUS_NOTES[status] || { ar: '', en: '' };
}

// Dedicated per-user rate limiter for subscription request creation,
// mirroring the express-rate-limit style used by the idea council routes.
const createRequestLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 1 day
  limit: CREATE_REQUESTS_PER_DAY,
  max: CREATE_REQUESTS_PER_DAY,
  keyGenerator: (req) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'SUBSCRIPTION_REQUEST_LIMIT',
    message: 'وصلت للحد الأقصى لطلبات الاشتراك اليوم (5 طلبات). حاول غداً. / Daily subscription request limit reached (5). Try again tomorrow.',
  },
});

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

function toPlain(doc) {
  if (!doc) return doc;
  if (typeof doc.toObject === 'function') {
    try {
      return doc.toObject({ transform: false });
    } catch (_err) {
      // Fall through to raw doc.
    }
  }
  return { ...doc };
}

// Best-effort in-app notification on review. Reuses the existing
// Notification schema ({ title, message, user, isRead }) — a failure here
// must never fail the approve/reject itself.
async function notifyReviewOutcome(doc, action) {
  try {
    const approved = action === 'approve';
    await Notification.create({
      user: doc.userId,
      title: approved
        ? 'تم تفعيل اشتراكك | Subscription activated'
        : 'تحديث طلب الاشتراك | Subscription request update',
      message: approved
        ? `تمت الموافقة على طلب اشتراكك (${doc.tier}) وتفعيل باقتك. / Your subscription request (${doc.tier}) was approved and your plan is now active.`
        : 'تم رفض طلب اشتراكك. تواصل معنا على واتساب للمتابعة. / Your subscription request was rejected. Please contact us on WhatsApp for follow-up.',
      isRead: false,
    });
  } catch (err) {
    logger.warn('subscription_review_notify_failed', { err: err.message });
  }
}

// POST /api/subscriptions/request — user submits a manual payment request
router.post('/request', authenticate, createRequestLimiter, validateBody(createRequestSchema), async (req, res) => {
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

// GET /api/subscriptions/mine — my requests, enriched with queue position
// (for pending items) and a bilingual status note. Read-only: nothing here
// changes the user's tier.
router.get('/mine', authenticate, async (req, res) => {
  try {
    const docs = await SubscriptionRequest.find({ userId: req.user.userId }).sort({ createdAt: -1 }).limit(20);
    const enriched = await Promise.all(
      (docs || []).map(async (doc) => {
        const plain = toPlain(doc);
        let queuePosition = null;
        if (plain.status === 'pending' && plain.createdAt) {
          try {
            queuePosition = await SubscriptionRequest.countDocuments({
              status: 'pending',
              createdAt: { $lte: plain.createdAt },
            });
          } catch (err) {
            logger.warn('subscription_queue_position_failed', { err: err.message });
            queuePosition = null;
          }
        }
        return { ...plain, queuePosition, statusNote: statusNoteFor(plain.status) };
      })
    );
    return res.json({ success: true, data: enriched });
  } catch (err) {
    logger.error('subscription_mine_error', { err: err.message });
    return res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

// GET /api/subscriptions/requests — superadmin list with status filter + pagination
router.get('/requests', authenticate, requireDirectActorRole('superadmin'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      if (!STATUSES.includes(req.query.status)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_STATUS',
          message: 'حالة غير صالحة. / Invalid status filter.',
        });
      }
      filter.status = req.query.status;
    }
    const rawLimit = Number.parseInt(req.query.limit, 10);
    const rawSkip = Number.parseInt(req.query.skip, 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), ADMIN_LIST_MAX_LIMIT)
      : ADMIN_LIST_DEFAULT_LIMIT;
    const skip = Number.isFinite(rawSkip) ? Math.max(rawSkip, 0) : 0;

    const [total, docs] = await Promise.all([
      SubscriptionRequest.countDocuments(filter),
      SubscriptionRequest.find(filter)
        .populate('userId', 'username email whatsapp subscriptionTier subscriptionType')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);
    return res.json({
      success: true,
      data: docs,
      pagination: { total, limit, skip, hasMore: skip + docs.length < total },
    });
  } catch (err) {
    logger.error('subscription_list_error', { err: err.message });
    return res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
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
    await notifyReviewOutcome(doc, action);
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

// Test/diagnostic handles (router still mounts as Express middleware).
router.statusNoteFor = statusNoteFor;
router.SUBSCRIPTION_STATUSES = STATUSES;
router.ADMIN_LIST_MAX_LIMIT = ADMIN_LIST_MAX_LIMIT;
router.CREATE_REQUESTS_PER_DAY = CREATE_REQUESTS_PER_DAY;

module.exports = router;
