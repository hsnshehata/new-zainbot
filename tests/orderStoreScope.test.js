'use strict';

// tests/orderStoreScope.test.js
// IDOR regression: GET /api/orders/:storeId/orders (orderController.getOrders)
// must not leak a store's orders (customer PII) to non-owners. The pre-fix
// code only logged the ownership mismatch and returned the orders anyway.
// Access contract mirrors updateOrder + getBotAccessFilter:
// - the store owner reads their orders;
// - any other authenticated user gets 404;
// - a direct (non-impersonating) superadmin may read any store;
// - an impersonating superadmin is limited to the impersonated user's stores.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Store = require('../server/models/Store');
const controller = require('../server/controllers/orderController');

const OWNER_ID = new mongoose.Types.ObjectId();
const OTHER_ID = new mongoose.Types.ObjectId();

let mongod;
let store;

function reqRes({ userId, role, auth } = {}) {
  const req = {
    user: { userId: String(userId), role: role || 'user' },
    params: { storeId: String(store._id) },
  };
  if (auth) req.auth = auth;
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  return { req, res };
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-orderscope-test'));
  store = await Store.create({
    userId: OWNER_ID,
    storeName: 'Scope Test Store',
    storeLink: 'scope-test-store',
    templateId: 1,
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('store owner can list their orders', async () => {
  const { req, res } = reqRes({ userId: OWNER_ID });
  await controller.getOrders(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.payload));
});

test('non-owner authenticated user gets 404, not the orders', async () => {
  const { req, res } = reqRes({ userId: OTHER_ID });
  await controller.getOrders(req, res);
  assert.equal(res.statusCode, 404);
});

test('direct superadmin can list any store orders', async () => {
  const { req, res } = reqRes({
    userId: OTHER_ID,
    role: 'superadmin',
    auth: { actorRole: 'superadmin', isImpersonating: false, subjectUserId: String(OTHER_ID) },
  });
  await controller.getOrders(req, res);
  assert.equal(res.statusCode, 200);
});

test('impersonating superadmin reads only the impersonated user stores', async () => {
  const asOwner = reqRes({
    userId: OTHER_ID,
    role: 'superadmin',
    auth: { actorRole: 'superadmin', isImpersonating: true, subjectUserId: String(OWNER_ID) },
  });
  await controller.getOrders(asOwner.req, asOwner.res);
  assert.equal(asOwner.res.statusCode, 200);

  const asOther = reqRes({
    userId: OTHER_ID,
    role: 'superadmin',
    auth: { actorRole: 'superadmin', isImpersonating: true, subjectUserId: String(OTHER_ID) },
  });
  await controller.getOrders(asOther.req, asOther.res);
  assert.equal(asOther.res.statusCode, 404);
});
