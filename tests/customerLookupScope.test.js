'use strict';

// tests/customerLookupScope.test.js
// IDOR regression: GET /api/customers/:storeId/customers-lookup
// (customersController.lookupByPhone) is an authenticated endpoint that
// returned a store's full customer record (PII: name/phone/email/address/
// spend totals) to ANY authenticated user, owner or not. It must apply the
// same authorizeStoreAccess gate as every other customers endpoint.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Store = require('../server/models/Store');
const Customer = require('../server/models/Customer');
const controller = require('../server/controllers/customersController');

const OWNER_ID = new mongoose.Types.ObjectId();
const OTHER_ID = new mongoose.Types.ObjectId();

let mongod;
let store;

function reqRes({ userId, role } = {}) {
  const req = {
    user: { userId: String(userId), role: role || 'user' },
    params: { storeId: String(store._id) },
    query: { phone: '01000000001' },
  };
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
  await mongoose.connect(mongod.getUri('zainbot-custlookup-test'));
  store = await Store.create({
    userId: OWNER_ID,
    storeName: 'Lookup Scope Store',
    storeLink: 'lookup-scope-store',
    templateId: 1,
  });
  await Customer.create({
    storeId: store._id,
    name: 'عميل تجريبي',
    phone: '01000000001',
    email: 'customer@example.com',
    address: 'عنوان تجريبي',
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('store owner can look up their customer by phone', async () => {
  const { req, res } = reqRes({ userId: OWNER_ID });
  await controller.lookupByPhone(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.phone, '01000000001');
});

test('non-owner authenticated user cannot read customer PII by phone', async () => {
  const { req, res } = reqRes({ userId: OTHER_ID });
  await controller.lookupByPhone(req, res);
  assert.notEqual(res.statusCode, 200);
  assert.equal(res.payload && res.payload.phone, undefined);
});

test('superadmin retains lookup access', async () => {
  const { req, res } = reqRes({ userId: OTHER_ID, role: 'superadmin' });
  await controller.lookupByPhone(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.phone, '01000000001');
});
