// tests/subscriptionQueue.test.js
// Backend contract tests for the subscription review queue (item 4).
// Covers: review audit fields + in-app Notification, enriched GET /mine
// (queue position + bilingual status note, no auto-activation), admin
// status filter with pagination (limit/skip, max 100), per-user rate limit
// on request creation, entitlement unchanged until approval, and the
// double-submit guard.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-that-is-at-least-32-bytes-long';
process.env.NODE_ENV = 'test';

const SubscriptionRequest = require('../server/models/SubscriptionRequest');
const Notification = require('../server/models/Notification');
const User = require('../server/models/User');
const { signAccessToken } = require('../server/utils/authTokens');
const router = require('../server/routes/subscriptions');

function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/subscriptions', router);
  return app;
}

// Chainable Mongoose query stub: supports populate/sort/skip/limit and await.
function chainable(result, capture = {}) {
  const q = {
    populate(...args) { capture.populate = args; return q; },
    sort(...args) { capture.sort = args; return q; },
    skip(n) { capture.skip = n; return q; },
    limit(n) { capture.limit = n; return q; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return q;
}

const app = buildApp();

// Authenticated users visible to the (real) authenticate middleware.
const authUsers = new Map();
function tokenFor(user) {
  authUsers.set(String(user._id), user);
  return signAccessToken(user);
}
function makeUser(id, role = 'user') {
  return { _id: id, username: `user_${id}`, role, status: 'active', sessionVersion: 0 };
}

const originals = {
  findOne: SubscriptionRequest.findOne,
  create: SubscriptionRequest.create,
  find: SubscriptionRequest.find,
  countDocuments: SubscriptionRequest.countDocuments,
  findById: SubscriptionRequest.findById,
  userFindById: User.findById,
  userFindByIdAndUpdate: User.findByIdAndUpdate,
  notificationCreate: Notification.create,
};

test.beforeEach(() => {
  authUsers.clear();
  User.findById = (id) => ({
    select: () => ({ lean: async () => authUsers.get(String(id)) || null }),
  });
});

test.afterEach(() => {
  SubscriptionRequest.findOne = originals.findOne;
  SubscriptionRequest.create = originals.create;
  SubscriptionRequest.find = originals.find;
  SubscriptionRequest.countDocuments = originals.countDocuments;
  SubscriptionRequest.findById = originals.findById;
  User.findById = originals.userFindById;
  User.findByIdAndUpdate = originals.userFindByIdAndUpdate;
  Notification.create = originals.notificationCreate;
});

const CREATE_PAYLOAD = {
  tier: 'growth_1k',
  billingPeriod: 'monthly',
  paymentMethod: 'instapay',
  paymentReference: 'REF123',
};

test('POST /request creates a pending request without touching the user tier (no auto-activation)', async () => {
  const user = makeUser('u-create-1');
  const token = tokenFor(user);
  let createdPayload;
  const userUpdates = [];
  const notifications = [];
  SubscriptionRequest.findOne = async () => null;
  SubscriptionRequest.create = async (payload) => {
    createdPayload = payload;
    return { _id: 'req-new-1', ...payload, createdAt: new Date('2026-09-28T10:00:00Z') };
  };
  User.findByIdAndUpdate = async (...args) => { userUpdates.push(args); return {}; };
  Notification.create = async (doc) => { notifications.push(doc); return { _id: 'n0', ...doc }; };

  const res = await request(app)
    .post('/api/subscriptions/request')
    .set('Authorization', `Bearer ${token}`)
    .send(CREATE_PAYLOAD);

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.status, 'pending');
  assert.equal(res.body.data.tier, 'growth_1k');
  assert.equal(createdPayload.status, 'pending');
  // Entitlement unchanged: creation must not activate any tier or notify.
  assert.equal(userUpdates.length, 0);
  assert.equal(notifications.length, 0);
});

test('POST /request keeps the double-submit guard (409 on existing pending)', async () => {
  const user = makeUser('u-double-1');
  const token = tokenFor(user);
  let createCalls = 0;
  const existing = { _id: 'req-old-1', userId: user._id, status: 'pending', tier: 'growth_1k' };
  SubscriptionRequest.findOne = async () => existing;
  SubscriptionRequest.create = async () => { createCalls++; return {}; };

  const res = await request(app)
    .post('/api/subscriptions/request')
    .set('Authorization', `Bearer ${token}`)
    .send(CREATE_PAYLOAD);

  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'PENDING_REQUEST_EXISTS');
  assert.equal(createCalls, 0);
});

