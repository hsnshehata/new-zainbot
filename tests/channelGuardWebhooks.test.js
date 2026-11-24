'use strict';
// Webhook handlers under CHANNELS_MODE: off ignores everything, allowlist handles
// only the allowlisted test bot, on handles all. Models, axios and the AI engine are stubbed.
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const root = path.join(__dirname, '..', 'server');
const logger = new Proxy({}, { get: () => () => {} });
let processed = [];
let sends = [];
const axiosStub = {
  get: async () => ({ data: { id: '1', name: 'n', username: 'u' } }),
  post: async (url) => { sends.push(url); return { data: { message_id: 'm1' } }; },
};
const bots = {
  test: { _id: 'ZZ-TEST-DELETE', isActive: true, facebookPageId: 'PT', instagramPageId: 'IT', whatsappBusinessAccountId: 'WT', facebookApiKey: 'x', instagramApiKey: 'x', whatsappApiKey: 'x' },
  real: { _id: 'REAL-MERCHANT', isActive: true, facebookPageId: 'PR', instagramPageId: 'IR', whatsappBusinessAccountId: 'WR', facebookApiKey: 'x', instagramApiKey: 'x', whatsappApiKey: 'x' },
};
const findBot = async (q) => Object.values(bots).find((b) => Object.keys(q).some((k) => b[k] === q[k])) || null;
const mkConv = () => ({ messages: [], labels: [], async save() {} });
function Conversation() { return mkConv(); }
Conversation.findOne = async () => mkConv();
Conversation.findById = async () => mkConv();
const BotStub = { findOne: findBot, exists: async () => ({}), findById: () => ({ select: async () => bots.test }) };
const realLoad = Module._load;
Module._load = function (request, parent) {
  const rel = parent && parent.filename && request.startsWith('.') ? path.resolve(path.dirname(parent.filename), request) : request;
  if (request === 'axios') return axiosStub;
  if (/[\\/]logger$/.test(rel)) return logger;
  if (/[\\/]services[\\/]channelGuard$/.test(rel)) return realLoad.apply(this, arguments);
  if (/[\\/]services[\\/]metaSendErrors$/.test(rel)) return realLoad.apply(this, arguments);
  if (/[\\/]services[\\/]channelTokenCrypto$/.test(rel)) return { decryptChannelToken: (v) => v };
  if (/[\\/]models[\\/]Bot$/.test(rel)) return BotStub;
  if (/[\\/]models[\\/]Conversation$/.test(rel)) return Conversation;
  if (/[\\/]botEngine$/.test(rel)) return { processMessage: async (botId) => { processed.push(String(botId)); return 'AI reply'; }, processFeedback: async () => null };
  if (request === 'mongoose') return { isValidObjectId: () => true, model: () => BotStub };
  if (request.startsWith('.')) return new Proxy(function () {}, { get: () => function () {}, apply: () => undefined });
  return realLoad.apply(this, arguments);
};
const load = (rel) => { const file = path.join(root, rel); const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); m._compile(fs.readFileSync(file, 'utf8'), file); return m.exports; };
const mkRes = () => { const r = { code: undefined, sendStatus(c) { r.code = c; return r; }, status(c) { r.code = c; return r; }, send() { return r; }, json() { return r; } }; return r; };

const fbBody = (page) => ({ object: 'page', entry: [{ id: page, messaging: [{ sender: { id: 'U1' }, recipient: { id: page }, message: { mid: 'm', text: 'hi' }, timestamp: 1 }] }] });
const igBody = (page) => ({ object: 'instagram', entry: [{ id: page, messaging: [{ sender: { id: 'S1' }, recipient: { id: page }, message: { mid: 'm', text: 'hi' }, timestamp: 1 }] }] });
const waBody = (phone) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: phone }, messages: [{ id: 'w1', from: '2010', type: 'text', text: { body: 'hi' } }] } }] }] });

async function run(handler, body) { processed = []; sends = []; const res = mkRes(); await handler({ body, headers: {}, get: () => '' }, res); return { processed: [...processed], sends: sends.length, code: res.code }; }

(async () => {
  const fb = load('controllers/facebookController.js').handleMessage;
  const ig = load('controllers/instagramController.js').handleMessage;
  const wa = load('controllers/whatsappController.js').processWebhook;
  const cases = [
    ['facebook', fb, fbBody, 'PT', 'PR'],
    ['instagram', ig, igBody, 'IT', 'IR'],
    ['whatsapp', wa, waBody, 'WT', 'WR'],
  ];
  for (const [name, h, mk, testId, realId] of cases) {
    process.env.CHANNELS_MODE = 'off';
    let r = await run(h, mk(testId)); assert.deepStrictEqual(r.processed, [], `${name} off: test bot ignored`);
    r = await run(h, mk(realId)); assert.deepStrictEqual(r.processed, [], `${name} off: real bot ignored`); assert.strictEqual(r.sends, 0);
    delete process.env.CHANNELS_MODE;
    r = await run(h, mk(realId)); assert.deepStrictEqual(r.processed, [], `${name} default: ignored`);
    process.env.CHANNELS_MODE = 'allowlist'; process.env.CHANNELS_ALLOWLIST_BOT_IDS = 'ZZ-TEST-DELETE';
    r = await run(h, mk(realId)); assert.deepStrictEqual(r.processed, [], `${name} allowlist: real bot ignored`); assert.strictEqual(r.sends, 0, `${name} allowlist: nothing sent for real bot`);
    r = await run(h, mk(testId)); assert.deepStrictEqual(r.processed, ['ZZ-TEST-DELETE'], `${name} allowlist: test bot processed`);
    process.env.CHANNELS_MODE = 'on';
    r = await run(h, mk(realId)); assert.deepStrictEqual(r.processed, ['REAL-MERCHANT'], `${name} on: real bot processed`);
  }
  console.log('channel guard webhook tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
