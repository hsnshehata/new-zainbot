const test = require('node:test');
const assert = require('node:assert/strict');
const { PLANS, priceForTier, getPlan } = require('../server/config/plans');

test('plans: free allows 3 tools and unlimited skills', () => {
  assert.equal(PLANS.free.maxTools, 3);
  assert.equal(PLANS.free.maxSkills, Number.POSITIVE_INFINITY);
  assert.equal(PLANS.free.monthlyEGP, 0);
});

test('plans: growth has 3 levels with same features, bigger numbers', () => {
  assert.equal(PLANS.growth_1k.monthlyEGP, 199);
  assert.equal(PLANS.growth_10k.monthlyEGP, 499);
  assert.equal(PLANS.growth_50k.monthlyEGP, 999);
  assert.equal(PLANS.growth_1k.agents, 5);
  assert.equal(PLANS.growth_10k.agents, 15);
  assert.equal(PLANS.growth_50k.agents, 50);
  assert.equal(PLANS.growth_1k.messages.monthly, 1000);
  assert.equal(PLANS.growth_10k.messages.monthly, 10000);
  assert.equal(PLANS.growth_50k.messages.monthly, 50000);
});

test('plans: enterprise is 4999/mo', () => {
  assert.equal(PLANS.unlimited.monthlyEGP, 4999);
  assert.equal(PLANS.unlimited.agents, Number.POSITIVE_INFINITY);
});

test('plans: yearly saves 2 months (x10)', () => {
  assert.equal(priceForTier('growth_1k', 'yearly'), 1990);
  assert.equal(priceForTier('growth_10k', 'yearly'), 4990);
  assert.equal(priceForTier('growth_50k', 'yearly'), 9990);
  assert.equal(priceForTier('unlimited', 'yearly'), 49990);
  assert.equal(priceForTier('growth_1k', 'monthly'), 199);
});

test('plans: getPlan falls back to free', () => {
  assert.equal(getPlan('nope').tier, 'free');
});
