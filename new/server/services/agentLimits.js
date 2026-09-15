const AGENT_LIMITS_BY_TIER = Object.freeze({
  free: 1,
  growth_1k: 5,
  growth_10k: 15,
  growth_50k: 50,
  unlimited: Number.POSITIVE_INFINITY,
});

function getAgentLimit(subscriptionTier) {
  return AGENT_LIMITS_BY_TIER[subscriptionTier] ?? AGENT_LIMITS_BY_TIER.free;
}

function canCreateAgent(subscriptionTier, activeAgentCount) {
  const limit = getAgentLimit(subscriptionTier);
  const current = Math.max(0, Number(activeAgentCount) || 0);
  return { allowed: current < limit, limit, current };
}

module.exports = { AGENT_LIMITS_BY_TIER, getAgentLimit, canCreateAgent };
