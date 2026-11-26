'use strict';

// tests/channelDeliveryService.test.js
// Verifies channelDeliveryService parity with legacy deliverManualReply across
// WhatsApp QR, WhatsApp Cloud API fallback, Facebook, Instagram, missing bot,
// unsupported channels, and channelGuard.assertBotAllowed enforcement.

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createChannelDeliveryService,
  stripChannelPrefixes,
} = require('../server/services/channelDeliveryService');
const { ChannelsDisabledError } = require('../server/services/channelGuard');

const BOT_ID = '507f191e810c19729de86101';

function buildFixture(overrides = {}) {
  const calls = {
    guardChecks: [],
    botLookups: [],
    waSends: [],
    axiosPosts: [],
  };

  let botDoc = overrides.botDoc !== undefined ? overrides.botDoc : {
    _id: BOT_ID,
    facebookApiKey: 'fb-token',
    instagramApiKey: 'ig-token',
    whatsappApiKey: '',
    whatsappBusinessAccountId: '',
  };

  const Bot = {
    findById(id) {
      calls.botLookups.push(String(id));
      return {
        select: async () => botDoc,
      };
    },
  };

  const channelGuard = overrides.channelGuard || {
    assertBotAllowed(botId) {
      calls.guardChecks.push(String(botId));
    },
  };

  const waSessionManager = {
    async sendMessage(botId, chatId, text) {
      calls.waSends.push({ botId, chatId, text });
      if (overrides.waSendError) {
        throw overrides.waSendError;
      }
      return { ok: true };
    },
  };

  const axios = {
    async post(url, body, config) {
      calls.axiosPosts.push({ url, body, config });
      return overrides.axiosResponse || { data: { recipient_id: 'r1', message_id: 'm1' } };
    },
  };

  const service = createChannelDeliveryService({
    Bot,
    axios,
    channelGuard,
    decryptChannelToken: (v) => v || '',
    getWhatsAppSessionManager: () => waSessionManager,
    env: overrides.env || {},
  });

  return { service, calls, setBot: (b) => { botDoc = b; } };
}

test('channelGuard.assertBotAllowed blocks delivery before any DB lookup or external send', async () => {
  const { service, calls } = buildFixture({
    channelGuard: {
      assertBotAllowed(botId) {
        calls.guardChecks.push(String(botId));
        throw new ChannelsDisabledError(botId);
      },
    },
  });

  await assert.rejects(
    () => service.deliverReply({ botId: BOT_ID, channel: 'whatsapp', userId: '201012345678@c.us' }, 'مرحباً'),
    (err) => err.code === 'CHANNELS_DISABLED' && err.status === 409
  );

  assert.deepEqual(calls.guardChecks, [BOT_ID]);
  assert.equal(calls.botLookups.length, 0);
  assert.equal(calls.waSends.length, 0);
  assert.equal(calls.axiosPosts.length, 0);
});

test('returns false cleanly when conversation, botId, or Bot document is missing', async () => {
  const { service, calls } = buildFixture({ botDoc: null });

  assert.equal(await service.deliverReply(null, 'hi'), false);
  assert.equal(await service.deliverReply({ channel: 'whatsapp' }, 'hi'), false);
  assert.equal(
    await service.deliverReply({ botId: BOT_ID, channel: 'whatsapp', userId: '201012345678' }, 'hi'),
    false
  );
  assert.equal(calls.waSends.length, 0);
  assert.equal(calls.axiosPosts.length, 0);
});

