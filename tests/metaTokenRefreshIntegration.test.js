'use strict';
// Integration of the real cronJobs.js refreshFacebookTokens callback and the real
// botsController.linkSocialPage with the real metaAppCredentials helper. Everything
// else (cron, models, axios, logger, dispatcher) is a stub injected through Module._load.
const assert = require('assert');
const Module = require('module');
const path = require('path');

const SECRET = 'SECRETVAL-app-secret';
const OLDTOK = 'OLDTOK-input-token';
const NEWTOK = 'NEWTOK-long-lived';
const LEGACY_ID = ['4990', '2036', '6015', '281'].join('');
const root = path.join(__dirname, '..', 'server');

const logs = [];
const logger = new Proxy({}, { get: () => (...a) => { logs.push(a); } });
let httpCalls;
let httpBehavior;
const axiosStub = {
  get: async (url, cfg) => { httpCalls.push({ url, cfg }); return httpBehavior(url, cfg); },
  post: async (url, body) => { httpCalls.push({ url, body }); return { data: { success: true } }; },
};
let scheduled;
const cronStub = { schedule: (expr, fn) => { scheduled = fn; return { stop() {} }; } };
let notifications;
class NotificationStub { constructor(d) { this.d = d; } async save() { notifications.push(this.d); } }
let bots;
const modelStub = (name) => {
  if (name === 'Bot') return { find: async () => bots, findById: async (id) => bots.find((b) => b._id === id) };
  if (name === 'Notification') return NotificationStub;
  return new Proxy(function () {}, { get: () => () => ({ sort: () => [], populate: () => [] }) });
};
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const resolvedFromHere = parent && parent.filename && request.startsWith('.') ? path.resolve(path.dirname(parent.filename), request) : request;
  if (request === 'node-cron') return cronStub;
  if (request === 'axios') return axiosStub;
  if (request === 'dotenv') return { config() {} };
  if (/[\\/]logger$/.test(resolvedFromHere) || request === './logger' || request === '../logger') return logger;
  if (/[\\/]services[\\/]notificationDispatcher$/.test(resolvedFromHere)) return { dispatchMultiChannelNotification: async () => {} };
  if (/[\\/]models[\\/]/.test(resolvedFromHere)) return modelStub(path.basename(resolvedFromHere));
  if (/botsController\.js$/.test(parent && parent.filename || '') && request.startsWith('.') && !/metaAppCredentials|logSanitize/.test(request)) {
    return new Proxy(function () {}, { get: () => function () {} , apply: () => undefined });
  }
  return realLoad.apply(this, arguments);
};

const mkBot = () => ({ _id: 'b1', name: 'Bot', userId: 'u1', facebookApiKey: OLDTOK, facebookPageId: 'p1', lastFacebookTokenRefresh: null, saved: 0, async save() { this.saved += 1; } });
const dumpLogs = () => JSON.stringify(logs) + logs.map((a) => a.map((x) => (x && x.stack) || '').join('')).join('');
const reset = () => { logs.length = 0; httpCalls = []; notifications = []; bots = [mkBot()]; };
const invalidTokenThenExchange = (exchange) => (url) => {
  if (url.includes('/oauth/access_token')) return exchange(url);
  throw Object.assign(new Error('token invalid'), { response: { status: 400, data: { error: { message: 'invalid', code: 190 } } } });
};
const axiosErr = () => Object.assign(new Error(`Request failed with status code 400 for client_secret=${SECRET}`), {
  code: 'ERR_BAD_REQUEST',
  config: { params: { client_secret: SECRET, fb_exchange_token: OLDTOK } },
  response: { status: 400, data: { error: { message: `echo ${SECRET} ${OLDTOK}`, anykey: SECRET } } },
});

