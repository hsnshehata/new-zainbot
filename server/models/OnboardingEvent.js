// server/models/OnboardingEvent.js
// First-conversation funnel events: one record per (user, bot, step).
// Steps mirror the guided onboarding flow: personalized -> trained -> tested.
const mongoose = require('mongoose');

const ONBOARDING_STEPS = Object.freeze(['personalized', 'trained', 'tested']);

const onboardingEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    botId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bot',
      required: true,
      index: true,
    },
    step: {
      type: String,
      enum: ONBOARDING_STEPS,
      required: true,
      index: true,
    },
  },
  {
    strict: 'throw',
    timestamps: { createdAt: true, updatedAt: true },
  }
);

// Idempotency: repeating the same step for the same (user, bot) never
// creates a second row — the route upserts on this key.
onboardingEventSchema.index(
  { userId: 1, botId: 1, step: 1 },
  { unique: true, name: 'onboarding_user_bot_step_unique' }
);
onboardingEventSchema.index(
  { step: 1, createdAt: -1 },
  { name: 'onboarding_step_time' }
);

module.exports =
  mongoose.models.OnboardingEvent ||
  mongoose.model('OnboardingEvent', onboardingEventSchema);
module.exports.ONBOARDING_STEPS = ONBOARDING_STEPS;
