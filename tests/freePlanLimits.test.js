'use strict';
const assert = require('assert');
const { checkCountLimit, reserveAssistantMessage, FREE_LIMITS } = require('../server/services/freePlanLimits');

const free = { subscriptionTier: 'free', role: 'user' };
assert.strictEqual(checkCountLimit(free, 'stores', 0).allowed, true);
assert.strictEqual(checkCountLimit(free, 'stores', 1).allowed, false);
assert.strictEqual(checkCountLimit(free, 'productsPerStore', FREE_LIMITS.productsPerStore - 1).allowed, true);
assert.strictEqual(checkCountLimit(free, 'productsPerStore', FREE_LIMITS.productsPerStore).allowed, false);
assert.strictEqual(checkCountLimit({ subscriptionTier: 'growth_1k' }, 'stores', 99).allowed, true);
assert.strictEqual(checkCountLimit({ subscriptionTier: 'free', role: 'superadmin' }, 'stores', 99).allowed, true);

{
  const { freeUploadSizeGuard } = require('../server/services/freePlanLimits');
  const run = (user, size) => { let out = 'next'; const res = { status(c) { out = c; return this; }, json() { return this; } }; freeUploadSizeGuard({ user, file: { size } }, res, () => {}); return out; };
  assert.strictEqual(run(free, 3 * 1024 * 1024), 413);
  assert.strictEqual(run(free, 1024 * 1024), 'next');
  assert.strictEqual(run({ subscriptionTier: 'growth_1k' }, 9 * 1024 * 1024), 'next');
}
(async () => {
  let used = 0;
  const model = {
    updateOne: async () => ({}),
    findOneAndUpdate: async () => (used < FREE_LIMITS.assistantMessagesPerDay ? { assistantMessagesToday: ++used } : null),
  };
  for (let i = 0; i < FREE_LIMITS.assistantMessagesPerDay; i++) {
    assert.strictEqual((await reserveAssistantMessage(model, { _id: 'u', ...free })).allowed, true);
  }
  assert.strictEqual((await reserveAssistantMessage(model, { _id: 'u', ...free })).allowed, false);
  assert.strictEqual((await reserveAssistantMessage(model, { _id: 'u', subscriptionTier: 'growth_1k' })).allowed, true);
  console.log('freePlanLimits ok');
})();
