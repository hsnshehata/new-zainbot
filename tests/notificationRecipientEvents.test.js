'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function stub(relativePath, exportsValue) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsValue };
}

const telegramSent = [];
const waSent = [];
let recipientsInDb = [];

stub('../server/models/NotificationRecipient', { find: async () => recipientsInDb });
stub('../server/models/Bot', { findById: () => ({ select: async () => ({ userId: 'u1', name: 'Shop', telegramUserId: '' }) }) });
stub('../server/models/User', { findById: () => ({ select: async () => ({ subscriptionTier: 'pro', subscriptionType: 'pro' }) }) });
stub('../server/models/Notification', { create: async () => ({}) });
stub('../server/services/telegramService', { sendTelegramMessage: async (target, text) => { telegramSent.push({ target, text }); return { ok: true }; } });
stub('../server/services/whatsappSessionManager', {
  getWhatsAppSessionManager: () => ({ sendMessage: async (botId, target, text) => { waSent.push({ botId, target, text }); } }),
});

const { dispatchMultiChannelNotification, recipientWantsEvent } = require('../server/services/notificationDispatcher');

const orderBookingDefaults = ['order_created', 'booking_created'];

test('recipientWantsEvent: chat_order matches the New Orders subscription', () => {
  assert.equal(recipientWantsEvent({ events: orderBookingDefaults }, 'chat_order'), true);
  assert.equal(recipientWantsEvent({ events: ['booking_created'] }, 'chat_order'), false);
});

test('recipientWantsEvent: human_handoff matches handoff; new events need their own subscription', () => {
  const v2 = (events) => ({ events, eventsVersion: 2 });
  assert.equal(recipientWantsEvent(v2(['handoff']), 'human_handoff'), true);
  assert.equal(recipientWantsEvent(v2(orderBookingDefaults), 'human_handoff'), false);
  assert.equal(recipientWantsEvent(v2(['urgent_complaint']), 'urgent_complaint'), true);
  assert.equal(recipientWantsEvent(v2(['daily_digest']), 'daily_digest'), true);
  assert.equal(recipientWantsEvent(v2(['low_stock']), 'low_stock'), true);
  assert.equal(recipientWantsEvent(v2(orderBookingDefaults), 'daily_digest'), false);
  assert.equal(recipientWantsEvent(v2(orderBookingDefaults), 'low_stock'), false);
});

test('existing channels (no eventsVersion) get the newer alert types without any migration', () => {
  const legacy = { events: orderBookingDefaults };
  for (const event of ['human_handoff', 'urgent_complaint', 'daily_digest', 'low_stock']) {
    assert.equal(recipientWantsEvent(legacy, event), true, event);
  }
  // still not subscribed to unrelated booking events they never ticked
  assert.equal(recipientWantsEvent({ events: ['order_created'] }, 'booking_cancelled'), false);
});

test('recipientWantsEvent: bookings unchanged, empty events means everything', () => {
  assert.equal(recipientWantsEvent({ events: orderBookingDefaults }, 'booking_created'), true);
  assert.equal(recipientWantsEvent({ events: ['booking_created'] }, 'booking_cancelled'), false);
  assert.equal(recipientWantsEvent({ events: [] }, 'daily_digest'), true);
  assert.equal(recipientWantsEvent({}, 'daily_digest'), true);
});

test('chat order reaches a dashboard-added Telegram and WhatsApp recipient', async () => {
  telegramSent.length = 0; waSent.length = 0;
  recipientsInDb = [
    { channel: 'telegram', target: '111', events: orderBookingDefaults },
    { channel: 'whatsapp', target: '201000000001', events: orderBookingDefaults },
  ];
  const res = await dispatchMultiChannelNotification({ userId: 'u1', botId: 'b1', event: 'chat_order', data: { customerName: 'Ali', total: 100 } });
  assert.equal(res.delivered, 2);
  assert.equal(telegramSent.length, 1);
  assert.equal(waSent.length, 1);
});

test('daily digest only reaches recipients subscribed to it', async () => {
  telegramSent.length = 0; waSent.length = 0;
  recipientsInDb = [
    { channel: 'telegram', target: '111', events: orderBookingDefaults, eventsVersion: 2 },
    { channel: 'whatsapp', target: '201000000001', events: ['daily_digest', 'urgent_complaint'], eventsVersion: 2 },
  ];
  const res = await dispatchMultiChannelNotification({ userId: 'u1', botId: 'b1', event: 'daily_digest', data: { ordersCount: 3 } });
  assert.equal(res.delivered, 1);
  assert.equal(telegramSent.length, 0);
  assert.equal(waSent.length, 1);
});

test('dashboard modal offers the new alert types in both languages', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'dashboard_new.js'), 'utf8');
  for (const value of ['handoff', 'urgent_complaint', 'daily_digest', 'low_stock']) {
    assert.match(html, new RegExp(`name="recipientEvents" value="${value}"`));
    const key = `ev_${value}`;
    assert.equal((js.match(new RegExp(`${key}:`, 'g')) || []).length, 2, `${key} has en and ar text`);
  }
});

test('legacy channel receives the daily digest on dispatch', async () => {
  telegramSent.length = 0; waSent.length = 0;
  recipientsInDb = [{ channel: 'whatsapp', target: '201000000001', events: orderBookingDefaults }];
  const res = await dispatchMultiChannelNotification({ userId: 'u1', botId: 'b1', event: 'daily_digest', data: { ordersCount: 1 } });
  assert.equal(res.delivered, 1);
  assert.equal(waSent.length, 1);
});

test('recipient model: no eventsVersion by default on old documents, controller sets 2', () => {
  const ctrl = fs.readFileSync(path.join(__dirname, '..', 'server', 'controllers', 'notificationsController.js'), 'utf8');
  assert.match(ctrl, /eventsVersion: 2/);
  delete require.cache[require.resolve('../server/models/NotificationRecipient')];
  const Model = require('../server/models/NotificationRecipient');
  const legacyDoc = new Model({ userId: '507f1f77bcf86cd799439011', channel: 'whatsapp', target: '1', events: ['order_created'] });
  assert.equal(legacyDoc.eventsVersion, undefined);
});

test('recipient model accepts the new events', () => {
  delete require.cache[require.resolve('../server/models/NotificationRecipient')];
  const Model = require('../server/models/NotificationRecipient');
  const doc = new Model({ userId: '507f1f77bcf86cd799439011', channel: 'whatsapp', target: '201000000001', events: ['handoff', 'urgent_complaint', 'daily_digest', 'low_stock'] });
  assert.equal(doc.validateSync(), undefined);
});
