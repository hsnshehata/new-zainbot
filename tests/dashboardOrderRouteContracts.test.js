'use strict';

// D01 — orders/bookings route contracts: PUT quick actions, raw-shape local
// handling, no invented POST, store-row guards, bookings bot isolation.
// Supertest against the exported app only (never startServer()); models and
// senders stubbed per test and restored in afterEach — no DB, no sends.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';
process.env.NODE_ENV = 'test';

const telegramCalls = [];
const dispatchCalls = [];
function stubModule(resolvedPath, exportsObject) {
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports: exportsObject,
  };
}
stubModule(require.resolve('../server/services/telegramService'), {
  notifyChatOrder: async (...args) => { telegramCalls.push(['chat', ...args]); },
  notifyOrderStatus: async (...args) => { telegramCalls.push(['status', ...args]); },
});
stubModule(require.resolve('../server/services/notificationDispatcher'), {
  dispatchMultiChannelNotification: async (...args) => { dispatchCalls.push(args); },
});
stubModule(require.resolve('../server/logger'), { error() {}, warn() {}, info() {} });

const supertest = require('supertest');
const app = require('../server/server');
const { signAccessToken } = require('../server/utils/authTokens');

const User = require('../server/models/User');
const Bot = require('../server/models/Bot');
const Booking = require('../server/models/Booking');
const ChatOrder = require('../server/models/ChatOrder');

const OWNER_ID = '507f191e810c19729de86001';
const OWN_BOT_ID = '507f191e810c19729de86101';
const OTHER_BOT_ID = '507f191e810c19729de86102';
const ORDER_ID = '507f191e810c19729de86201';

function chain(doc) {
  const c = { select: () => c, lean: async () => doc };
  c.then = (resolve, reject) => Promise.resolve(doc).then(resolve, reject);
  return c;
}

function ownerDoc() {
  return {
    _id: OWNER_ID,
    username: 'contract_owner',
    email: 'owner@example.com',
    role: 'user',
    status: 'active',
    sessionVersion: 0,
    password: 'must-never-leak',
  };
}

function ownerToken() {
  return signAccessToken({ _id: OWNER_ID, username: 'contract_owner', role: 'user', sessionVersion: 0 });
}

let bookingFindFilters = [];
let bookingFindCalls = 0;
let chatOrderDoc = null;
let deletedChatOrders = 0;

const originals = {
  userFindById: User.findById,
  botFind: Bot.find,
  botFindById: Bot.findById,
  bookingFind: Booking.find,
  chatOrderFindById: ChatOrder.findById,
};

function installStubs() {
  User.findById = () => chain(ownerDoc());
  Bot.find = () => ({ select: async () => [{ _id: OWN_BOT_ID }] });
  Bot.findById = (id) => chain(
    String(id) === String(OWN_BOT_ID) ? { _id: OWN_BOT_ID, userId: OWNER_ID, name: 'Bot' } : null
  );
  Booking.find = (filter) => {
    bookingFindCalls += 1;
    bookingFindFilters.push(filter);
    return { sort: () => ({ limit: async () => [] }) };
  };
  ChatOrder.findById = async () => chatOrderDoc;
}

test.beforeEach(() => {
  process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';
  telegramCalls.length = 0;
  dispatchCalls.length = 0;
  bookingFindFilters = [];
  bookingFindCalls = 0;
  chatOrderDoc = null;
  deletedChatOrders = 0;
  installStubs();
});

test.afterEach(() => {
  User.findById = originals.userFindById;
  Bot.find = originals.botFind;
  Bot.findById = originals.botFindById;
  Booking.find = originals.bookingFind;
  ChatOrder.findById = originals.chatOrderFindById;
});

// ---------- bookings list bot isolation (server) ----------

test('bookings list applies an owned selected botId', async () => {
  const res = await supertest(app)
    .get(`/api/bookings?botId=${OWN_BOT_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(bookingFindCalls, 1);
  assert.deepEqual(bookingFindFilters[0], { botId: OWN_BOT_ID });
});

test('bookings list with an unowned botId returns empty, never all bots', async () => {
  const res = await supertest(app)
    .get(`/api/bookings?botId=${OTHER_BOT_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, []);
  assert.equal(bookingFindCalls, 0, 'unowned bot must not trigger any booking read');
});

test('bookings list without botId still scopes to owned bots', async () => {
  const res = await supertest(app)
    .get('/api/bookings')
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 200);
  assert.equal(bookingFindCalls, 1);
  assert.deepEqual(bookingFindFilters[0], { botId: { $in: [OWN_BOT_ID] } });
});

// ---------- chat-order response shapes (server contract, handled locally) ----------

