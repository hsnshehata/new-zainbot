// server/routes/onboardingMetrics.js
// First-conversation funnel measurement (item 2 of the growth improvements).
//
// Mounted in server/server.js as:
//   app.use('/api/onboarding-events', ...onboardingEventsRouter);   // POST /
//   app.use('/api/onboarding-metrics', ...onboardingMetricsRouter);  // GET /funnel
const express = require('express');

const OnboardingEvent = require('../models/OnboardingEvent');
const { ONBOARDING_STEPS } = require('../models/OnboardingEvent');
const authenticate = require('../middleware/authenticate');
const { loadAccessibleBot } = require('../middleware/botAccess');
const { requireDirectActorRole } = require('../middleware/authorize');
const { validateBody, Joi } = require('../middleware/validate');
const logger = require('../logger');

const FUNNEL_WINDOW_DAYS = 30;

function subjectUserId(req) {
  return req.auth?.subjectUserId || req.user.userId;
}

const eventSchema = Joi.object({
  botId: Joi.string().hex().length(24).required(),
  step: Joi.string()
    .valid(...ONBOARDING_STEPS)
    .required(),
});

// POST /api/onboarding-events — record one funnel step (idempotent).
const onboardingEventsRouter = express.Router();
onboardingEventsRouter.post(
  '/',
  authenticate,
  validateBody(eventSchema),
  loadAccessibleBot,
  async (req, res) => {
    try {
      const userId = subjectUserId(req);
      const { botId, step } = req.body;

      const raw = await OnboardingEvent.findOneAndUpdate(
        { userId, botId, step },
        { $setOnInsert: { userId, botId, step } },
        {
          upsert: true,
          new: true,
          rawResult: true,
          setDefaultsOnInsert: true,
        }
      );

      const doc = raw && raw.value !== undefined ? raw.value : raw;
      const created = raw && raw.lastErrorObject
        ? !raw.lastErrorObject.updatedExisting
        : true;

      logger.info('onboarding_event_recorded', {
        requestId: req.requestId,
        userId: String(userId),
        botId: String(botId),
        step,
        created,
      });
      return res.status(created ? 201 : 200).json({
        success: true,
        created,
        data: doc,
      });
    } catch (err) {
      // Lost an insert race with another request for the same key:
      // the row already exists, so report the idempotent outcome.
      if (err && err.code === 11000) {
        const existing = await OnboardingEvent.findOne({
          userId: subjectUserId(req),
          botId: req.body.botId,
          step: req.body.step,
        });
        return res.status(200).json({
          success: true,
          created: false,
          data: existing,
        });
      }
      logger.error('onboarding_event_error', {
        requestId: req.requestId,
        err: err.message,
      });
      return res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
  }
);

function conversionRate(numerator, denominator) {
  if (!denominator || denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(4));
}

// GET /api/onboarding-metrics/funnel — superadmin funnel over the last 30 days.
const onboardingMetricsRouter = express.Router();
onboardingMetricsRouter.get(
  '/funnel',
  authenticate,
  requireDirectActorRole('superadmin'),
  async (req, res) => {
    try {
      const since = new Date(
        Date.now() - FUNNEL_WINDOW_DAYS * 24 * 60 * 60 * 1000
      );
      const timeFilter = { createdAt: { $gte: since } };

      const [personalized, trained, tested] = await Promise.all(
        ONBOARDING_STEPS.map((step) =>
          OnboardingEvent.countDocuments({ step, ...timeFilter })
        )
      );

      return res.json({
        success: true,
        data: {
          windowDays: FUNNEL_WINDOW_DAYS,
          since,
          counts: { personalized, trained, tested },
          rates: {
            personalizedToTrained: conversionRate(trained, personalized),
            trainedToTested: conversionRate(tested, trained),
            personalizedToTested: conversionRate(tested, personalized),
          },
        },
      });
    } catch (err) {
      logger.error('onboarding_funnel_error', {
        requestId: req.requestId,
        err: err.message,
      });
      return res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
    }
  }
);

module.exports = {
  onboardingEventsRouter,
  onboardingMetricsRouter,
  FUNNEL_WINDOW_DAYS,
};
