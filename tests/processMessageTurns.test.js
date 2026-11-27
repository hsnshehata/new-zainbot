'use strict';
// Full processMessage turns with stubbed models, services, controllers and AI.
// Regression for the booking-truth review blockers: bookingResult must be in
// scope for the note injection and the final guard on EVERY turn.
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const root = path.join(__dirname, '..', 'server');
const logs = [];
const logger = new Proxy({}, { get: () => (...a) => { logs.push(a); } });

const BOOKING = { _id: 'bk1', status: 'pending', serviceType: 'General Appointment', bookingDate: new Date('2026-12-01T15:00:00Z') };
let bookingControllerResult = null;
let bookingControllerThrows = false;
let aiReplyText = 'أهلاً بيك.';
let aiBookingJson = { isBooking: false };
let lastSys = '';

const mkConvo = () => ({
  _id: 'c1', messages: [], labels: [], isHumanHandling: false, mutedUntil: null,
  category: null, save: async function () { return this; },
});
let convo = mkConvo();
const botDoc = { _id: 'b1', userId: 'u1', name: 'TestBot', isActive: true, storeId: null, agentTools: {}, handoffKeywords: [] };

const ConversationStub = { findOne: async () => convo, create: async () => (convo = mkConvo()) };
const lean = (v) => ({ lean: async () => v });

