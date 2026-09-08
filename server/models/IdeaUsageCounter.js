'use strict';

const mongoose = require('mongoose');

const ideaUsageCounterSchema = new mongoose.Schema({
  counterKey: {
    type: String,
    required: true,
    unique: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  yearMonthUtc: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}$/,
  },
  initialRunsReserved: {
    type: Number,
    default: 0,
    min: 0,
  },
  initialRunsCompleted: {
    type: Number,
    default: 0,
    min: 0,
  },
}, {
  timestamps: true,
  strict: 'throw',
});

// Helper static method for atomic quota reservation
ideaUsageCounterSchema.statics.reserveQuota = async function(userId, monthlyLimit = 3, date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yearMonthUtc = `${year}-${month}`;
  const counterKey = `${userId}:${yearMonthUtc}`;

  // Ensure record exists atomically
  await this.updateOne(
    { counterKey },
    {
      $setOnInsert: {
        counterKey,
        userId,
        yearMonthUtc,
        initialRunsReserved: 0,
        initialRunsCompleted: 0,
      },
    },
    { upsert: true }
  );

  // Attempt atomic reservation where initialRunsReserved < monthlyLimit
  const updated = await this.findOneAndUpdate(
    {
      counterKey,
      initialRunsReserved: { $lt: monthlyLimit },
    },
    {
      $inc: { initialRunsReserved: 1 },
    },
    { new: true }
  );

  if (!updated) {
    const current = await this.findOne({ counterKey }).lean();
    return {
      allowed: false,
      yearMonthUtc,
      used: current?.initialRunsReserved || monthlyLimit,
      limit: monthlyLimit,
      remaining: 0,
    };
  }

  return {
    allowed: true,
    yearMonthUtc,
    used: updated.initialRunsReserved,
    limit: monthlyLimit,
    remaining: Math.max(0, monthlyLimit - updated.initialRunsReserved),
  };
};

// Helper static method for releasing reservation on final unrecoverable system failure
ideaUsageCounterSchema.statics.releaseReservation = async function(userId, date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yearMonthUtc = `${year}-${month}`;
  const counterKey = `${userId}:${yearMonthUtc}`;

  await this.findOneAndUpdate(
    {
      counterKey,
      initialRunsReserved: { $gt: 0 },
    },
    {
      $inc: { initialRunsReserved: -1 },
    }
  );
};

// Helper static method for getting current usage
ideaUsageCounterSchema.statics.getUsage = async function(userId, monthlyLimit = 3, date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yearMonthUtc = `${year}-${month}`;
  const counterKey = `${userId}:${yearMonthUtc}`;

  const counter = await this.findOne({ counterKey }).lean();
  const used = counter?.initialRunsReserved || 0;
  const completed = counter?.initialRunsCompleted || 0;

  // Next reset is 1st of next month UTC
  const nextResetDate = new Date(Date.UTC(
    date.getUTCMonth() === 11 ? year + 1 : year,
    (date.getUTCMonth() + 1) % 12,
    1,
    0, 0, 0, 0
  ));

  return {
    yearMonthUtc,
    limit: monthlyLimit,
    used,
    completed,
    remaining: Math.max(0, monthlyLimit - used),
    nextResetDate,
  };
};

module.exports = mongoose.model('IdeaUsageCounter', ideaUsageCounterSchema);
