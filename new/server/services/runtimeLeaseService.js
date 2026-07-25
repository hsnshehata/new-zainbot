const crypto = require('crypto');
const RuntimeLease = require('../models/RuntimeLease');

const DEFAULT_LEASE_MS = 90_000;

function createRuntimeLeaseService(options = {}) {
  const LeaseModel = options.LeaseModel || RuntimeLease;
  const ownerId = options.ownerId
    || `${process.env.HOSTNAME || 'zainbot'}-${process.pid}-${crypto.randomUUID()}`;
  const now = options.now || (() => new Date());
  const leaseMs = options.leaseMs || DEFAULT_LEASE_MS;

  async function acquire(resourceKey) {
    const acquiredAt = now();
    const leaseUntil = new Date(acquiredAt.getTime() + leaseMs);
    try {
      const lease = await LeaseModel.findOneAndUpdate(
        {
          resourceKey,
          $or: [
            { ownerId },
            { leaseUntil: { $lte: acquiredAt } },
          ],
        },
        {
          $set: {
            ownerId,
            acquiredAt,
            leaseUntil,
            updatedAt: acquiredAt,
          },
          $setOnInsert: { resourceKey },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );
      return lease && lease.ownerId === ownerId ? lease : null;
    } catch (error) {
      if (error?.code === 11000) {
        return null;
      }
      throw error;
    }
  }

  async function renew(resourceKey) {
    const updatedAt = now();
    return LeaseModel.findOneAndUpdate(
      { resourceKey, ownerId },
      {
        $set: {
          leaseUntil: new Date(updatedAt.getTime() + leaseMs),
          updatedAt,
        },
      },
      { new: true }
    );
  }

  async function release(resourceKey) {
    return LeaseModel.deleteOne({ resourceKey, ownerId });
  }

  return {
    ownerId,
    leaseMs,
    acquire,
    renew,
    release,
  };
}

module.exports = {
  DEFAULT_LEASE_MS,
  createRuntimeLeaseService,
};