test('WhatsApp QR delivery preserves exact deliverManualReply chatId formatting and @lid handling', async () => {
  const { service, calls } = buildFixture();

  // Plain prefixed number -> <digits>@c.us
  const ok1 = await service.deliverReply(
    { botId: BOT_ID, channel: 'whatsapp', userId: 'whatsapp_201012345678' },
    'أهلاً'
  );
  assert.equal(ok1, true);
  assert.deepEqual(calls.waSends[0], {
    botId: BOT_ID,
    chatId: '201012345678@c.us',
    text: 'أهلاً',
  });

  // Existing @c.us preserved
  const ok2 = await service.deliverReply(
    { botId: BOT_ID, channel: 'whatsapp', userId: '201099998888@c.us' },
    'مرحباً'
  );
  assert.equal(ok2, true);
  assert.equal(calls.waSends[1].chatId, '201099998888@c.us');

  // Existing @lid preserved for QR session
  const ok3 = await service.deliverReply(
    { botId: BOT_ID, channel: 'whatsapp', userId: '198765432109876@lid' },
    'تمام'
  );
  assert.equal(ok3, true);
  assert.equal(calls.waSends[2].chatId, '198765432109876@lid');

  // Non-numeric empty recipient returns false without sending
  const bad = await service.deliverReply(
    { botId: BOT_ID, channel: 'whatsapp', userId: 'whatsapp_abc' },
    'nope'
  );
  assert.equal(bad, false);
  assert.equal(calls.waSends.length, 3);
});

test('WhatsApp falls back to Cloud API when QR session is not running and Cloud config exists (never for @lid)', async () => {
  const notRunningErr = new Error('The WhatsApp session is not active');
  notRunningErr.code = 'WHATSAPP_SESSION_NOT_RUNNING';

  const { service, calls } = buildFixture({
    botDoc: {
      _id: BOT_ID,
      whatsappBusinessAccountId: 'phone-id-999',
      whatsappApiKey: 'wa-cloud-token',
    },
    waSendError: notRunningErr,
    axiosResponse: { data: { messages: [{ id: 'wamid.123' }] } },
  });

  const ok = await service.deliverReply(
    { botId: BOT_ID, channel: 'whatsapp', userId: 'whatsapp_201012345678' },
    'رد من الكلاود'
  );
  assert.equal(ok, true);
  assert.equal(calls.axiosPosts.length, 1);
  assert.equal(calls.axiosPosts[0].url, 'https://graph.facebook.com/v20.0/phone-id-999/messages');
  assert.deepEqual(calls.axiosPosts[0].body, {
    messaging_product: 'whatsapp',
    to: '201012345678',
    type: 'text',
    text: { body: 'رد من الكلاود' },
  });
  assert.equal(calls.axiosPosts[0].config.headers.Authorization, 'Bearer wa-cloud-token');

  // @lid must NOT fall back to Cloud API
  await assert.rejects(
    () => service.deliverReply({ botId: BOT_ID, channel: 'whatsapp', userId: '198765432109876@lid' }, 'hi'),
    (err) => err.code === 'WHATSAPP_SESSION_NOT_RUNNING'
  );
  assert.equal(calls.axiosPosts.length, 1);
});

test('Facebook and Instagram delivery match deliverManualReply Graph API contracts', async () => {
  const { service, calls } = buildFixture();

  const fbOk = await service.deliverReply(
    { botId: BOT_ID, channel: 'facebook', userId: 'facebook_comment_987654' },
    'مرحباً من فيسبوك'
  );
  assert.equal(fbOk, true);
  assert.equal(calls.axiosPosts[0].url, 'https://graph.facebook.com/v22.0/me/messages');
  assert.deepEqual(calls.axiosPosts[0].body, {
    recipient: { id: '987654' },
    message: { text: 'مرحباً من فيسبوك' },
  });
  assert.equal(calls.axiosPosts[0].config.params.access_token, 'fb-token');

  const igOk = await service.deliverReply(
    { botId: BOT_ID, channel: 'instagram', userId: 'instagram_comment_555444' },
    'مرحباً من إنستجرام'
  );
  assert.equal(igOk, true);
  assert.equal(calls.axiosPosts[1].url, 'https://graph.instagram.com/v22.0/me/messages');
  assert.deepEqual(calls.axiosPosts[1].body, {
    recipient: { id: '555444' },
    message: { text: 'مرحباً من إنستجرام' },
  });
  assert.equal(calls.axiosPosts[1].config.params.access_token, 'ig-token');

  // Unsupported web channel returns false without external sends
  const webRes = await service.deliverReply(
    { botId: BOT_ID, channel: 'web', userId: 'visitor-1' },
    'hi'
  );
  assert.equal(webRes, false);
  assert.equal(calls.axiosPosts.length, 2);

  assert.equal(stripChannelPrefixes('comment_123'), '123');
});
