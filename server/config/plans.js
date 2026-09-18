// server/config/plans.js
// Single source of truth for ZainBot subscription plans & pricing (EGP).
// Free: all skills, max 3 tools. Growth: 3 levels, same features with bigger numbers.
// Enterprise: unlimited, 4999/mo. Yearly = monthly * 10 (2 months free).

const PLANS = Object.freeze({
  free: Object.freeze({
    tier: 'free',
    nameKey: 'plan_free_title',
    monthlyEGP: 0,
    yearlyEGP: 0,
    agents: 1,
    messages: Object.freeze({ daily: 25, monthly: 250 }),
    maxTools: 3,
    maxSkills: Number.POSITIVE_INFINITY,
    ideaEvaluationsPerMonth: 3,
    notificationRecipients: 1,
    support: 'basic',
  }),
  growth_1k: Object.freeze({
    tier: 'growth_1k',
    nameKey: 'plan_growth1_title',
    monthlyEGP: 199,
    yearlyEGP: 1990,
    agents: 5,
    messages: Object.freeze({ monthly: 1000 }),
    maxTools: Number.POSITIVE_INFINITY,
    maxSkills: Number.POSITIVE_INFINITY,
    ideaEvaluationsPerMonth: 10,
    notificationRecipients: Number.POSITIVE_INFINITY,
    support: 'priority',
  }),
  growth_10k: Object.freeze({
    tier: 'growth_10k',
    nameKey: 'plan_growth2_title',
    monthlyEGP: 499,
    yearlyEGP: 4990,
    agents: 15,
    messages: Object.freeze({ monthly: 10000 }),
    maxTools: Number.POSITIVE_INFINITY,
    maxSkills: Number.POSITIVE_INFINITY,
    ideaEvaluationsPerMonth: 30,
    notificationRecipients: Number.POSITIVE_INFINITY,
    support: 'priority',
  }),
  growth_50k: Object.freeze({
    tier: 'growth_50k',
    nameKey: 'plan_growth3_title',
    monthlyEGP: 999,
    yearlyEGP: 9990,
    agents: 50,
    messages: Object.freeze({ monthly: 50000 }),
    maxTools: Number.POSITIVE_INFINITY,
    maxSkills: Number.POSITIVE_INFINITY,
    ideaEvaluationsPerMonth: 100,
    notificationRecipients: Number.POSITIVE_INFINITY,
    support: 'priority',
  }),
  unlimited: Object.freeze({
    tier: 'unlimited',
    nameKey: 'plan_scale_title',
    monthlyEGP: 4999,
    yearlyEGP: 49990,
    agents: Number.POSITIVE_INFINITY,
    messages: null, // unmetered
    maxTools: Number.POSITIVE_INFINITY,
    maxSkills: Number.POSITIVE_INFINITY,
    ideaEvaluationsPerMonth: Number.POSITIVE_INFINITY,
    notificationRecipients: Number.POSITIVE_INFINITY,
    support: 'vip',
  }),
});

const TIER_ORDER = Object.freeze(['free', 'growth_1k', 'growth_10k', 'growth_50k', 'unlimited']);

function getPlan(tier) {
  return PLANS[tier] || PLANS.free;
}

function priceForTier(tier, billingPeriod = 'monthly') {
  const plan = getPlan(tier);
  if (billingPeriod === 'yearly') return plan.yearlyEGP;
  return plan.monthlyEGP;
}

function subscriptionConfig() {
  return {
    whatsappNumber: (process.env.SUBSCRIPTION_WHATSAPP_NUMBER || '').trim(),
    instapayAccount: (process.env.SUBSCRIPTION_INSTAPAY_ACCOUNT || '').trim(),
    cashWallet: (process.env.SUBSCRIPTION_CASH_WALLET || '').trim(),
    ownerContactText: (process.env.SUBSCRIPTION_OWNER_CONTACT || '').trim(),
  };
}

module.exports = { PLANS, TIER_ORDER, getPlan, priceForTier, subscriptionConfig };
