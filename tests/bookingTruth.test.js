'use strict';
// Booking confirmation truth (B1/B2 fix) + fail-safes. Real botEngine module
// and real bookingsController; heavy deps stubbed. Pins:
//  - a booking outcome replaces the reply with a deterministic booking truth
//  - booking confirmations are never stripped by the order guard on booking turns
//  - cancel with no open booking creates nothing and says so
//  - no fabricated default date; a save failure is admitted, never confirmed
//  - order behavior is unchanged when no booking context is passed
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const root = path.join(__dirname, '..', 'server');
const logs = [];
const logger = new Proxy({}, { get: () => (...a) => { logs.push(a); } });
const realLoad = Module._load;
let aiReply = null;        // what the stubbed extractor LLM returns
let savedArgs = null;      // args the stubbed controller received
let controllerResult = null;
let controllerThrows = false;
Module._load = function (request, parent) {
  const rel = parent && parent.filename && request.startsWith('.') ? path.resolve(path.dirname(parent.filename), request) : request;
  if (/[\\/]logger$/.test(rel)) return logger;
  if (/[\\/]models[\\/]/.test(rel)) return {};
  if (/[\\/]controllers[\\/]bookingsController$/.test(rel)) {
    return { createOrUpdateFromExtraction: async (args) => { savedArgs = args; if (controllerThrows) throw Object.assign(new Error('db down SECRET'), { code: 'ECONNREFUSED' }); return controllerResult; } };
  }
  if (/[\\/]controllers[\\/]/.test(rel)) return {};
  if (/[\\/]services[\\/]aiFailover$/.test(rel)) return { getAiCompletion: async () => ({ choices: [{ message: { content: JSON.stringify(aiReply) } }] }) };
  if (/[\\/]services[\\/]metaSendErrors$/.test(rel)) return realLoad.apply(this, arguments);
  if (/[\\/]services[\\/]/.test(rel)) return {};
  if (request === 'openai') return function () {};
  if (request === 'mongoose') return { model: () => ({}), Schema: function () {} };
  if (request === 'axios') return {};
  if (request === 'form-data') return function () {};
  if (request === 'uuid') return { v4: () => 'uuid' };
  if (request === 'node-cache') return function () { return { get: () => undefined, set: () => {} }; };
  return realLoad.apply(this, arguments);
};
const file = path.join(root, 'botEngine.js');
const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
m._compile(fs.readFileSync(file, 'utf8'), file);
const { enforceTruthfulOrderReply, bookingTruthSentence, buildBookingStateNote, extractBookingIntent, customerTruthSentence } = m.exports;

const BOOKING = { _id: 'bk1', status: 'pending', serviceType: 'كشف', bookingDate: new Date('2026-12-01T15:00:00Z') };
const extract = (content) => extractBookingIntent({ bot: { _id: 'b1', agentTools: {} }, channel: 'whatsapp', userMessageContent: content, conversationId: 'c1', sourceUserId: 'u1', sourceUsername: 'عميل' });

