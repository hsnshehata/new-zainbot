const test = require('node:test');
const assert = require('node:assert/strict');

function countActiveTools(agentTools) {
  if (!agentTools || typeof agentTools !== 'object') return 0;
  return Object.keys(agentTools).filter((k) => agentTools[k] && agentTools[k].enabled === true).length;
}

function validateToolsAndSkillsLimits(userTier, agentTools, agentSkills) {
  const isFree = !userTier || userTier === 'free' || userTier.startsWith('free');
  if (!isFree) return { allowed: true };

  const activeTools = countActiveTools(agentTools);
  if (activeTools > 2) {
    return {
      allowed: false,
      error: 'FREE_PLAN_TOOLS_LIMIT',
      message: 'تسمح الباقة المجانية بتفعيل أداتين فقط كحد أقصى للوكيل. يرجى الترقية لتفعيل أدوات غير محدودة.',
    };
  }

  const activeSkillsCount = Array.isArray(agentSkills) ? agentSkills.length : 0;
  if (activeSkillsCount > 2) {
    return {
      allowed: false,
      error: 'FREE_PLAN_SKILLS_LIMIT',
      message: 'تسمح الباقة المجانية باختيار مهارتين فقط كحد أقصى للوكيل. يرجى الترقية لفتح كافة المهارات.',
    };
  }

  return { allowed: true };
}

test('Free Plan allows up to 2 active tools and 2 active skills', () => {
  const tools = {
    bookingTool: { enabled: true },
    orderTrackingTool: { enabled: true },
    whatsappNotificationTool: { enabled: false },
    telegramNotificationTool: { enabled: false }
  };
  const skills = [
    { skillKey: 'sales_consultant', enabled: true },
    { skillKey: 'appointment_scheduler', enabled: true }
  ];

  const result = validateToolsAndSkillsLimits('free', tools, skills);
  assert.equal(result.allowed, true);
});

test('Free Plan blocks more than 2 active tools', () => {
  const tools = {
    bookingTool: { enabled: true },
    orderTrackingTool: { enabled: true },
    whatsappNotificationTool: { enabled: true },
    telegramNotificationTool: { enabled: false }
  };
  const skills = [
    { skillKey: 'sales_consultant', enabled: true }
  ];

  const result = validateToolsAndSkillsLimits('free', tools, skills);
  assert.equal(result.allowed, false);
  assert.equal(result.error, 'FREE_PLAN_TOOLS_LIMIT');
});

test('Free Plan blocks more than 2 active skills', () => {
  const tools = {
    bookingTool: { enabled: true }
  };
  const skills = [
    { skillKey: 'sales_consultant', enabled: true },
    { skillKey: 'appointment_scheduler', enabled: true },
    { skillKey: 'order_manager', enabled: true }
  ];

  const result = validateToolsAndSkillsLimits('free', tools, skills);
  assert.equal(result.allowed, false);
  assert.equal(result.error, 'FREE_PLAN_SKILLS_LIMIT');
});

test('Paid Plans (Growth / Enterprise) allow unlimited tools and skills', () => {
  const tools = {
    bookingTool: { enabled: true },
    orderTrackingTool: { enabled: true },
    whatsappNotificationTool: { enabled: true },
    telegramNotificationTool: { enabled: true },
    messageClassificationTool: { enabled: true }
  };
  const skills = [
    { skillKey: 'sales_consultant', enabled: true },
    { skillKey: 'appointment_scheduler', enabled: true },
    { skillKey: 'order_manager', enabled: true },
    { skillKey: 'support_specialist', enabled: true },
    { skillKey: 'winback_agent', enabled: true }
  ];

  const growthResult = validateToolsAndSkillsLimits('growth_1k', tools, skills);
  assert.equal(growthResult.allowed, true);

  const enterpriseResult = validateToolsAndSkillsLimits('unlimited', tools, skills);
  assert.equal(enterpriseResult.allowed, true);
});
