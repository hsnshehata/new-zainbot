'use strict';
// Real bookingsController.createOrUpdateFromExtraction with stubbed models,
// dispatcher and logger. Pins the write-side fail-safes.
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const root = path.join(__dirname, '..', 'server');
const logs = [];
const logger = new Proxy({}, { get: () => (...a) => { logs.push(a); } });
let existingBooking = null;
let created = [];
const BookingStub = {
  findOne: () => ({ sort: async () => existingBooking }),
  create: async (doc) => { created.push(doc); return { ...doc, _id: 'bk-new' }; },
};
const realLoad = Module._load;
Module._load = function (request, parent) {
  const rel = parent && parent.filename && request.startsWith('.') ? path.resolve(path.dirname(parent.filename), request) : request;
  if (/[\\/]logger$/.test(rel)) return logger;
  if (/[\\/]models[\\/]Booking$/.test(rel)) return BookingStub;
  if (/[\\/]models[\\/]/.test(rel)) return {};
  if (/[\\/]services[\\/]notificationDispatcher$/.test(rel)) return { dispatchMultiChannelNotification: async () => ({ delivered: 0, failed: 0 }) };
  if (/[\\/]services[\\/]metaSendErrors$/.test(rel)) return realLoad.apply(this, arguments);
  return realLoad.apply(this, arguments);
};
const file = path.join(root, 'controllers', 'bookingsController.js');
const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
m._compile(fs.readFileSync(file, 'utf8'), file);
const { createOrUpdateFromExtraction } = m.exports;
const base = { botId: 'b1', channel: 'whatsapp', conversationId: 'c1', customerName: 'أحمد', customerPhone: '01000000000' };

(async () => {
  // cancel with no open booking: nothing is created
  existingBooking = null; created = []; logs.length = 0;
  let r = await createOrUpdateFromExtraction({ ...base, bookingDate: null, isCancel: true });
  assert.strictEqual(r, null);
  assert.strictEqual(created.length, 0, 'a cancellation must never create a booking');
  assert.ok(logs.some((l) => l[0] === 'booking_extraction_cancel_without_booking'));

  // new booking without a customer-supplied date: nothing is created
  created = []; logs.length = 0;
  r = await createOrUpdateFromExtraction({ ...base, bookingDate: null });
  assert.strictEqual(r, null);
  assert.strictEqual(created.length, 0, 'no fabricated date may be written');
  assert.ok(logs.some((l) => l[0] === 'booking_extraction_missing_date'));

  // invalid date: rejected
  created = [];
  r = await createOrUpdateFromExtraction({ ...base, bookingDate: 'not-a-date' });
  assert.strictEqual(r, null);
  assert.strictEqual(created.length, 0);

  // create with a real date works and keeps the exact date
  created = []; logs.length = 0;
  const d = new Date('2026-12-01T15:00:00Z');
  r = await createOrUpdateFromExtraction({ ...base, bookingDate: d, serviceType: 'كشف' });
  assert.strictEqual(r._id, 'bk-new');
  assert.strictEqual(created[0].bookingDate.getTime(), d.getTime());
  // the creation log carries no customer name (PII)
  const createdLog = logs.find((l) => l[0] === 'booking_created_by_ai');
  assert.ok(createdLog, 'creation logged');
  assert.ok(!JSON.stringify(createdLog).includes('أحمد'), 'customer name must not be logged');

  // update of an existing booking without a new date keeps its stored date
  const keptDate = new Date('2026-11-20T10:00:00Z');
  existingBooking = {
    _id: 'bk-old', botId: 'b1', status: 'pending', bookingDate: keptDate,
    customerName: 'أحمد', customerPhone: '01000000000', history: [],
    save: async function () { return this; },
  };
  created = [];
  r = await createOrUpdateFromExtraction({ ...base, bookingDate: null, customerPhone: '01099999999' });
  assert.strictEqual(r.bookingDate.getTime(), keptDate.getTime(), 'update without a date must not move the booking');
  assert.strictEqual(r.customerPhone, '01099999999', 'other fields still update');
  assert.strictEqual(created.length, 0);

  // update with an explicit date moves the booking
  r = await createOrUpdateFromExtraction({ ...base, bookingDate: d });
  assert.strictEqual(r.bookingDate.getTime(), d.getTime());

  // cancel of an existing booking cancels it
  existingBooking.status = 'pending';
  r = await createOrUpdateFromExtraction({ ...base, bookingDate: null, isCancel: true });
  assert.strictEqual(r.status, 'cancelled');

  console.log('booking extraction write tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
