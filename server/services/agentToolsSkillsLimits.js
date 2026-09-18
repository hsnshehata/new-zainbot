// server/services/agentToolsSkillsLimits.js
// Free plan: unlimited skills, max 3 active tools. Paid plans: unlimited both.
const { PLANS } = require('../config/plans');

const ALL_AGENT_TOOL_KEYS = Object.freeze([
  'bookingTool',
  'orderTrackingTool',
  'whatsappNotificationTool',
  'telegramNotificationTool',
  'messageClassificationTool',
  'salesRecoveryTool',
  'dailyDigestTool',
  'salesUpsellTool',
]);

function countActiveTools(agentTools) {
  if (!agentTools || typeof agentTools !== 'object') return 0;
  return ALL_AGENT_TOOL_KEYS.filter((k) => agentTools[k] && agentTools[k].enabled === true).length;
}

function normalizeSkills(agentSkills) {
  if (!Array.isArray(agentSkills)) return [];
  return agentSkills
    .map((s) => (typeof s === 'string' ? s.trim() : String(s?.skillKey || '').trim()))
    .filter(Boolean);
}

function isFreeTier(userTier, subscriptionType) {
  if (userTier) return userTier === 'free';
  return !subscriptionType || subscriptionType === 'free';
}

function validateToolsAndSkillsLimits(userTier, agentTools, agentSkills, subscriptionType) {
  if (!isFreeTier(userTier, subscriptionType)) return { allowed: true };
  const maxTools = (PLANS.free && PLANS.free.maxTools) || 3;
  const activeTools = countActiveTools(agentTools);
  if (activeTools > maxTools) {
    return {
      allowed: false,
      error: 'FREE_PLAN_TOOLS_LIMIT',
      message: `تسمح الباقة المجانية بتفعيل ${maxTools} أدوات فقط كحد أقصى للوكيل. يرجى الترقية لتفعيل أدوات غير محدودة.`,
    };
  }
  // Skills are unlimited on free plan by policy.
  return { allowed: true };
}

module.exports = {
  ALL_AGENT_TOOL_KEYS,
  countActiveTools,
  normalizeSkills,
  isFreeTier,
  validateToolsAndSkillsLimits,
  FREE_MAX_TOOLS: 3,
};
