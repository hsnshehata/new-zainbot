'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  getFacebookAppCredentials, exchangeLongLivedToken, resolveGraphVersion, MetaAppNotConfiguredError,
} = require('../server/services/metaAppCredentials');

(async () => {
  // 1. No app id baked into source: the legacy id must not appear anywhere in server/.
  const legacyId = ['4990', '2036', '6015', '281'].join('');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(d, e.name);
    return e.isDirectory() ? walk(f) : f.endsWith('.js') ? [f] : [];
  });
  const hits = walk(path.join(__dirname, '..', 'server')).filter((f) => fs.readFileSync(f, 'utf8').includes(legacyId));
  assert.deepStrictEqual(hits, [], 'legacy app id still hardcoded in: ' + hits.join(','));

  // 2. Fails closed with no network call when id or secret is missing.
  let calls = 0;
  const httpGet = async () => { calls += 1; return { data: { access_token: 'NEW' } }; };
  for (const env of [{}, { FACEBOOK_APP_ID: '123' }, { FACEBOOK_APP_SECRET: 's' }, { FACEBOOK_APP_ID: '  ', FACEBOOK_APP_SECRET: 's' }]) {
    await assert.rejects(() => exchangeLongLivedToken('tok', { env, httpGet }), (e) => e instanceof MetaAppNotConfiguredError && e.code === 'META_APP_NOT_CONFIGURED');
  }
  assert.strictEqual(calls, 0);
  assert.throws(() => getFacebookAppCredentials({}), MetaAppNotConfiguredError);

  // 3. Uses the configured app id, secret in params (not in the URL string), pinned version, timeout.
  let seen;
  const out = await exchangeLongLivedToken('short-token', {
    env: { FACEBOOK_APP_ID: ' 777 ', FACEBOOK_APP_SECRET: 'sec', META_GRAPH_API_VERSION: 'v24.0' },
    httpGet: async (url, cfg) => { seen = { url, cfg }; return { data: { access_token: 'LONG' } }; },
  });
  assert.strictEqual(out, 'LONG');
  assert.strictEqual(seen.url, 'https://graph.facebook.com/v24.0/oauth/access_token');
  assert.deepStrictEqual(seen.cfg.params, { grant_type: 'fb_exchange_token', client_id: '777', client_secret: 'sec', fb_exchange_token: 'short-token' });
  assert.ok(seen.cfg.timeout > 0);
  assert.ok(!seen.url.includes('sec') && !seen.url.includes('short-token'));

  // 3b. Version pinning: explicit pin wins over env, '' keeps the unversioned legacy URL, bad pin rejects.
  const envFull = { FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 's', META_GRAPH_API_VERSION: 'v24.0' };
  const grab = async (gv) => { let u; await exchangeLongLivedToken('t', { env: envFull, graphVersion: gv, httpGet: async (url) => { u = url; return { data: { access_token: 'x' } }; } }); return u; };
  assert.strictEqual(await grab('v20.0'), 'https://graph.facebook.com/v20.0/oauth/access_token');
  assert.strictEqual(await grab(''), 'https://graph.facebook.com/oauth/access_token');
  await assert.rejects(() => grab('20'), /Invalid Graph API version/);
  // Call sites keep their previous versions.
  const root = path.join(__dirname, '..', 'server');
  assert.ok(fs.readFileSync(path.join(root, 'cronJobs.js'), 'utf8').includes("graphVersion: 'v20.0'"));
  assert.ok(fs.readFileSync(path.join(root, 'controllers', 'botsController.js'), 'utf8').includes("graphVersion: ''"));

  // 4. Bad configured version falls back to the default; missing access_token and empty input reject.
  assert.strictEqual(resolveGraphVersion('24'), 'v22.0');
  assert.strictEqual(resolveGraphVersion('v21.0'), 'v21.0');
  await assert.rejects(() => exchangeLongLivedToken('t', { env: { FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 's' }, httpGet: async () => ({ data: {} }) }), /No access_token/);
  await assert.rejects(() => exchangeLongLivedToken('  ', { env: { FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 's' }, httpGet }), /empty/);
  // Upstream HTTP errors are sanitized: no config/params/request/stack-borne secrets, JSON-safe.
  const up = Object.assign(new Error('Request failed with status code 400 for client_secret=SECRETVAL'), {
    code: 'ERR_BAD_REQUEST',
    config: { params: { client_secret: 'SECRETVAL', fb_exchange_token: 'TOKVAL' }, url: 'u?client_secret=SECRETVAL' },
    request: { path: '/x?client_secret=SECRETVAL' },
    response: { status: 400, data: { error: { message: 'echo TOKVAL and SECRETVAL', weird_key: 'SECRETVAL' } } },
  });
  let caught;
  try { await exchangeLongLivedToken('TOKVAL', { env: { FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 'SECRETVAL' }, httpGet: async () => { throw up; } }); } catch (e) { caught = e; }
  assert.ok(caught && caught !== up);
  assert.strictEqual(caught.config, undefined);
  assert.strictEqual(caught.request, undefined);
  assert.strictEqual(caught.code, 'ERR_BAD_REQUEST');
  assert.strictEqual(caught.response, undefined);
  assert.strictEqual(caught.status, 400);
  assert.strictEqual(caught.message, 'Meta token exchange failed with HTTP 400');
  const dump = JSON.stringify(caught) + caught.message + caught.stack + require('util').inspect(caught, { depth: 6 });
  assert.ok(!dump.includes('SECRETVAL') && !dump.includes('TOKVAL'), 'secret or token leaked via error');
  // Network failure with no response still sanitizes.
  let c2; try { await exchangeLongLivedToken('TOKVAL', { env: { FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 'SECRETVAL' }, httpGet: async () => { throw Object.assign(new Error('timeout SECRETVAL'), { code: 'ECONNABORTED', config: { params: { client_secret: 'SECRETVAL' } } }); } }); } catch (e) { c2 = e; }
  assert.strictEqual(c2.code, 'ECONNABORTED'); assert.strictEqual(c2.status, undefined);
  // Unknown error codes collapse to the stable code; attacker-shaped values never pass through.
  let c3; try { await exchangeLongLivedToken('TOKVAL', { env: { FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 'SECRETVAL' }, httpGet: async () => { throw Object.assign(new Error('x'), { code: 'SECRETVAL', response: { status: 'SECRETVAL' } }); } }); } catch (e) { c3 = e; }
  assert.strictEqual(c3.code, 'META_TOKEN_EXCHANGE_FAILED'); assert.strictEqual(c3.status, undefined); assert.ok(!(JSON.stringify(c3) + c3.message).includes('SECRETVAL')); assert.ok(!(c2.message + c2.stack).includes('SECRETVAL'));

  // Malformed provider results are rejected before any caller can persist them.
  for (const bad of [{}, true, 1, ['x'], '', '   ', ' pad ', null]) {
    await assert.rejects(() => exchangeLongLivedToken('t', { env: { FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 's' }, httpGet: async () => ({ data: { access_token: bad } }) }), /No access_token/);
  }
  await assert.rejects(() => exchangeLongLivedToken('t', { env: { FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 's' }, httpGet: async () => ({}) }), /No access_token/);

  console.log('PASS metaAppCredentials (7 groups)');
})().catch((e) => { console.error(e); process.exit(1); });
