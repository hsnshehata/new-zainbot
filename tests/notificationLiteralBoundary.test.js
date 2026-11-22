'use strict';
// Local entity/transport boundaries only. No real Telegram calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
process.env.TELEGRAM_BOT_TOKEN = 'synthetic-local-token';
const { formatComplaintNotificationMessage } = require('../server/services/notificationDispatcher');
const { sendTelegramMessage } = require('../server/services/telegramService');
const decode = s => s.replace(/<\/?b>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const count = s => [...s].length;
for (const raw of ['<>&', '&lt;b&gt; &amp; &#60; &#x3c;', '<img src=x onerror="window.fixtureExecuted=true">']) {
 test('entity spelling and tag-looking customer text round-trip: '+raw.slice(0,12), () => {
  const result = formatComplaintNotificationMessage({message:raw});
  assert.ok(decode(result).includes(raw));
  assert.deepEqual((result.match(/<[^>]*>/g)||[]).filter(s => s !== '<b>' && s !== '</b>'), []);
 });
}
test('entity-heavy text is not truncated by escaped wire length; decoded boundary retained', () => {
 const base = count(decode(formatComplaintNotificationMessage({message:'x'}))) - 1;
 for (const target of [4096,4097]) {
  const raw = '&'.repeat(target-base);
  const formatted = formatComplaintNotificationMessage({message:raw});
  assert.equal(count(decode(formatted)), target);
  assert.ok(formatted.length > 4096);
  assert.ok(formatted.includes('&amp;'.repeat(target-base)));
 }
});
test('provider rejection returns failure once, without raw-text fallback or retry', async () => {
 const original=axios.post; let calls=0;
 axios.post=async (_url,payload)=>{calls++;assert.equal(payload.parse_mode,'HTML');throw {response:{data:{description:'synthetic oversized rejection'}}};};
 try {
  assert.deepEqual(await sendTelegramMessage('synthetic','&amp;'.repeat(5000)), {ok:false,reason:'synthetic oversized rejection'});
  assert.equal(calls,1);
 } finally {axios.post=original;}
});
