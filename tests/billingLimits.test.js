// tests/billingLimits.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { createBillingLimitsService, MESSAGE_LIMITS_BY_TIER } = require('../server/services/billingLimits');

const FIXED_NOW = new Date(2026, 6, 15, 12, 0, 0); // Jul 15 2026, noon (local)
const NEXT_MONTH_START = new Date(2026, 7, 1);
const HOUR_MS = 60 * 60 * 1000;

const silentLogger = { info() {}, warn() {}, error() {} };

function matchesCondition(value, cond) {
  if (cond === null || cond === undefined) return value == null;
  if (typeof cond === 'object' && !(cond instanceof Date)) {
    let ok = true;
    if ('$lt' in cond) ok = ok && value != null && value < cond.$lt;
    if ('$lte' in cond) ok = ok && value != null && value <= cond.$lte;
    if ('$gt' in cond) ok = ok && value != null && value > cond.$gt;
    if ('$gte' in cond) ok = ok && value != null && value >= cond.$gte;
    return ok;
  }
  return value === cond;
}

function matchesFilter(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((sub) => matchesFilter(doc, sub));
    if (key === '_id') return String(doc?._id) === String(cond);
    return matchesCondition(doc ? doc[key] : undefined, cond);
  });
}

function applyUpdate(doc, update = {}) {
  if (update.$set) Object.assign(doc, update.$set);
  if (update.$inc) {
    for (const [key, amount] of Object.entries(update.$inc)) {
      doc[key] = (doc[key] ?? 0) + amount;
    }
  }
}

// In-memory User model emulating Mongoose update semantics (matched/not-matched).
function createFakeUserModel(seedUsers = []) {
  const users = new Map();
  for (const user of seedUsers) users.set(user._id, { ...user });
  const calls = { updateOne: [], findOneAndUpdate: [], findById: [] };

  return {
    calls,
    docs: users,
    findById(id, projection) {
      calls.findById.push({ id: String(id), projection });
      const doc = users.get(id);
      return { lean: async () => (doc ? { ...doc } : null) };
    },
    async findOneAndUpdate(filter, update, options) {
      calls.findOneAndUpdate.push({ filter, update, options });
      const doc = users.get(filter._id);
      if (!doc || !matchesFilter(doc, filter)) return null;
      applyUpdate(doc, update);
      return { ...doc };
    },
    async updateOne(filter, update) {
      calls.updateOne.push({ filter, update });
      const doc = users.get(filter._id);
      const matched = Boolean(doc) && matchesFilter(doc, filter);
      if (matched) applyUpdate(doc, update);
      return { acknowledged: true, matchedCount: matched ? 1 : 0, modifiedCount: matched ? 1 : 0 };
    },
  };
}

function seedUser(overrides = {}) {
  return {
    _id: 'u1',
    subscriptionTier: 'free',
    dailyMessagesUsed: 0,
    monthlyMessagesUsed: 0,
    // One hour old: inside the current day and month window.
    lastUsageReset: new Date(FIXED_NOW.getTime() - HOUR_MS),
    ...overrides,
  };
}

function buildService(model) {
  return createBillingLimitsService({ userModel: model, loggerInstance: silentLogger, now: () => FIXED_NOW });
}