test('chat-order PUT returns the raw updated document (no success wrapper)', async () => {
  chatOrderDoc = {
    _id: ORDER_ID,
    botId: OWN_BOT_ID,
    status: 'pending',
    items: [],
    history: [],
    save: async function save() { this.__saved = (this.__saved || 0) + 1; return this; },
  };
  const res = await supertest(app)
    .put(`/api/chat-orders/${ORDER_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ status: 'confirmed' });
  assert.equal(res.status, 200);
  assert.equal(res.body._id, ORDER_ID);
  assert.equal(res.body.status, 'confirmed');
  assert.equal(res.body.success, undefined, 'raw document carries no success flag');
  assert.equal(chatOrderDoc.__saved, 1);
});

test('chat-order DELETE returns { message } without a success wrapper', async () => {
  chatOrderDoc = {
    _id: ORDER_ID,
    botId: OWN_BOT_ID,
    deleteOne: async () => { deletedChatOrders += 1; },
  };
  const res = await supertest(app)
    .delete(`/api/chat-orders/${ORDER_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.message, 'delete reports via message');
  assert.equal(res.body.success, undefined);
  assert.equal(deletedChatOrders, 1);
});

test('no manual chat-order creation route exists', async () => {
  const res = await supertest(app)
    .post('/api/chat-orders')
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ status: 'pending' });
  assert.equal(res.status, 404, 'POST /api/chat-orders must not exist');
});

// ---------- dashboard wiring (static contract) ----------

const workspace = path.resolve(__dirname, '..');
const script = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function sliceBetween(startMarker, endMarker) {
  const start = script.indexOf(startMarker);
  assert.notEqual(start, -1, `missing section ${startMarker}`);
  const end = script.indexOf(endMarker, start + 1);
  assert.notEqual(end, -1, `missing section end ${endMarker}`);
  return script.slice(start, end);
}

test('quick status actions use the existing PUT routes, never PATCH', () => {
  const orderQuick = sliceBetween('window.changeOrderStatus = ', 'window.deleteOrder = ');
  assert.match(orderQuick, /method: 'PUT'/);
  assert.doesNotMatch(orderQuick, /PATCH/);
  const bookingQuick = sliceBetween('window.changeBookingStatus = ', 'window.deleteBooking = ');
  assert.match(bookingQuick, /method: 'PUT'/);
  assert.doesNotMatch(bookingQuick, /PATCH/);
});

test('raw shapes are handled locally: _id for updates, message for deletes', () => {
  const orderQuick = sliceBetween('window.changeOrderStatus = ', 'window.deleteOrder = ');
  assert.match(orderQuick, /res\._id/, 'PUT update accepts the raw document via _id');
  const deleteOrder = sliceBetween('window.deleteOrder = ', 'window.openOrderModal = ');
  assert.match(deleteOrder, /res\.message/, 'DELETE accepts the { message } shape');
});

test('no invented chat-order POST anywhere in the dashboard', () => {
  assert.equal(script.indexOf("'/api/chat-orders'"), -1, 'bare create URL must be gone');
  const submit = sliceBetween('chatOrderForm.addEventListener', 'Toolbar & Filter');
  assert.match(submit, /chat_order_create_unsupported/);
  assert.doesNotMatch(submit, /'POST'/);
});

test('edit-save accepts the raw document and the singular note field', () => {
  const submit = sliceBetween('chatOrderForm.addEventListener', 'Toolbar & Filter');
  assert.match(submit, /res\.success \|\| res\._id/, 'save success covers the raw-document shape');
  assert.match(submit, /note: document\.getElementById\('orderCustomerNote'\)/, 'payload uses the server-read note field');
  assert.doesNotMatch(submit, /notes: document\.getElementById/, 'plural notes must not shadow it');
});

test('singular note round-trips into order history via PUT', async () => {
  chatOrderDoc = {
    _id: ORDER_ID,
    botId: OWN_BOT_ID,
    status: 'pending',
    items: [],
    history: [],
    save: async function save() { this.__saved = (this.__saved || 0) + 1; return this; },
  };
  const res = await supertest(app)
    .put(`/api/chat-orders/${ORDER_ID}`)
    .set('Authorization', `Bearer ${ownerToken()}`)
    .send({ note: 'ring the bell twice' });
  assert.equal(res.status, 200);
  assert.equal(res.body._id, ORDER_ID);
  assert.equal(chatOrderDoc.history.length, 1);
  assert.equal(chatOrderDoc.history[0].note, 'ring the bell twice');
  assert.equal(chatOrderDoc.__saved, 1);
});

test('store rows never reach ChatOrder mutations', () => {
  for (const [name, start, end] of [
    ['changeOrderStatus', 'window.changeOrderStatus = ', 'window.deleteOrder = '],
    ['deleteOrder', 'window.deleteOrder = ', 'window.openOrderModal = '],
    ['openOrderModal', 'window.openOrderModal = ', 'Setup Booking Form Submit'],
  ]) {
    assert.match(sliceBetween(start, end), /isStoreOrder/, `${name} guards store rows`);
  }
});

test('order editor is edit-only with read-only customer fields', () => {
  const modal = sliceBetween('window.openOrderModal = ', 'Setup Booking Form Submit');
  assert.match(modal, /chat_order_create_unsupported/, 'creation blocked with a translated reason');
  assert.match(modal, /orderCustomerName.+readOnly = true/s);
  assert.match(modal, /orderCustomerPhone.+readOnly = true/s);
  assert.match(modal, /orderCustomerAddress.+readOnly = true/s);
  assert.match(script, /createOrderBtn\.disabled = true/, 'creation button disabled at runtime');
});

test('unsupported-action copy exists in both dictionaries', () => {
  for (const key of ['chat_order_create_unsupported', 'store_order_readonly']) {
    assert.match(script, new RegExp(`      ${key}: '[^']+'`), `missing dictionary key ${key}`);
  }
});