const realLoad = Module._load;
Module._load = function (request, parent) {
  const rel = parent && parent.filename && request.startsWith('.') ? path.resolve(path.dirname(parent.filename), request) : request;
  if (/[\\/]logger$/.test(rel)) return logger;
  if (/[\\/]models[\\/]Conversation$/.test(rel)) return ConversationStub;
  if (/[\\/]models[\\/]Bot$/.test(rel)) return { findById: () => lean(botDoc) };
  if (/[\\/]models[\\/]Rule$/.test(rel)) return { find: () => lean([]) };
  if (/[\\/]models[\\/]Store$/.test(rel)) return { findById: () => lean(null) };
  if (/[\\/]models[\\/]Product$/.test(rel)) return { find: () => lean([]) };
  if (/[\\/]models[\\/]ChatOrder$/.test(rel)) return { findOne: () => ({ sort: async () => null }) };
  if (/[\\/]models[\\/]/.test(rel)) return {};
  if (/[\\/]controllers[\\/]bookingsController$/.test(rel)) {
    return { createOrUpdateFromExtraction: async () => { if (bookingControllerThrows) throw Object.assign(new Error('db down'), { code: 'ECONNREFUSED' }); return bookingControllerResult; } };
  }
  if (/[\\/]controllers[\\/]chatOrdersController$/.test(rel)) return { createOrUpdateFromExtraction: async () => null };
  if (/[\\/]controllers[\\/]chatCustomersController$/.test(rel)) return { upsertChatCustomerProfile: async () => {} };
  if (/[\\/]controllers[\\/]/.test(rel)) return {};
  if (/[\\/]services[\\/](metaSendErrors|conversationPolicy|platformBotId)$/.test(rel)) return realLoad.apply(this, arguments);
  if (/[\\/]services[\\/]aiFailover$/.test(rel)) {
    return { getAiCompletion: async ({ messages }) => {
      const sys = String(messages && messages[0] && messages[0].content || '');
      let content = aiReplyText;
      if (!sys.includes('استخلاص')) lastSys = sys;
      if (sys.includes('استخلاص طلبات العملاء')) content = '{}';
      else if (sys.includes('استخلاص بيانات حجز المواعيد')) content = JSON.stringify(aiBookingJson);
      return { choices: [{ message: { content } }] };
    } };
  }
  if (/[\\/]services[\\/]platformSettingsService$/.test(rel)) return { getPlatformDefaultOpenAiModel: async () => 'gpt-4o-mini' };
  if (/[\\/]services[\\/]billingLimits$/.test(rel)) return { checkPlanLimitsAndIncrement: async () => ({ allowed: true, useBackup: false }), settleMessageQuota: async () => {} };
  if (/[\\/]services[\\/]webhookDispatcher$/.test(rel)) return { dispatchWebhook: () => {} };
  if (/[\\/]services[\\/]notificationDispatcher$/.test(rel)) return { dispatchMultiChannelNotification: async () => ({ delivered: 0, failed: 0 }) };
  if (/[\\/]services[\\/]catalogTransition$/.test(rel)) return { beginChatWrite: async () => null, endChatWrite: async () => {} };
  if (/[\\/]services[\\/]chatInventoryPolicy$/.test(rel)) return { chatInventoryHandoff: async () => null };
  if (/[\\/]services[\\/]productContext$/.test(rel)) return { buildProductContext: () => '', buildStorefrontUrl: () => '', effectiveProductPrice: (p) => p && p.price, normalize: (s) => s, tokens: () => [] };
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
const { processMessage, bookingTruthSentence } = m.exports;

(async () => {
  // 1. normal turn: reply passes through; bookingResult in scope (no ReferenceError)
  convo = mkConvo(); aiReplyText = 'أيوه عندنا توصيل داخل الإسكندرية.'; aiBookingJson = { isBooking: false };
  let out = await processMessage('b1', 'cust-1', 'عندكم توصيل؟', false, false, 'm1', 'whatsapp');
  assert.strictEqual(out, 'أيوه عندنا توصيل داخل الإسكندرية.');

  // 2. booking turn: deterministic booking truth replaces the model reply
  convo = mkConvo(); bookingControllerResult = BOOKING;
  aiReplyText = 'حجزنا لك الموعد يا فندم MARKER.'; aiBookingJson = { isBooking: true, customerName: 'أحمد', bookingDate: '2026-12-01T15:00:00Z' };
  out = await processMessage('b1', 'cust-1', 'عايز أحجز موعد يوم 1 ديسمبر الساعة 5', false, false, 'm2', 'whatsapp');
  assert.strictEqual(out, bookingTruthSentence({ outcome: 'saved', booking: BOOKING }));
  assert.ok(!out.includes('MARKER'));

  // 3. booking save fails: the customer is told, never confirmed
  convo = mkConvo(); bookingControllerResult = null; bookingControllerThrows = true;
  aiReplyText = 'تم حجز موعدك بنجاح يوم 1 ديسمبر.';
  out = await processMessage('b1', 'cust-1', 'عايز أحجز موعد يوم 1 ديسمبر الساعة 5', false, false, 'm3', 'whatsapp');
  assert.strictEqual(out, bookingTruthSentence({ outcome: 'save_failed' }));
  bookingControllerThrows = false;

  // 4. missing_date is soft: a natural turn asking for the date passes through
  convo = mkConvo(); bookingControllerResult = null;
  aiBookingJson = { isBooking: true, customerName: 'أحمد' };
  aiReplyText = 'تمام يا أحمد، عايز تحجز إمتى؟';
  out = await processMessage('b1', 'cust-1', 'عايز أحجز موعد', false, false, 'm4', 'whatsapp');
  assert.strictEqual(out, 'تمام يا أحمد، عايز تحجز إمتى؟');

  // 5. missing_date with an unverifiable booking claim: claim replaced by the honest truth
  convo = mkConvo();
  aiReplyText = 'حجزنا لك موعد.';
  out = await processMessage('b1', 'cust-1', 'عايز أحجز موعد', false, false, 'm5', 'whatsapp');
  assert.ok(out.includes('تاريخ الموعد غير محدد'), 'missing_date truth replaces the claim');
  assert.ok(!out.includes('حجزنا'), 'claim stripped');

  // 6. order words keep the order default even when a booking keyword matched
  convo = mkConvo(); aiBookingJson = { isBooking: false };
  aiReplyText = 'تم تأكيد طلبك بنجاح.';
  out = await processMessage('b1', 'cust-1', 'ميعاد تسليم الاوردر إمتى؟', false, false, 'm6', 'whatsapp');
  assert.ok(out.includes('لم يُسجل أي طلب'), 'order default, not booking default');
  aiBookingJson = { isBooking: false };

  // 7. stop request: one short ack, conversation muted, later messages get no reply, "كمل" resumes
  convo = mkConvo(); aiReplyText = 'رد عادي.';
  out = await processMessage('b1', 'cust-1', 'اسكت', false, false, 'm7', 'whatsapp');
  assert.ok(out.includes('هبطل أرد'), 'stop is acknowledged once');
  assert.ok(convo.mutedUntil && new Date(convo.mutedUntil) > new Date(), 'conversation muted');
  out = await processMessage('b1', 'cust-1', 'طب والباقات؟', false, false, 'm8', 'whatsapp');
  assert.strictEqual(out, null, 'no reply while muted');
  out = await processMessage('b1', 'cust-1', 'كمل', false, false, 'm9', 'whatsapp');
  assert.strictEqual(out, 'رد عادي.', 'resumes on explicit resume');

  // 8. a normal question containing stop-like words is NOT a stop
  convo = mkConvo(); aiReplyText = 'ممكن توقف الاشتراك من الإعدادات.';
  out = await processMessage('b1', 'cust-1', 'عاوز أوقف الاشتراك ازاي؟', false, false, 'm10', 'whatsapp');
  assert.strictEqual(out, 'ممكن توقف الاشتراك من الإعدادات.');

  // 9. repeated generic help offer is stripped after the first reply, kept on the first
  convo = mkConvo(); aiReplyText = 'أهلا بيك! كيف يمكنني مساعدتك اليوم؟';
  out = await processMessage('b1', 'cust-1', 'سلام', false, false, 'm11', 'whatsapp');
  assert.ok(out.includes('كيف يمكنني مساعدتك'), 'first reply untouched');
  aiReplyText = 'الباقة بـ 199 ج. كيف يمكنني مساعدتك اليوم؟';
  out = await processMessage('b1', 'cust-1', 'بكام نمو 1k', false, false, 'm12', 'whatsapp');
  assert.strictEqual(out, 'الباقة بـ 199 ج.');
  assert.ok(lastSys.includes('ثبات الأسلوب'), 'style note present');

  // 10. platform bot: picking a plan is a subscription, never an unpriced store product
  const platformId = require('../server/services/platformBotId').getPlatformBotId();
  const savedId = botDoc._id; botDoc._id = platformId;
  convo = mkConvo(); aiReplyText = 'تمام، باقة نمو 1k بـ 199 ج/شهر. سجّل من zainbot.com/register.';
  out = await processMessage(platformId, 'fb-1', '1', false, false, 'm13', 'facebook');
  assert.ok(!out.includes('غير متوفر بسعر رسمي'), 'no unpriced-product refusal for a plan');
  assert.ok(lastSys.includes('اشتراكات المنصة'), 'platform subscription note injected');
  botDoc._id = savedId;

  // 11. other storeless bot: honest no-store note, never a fake order claim
  convo = mkConvo(); aiReplyText = 'تم تسجيل طلبك.';
  out = await processMessage('b1', 'cust-1', 'عايز اطلب', false, false, 'm14', 'whatsapp');
  assert.ok(lastSys.includes('لا يوجد متجر أو كتالوج'), 'storeless note injected');
  assert.ok(out.includes('لم يُسجل أي طلب'), 'unverified order claim replaced');

  console.log('processMessage turn tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