test('POST /request rate-limits a user to 5 creations per day (6th is 429)', async () => {
  const user = makeUser('u-ratelimit-1');
  const token = tokenFor(user);
  let seq = 0;
  SubscriptionRequest.findOne = async () => null;
  SubscriptionRequest.create = async (payload) => {
    seq++;
    return { _id: `req-rl-${seq}`, ...payload, status: 'pending', createdAt: new Date() };
  };

  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const res = await request(app)
      .post('/api/subscriptions/request')
      .set('Authorization', `Bearer ${token}`)
      .send(CREATE_PAYLOAD);
    statuses.push(res.status);
    if (i === 5) assert.equal(res.body.error, 'SUBSCRIPTION_REQUEST_LIMIT');
  }
  assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
});

test('GET /mine enriches with queue position + bilingual note and never activates the tier', async () => {
  const user = makeUser('u-mine-1');
  const token = tokenFor(user);
  const pendingAt = new Date('2026-09-01T10:00:00Z');
  const docs = [
    {
      _id: 'req-pending-1', userId: user._id, tier: 'growth_1k',
      billingPeriod: 'monthly', paymentMethod: 'instapay',
      status: 'pending', createdAt: pendingAt,
    },
    {
      _id: 'req-approved-1', userId: user._id, tier: 'growth_1k',
      billingPeriod: 'monthly', paymentMethod: 'instapay',
      status: 'approved', createdAt: new Date('2026-08-01T10:00:00Z'),
    },
  ];
  let countFilter;
  const userUpdates = [];
  SubscriptionRequest.find = () => chainable(docs);
  SubscriptionRequest.countDocuments = async (filter) => { countFilter = filter; return 3; };
  User.findByIdAndUpdate = async (...args) => { userUpdates.push(args); return {}; };

  const res = await request(app)
    .get('/api/subscriptions/mine')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.length, 2);
  const [pending, approved] = res.body.data;
  assert.equal(pending.queuePosition, 3);
  assert.match(pending.statusNote.ar, /قيد المراجعة/);
  assert.match(pending.statusNote.en, /under review/);
  assert.equal(approved.queuePosition, null);
  assert.match(approved.statusNote.ar, /تمت الموافقة/);
  assert.match(approved.statusNote.en, /approved/);
  // Queue position counts earlier pending requests only.
  assert.equal(countFilter.status, 'pending');
  assert.equal(new Date(countFilter.createdAt.$lte).getTime(), pendingAt.getTime());
  // Read-only: no tier change from listing.
  assert.equal(userUpdates.length, 0);
});

