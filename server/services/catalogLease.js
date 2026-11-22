'use strict';
// Connector replacement/configuration is forbidden during its active lease.
// Claims and publishing predicates use the same Mongo clock, so an expired
// worker cannot publish between its application check and the database write.
const claimableLease = { $or: [{ state: { $ne: 'running' } },
  { $expr: { $lte: [{ $ifNull: ['$leaseUntil', new Date(0)] }, '$$NOW'] } }] };
const activeLease = { $expr: { $gt: ['$leaseUntil', '$$NOW'] } };
function claimLeaseUpdate() {
  return [{ $set: { state: 'running', leaseUntil: { $add: ['$$NOW', 300000] },
    syncGeneration: { $add: [{ $ifNull: ['$syncGeneration', 0] }, 1] }, lastError: null, updatedAt: '$$NOW' } }];
}
function catalogWriteFence(config) {
  if (!config.leaseUntil) {
    // Persisted connectors must always carry the route's claimed lease.
    // Plain source-only configurations are used by isolated service fixtures.
    if (config._id) { const e = new Error('STALE_CATALOG_SYNC'); e.code = 'STALE_CATALOG_SYNC'; throw e; }
    return {};
  }
  const lease = new Date(config.leaseUntil);
  if (!Number.isFinite(lease.getTime())) { const e = new Error('STALE_CATALOG_SYNC'); e.code = 'STALE_CATALOG_SYNC'; throw e; }
  return { $expr: { $gt: [{ $literal: lease }, '$$NOW'] } };
}
module.exports = { claimableLease, activeLease, claimLeaseUpdate, catalogWriteFence };
