'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const IdeaUsageCounter = require('../../server/models/IdeaUsageCounter');

test('ideaUsageCounter: simulates atomic quota reservation', async () => {
  const userId = new mongoose.Types.ObjectId();
  const testDate = new Date('2026-09-08T00:00:00.000Z');

  // Stub model findOneAndUpdate and updateOne for unit testing without full DB
  let reservedCount = 0;
  const originalUpdateOne = IdeaUsageCounter.updateOne;
  const originalFindOneAndUpdate = IdeaUsageCounter.findOneAndUpdate;
  const originalFindOne = IdeaUsageCounter.findOne;

  IdeaUsageCounter.updateOne = async () => ({ acknowledged: true });
  IdeaUsageCounter.findOneAndUpdate = async (filter, update) => {
    if (filter.initialRunsReserved && filter.initialRunsReserved.$lt !== undefined) {
      if (reservedCount < filter.initialRunsReserved.$lt) {
        reservedCount += 1;
        return {
          counterKey: filter.counterKey,
          userId,
          yearMonthUtc: '2026-09',
          initialRunsReserved: reservedCount,
        };
      }
      return null;
    }
    if (filter.initialRunsReserved && filter.initialRunsReserved.$gt !== undefined) {
      if (reservedCount > 0) {
        reservedCount -= 1;
      }
      return { initialRunsReserved: reservedCount };
    }
    return null;
  };
  IdeaUsageCounter.findOne = () => ({
    lean: () => Promise.resolve({
      userId,
      yearMonthUtc: '2026-09',
      initialRunsReserved: reservedCount,
      initialRunsCompleted: 0,
    }),
  });

  try {
    // 1st reservation: allowed
    const q1 = await IdeaUsageCounter.reserveQuota(userId, 3, testDate);
    assert.equal(q1.allowed, true);
    assert.equal(q1.used, 1);
    assert.equal(q1.remaining, 2);

    // 2nd reservation: allowed
    const q2 = await IdeaUsageCounter.reserveQuota(userId, 3, testDate);
    assert.equal(q2.allowed, true);
    assert.equal(q2.used, 2);
    assert.equal(q2.remaining, 1);

    // 3rd reservation: allowed
    const q3 = await IdeaUsageCounter.reserveQuota(userId, 3, testDate);
    assert.equal(q3.allowed, true);
    assert.equal(q3.used, 3);
    assert.equal(q3.remaining, 0);

    // 4th reservation: blocked by quota limit
    const q4 = await IdeaUsageCounter.reserveQuota(userId, 3, testDate);
    assert.equal(q4.allowed, false);
    assert.equal(q4.remaining, 0);

    // Releasing on system error
    await IdeaUsageCounter.releaseReservation(userId, testDate);
    assert.equal(reservedCount, 2);

    // Now a new reservation can proceed
    const q5 = await IdeaUsageCounter.reserveQuota(userId, 3, testDate);
    assert.equal(q5.allowed, true);
    assert.equal(q5.used, 3);
  } finally {
    IdeaUsageCounter.updateOne = originalUpdateOne;
    IdeaUsageCounter.findOneAndUpdate = originalFindOneAndUpdate;
    IdeaUsageCounter.findOne = originalFindOne;
  }
});
