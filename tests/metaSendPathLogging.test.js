'use strict';
// Real facebookController, instagramController and routes/messages source (loaded with
// their internal functions exposed) run against a stubbed axios and logger. Provider
// bodies and errors are filled with secrets under arbitrary keys and inside free text.
// Nothing but integer status/Graph code/subcode and allow-listed codes may reach logs.
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const root = path.join(__dirname, '..', 'server');

const TOK = 'EAAB-SECRET-page-token-123';
const CUST = 'customer-private-text-xyz';
const logs = [];
const logger = new Proxy({}, { get: () => (...a) => { logs.push(a); } });
let axiosImpl;
const axiosStub = {
  get: async (...a) => axiosImpl('get', ...a),
  post: async (...a) => axiosImpl('post', ...a),
};
const realLoad = Module._load;
Module._load = function (request, parent) {
  const rel = parent && parent.filename && request.startsWith('.') ? path.resolve(path.dirname(parent.filename), request) : request;
  if (request === 'axios') return axiosStub;
  if (/[\\/]logger$/.test(rel)) return logger;
  if (/[\\/]services[\\/]channelTokenCrypto$/.test(rel)) return { decryptChannelToken: (v) => v };
  if (/[\\/]services[\\/]metaSendErrors$/.test(rel)) return realLoad.apply(this, arguments);
  if (request.startsWith('.') ) return new Proxy(function () {}, { get: () => function () {}, apply: () => undefined });
  if (request === 'express') return { Router: () => ({ get() {}, post() {}, put() {}, patch() {}, delete() {}, use() {} }) };
  if (request === 'mongoose') return {};
  return realLoad.apply(this, arguments);
};
function load(rel, names) {
  const file = path.join(root, rel);
  const src = fs.readFileSync(file, 'utf8') + `\nmodule.exports.__t = { ${names.join(', ')} };\n`;
  const m = new Module(file, null);
  m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src, file);
  return m.exports.__t;
}
const dump = () => JSON.stringify(logs);
const reset = () => { logs.length = 0; };
const evil = (status, extra) => Object.assign(new Error(`Request failed ${TOK} ${CUST}`), {
  code: 'ERR_BAD_REQUEST',
  config: { url: `https://x/?access_token=${TOK}`, params: { access_token: TOK }, data: CUST },
  response: { status, data: { error: { code: 190, error_subcode: 463, message: `echo ${TOK} ${CUST}`, fbtrace_id: TOK, weird_key: TOK, type: TOK }, anykey: TOK, ...extra } },
});
const fail = (status) => async () => { throw evil(status); };
const okErrBody = (status) => async () => ({ status, data: { error: { code: 100, message: `bad ${TOK} ${CUST}`, error_subcode: 33, other: TOK } } });

