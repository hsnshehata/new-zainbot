const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateToolsAndSkillsLimits,
  countActiveTools,
  normalizeSkills,
} = require('../server/services/agentToolsSkillsLimits');

test('Free Plan allows up to 3 active tools and unlimited skills', () => {
  const tools = {
    bookingTool: { enabled: true },
    orderTrackingTool: { enabled: true },
    whatsappNotificationTool: { enabled: true },
    telegramNotificationTool: { enabled: false },
  };
  const skills = [
    'sales_consultant',
    'appointment_scheduler',
    'order_manager',
    'support_specialist',
    'winback_agent',
  ];

  const result = validateToolsAndSkillsLimits('free', tools, skills);
  assert.equal(result.allowed, true);
  assert.equal(countActiveTools(tools), 3);
  assert.deepEqual(normalizeSkills(skills).length, 5);
});

test('Free Plan blocks more than 3 active tools', () => {
  const tools = {
    bookingTool: { enabled: true },
    orderTrackingTool: { enabled: true },
    whatsappNotificationTool: { enabled: true },
    telegramNotificationTool: { enabled: true },
  };
  const skills = ['sales_consultant'];

  const result = validateToolsAndSkillsLimits('free', tools, skills);
  assert.equal(result.allowed, false);
  assert.equal(result.error, 'FREE_PLAN_TOOLS_LIMIT');
});

test('Free Plan allows all 5 skills (no skills cap)', () => {
  const tools = {
    bookingTool: { enabled: true },
  };
  const skills = [
    'sales_consultant',
    'appointment_scheduler',
    'order_manager',
    'support_specialist',
    'winback_agent',
  ];

  const result = validateToolsAndSkillsLimits('free', tools, skills);
  assert.equal(result.allowed, true);
});

test('Paid Plans (Growth / Enterprise) allow unlimited tools and skills', () => {
  const tools = {
    bookingTool: { enabled: true },
    orderTrackingTool: { enabled: true },
    whatsappNotificationTool: { enabled: true },
    telegramNotificationTool: { enabled: true },
    messageClassificationTool: { enabled: true },
    salesRecoveryTool: { enabled: true },
    dailyDigestTool: { enabled: true },
    salesUpsellTool: { enabled: true },
  };
  const skills = [
    'sales_consultant',
    'appointment_scheduler',
    'order_manager',
    'support_specialist',
    'winback_agent',
  ];

  for (const tier of ['growth_1k', 'growth_10k', 'growth_50k', 'unlimited']) {
    const result = validateToolsAndSkillsLimits(tier, tools, skills);
    assert.equal(result.allowed, true, `tier ${tier} should allow unlimited`);
  }
});