(async () => {
  const cronJobs = require(path.join(root, 'cronJobs.js'));
  cronJobs.refreshFacebookTokens();
  assert.strictEqual(typeof scheduled, 'function');
  const run = () => scheduled();

  // A. Configured env: exchange uses env app id, pinned v20.0, secret only in params; token persisted.
  process.env.FACEBOOK_APP_ID = '777'; process.env.FACEBOOK_APP_SECRET = SECRET;
  reset(); httpBehavior = invalidTokenThenExchange(() => ({ data: { access_token: NEWTOK } }));
  await run();
  const ex = httpCalls.filter((c) => c.url.includes('/oauth/access_token'));
  assert.strictEqual(ex.length, 1);
  assert.strictEqual(ex[0].url, 'https://graph.facebook.com/v20.0/oauth/access_token');
  assert.strictEqual(ex[0].cfg.params.client_id, '777');
  assert.ok(!ex[0].url.includes(SECRET) && !ex[0].url.includes(OLDTOK) && !ex[0].url.includes(LEGACY_ID));
  assert.strictEqual(bots[0].facebookApiKey, NEWTOK); assert.strictEqual(bots[0].saved, 1); assert.strictEqual(notifications.length, 0);
  assert.ok(!dumpLogs().includes(NEWTOK) && !dumpLogs().includes(SECRET));

  // B. Missing env: ZERO HTTP calls (no validation call either), token untouched, NO merchant relink notification, one server-side error log, logs clean.
  for (const [id, sec] of [[undefined, SECRET], ['777', undefined], ['', '']]) {
    if (id === undefined) delete process.env.FACEBOOK_APP_ID; else process.env.FACEBOOK_APP_ID = id;
    if (sec === undefined) delete process.env.FACEBOOK_APP_SECRET; else process.env.FACEBOOK_APP_SECRET = sec;
    reset(); httpBehavior = () => { throw new Error('must not be called'); };
    await run();
    assert.strictEqual(httpCalls.length, 0, 'no provider request when app is not configured');
    assert.strictEqual(bots[0].facebookApiKey, OLDTOK); assert.strictEqual(bots[0].saved, 0);
    assert.strictEqual(notifications.length, 0, 'setup fault must not notify merchants to relink');
    assert.strictEqual(logs.filter((a) => a[0] === 'facebook_token_refresh_skipped_app_not_configured').length, 1);
    assert.ok(!dumpLogs().includes(SECRET) && !dumpLogs().includes(OLDTOK));
  }

  // C. Provider error echoing secret/token under arbitrary keys: nothing leaks to logs or notification.
  process.env.FACEBOOK_APP_ID = '777'; process.env.FACEBOOK_APP_SECRET = SECRET;
  reset(); httpBehavior = invalidTokenThenExchange(() => { throw axiosErr(); });
  await run();
  assert.strictEqual(bots[0].facebookApiKey, OLDTOK); assert.strictEqual(bots[0].saved, 0); assert.strictEqual(notifications.length, 1);
  assert.ok(!dumpLogs().includes(SECRET) && !dumpLogs().includes(OLDTOK), 'leak in logs');
  assert.ok(!JSON.stringify(notifications).includes(SECRET));

  // D. Malformed provider results never persist.
  for (const bad of [{}, true, '', '   ', null]) {
    reset(); httpBehavior = invalidTokenThenExchange(() => ({ data: { access_token: bad } }));
    await run();
    assert.strictEqual(bots[0].facebookApiKey, OLDTOK); assert.strictEqual(bots[0].saved, 0); assert.strictEqual(notifications.length, 1);
  }

  // E. Controller path (unrouted linkSocialPage): unconfigured => 503 and no HTTP; provider error => 400 with no echo.
  const { linkSocialPage } = require(path.join(root, 'controllers', 'botsController.js'));
  const call = async () => {
    const out = {}; const res = { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; } };
    await linkSocialPage({ params: { id: 'b1' }, body: { facebookApiKey: OLDTOK, facebookPageId: 'p1' }, user: { role: 'superadmin', userId: 'u1' } }, res);
    return out;
  };
  delete process.env.FACEBOOK_APP_ID;
  reset(); httpBehavior = () => { throw new Error('must not be called'); };
  let out = await call();
  assert.strictEqual(out.code, 503); assert.strictEqual(httpCalls.length, 0);
  process.env.FACEBOOK_APP_ID = '777';
  reset(); httpBehavior = () => { throw axiosErr(); };
  out = await call();
  assert.strictEqual(out.code, 400); assert.ok(!JSON.stringify(out.body).includes(SECRET) && !JSON.stringify(out.body).includes(OLDTOK));
  assert.ok(!dumpLogs().includes(SECRET) && !dumpLogs().includes(OLDTOK), 'controller leak in logs');
  assert.strictEqual(httpCalls[0].url, 'https://graph.facebook.com/oauth/access_token');


  // ---- F-I: encrypted-at-rest tokens, validation classification, Instagram cron ----
  process.env.CREDENTIAL_ENCRYPTION_KEY = 'hex:' + '11'.repeat(32);
  const { encryptChannelToken } = require(path.join(root, 'services', 'channelTokenCrypto.js'));
  process.env.FACEBOOK_APP_ID = '777'; process.env.FACEBOOK_APP_SECRET = SECRET;
  const encBot = (field, plain) => { const b = mkBot(); b[field] = encryptChannelToken(plain); b.instagramPageId = 'ig1'; return b; };
  const isExchange = (u) => u.includes('/oauth/access_token');
  const httpErr = (status, extra, g) => Object.assign(new Error(`Request failed ${SECRET} ${OLDTOK}`), { response: status ? { status, data: { error: { message: `${SECRET} ${OLDTOK}`, ...g } } } : undefined, config: { params: { access_token: OLDTOK } } }, extra);

  // F. FB cron with an encrypted token: validation and exchange use the DECRYPTED value, only in params.
  reset(); bots = [encBot('facebookApiKey', OLDTOK)];
  assert.ok(bots[0].facebookApiKey.startsWith('chv1:'));
  httpBehavior = (url) => { if (isExchange(url)) return { data: { access_token: NEWTOK } }; throw httpErr(400, undefined, { code: 190, error_subcode: 463 }); };
  await run();
  const val = httpCalls.find((c) => !isExchange(c.url));
  assert.strictEqual(val.cfg.params.access_token, OLDTOK, 'validation must use the decrypted token');
  assert.ok(!val.url.includes(OLDTOK) && !val.url.includes('chv1:'));
  assert.strictEqual(httpCalls.find((c) => isExchange(c.url)).cfg.params.fb_exchange_token, OLDTOK);
  assert.strictEqual(bots[0].facebookApiKey, NEWTOK); assert.strictEqual(notifications.length, 0);
  assert.ok(!dumpLogs().includes(OLDTOK) && !dumpLogs().includes(SECRET) && !dumpLogs().includes('chv1:'));

  // F2. Valid token: no exchange, nothing saved, no notice.
  reset(); bots = [encBot('facebookApiKey', OLDTOK)]; httpBehavior = () => ({ data: { id: 'p1' } });
  await run();
  assert.strictEqual(httpCalls.length, 1); assert.strictEqual(bots[0].saved, 0); assert.strictEqual(notifications.length, 0);

  // G. Inconclusive validation (no response, timeout, 5xx, 429, 408): no exchange, no relink notice, no save, logs clean.
  for (const e of [() => httpErr(undefined, { code: 'ECONNABORTED' }), () => httpErr(500), () => httpErr(503), () => httpErr(429), () => httpErr(408)]) {
    reset(); bots = [encBot('facebookApiKey', OLDTOK)]; httpBehavior = () => { throw e(); };
    await run();
    assert.strictEqual(httpCalls.filter((c) => isExchange(c.url)).length, 0);
    assert.strictEqual(notifications.length, 0, 'transient failure must not tell merchant to relink'); assert.strictEqual(bots[0].saved, 0);
    assert.ok(!dumpLogs().includes(OLDTOK) && !dumpLogs().includes(SECRET));
  }

  // H. Decrypt failure (wrong key): no provider request, no notice, fixed log, no token/secret in logs.
  reset(); bots = [encBot('facebookApiKey', OLDTOK)];
  process.env.CREDENTIAL_ENCRYPTION_KEY = 'hex:' + '22'.repeat(32); httpBehavior = () => { throw new Error('must not be called'); };
  await run();
  assert.strictEqual(httpCalls.length, 0); assert.strictEqual(notifications.length, 0);
  assert.strictEqual(logs.filter((a) => a[0] === 'facebook_token_decrypt_failed_skipped').length, 1);
  assert.ok(!dumpLogs().includes(OLDTOK));
  process.env.CREDENTIAL_ENCRYPTION_KEY = 'hex:' + '11'.repeat(32);

  // I. Instagram refresh cron.
  scheduled = undefined; cronJobs.refreshInstagramTokens(); const runIg = scheduled;
  const igBot = () => { const b = encBot('instagramApiKey', OLDTOK); return b; };
  reset(); bots = [igBot()]; httpBehavior = () => ({ data: { access_token: NEWTOK, expires_in: 5184000 } });
  await runIg();
  assert.strictEqual(httpCalls[0].url, 'https://graph.instagram.com/refresh_access_token');
  assert.deepStrictEqual(httpCalls[0].cfg.params, { grant_type: 'ig_refresh_token', access_token: OLDTOK });
  assert.strictEqual(bots[0].instagramApiKey, NEWTOK); assert.strictEqual(notifications.length, 0);
  assert.ok(!dumpLogs().includes(OLDTOK) && !dumpLogs().includes(NEWTOK));
  // I2 transient: no notice, no save. I3 definitive 4xx: one notice, no save, no leak. I4 malformed token: notice, no save.
  for (const e of [() => httpErr(undefined, { code: 'ETIMEDOUT' }), () => httpErr(502), () => httpErr(429)]) {
    reset(); bots = [igBot()]; httpBehavior = () => { throw e(); }; await runIg();
    assert.strictEqual(notifications.length, 0); assert.strictEqual(bots[0].saved, 0); assert.ok(!dumpLogs().includes(OLDTOK) && !dumpLogs().includes(SECRET));
  }
  reset(); bots = [igBot()]; httpBehavior = () => { throw httpErr(400, undefined, { code: 190 }); }; await runIg();
  assert.strictEqual(notifications.length, 1); assert.strictEqual(bots[0].saved, 0); assert.ok(!dumpLogs().includes(OLDTOK) && !dumpLogs().includes(SECRET));
  for (const bad of [{}, true, '', '  ', null]) {
    reset(); bots = [igBot()]; httpBehavior = () => ({ data: { access_token: bad } }); await runIg();
    assert.strictEqual(notifications.length, 1); assert.strictEqual(bots[0].saved, 0);
  }

  scheduled = undefined; cronJobs.refreshFacebookTokens(); const runFb = scheduled;
  // J. Classification by Graph code, not HTTP status alone (Meta error-handling guide).
  // J1 FB validation: HTTP 400/403 with throttling, temporary, permission, parameter or no Graph code, and
  // is_transient=true, must NOT exchange and must NOT notify. Only 190/102, subcodes 460/463/467, or 401 with no code is a token fault.
  const notTokenFaults = [[400, { code: 4, is_transient: true }], [400, { code: 17 }], [403, { code: 4 }], [400, { code: 1 }], [400, { code: 2 }], [400, { code: 341 }], [400, { code: 368 }], [400, { code: 10 }], [403, { code: 200 }], [400, { code: 299 }], [400, { code: 3 }], [400, { code: 100 }], [400, {}], [403, {}], [404, {}], [400, { code: 9999, is_transient: true }], [400, { code: 'x' }], [401, {}], [400, { code: 190, is_transient: true }], [401, { code: 190, is_transient: true }], [400, { code: 4, error_subcode: 463 }], [400, { code: 17, error_subcode: 467 }], [400, { code: 10, error_subcode: 460 }], [400, { code: 100, error_subcode: 463 }], [400, { code: 100, error_subcode: 467 }], [400, { code: 100, error_subcode: 460 }], [403, { code: 200, error_subcode: 463 }]];
  for (const [st, g] of notTokenFaults) {
    reset(); bots = [encBot('facebookApiKey', OLDTOK)]; httpBehavior = () => { throw httpErr(st, undefined, g); }; await runFb();
    assert.strictEqual(httpCalls.filter((c) => isExchange(c.url)).length, 0, 'no exchange for ' + st + JSON.stringify(g));
    assert.strictEqual(notifications.length, 0, 'no notice for ' + st + JSON.stringify(g)); assert.strictEqual(bots[0].saved, 0);
    assert.ok(!dumpLogs().includes(OLDTOK) && !dumpLogs().includes(SECRET));
    reset(); bots = [igBot()]; httpBehavior = () => { throw httpErr(st, undefined, g); }; await runIg();
    assert.strictEqual(notifications.length, 0, 'IG no notice for ' + st + JSON.stringify(g)); assert.strictEqual(bots[0].saved, 0);
  }
  // J2 token faults still exchange (FB) / notify (IG), including a non-400 status carrying code 190 and a bare 401.
  for (const [st, g] of [[400, { code: 190 }], [401, { code: 190 }], [403, { code: 190 }], [400, { code: 102 }], [400, { code: 190, error_subcode: 463 }], [400, { code: 190, error_subcode: 467 }], [400, { code: 102, error_subcode: 460 }]]) {
    reset(); bots = [encBot('facebookApiKey', OLDTOK)]; httpBehavior = (url) => { if (isExchange(url)) return { data: { access_token: NEWTOK } }; throw httpErr(st, undefined, g); }; await runFb();
    assert.strictEqual(httpCalls.filter((c) => isExchange(c.url)).length, 1, 'exchange for ' + st + JSON.stringify(g)); assert.strictEqual(bots[0].facebookApiKey, NEWTOK);
    reset(); bots = [igBot()]; httpBehavior = () => { throw httpErr(st, undefined, g); }; await runIg();
    assert.strictEqual(notifications.length, 1, 'IG notice for ' + st + JSON.stringify(g)); assert.strictEqual(bots[0].saved, 0);
  }
  // J3 invalid token, exchange fails: transient exchange (503, 429, throttling code, is_transient, no response) skips without notice;
  // a definitive exchange failure notifies. Nothing sensitive in logs or notices either way.
  const exFail = (st, g, code) => (url) => { if (isExchange(url)) throw httpErr(st, code ? { code } : undefined, g); throw httpErr(400, undefined, { code: 190 }); };
  for (const [st, g, code] of [[503], [429], [500], [undefined, undefined, 'ETIMEDOUT'], [400, { code: 4 }], [400, { code: 9999, is_transient: true }]]) {
    reset(); bots = [encBot('facebookApiKey', OLDTOK)]; httpBehavior = exFail(st, g, code); await runFb();
    assert.strictEqual(notifications.length, 0, 'transient exchange no notice ' + st); assert.strictEqual(bots[0].saved, 0);
    assert.ok(!dumpLogs().includes(OLDTOK) && !dumpLogs().includes(SECRET));
  }
  for (const [st, g] of [[400, { code: 190 }], [400, { code: 100 }], [403, {}]]) {
    reset(); bots = [encBot('facebookApiKey', OLDTOK)]; httpBehavior = exFail(st, g); await runFb();
    assert.strictEqual(notifications.length, 1, 'definitive exchange failure notifies ' + st + JSON.stringify(g)); assert.strictEqual(bots[0].saved, 0);
    assert.ok(!dumpLogs().includes(OLDTOK) && !dumpLogs().includes(SECRET));
  }
  // J4 IG success log never carries a provider-controlled expires_in beyond a bounded integer.
  for (const bad of [`leak ${SECRET} ${OLDTOK}`, { x: SECRET }, -5, 1.5, 1e12, NaN]) {
    reset(); bots = [igBot()]; httpBehavior = () => ({ data: { access_token: NEWTOK, expires_in: bad } }); await runIg();
    assert.strictEqual(bots[0].instagramApiKey, NEWTOK); assert.ok(!dumpLogs().includes(SECRET) && !dumpLogs().includes(OLDTOK));
    const ok = logs.find((a) => /Successfully refreshed Instagram/.test(a[0])); assert.strictEqual(ok[1].expiresIn, undefined);
  }
  reset(); bots = [igBot()]; httpBehavior = () => ({ data: { access_token: NEWTOK, expires_in: 5184000 } }); await runIg();
  assert.strictEqual(logs.find((a) => /Successfully refreshed Instagram/.test(a[0]))[1].expiresIn, 5184000);

  console.log('PASS metaTokenRefreshIntegration (cron A-I, controller E)');
})().catch((e) => { console.error(e); process.exit(1); });