test('PUT /requests/:id approve records review, activates tier, writes in-app Notification', async () => {
  const admin = makeUser('u-admin-1', 'superadmin');
  const token = tokenFor(admin);
  let saved = false;
  const doc = {
    _id: 'req-review-1', userId: 'u-customer-1', tier: 'growth_10k',
    billingPeriod: 'yearly', paymentMethod: 'vodafone_cash',
    status: 'pending', adminNote: '', reviewedBy: null, reviewedAt: null,
    save: async function () { saved = true; return this; },
  };
  const userUpdates = [];
  const notifications = [];
  SubscriptionRequest.findById = async () => doc;
  User.findByIdAndUpdate = async (...args) => { userUpdates.push(args); return {}; };
  Notification.create = async (payload) => { notifications.push(payload); return { _id: 'n1', ...payload }; };

  const res = await request(app)
    .put('/api/subscriptions/requests/req-review-1')
    .set('Authorization', `Bearer ${token}`)
    .send({ action: 'approve', adminNote: 'receipt verified' });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'approved');
  assert.equal(saved, true);
  assert.ok(doc.reviewedAt);
  assert.equal(String(doc.reviewedBy), admin._id);
  assert.equal(userUpdates.length, 1);
  assert.equal(String(userUpdates[0][0]), 'u-customer-1');
  assert.equal(userUpdates[0][1].subscriptionTier, 'growth_10k');
  assert.equal(userUpdates[0][1].subscriptionType, 'yearly');
  assert.equal(notifications.length, 1);
  assert.equal(String(notifications[0].user), 'u-customer-1');
  assert.match(notifications[0].title, /تفعيل/);
  assert.match(notifications[0].message, /growth_10k/);
});

test('PUT /requests/:id reject records review + notifies without touching the tier', async () => {
  const admin = makeUser('u-admin-2', 'superadmin');
  const token = tokenFor(admin);
  const doc = {
    _id: 'req-review-2', userId: 'u-customer-2', tier: 'growth_1k',
    billingPeriod: 'monthly', paymentMethod: 'instapay',
    status: 'pending', adminNote: '', reviewedBy: null, reviewedAt: null,
    save: async function () { return this; },
  };
  const userUpdates = [];
  const notifications = [];
  SubscriptionRequest.findById = async () => doc;
  User.findByIdAndUpdate = async (...args) => { userUpdates.push(args); return {}; };
  Notification.create = async (payload) => { notifications.push(payload); return { _id: 'n2', ...payload }; };

  const res = await request(app)
    .put('/api/subscriptions/requests/req-review-2')
    .set('Authorization', `Bearer ${token}`)
    .send({ action: 'reject' });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'rejected');
  assert.ok(doc.reviewedAt);
  assert.equal(String(doc.reviewedBy), admin._id);
  // Rejection must not change entitlement.
  assert.equal(userUpdates.length, 0);
  assert.equal(notifications.length, 1);
  assert.equal(String(notifications[0].user), 'u-customer-2');
});

test('PUT /requests/:id on an already-reviewed request is 409 with no side effects', async () => {
  const admin = makeUser('u-admin-3', 'superadmin');
  const token = tokenFor(admin);
  const userUpdates = [];
  const notifications = [];
  SubscriptionRequest.findById = async () => ({ _id: 'req-done-1', status: 'approved' });
  User.findByIdAndUpdate = async (...args) => { userUpdates.push(args); return {}; };
  Notification.create = async (payload) => { notifications.push(payload); return {}; };

  const res = await request(app)
    .put('/api/subscriptions/requests/req-done-1')
    .set('Authorization', `Bearer ${token}`)
    .send({ action: 'approve' });

  assert.equal(res.status, 409);
  assert.equal(userUpdates.length, 0);
  assert.equal(notifications.length, 0);
});

test('GET /requests validates status and paginates with max limit 100', async () => {
  const admin = makeUser('u-admin-4', 'superadmin');
  const token = tokenFor(admin);
  let findFilter;
  const capture = {};
  const rows = [{ _id: 'r1', status: 'pending' }, { _id: 'r2', status: 'pending' }];
  SubscriptionRequest.find = (filter) => { findFilter = filter; return chainable(rows, capture); };
  SubscriptionRequest.countDocuments = async () => 250;

  const res = await request(app)
    .get('/api/subscriptions/requests?status=pending&limit=200&skip=10')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.deepEqual(findFilter, { status: 'pending' });
  assert.equal(capture.limit, 100);
  assert.equal(capture.skip, 10);
  assert.deepEqual(res.body.pagination, { total: 250, limit: 100, skip: 10, hasMore: true });

  const bad = await request(app)
    .get('/api/subscriptions/requests?status=bogus')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'INVALID_STATUS');
});
