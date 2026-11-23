'use strict';
// Real telegramService.sendTelegramMessage with stubbed axios/models/logger.
// A failing send must return a fixed reason, never throw, and log fixed
// metadata only (the bot token sits in the request URL; provider text can
// echo it or customer data).
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const root = path.join(__dirname, '..', 'server');
const TOK = 'TG-SECRET-bot-token';
process.env.TELEGRAM_BOT_TOKEN = TOK;
const logs = [];
const logger = new Proxy({}, { get: () => (...a) => { logs.push(a); } });
let axiosImpl;
const realLoad = Module._load;
Module._load = function (request, parent) {
  const rel = parent && parent.filename && request.startsWith('.') ? path.resolve(path.dirname(parent.filename), request) : request;
  if (/[\\/]logger$/.test(rel)) return logger;
  if (/[\\/]models[\\/]/.test(rel)) return {};
  if (request === 'axios') return { post: (...a) => axiosImpl(...a) };
  return realLoad.apply(this, arguments);
};
const file = path.join(root, 'services', 'telegramService.js');
const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
m._compile(fs.readFileSync(file, 'utf8'), file);
const { sendTelegramMessage } = m.exports;
const dump = () => JSON.stringify(logs);

(async () => {
  // success passes through the provider result
  axiosImpl = async () => ({ data: { ok: true, result: { message_id: 1 } } });
  let r = await sendTelegramMessage('chat1', 'hello');
  assert.strictEqual(r.ok, true);

  // provider 4xx with a body echoing the token: fixed reason, metadata-only log
  for (const make of [
    () => { const e = new Error(`Request failed 401 for https://api.telegram.org/bot${TOK}/sendMessage`); e.response = { status: 401, data: { description: `Unauthorized: ${TOK}` } }; throw e; },
    () => { throw Object.assign(new Error(`socket hang up ${TOK}`), { code: 'ECONNRESET' }); },
  ]) {
    logs.length = 0;
    axiosImpl = make;
    r = await sendTelegramMessage('chat1', 'hello');
    assert.deepStrictEqual(r, { ok: false, reason: 'send_failed' }, 'fixed reason, no provider text');
    const errLog = logs.find((l) => l[0] === 'Telegram send error');
    assert.ok(errLog, 'failure logged');
    assert.ok(!dump().includes(TOK), 'token must not reach logs');
    assert.ok(!JSON.stringify(errLog[1]).includes('Unauthorized'), 'provider description must not reach logs');
  }

  console.log('telegram send failure tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