describe('billingLimits reservation', () => {
  test('caps match the legacy numbers per tier', () => {
    assert.deepEqual(MESSAGE_LIMITS_BY_TIER.free, { daily: 25, monthly: 250 });
    assert.equal(MESSAGE_LIMITS_BY_TIER.growth_1k.monthly, 1000);
    assert.equal(MESSAGE_LIMITS_BY_TIER.growth_10k.monthly, 10000);
    assert.equal(MESSAGE_LIMITS_BY_TIER.growth_50k.monthly, 50000);
  });

  test('allows below the cap via a guarded $inc and reports remaining/resetAt', async () => {
    const model = createFakeUserModel([seedUser({ dailyMessagesUsed: 10, monthlyMessagesUsed: 240 })]);
    const service = buildService(model);

    const outcome = await service.reserveMessageQuota({ userId: 'u1', botId: 'b1' });

    assert.equal(outcome.allowed, true);
    assert.equal(outcome.remaining, 9); // min(25 - 11, 250 - 241)
    assert.equal(outcome.resetAt.getTime(), NEXT_MONTH_START.getTime());

    const [attempt] = model.calls.findOneAndUpdate;
    assert.equal(attempt.filter.dailyMessagesUsed.$lt, 25);
    assert.equal(attempt.filter.monthlyMessagesUsed.$lt, 250);
    assert.deepEqual(attempt.update.$inc, { monthlyMessagesUsed: 1, dailyMessagesUsed: 1 });
    assert.equal(attempt.options.new, true);
    assert.equal(model.docs.get('u1').monthlyMessagesUsed, 241);
  });

  test('denies at the cap when the guarded update matches nothing', async () => {
    const model = createFakeUserModel([seedUser({ dailyMessagesUsed: 5, monthlyMessagesUsed: 250 })]);
    const service = buildService(model);

    const outcome = await service.reserveMessageQuota({ userId: 'u1', botId: 'b1' });

    assert.equal(outcome.allowed, false);
    assert.equal(outcome.remaining, 0);
    assert.equal(outcome.reason, 'monthly_limit');
    assert.equal(model.docs.get('u1').monthlyMessagesUsed, 250); // untouched
  });

  test('fires exactly one combined reset+advance update when the window expired', async () => {
    const model = createFakeUserModel([seedUser({
      monthlyMessagesUsed: 200,
      dailyMessagesUsed: 20,
      lastUsageReset: new Date(2026, 5, 10), // previous month
    })]);
    const service = buildService(model);

    const first = await service.reserveMessageQuota({ userId: 'u1', botId: 'b1' });

    assert.equal(first.allowed, true);
    assert.equal(model.calls.updateOne.length, 1);
    const rollover = model.calls.updateOne[0];
    assert.equal(rollover.update.$set.dailyMessagesUsed, 0);
    assert.equal(rollover.update.$set.monthlyMessagesUsed, 0);
    assert.ok(Array.isArray(rollover.filter.$or), 'guard condition on lastUsageReset');
    // Counters restarted from zero before this reservation was counted.
    assert.equal(model.docs.get('u1').monthlyMessagesUsed, 1);
    assert.equal(model.docs.get('u1').dailyMessagesUsed, 1); // new month is also a new day

    // Second reservation in the same window performs no further rollover.
    await service.reserveMessageQuota({ userId: 'u1', botId: 'b1' });
    assert.equal(model.calls.updateOne.length, 1);
    assert.equal(model.docs.get('u1').monthlyMessagesUsed, 2);
  });

  test('day-only rollover zeroes the daily counter but keeps current-month usage', async () => {
    const model = createFakeUserModel([seedUser({
      monthlyMessagesUsed: 5,
      dailyMessagesUsed: 25,
      lastUsageReset: new Date(2026, 6, 14, 18, 0, 0), // yesterday, same month
    })]);
    const service = buildService(model);

    const outcome = await service.reserveMessageQuota({ userId: 'u1', botId: 'b1' });

    assert.equal(outcome.allowed, true);
    const rollover = model.calls.updateOne[0];
    assert.equal(rollover.update.$set.dailyMessagesUsed, 0);
    assert.equal(rollover.update.$set.monthlyMessagesUsed, undefined);
    assert.equal(model.docs.get('u1').monthlyMessagesUsed, 6);
    assert.equal(model.docs.get('u1').dailyMessagesUsed, 1);
  });

  test('unlimited and unlisted tiers are never metered', async () => {
    for (const tier of ['unlimited', 'enterprise']) {
      const model = createFakeUserModel([seedUser({ subscriptionTier: tier })]);
      const service = buildService(model);
      const outcome = await service.reserveMessageQuota({ userId: 'u1', botId: 'b1' });
      assert.equal(outcome.allowed, true);
      assert.equal(model.calls.findOneAndUpdate.length, 0);
      assert.equal(model.calls.updateOne.length, 0);
    }
  });
});

describe('billingLimits settlement', () => {
  test('decrements atomically for successful compensations', async () => {
    const model = createFakeUserModel([seedUser({ monthlyMessagesUsed: 3 })]);
    const service = buildService(model);

    const outcome = await service.settleMessageQuota({ userId: 'u1', delta: 1 });

    assert.deepEqual(outcome, { settled: true });
    assert.equal(model.calls.updateOne.length, 1);
    assert.deepEqual(model.calls.updateOne[0].update, { $inc: { monthlyMessagesUsed: -1 } });
    assert.equal(model.docs.get('u1').monthlyMessagesUsed, 2);
  });

  test('clamps at zero instead of going negative', async () => {
    const model = createFakeUserModel([seedUser({ monthlyMessagesUsed: 2 })]);
    const service = buildService(model);

    const outcome = await service.settleMessageQuota({ userId: 'u1', delta: 5 });

    assert.deepEqual(outcome, { settled: true });
    assert.equal(model.calls.updateOne.length, 2);
    assert.equal(model.calls.updateOne[0].filter.monthlyMessagesUsed.$gte, 5);
    assert.deepEqual(model.calls.updateOne[1].update, { $set: { monthlyMessagesUsed: 0 } });
    assert.equal(model.docs.get('u1').monthlyMessagesUsed, 0);

    // Already at zero: nothing matches and nothing changes.
    const repeat = await service.settleMessageQuota({ userId: 'u1', delta: 1 });
    assert.deepEqual(repeat, { settled: false });
    assert.equal(model.docs.get('u1').monthlyMessagesUsed, 0);
  });

  test('ignores invalid deltas', async () => {
    const model = createFakeUserModel([seedUser({ monthlyMessagesUsed: 3 })]);
    const service = buildService(model);
    await service.settleMessageQuota({ userId: 'u1', delta: 0 });
    await service.settleMessageQuota({ userId: 'u1', delta: -2 });
    assert.equal(model.calls.updateOne.length, 0);
    assert.equal(model.docs.get('u1').monthlyMessagesUsed, 3);
  });
});