(async () => {
  // --- guard: booking outcome replaces the reply with deterministic truth ---
  logs.length = 0;
  const out1 = enforceTruthfulOrderReply('حجزنا لك موعد يوم الخميس الساعة 5. MARKER_MODEL', null, { outcome: 'saved', booking: BOOKING });
  assert.ok(!out1.includes('MARKER_MODEL'), 'model prose must not survive a booking turn');
  assert.ok(out1.includes('كشف') && out1.includes('قيد المراجعة'), 'booking truth carries stored service and status');
  assert.ok(!/لم يُسجل أي طلب/.test(out1), 'no order-denial on a booking turn');
  assert.ok(logs.some((l) => l[0] === 'chat_order_reply_replaced_by_deterministic' && l[1].bookingOutcome === 'saved'));

  // --- fail-safes: truthful bodies for unsaved outcomes ---
  assert.ok(bookingTruthSentence({ outcome: 'cancel_not_found' }).includes('لم أجد حجزًا'));
  assert.ok(bookingTruthSentence({ outcome: 'missing_date' }).includes('تاريخ الموعد غير محدد'));
  assert.ok(bookingTruthSentence({ outcome: 'save_failed' }).includes('لم يُحفظ'));
  assert.strictEqual(bookingTruthSentence({ outcome: 'cancelled' }), 'تم إلغاء حجزك كما طلبت.');

  // --- prompt notes exist and forbid unearned confirmation ---
  assert.ok(buildBookingStateNote({ outcome: 'save_failed' }).includes('لم يُحفظ'));
  assert.ok(buildBookingStateNote({ outcome: 'saved', booking: BOOKING }).includes('كشف'));
  assert.strictEqual(buildBookingStateNote(null), '');

  // --- order behavior unchanged when no booking context is passed (regression) ---
  const orderOnly = enforceTruthfulOrderReply('تم تأكيد طلبك! MARKER_O', { outcome: 'save_failed' });
  assert.strictEqual(orderOnly, customerTruthSentence({ outcome: 'save_failed' }));
  const plainChat = enforceTruthfulOrderReply('أهلاً بيك، المنتج متوفر.', null);
  assert.strictEqual(plainChat, 'أهلاً بيك، المنتج متوفر.');
  const strippedOrderClaim = enforceTruthfulOrderReply('تم تأكيد طلبك بنجاح.', null);
  assert.ok(strippedOrderClaim.includes('لم يُسجل أي طلب'), 'order claim with no outcome still replaced by order default');

  // --- no-outcome booking talk gets the booking default, not the order denial ---
  const strippedBookingClaim = enforceTruthfulOrderReply('حجزنا لك موعد يوم الخميس.', null, null, { bookingTalk: true });
  assert.ok(!strippedBookingClaim.includes('حجزنا'), 'unverifiable booking claim stripped');
  assert.ok(strippedBookingClaim.includes('لم يُحفظ أي حجز'), 'booking default, not order default');
  assert.ok(!/لم يُسجل أي طلب/.test(strippedBookingClaim));

  // --- both outcomes on one turn join both truths ---
  const both = enforceTruthfulOrderReply('تمام MARKER_BOTH', { outcome: 'cancelled', chatOrder: { _id: 'o9', status: 'cancelled' } }, { outcome: 'saved', booking: BOOKING });
  assert.ok(both.includes('تم إلغاء طلبك') && both.includes('تم حفظ حجزك'));

  // --- missing_date is soft: natural turns pass, claims are replaced ---
  const softClean = enforceTruthfulOrderReply('تمام يا أحمد، عايز تحجز إمتى؟', null, { outcome: 'missing_date' });
  assert.strictEqual(softClean, 'تمام يا أحمد، عايز تحجز إمتى؟', 'soft outcome must not hijack a natural turn');
  const softClaim = enforceTruthfulOrderReply('حجزنا لك موعد.', null, { outcome: 'missing_date' });
  assert.ok(softClaim.includes('تاريخ الموعد غير محدد') && !softClaim.includes('حجزنا'), 'claim replaced by missing_date truth');

  // --- extraction flow: no fabricated date ---
  savedArgs = null; controllerResult = null; controllerThrows = false;
  aiReply = { isBooking: true, customerName: 'أحمد', customerPhone: '01000000000' };
  let r = await extract('عايز أحجز موعد');
  assert.deepStrictEqual(r, { outcome: 'missing_date', booking: null });
  assert.strictEqual(savedArgs.bookingDate, null, 'no +24h fabricated date may be passed to the controller');

  // --- cancel with no open booking: nothing created, outcome says so ---
  savedArgs = null; controllerResult = null;
  aiReply = { isBooking: true, isCancel: true, customerName: 'أحمد' };
  r = await extract('عايز ألغي الحجز');
  assert.deepStrictEqual(r, { outcome: 'cancel_not_found', booking: null });

  // --- save throw is admitted as save_failed, never returns null (which the guard would treat as no-outcome) ---
  controllerThrows = true;
  aiReply = { isBooking: true, customerName: 'أحمد', bookingDate: '2026-12-01T15:00:00Z' };
  r = await extract('عايز أحجز موعد يوم 1 ديسمبر الساعة 5');
  assert.deepStrictEqual(r, { outcome: 'save_failed', booking: null });
  assert.ok(logs.some((l) => l[0] === 'booking_intent_save_failed' && l[1].err.name === 'Error' && l[1].err.code === 'ECONNREFUSED'));
  assert.ok(!logs.some((l) => JSON.stringify(l).includes('SECRET')), 'provider/db error text must not reach logs');

  // --- happy paths ---
  controllerThrows = false; controllerResult = BOOKING;
  r = await extract('عايز أحجز موعد يوم 1 ديسمبر الساعة 5');
  assert.deepStrictEqual(r, { outcome: 'saved', booking: BOOKING });
  aiReply = { isBooking: true, isCancel: true, customerName: 'أحمد' };
  r = await extract('ألغي الحجز');
  assert.deepStrictEqual(r, { outcome: 'cancelled', booking: BOOKING });

  // --- regressions: non-booking and isBooking:false stay null ---
  aiReply = null;
  assert.strictEqual(await extract('السلام عليكم، بكام التيشيرت ده؟'), null);
  assert.strictEqual(await extract(''), null);
  aiReply = { isBooking: false };
  assert.strictEqual(await extract('عايز أحجز'), null);

  console.log('booking truth tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
