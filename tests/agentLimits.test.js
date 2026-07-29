const test = require('node:test');
const assert = require('node:assert/strict');
const { canCreateAgent, getAgentLimit } = require('../server/services/agentLimits');

test('agent limits reflect public tier entitlements', () => {
  assert.equal(getAgentLimit('free'), 1);
  assert.equal(getAgentLimit('growth_1k'), 5);
  assert.equal(getAgentLimit('growth_10k'), 15);
  assert.equal(getAgentLimit('growth_50k'), 50);
  assert.equal(getAgentLimit('unlimited'), Number.POSITIVE_INFINITY);
});

test('agent creation stops at the tier limit without affecting legacy agents', () => {
  assert.deepEqual(canCreateAgent('free', 0), { allowed: true, current: 0, limit: 1 });
  assert.deepEqual(canCreateAgent('free', 1), { allowed: false, current: 1, limit: 1 });
  assert.equal(canCreateAgent('free', 3).allowed, false);
  assert.equal(canCreateAgent('unlimited', 10_000).allowed, true);
});
