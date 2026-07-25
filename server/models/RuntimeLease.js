const mongoose = require('mongoose');

const runtimeLeaseSchema = new mongoose.Schema({
  resourceKey: {
    type: String,
    required: true,
    unique: true,
    immutable: true,
    maxlength: 220,
  },
  ownerId: {
    type: String,
    required: true,
    maxlength: 160,
    index: true,
  },
  acquiredAt: {
    type: Date,
    required: true,
  },
  leaseUntil: {
    type: Date,
    required: true,
    index: true,
  },
  updatedAt: {
    type: Date,
    required: true,
  },
}, {
  strict: 'throw',
  versionKey: false,
});

runtimeLeaseSchema.index(
  { leaseUntil: 1 },
  { expireAfterSeconds: 0, name: 'runtime_lease_ttl' }
);

module.exports = mongoose.model('RuntimeLease', runtimeLeaseSchema);