(async () => {
  const { describeGraphFailure } = require(path.join(root, 'services', 'metaSendErrors'));
  // helper: fixed shape
  assert.deepStrictEqual(describeGraphFailure(evil(400)), { status: 400, graphCode: 190, graphSubcode: 463, code: 'ERR_BAD_REQUEST' });
  assert.deepStrictEqual(describeGraphFailure({ code: 'WEIRD-' + TOK }), {});
  assert.deepStrictEqual(describeGraphFailure({ response: { status: '400', data: { error: { code: '190', error_subcode: TOK } } } }), {});
  assert.deepStrictEqual(describeGraphFailure(null), {});
  assert.deepStrictEqual(describeGraphFailure({ status: 400, data: { error: { code: 100 } } }), { status: 400, graphCode: 100 });

  // Facebook senders
  const fb = load('controllers/facebookController.js', ['sendMessage', 'replyToComment', 'sendPrivateReply']);
  for (const [fn, name, args] of [[fb.sendMessage, 'fb_send_message_error', ['1', CUST, TOK]], [fb.replyToComment, 'fb_reply_comment_error', ['c1', CUST, TOK]], [fb.sendPrivateReply, 'fb_send_private_reply_error', ['c1', CUST, TOK]]]) {
    reset(); axiosImpl = fail(400);
    await assert.rejects(() => fn(...args));            // rejection behaviour is preserved
    assert.ok(logs.some((l) => l[0] === name), name);
    assert.ok(!dump().includes(TOK) && !dump().includes(CUST), name + ' leaked');
    assert.deepStrictEqual(logs.find((l) => l[0] === name)[1], { status: 400, graphCode: 190, graphSubcode: 463, code: 'ERR_BAD_REQUEST' });
  }
  // request shape and version unchanged
  let seen; axiosImpl = async (m, url, body, cfg) => { seen = { url, cfg }; return { data: { ok: 1 } }; };
  await fb.sendMessage('1', 'hi', TOK);
  assert.strictEqual(seen.url, 'https://graph.facebook.com/v20.0/me/messages');
  assert.strictEqual(seen.cfg.params.access_token, TOK);

  // Instagram
  const ig = load('controllers/instagramController.js', ['getInstagramUsername', 'validateAccessToken', 'sendMessage', 'replyToComment']);
  reset(); axiosImpl = fail(400);
  assert.strictEqual(await ig.getInstagramUsername('instagram_55', TOK), '55');
  assert.strictEqual(await ig.validateAccessToken(TOK), false);
  assert.ok(logs.filter((l) => /_error|_invalid/.test(l[0])).length === 2 && !dump().includes(TOK) && !dump().includes(CUST), 'ig lookups leaked');
  for (const [fn, args, evt] of [[ig.sendMessage, ['9', CUST, TOK], 'ig_send_message_error'], [ig.replyToComment, ['c9', CUST, TOK], 'ig_reply_comment_error']]) {
    // thrown path: rethrow preserved, user-unavailable subcode still swallowed
    reset(); axiosImpl = fail(400);
    await assert.rejects(() => fn(...args));
    assert.ok(logs.some((l) => l[0] === evt) && !dump().includes(TOK) && !dump().includes(CUST), evt);
    reset(); axiosImpl = async () => { throw Object.assign(evil(400), { response: { status: 400, data: { error: { error_subcode: 2534014, message: TOK } } } }); };
    assert.strictEqual(await fn(...args), undefined);
    assert.ok(!dump().includes(TOK), evt + ' subcode path leaked');
    // resolved non-2xx path
    reset(); axiosImpl = okErrBody(500);
    await assert.rejects(() => fn(...args));
    assert.ok(!dump().includes(TOK) && !dump().includes(CUST), evt + ' non2xx leaked');
  }
  seen = null; axiosImpl = async (m, url) => { seen = url; return { status: 200, data: { ok: 1 } }; };
  await ig.sendMessage('9', 'hi', TOK);
  assert.strictEqual(seen, `https://graph.instagram.com/v20.0/me/messages?access_token=${TOK}`); // unchanged on purpose

  // routes/messages.js name lookup (both the thrown and the resolved error-body paths)
  const msg = load('routes/messages.js', ['getSocialUsername']);
  const bot = { _id: 'b', facebookApiKey: TOK, instagramApiKey: TOK, whatsappApiKey: TOK, whatsappBusinessAccountId: 'w' };
  reset(); axiosImpl = fail(400);
  await msg.getSocialUsername('facebook_77', bot, 'facebook').catch(() => {});
  reset(); axiosImpl = async () => ({ data: { error: { code: 100, message: `${TOK} ${CUST}`, x: TOK } } });
  await msg.getSocialUsername('facebook_77', bot, 'facebook').catch(() => {});
  assert.ok(logs.length >= 2, 'expected error logs');
  assert.ok(!dump().includes(TOK) && !dump().includes(CUST), 'messages.js leaked');
  reset(); axiosImpl = fail(400);
  await msg.getSocialUsername('instagram_77', bot, 'instagram').catch(() => {});
  if (dump().includes(TOK)) console.log(dump()); assert.ok(!dump().includes(TOK) && !dump().includes(CUST), 'messages.js thrown leaked');
  console.log('meta send path logging tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
