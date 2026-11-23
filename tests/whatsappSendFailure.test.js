'use strict';
// Real whatsappController.processWebhook with stubbed models, bot engine, logger and fetch.
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const root = path.join(__dirname, '..', 'server');
const TOK = 'WA-SECRET-token-123';
const REPLY = 'bot-reply-private-text-xyz';
const SIGNED = 'https://lookaside.example/signed?sig=SIGNED-URL-SECRET';
const logs = [];
const logger = new Proxy({}, { get: () => (...a) => { logs.push(a); } });
const dump = () => JSON.stringify(logs);
let fetchImpl; let bot = { _id: 'b1', isActive: true }; let reply = REPLY;
const realLoad = Module._load;
Module._load = function (request, parent) {
  const rel = parent && parent.filename && request.startsWith('.') ? path.resolve(path.dirname(parent.filename), request) : request;
  if (/[\\/]logger$/.test(rel)) return logger;
  if (/[\\/]botEngine$/.test(rel)) return { processMessage: async () => reply };
  if (/[\\/]models[\\/]/.test(rel)) return {};
  if (/[\\/]services[\\/]metaSendErrors$/.test(rel)) return realLoad.apply(this, arguments);
  if (request === 'mongoose') return { model: () => ({ findOne: async () => bot }) };
  return realLoad.apply(this, arguments);
};
process.env.WHATSAPP_ACCESS_TOKEN = TOK;
const file = path.join(root, 'controllers', 'whatsappController.js');
const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
global.fetch = async (...a) => fetchImpl(...a);
m._compile(fs.readFileSync(file, 'utf8'), file);
const { processWebhook } = m.exports;
const mkRes = () => { const r = { code: undefined, sendStatus(c) { r.code = c; return r; } }; return r; };
const textReq = () => ({ body: { object: 'x', entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PN1' }, messages: [{ from: '201000000001', id: 'wamid.1', type: 'text', text: { body: 'hi' } }] } }] }] } });
const imgReq = () => ({ body: { object: 'x', entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PN1' }, messages: [{ from: '201000000001', id: 'wamid.2', type: 'image', image: { id: 'MEDIA1' } }] } }] }] } });

(async () => {
  // success: logged as sent with a length only, never the reply text
  logs.length = 0; fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}) });
  let res = mkRes(); await processWebhook(textReq(), res);
  assert.strictEqual(res.code, 200);
  assert.ok(logs.some((l) => l[0] === 'whatsapp_reply_sent' && l[1].replyLength === REPLY.length));
  assert.ok(!dump().includes(REPLY));
  // pre-existing (out of scope here): whatsapp_processing logs the sender phone as userId,
  // the same pattern facebook/instagram controllers use with prefixedSenderId.
  // rejected send (provider 4xx/5xx, body with secrets): surfaced as an error, not as sent, 200 kept
  for (const status of [400, 401, 429, 500]) {
    logs.length = 0; fetchImpl = async () => ({ ok: false, status, json: async () => ({ error: { message: `${TOK} ${REPLY}` } }) });
    res = mkRes(); await processWebhook(textReq(), res);
    assert.strictEqual(res.code, 200, 'ack kept to avoid duplicate re-delivery');
    assert.ok(!logs.some((l) => l[0] === 'whatsapp_reply_sent'), 'must not claim sent');
    const f = logs.find((l) => l[0] === 'whatsapp_reply_send_failed'); assert.ok(f, 'failure surfaced');
    assert.deepStrictEqual(f[1], { botId: 'b1', status });
    assert.ok(!dump().includes(TOK) && !dump().includes(REPLY));
  }
  // missing / malformed response object is a failure too
  logs.length = 0; fetchImpl = async () => undefined; res = mkRes(); await processWebhook(textReq(), res);
  assert.strictEqual(res.code, 200); assert.deepStrictEqual(logs.find((l) => l[0] === 'whatsapp_reply_send_failed')[1], { botId: 'b1', status: undefined });
  // a fetch that throws reaches the outer catch: still 500 as before, and the catch itself now works
  logs.length = 0; fetchImpl = async () => { throw Object.assign(new Error(`network ${TOK} ${REPLY}`), { code: 'ECONNRESET' }); };
  res = mkRes(); await processWebhook(textReq(), res);
  assert.strictEqual(res.code, 500);
  assert.deepStrictEqual(logs.find((l) => l[0] === 'whatsapp_webhook_error')[1], { name: 'Error', code: 'ECONNRESET' });
  assert.ok(!dump().includes(TOK) && !dump().includes(REPLY));
  // media: signed URL never logged; a failed media lookup is still acked 200 with the status
  logs.length = 0; let calls = 0;
  fetchImpl = async () => { calls += 1; return calls === 1 ? { ok: true, status: 200, json: async () => ({ url: SIGNED, mime_type: 'image/jpeg' }) } : { ok: true, status: 200, json: async () => ({}) }; };
  res = mkRes(); await processWebhook(imgReq(), res);
  assert.strictEqual(res.code, 200); assert.ok(!dump().includes('SIGNED-URL-SECRET'), 'signed media URL leaked');
  logs.length = 0; fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({ error: {} }) });
  res = mkRes(); await processWebhook(imgReq(), res);
  assert.strictEqual(res.code, 200); assert.strictEqual(logs.find((l) => l[0] === 'whatsapp_media_url_fetch_failed')[1].status, 404);
  console.log('whatsapp send failure tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