describe('legacy checkPlanLimitsAndIncrement wrapper', () => {
  test('preserves the legacy success shape and increments once', async () => {
    const model = createFakeUserModel([seedUser()]);
    const service = buildService(model);

    const result = await service.checkPlanLimitsAndIncrement({ _id: 'b1', userId: 'u1' });

    assert.deepEqual(result, { allowed: true, useBackup: false });
    assert.equal(model.docs.get('u1').monthlyMessagesUsed, 1);
    assert.equal(model.docs.get('u1').dailyMessagesUsed, 1);
  });

  test('free tier with own API key bypasses quotas without any write', async () => {
    const model = createFakeUserModel([seedUser({ dailyMessagesUsed: 30, monthlyMessagesUsed: 300 })]);
    const service = buildService(model);

    const result = await service.checkPlanLimitsAndIncrement({ _id: 'b1', userId: 'u1', userApiKey: 'sk-user' });

    assert.deepEqual(result, { allowed: true, useBackup: false });
    assert.equal(model.calls.updateOne.length, 0);
    assert.equal(model.calls.findOneAndUpdate.length, 0);
  });

  test('free tier denials keep the legacy daily/monthly messages in order', async () => {
    const dailyModel = createFakeUserModel([seedUser({ dailyMessagesUsed: 25, monthlyMessagesUsed: 100 })]);
    const dailyResult = await buildService(dailyModel).checkPlanLimitsAndIncrement({ _id: 'b1', userId: 'u1' });
    assert.equal(dailyResult.allowed, false);
    assert.match(dailyResult.message, /\(25 رسالة\/يوم\)/);

    const monthlyModel = createFakeUserModel([seedUser({ dailyMessagesUsed: 5, monthlyMessagesUsed: 250 })]);
    const monthlyResult = await buildService(monthlyModel).checkPlanLimitsAndIncrement({ _id: 'b1', userId: 'u1' });
    assert.equal(monthlyResult.allowed, false);
    assert.match(monthlyResult.message, /\(250 رسالة\/شهر\)/);

    // Both exhausted: the daily message wins, matching legacy check order.
    const bothModel = createFakeUserModel([seedUser({ dailyMessagesUsed: 25, monthlyMessagesUsed: 250 })]);
    const bothResult = await buildService(bothModel).checkPlanLimitsAndIncrement({ _id: 'b1', userId: 'u1' });
    assert.match(bothResult.message, /\(25 رسالة\/يوم\)/);
  });

  test('growth tier switches to the backup key without incrementing, else denies with the tier cap', async () => {
    const backupModel = createFakeUserModel([seedUser({
      subscriptionTier: 'growth_1k',
      monthlyMessagesUsed: 1000,
    })]);
    const backupResult = await buildService(backupModel)
      .checkPlanLimitsAndIncrement({ _id: 'b1', userId: 'u1', backupApiKey: 'sk-backup' });
    assert.deepEqual(backupResult, { allowed: true, useBackup: true });
    assert.equal(backupModel.docs.get('u1').monthlyMessagesUsed, 1000); // no charge on fallback

    const denyModel = createFakeUserModel([seedUser({
      subscriptionTier: 'growth_10k',
      monthlyMessagesUsed: 10000,
    })]);
    const denyResult = await buildService(denyModel).checkPlanLimitsAndIncrement({ _id: 'b1', userId: 'u1' });
    assert.equal(denyResult.allowed, false);
    assert.match(denyResult.message, /10000 محادثة/);
  });

  test('fails open for missing users, unmetered tiers, and errors', async () => {
    const missingModel = createFakeUserModel([]);
    assert.deepEqual(
      await buildService(missingModel).checkPlanLimitsAndIncrement({ _id: 'b1', userId: 'ghost' }),
      { allowed: true, useBackup: false }
    );

    const unlimitedModel = createFakeUserModel([seedUser({ subscriptionTier: 'unlimited' })]);
    assert.deepEqual(
      await buildService(unlimitedModel).checkPlanLimitsAndIncrement({ _id: 'b1', userId: 'u1' }),
      { allowed: true, useBackup: false }
    );
    assert.equal(unlimitedModel.calls.findOneAndUpdate.length, 0);

    const brokenModel = {
      findById: () => ({ lean: async () => { throw new Error('db down'); } }),
      async findOneAndUpdate() { return null; },
      async updateOne() { return { matchedCount: 0 }; },
    };
    assert.deepEqual(
      await buildService(brokenModel).checkPlanLimitsAndIncrement({ _id: 'b1', userId: 'u1' }),
      { allowed: true, useBackup: false }
    );
  });
});
