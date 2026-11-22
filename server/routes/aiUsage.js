// server/routes/aiUsage.js
// Tenant-scoped visibility into real recorded AI usage (AiUsageEvent ledger).
// Counts, models, providers and tokens only: no dollar pricing, because the
// ledger does not store per-unit rates and guessing would be dishonest.

const express = require('express');
const mongoose = require('mongoose');
const AiUsageEvent = require('../models/AiUsageEvent');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

function subjectUserId(req) {
  return req.auth?.subjectUserId || req.user?.userId || req.user?._id || null;
}

function isDirectSuperadmin(req) {
  const actorRole = req.auth?.actorRole || req.user?.role;
  const actorUserId = req.auth?.actorUserId || req.user?.userId || req.user?._id;
  const subject = subjectUserId(req);
  const impersonating = req.auth?.isImpersonating === true
    || (actorUserId && subject && String(actorUserId) !== String(subject));
  return actorRole === 'superadmin' && actorUserId && !impersonating;
}

function clampDays(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(90, Math.max(1, parsed));
}

// GET /api/ai-usage/summary?days=30[&userId=<id> (direct superadmin only)]
router.get('/summary', authenticate, async (req, res) => {
  try {
    const subject = subjectUserId(req);
    if (!subject) {
      return res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
    }

    let targetUserId = String(subject);
    if (req.query.userId && String(req.query.userId) !== targetUserId) {
      if (!isDirectSuperadmin(req)) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'You can only view your own AI usage',
        });
      }
      if (!mongoose.isValidObjectId(req.query.userId)) {
        return res.status(400).json({ success: false, error: 'INVALID_USER_ID' });
      }
      targetUserId = String(req.query.userId);
    }

    const days = clampDays(req.query.days);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [totalsRow] = await AiUsageEvent.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(targetUserId), createdAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          requests: { $sum: 1 },
          successes: { $sum: { $cond: ['$success', 1, 0] } },
          failures: { $sum: { $cond: ['$success', 0, 1] } },
          inputTokens: { $sum: '$inputTokens' },
          outputTokens: { $sum: '$outputTokens' },
          totalTokens: { $sum: '$totalTokens' },
        },
      },
    ]);

    const byModel = await AiUsageEvent.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(targetUserId), createdAt: { $gte: since } } },
      {
        $group: {
          _id: { provider: '$provider', modelId: '$modelId' },
          requests: { $sum: 1 },
          failures: { $sum: { $cond: ['$success', 0, 1] } },
          inputTokens: { $sum: '$inputTokens' },
          outputTokens: { $sum: '$outputTokens' },
          totalTokens: { $sum: '$totalTokens' },
        },
      },
      { $sort: { requests: -1 } },
      { $limit: 20 },
    ]);

    const totals = totalsRow || {
      requests: 0,
      successes: 0,
      failures: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };

    return res.json({
      success: true,
      days,
      since: since.toISOString(),
      totals: {
        requests: totals.requests,
        successes: totals.successes,
        failures: totals.failures,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        totalTokens: totals.totalTokens,
      },
      byModel: byModel.map((row) => ({
        provider: row._id.provider,
        modelId: row._id.modelId,
        requests: row.requests,
        failures: row.failures,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        totalTokens: row.totalTokens,
      })),
      caveats: {
        pricingKnown: false,
        // Honest caveat: real recorded usage, unknown per-unit cost.
        message: 'Real recorded request and token counts. Exact cost is unknown because per-unit provider rates are not tracked.',
        messageAr: 'أعداد حقيقية مسجلة للطلبات والرموز. التكلفة الدقيقة غير معروفة لأن أسعار الوحدات لدى المزود غير متتبعة.',
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'AI_USAGE_SUMMARY_FAILED', message: err.message });
  }
});

module.exports = router;
