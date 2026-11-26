'use strict';
// End to end through the real caller catch blocks: facebookController.handleMessage (optin send,
// comment private reply), instagramController.handleMessage (optin send) and the real
// routes/messages.js POST /reply handler (manual delivery). The stubbed axios rejects with an
// HTTP-client error whose message, stack, config and response carry secret markers. Control
// flow is asserted: HTTP status codes, the 'delivered' flag and the saved conversation.
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const root = path.join(__dirname, '..', 'server');
const TOK = 'EAAB-SECRET-page-token-123';
const CUST = 'customer-private-text-xyz';
const logs = [];
const logger = new Proxy({}, { get: () => (...a) => { logs.push(a); } });
const dump = () => JSON.stringify(logs) + logs.map((a) => a.map((x) => (x && x.stack) || '').join('')).join('');
let postImpl;
const axiosStub = {
  get: async () => ({ data: { id: '1', name: 'n' } }),
  post: async (...a) => postImpl(...a),
};
const evil = (msg) => {
  const e = new Error(msg || `Request failed with status code 400 for https://graph.facebook.com/v20.0/me/messages?access_token=${TOK} ${CUST}`);
  e.isAxiosError = true; e.code = 'ERR_BAD_REQUEST';
  e.config = { url: `https://x/?access_token=${TOK}`, params: { access_token: TOK }, data: CUST };
  e.response = { status: 400, data: { error: { code: 100, message: `${TOK} ${CUST}` } } };
  e.stack = `Error: ${e.message}\n    at fake (${TOK})`;
  return e;
};
let bot; let conv; let routes;
function Conversation() { return conv; }
Conversation.findOne = async () => conv;
Conversation.findById = async () => conv;
const BotStub = { findOne: async () => bot, exists: async () => ({}), findById: () => ({ select: async () => bot }) };
const realLoad = Module._load;
Module._load = function (request, parent) {
  const rel = parent && parent.filename && request.startsWith('.') ? path.resolve(path.dirname(parent.filename), request) : request;
  if (request === 'axios') return axiosStub;
  if (/[\\/]logger$/.test(rel)) return logger;
  if (/[\\/]services[\\/]channelTokenCrypto$/.test(rel)) return { decryptChannelToken: (v) => v };
  if (/[\\/]services[\\/]metaSendErrors$/.test(rel)) return realLoad.apply(this, arguments);
  if (/[\\/]services[\\/]channelGuard$/.test(rel)) return realLoad.apply(this, arguments);
  if (/[\\/]services[\\/]channelDeliveryService$/.test(rel)) return realLoad.apply(this, arguments);
  if (/[\\/]models[\\/]Bot$/.test(rel)) return BotStub;
  if (/[\\/]models[\\/]Conversation$/.test(rel)) return Conversation;
  if (/[\\/]botEngine$/.test(rel)) return { processMessage: async () => 'AI reply', processFeedback: async () => null };
  if (/[\\/]middleware[\\/]botAccess$/.test(rel)) return { getBotAccessFilter: () => ({}), loadAccessibleBot: () => {} };
  if (request.startsWith('.')) return new Proxy(function () {}, { get: () => function () {}, apply: () => undefined });
  if (request === 'express') return { Router: () => { const r = { use() {}, get() {}, put() {}, patch() {}, delete() {}, post(p, ...h) { routes[p] = h[h.length - 1]; } }; return r; } };
  if (request === 'mongoose') return { isValidObjectId: () => true };
  return realLoad.apply(this, arguments);
};
const load = (rel) => { routes = {}; const file = path.join(root, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(fs.readFileSync(file, 'utf8'), file); return m.exports; };
const mkRes = () => { const r = { code: undefined, body: undefined, sendStatus(c) { r.code = c; return r; }, status(c) { r.code = c; return r; }, send(b) { r.body = b; return r; }, json(b) { r.body = b; return r; } }; return r; };
const mkConv = () => ({ messages: [], labels: [], saved: 0, username: 'x', async save() { this.saved += 1; } });

(async () => {
  // Facebook optin -> sendMessage rejects -> outer catch
  const fb = load('controllers/facebookController.js');
  bot = { _id: 'b1', isActive: true, facebookPageId: 'P1', facebookApiKey: TOK, messagingOptinsEnabled: true };
  conv = mkConv(); logs.length = 0; postImpl = async () => { throw evil(); };
  let res = mkRes();
  await fb.handleMessage({ body: { object: 'page', entry: [{ id: 'P1', messaging: [{ sender: { id: 'U1' }, recipient: { id: 'P1' }, optin: { ref: 'x' } }] }] } }, res);
  assert.strictEqual(res.code, 500, 'control flow: outer catch still answers 500');
  assert.ok(logs.some((l) => l[0] === 'fb_webhook_error_outer'));
  assert.ok(!dump().includes(TOK) && !dump().includes(CUST), 'FB outer catch leaked: ' + dump().slice(0, 300));
  assert.deepStrictEqual(logs.find((l) => l[0] === 'fb_webhook_error_outer')[1], { name: 'Error', status: 400, graphCode: 100, code: 'ERR_BAD_REQUEST' });

  // Facebook comment private mode -> sendPrivateReply rejects -> private reply catch, flow continues
  bot = { _id: 'b1', isActive: true, facebookPageId: 'P1', facebookApiKey: TOK, commentsRepliesEnabled: true, commentReplyMode: 'private' };
  conv = mkConv(); logs.length = 0; postImpl = async () => { throw evil(); };
  res = mkRes();
  await fb.handleMessage({ body: { object: 'page', entry: [{ id: 'P1', changes: [{ field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'c1', post_id: 'p', message: CUST, from: { id: 'U2', name: 'N' } } }] }] } }, res);
  assert.strictEqual(res.code, 200, 'private reply failure is still swallowed');
  assert.ok(logs.some((l) => l[0] === 'fb_private_reply_failed'));
  assert.ok(!dump().includes(TOK) && !dump().includes(CUST), 'FB private reply catch leaked: ' + dump().slice(0, 300));

  // Non-HTTP-shaped errors at provider-reachable catches (adapter or application errors whose text could
  // carry a token or customer text): fixed metadata only, same control flow.
  for (const mk of [() => new TypeError(`plain failure ${TOK} ${CUST}`), () => Object.assign(new Error(`custom ${TOK} ${CUST}`), { name: `Weird${TOK}`, code: TOK }), () => { const e = new Error(CUST); e.stack = `Error: ${TOK}`; return e; }, () => ({ message: TOK, stack: CUST }), () => `${TOK} ${CUST}`]) {
    conv = mkConv(); logs.length = 0; bot = { _id: 'b1', isActive: true, facebookPageId: 'P1', facebookApiKey: TOK, messagingOptinsEnabled: true };
    postImpl = async () => { throw mk(); };
    res = mkRes();
    await fb.handleMessage({ body: { object: 'page', entry: [{ id: 'P1', messaging: [{ sender: { id: 'U1' }, recipient: { id: 'P1' }, optin: {} }] }] } }, res);
    assert.strictEqual(res.code, 500);
    assert.ok(!dump().includes(TOK) && !dump().includes(CUST), 'non-HTTP error leaked: ' + dump().slice(0, 300));
    const meta = logs.find((l) => l[0] === 'fb_webhook_error_outer')[1];
    assert.ok(['Error', 'TypeError'].includes(meta.name) && Object.keys(meta).every((k) => ['name', 'status', 'graphCode', 'graphSubcode', 'code'].includes(k)), JSON.stringify(meta));
  }

  // Instagram optin -> sendMessage rejects -> handleMessage outer catch
  const ig = load('controllers/instagramController.js');
  bot = { _id: 'b2', instagramPageId: 'I1', instagramApiKey: TOK, instagramMessagingOptinsEnabled: true };
  conv = mkConv(); logs.length = 0; postImpl = async () => { throw evil(); };
  res = mkRes();
  await ig.handleMessage({ body: { object: 'instagram', entry: [{ id: 'I1', messaging: [{ sender: { id: 'S1' }, recipient: { id: 'I1' }, timestamp: 1, optin: { ref: 'x' } }] }] } }, res);
  assert.strictEqual(res.code, 500);
  assert.ok(logs.some((l) => l[0] === 'ig_handle_error'));
  assert.ok(!dump().includes(TOK) && !dump().includes(CUST), 'IG outer catch leaked: ' + dump().slice(0, 300));

  // Manual reply route: delivery failure is logged safely, reply is still saved, delivered=false
  load('routes/messages.js');
  const reply = routes['/reply']; assert.ok(reply, 'real /reply handler captured');
  bot = { _id: 'b3', facebookApiKey: TOK, instagramApiKey: TOK };
  conv = Object.assign(mkConv(), { botId: 'b3', channel: 'facebook', userId: 'facebook_55' });
  logs.length = 0; postImpl = async () => { throw evil(); };
  res = mkRes();
  await reply({ body: { conversationId: 'c', content: 'hello' }, user: {} }, res);
  assert.strictEqual(res.code, 200); assert.strictEqual(res.body.delivered, false);
  assert.strictEqual(conv.messages.length, 1); assert.strictEqual(conv.saved, 1);
  assert.ok(logs.some((l) => l[0] === 'manual_reply_delivery_failed'));
  assert.ok(!dump().includes(TOK) && !dump().includes(CUST), 'manual reply leaked: ' + dump().slice(0, 300));
  // and the outer manual_reply_error catch
  conv = Object.assign(mkConv(), { botId: 'b3', channel: 'facebook', userId: 'facebook_55' });
  conv.save = async () => { throw evil(); };
  logs.length = 0; postImpl = async () => ({ data: { message_id: 'm' } });
  res = mkRes();
  await reply({ body: { conversationId: 'c', content: 'hello' }, user: {} }, res);
  assert.strictEqual(res.code, 500);
  assert.ok(logs.some((l) => l[0] === 'manual_reply_error') && !dump().includes(TOK) && !dump().includes(CUST), 'manual_reply_error leaked');
  console.log('meta send path caller-catch tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
