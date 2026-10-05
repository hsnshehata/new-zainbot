'use strict';

// A03 browser runner — `npm run test:browser:dashboard`.
//
// 1. Serves the EXPORTED Express app (never startServer(): it has
//    WhatsApp/job side effects) on 0.0.0.0:<ephemeral-port>.
// 2. Discovers the container IPv4 at runtime via `hostname -i` (first IPv4;
//    NEVER hardcoded, NEVER the public IP — public-IP hairpin does not work).
// 3. Concatenates tests/browser/fixtures/dashboardApi.js ABOVE
//    tests/browser/dashboardSmoke.browser.js, injects the base URL, and POSTs
//    the raw-JS body to Browserless /chrome/function (Content-Type:
//    application/javascript; the {code,context} JSON shape does NOT work).
// 4. Prints per-scenario results; exit 0 only when every scenario passes AND
//    no unknown API was hit. Browser + server cleanup in `finally`.
//
// Node built-ins only (fetch, fs, os, child_process, path). No new deps.
// The Browserless token is read from /root/.config/opencode/.browserless-url
// (chmod 600) and is NEVER printed — errors redact query strings.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const FIXTURES_PATH = path.join(REPO_ROOT, 'tests', 'browser', 'fixtures', 'dashboardApi.js');
const SMOKE_PATH = path.join(REPO_ROOT, 'tests', 'browser', 'dashboardSmoke.browser.js');
const TOKEN_FILE = '/root/.config/opencode/.browserless-url';
const BASE_PLACEHOLDER = '__SMOKE_BASE_URL__';
const DOCS_PLACEHOLDER = '__DOC_BODIES__';
// Document paths served byte-identical by the runner (see smoke rationale).
const DOC_PATHS = ['/dashboard', '/login'];

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-that-is-at-least-32-bytes-long';

function discoverContainerIp() {
  const override = String(process.env.QA_BROWSER_IP || '').trim();
  if (/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(override)) return override;
  const raw = execFileSync('hostname', ['-i'], { encoding: 'utf8' });
  const match = String(raw).split(/\s+/).find((part) => /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(part));
  if (!match) throw new Error('no IPv4 address found in `hostname -i` output');
  return match;
}

function readBrowserless() {
  const base = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  const host = base.replace(/^ws:\/\//, '').split('/')[0];
  const tokenParam = (base.match(/token=[^\s&'"]+/) || [])[0];
  if (!host || !tokenParam) throw new Error('could not derive host/token from the browserless URL file');
  return { host, tokenParam };
}

function redact(url) {
  return String(url).split('?')[0];
}

function selfCheckFixtures() {
  // eslint-disable-next-line global-require
  const fixtures = require(FIXTURES_PATH);
  const assert = require('node:assert/strict');
  const { SMOKE_TOKENS, SMOKE_LOGIN, matchSmokeApi } = fixtures;

  let decision = matchSmokeApi('POST', '/api/auth/login', '', JSON.stringify(SMOKE_LOGIN), 'ok');
  assert.equal(decision.kind, 'fulfill');
  assert.equal(decision.status, 200);
  assert.equal(decision.body.token, SMOKE_TOKENS.ORDINARY);

  decision = matchSmokeApi('POST', '/api/auth/login', '', JSON.stringify({ username: 'mallory', password: 'x' }), 'ok');
  assert.equal(decision.kind, 'unknown');

  decision = matchSmokeApi('GET', '/api/users/profile', `Bearer ${SMOKE_TOKENS.ORDINARY}`, '', 'ok');
  assert.equal(decision.kind, 'fulfill');
  assert.equal(decision.status, 200);
  assert.equal(decision.body.data.username, 'smoke_user');

  decision = matchSmokeApi('GET', '/api/users/profile', `Bearer ${SMOKE_TOKENS.SUPERADMIN}`, '', 'ok');
  assert.equal(decision.body.data.role, 'superadmin');

  decision = matchSmokeApi('GET', '/api/users/profile', `Bearer ${SMOKE_TOKENS.DEAD}`, '', 'ok');
  assert.equal(decision.status, 401);

  decision = matchSmokeApi('GET', '/api/users/profile', `Bearer ${SMOKE_TOKENS.ORDINARY}`, '', 'unauthorized');
  assert.equal(decision.status, 401);

  decision = matchSmokeApi('GET', '/api/users/profile', `Bearer ${SMOKE_TOKENS.ORDINARY}`, '', 'error500slow');
  assert.equal(decision.status, 500);
  assert.ok(decision.delayMs >= 500);

  decision = matchSmokeApi('GET', '/api/config', '', '', 'ok');
  assert.equal(decision.status, 200);

  decision = matchSmokeApi('GET', '/api/subscriptions/mine', `Bearer ${SMOKE_TOKENS.ORDINARY}`, '', 'ok');
  assert.equal(decision.kind, 'fulfill');
  assert.equal(decision.status, 200);

  assert.equal(matchSmokeApi('GET', '/api/bots', `Bearer ${SMOKE_TOKENS.ORDINARY}`, '', 'ok').kind, 'unknown');
  assert.equal(matchSmokeApi('POST', '/api/nope', '', '', 'ok').kind, 'unknown');
}

async function main() {
  selfCheckFixtures();
  console.log('fixtures self-check: 12 assertions ok');

  const ip = discoverContainerIp();
  // eslint-disable-next-line global-require
  const app = require(path.join(REPO_ROOT, 'server', 'server'));
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '0.0.0.0', () => resolve(listener));
    listener.on('error', reject);
  });
  try {
    const port = server.address().port;
    const baseUrl = process.env.QA_BROWSER_URL || `http://${ip}:${port}`;

    const sanity = await fetch(`${baseUrl}/dashboard`, { headers: { Accept: 'text/html' } });
    const sanityText = await sanity.text();
    if (sanity.status !== 200 || !/<html/i.test(sanityText)) {
      throw new Error(`local sanity failed: status ${sanity.status}`);
    }
    console.log(`app serving: local sanity 200, browser target ${baseUrl.replace(/:\d+$/, ':<port>')}`);

    const fixturesSrc = fs.readFileSync(FIXTURES_PATH, 'utf8');
    const smokeSrc = fs.readFileSync(SMOKE_PATH, 'utf8');
    if (!smokeSrc.includes(BASE_PLACEHOLDER)) throw new Error('smoke file lost its base-URL placeholder');
    if (!smokeSrc.includes(DOCS_PLACEHOLDER)) throw new Error('smoke file lost its document-bodies placeholder');
    if (/\.test\.js/.test(SMOKE_PATH)) throw new Error('smoke file must not end in .test.js');
    // Real document bytes over loopback (Node ignores HSTS). Verified
    // byte-identical to disk so the injection cannot mask a broken page.
    const docBodies = {};
    for (const docPath of DOC_PATHS) {
      const res = await fetch(`http://127.0.0.1:${port}${docPath}`, { headers: { Accept: 'text/html' } });
      const text = await res.text();
      if (res.status !== 200 || !/<html/i.test(text)) {
        throw new Error(`document fetch failed for ${docPath}: status ${res.status}`);
      }
      const onDisk = fs.readFileSync(path.join(REPO_ROOT, 'public', docPath === '/dashboard' ? 'dashboard.html' : 'login.html'), 'utf8');
      if (text !== onDisk) throw new Error(`served ${docPath} differs from disk — refusing to inject`);
      docBodies[docPath] = text;
    }
    let body = `${fixturesSrc}\n${smokeSrc.split(BASE_PLACEHOLDER).join(baseUrl)}`;
    body = body.split(DOCS_PLACEHOLDER).join(JSON.stringify(docBodies));
    console.log(`function payload bytes: ${Buffer.byteLength(body)}`);

    const { host, tokenParam } = readBrowserless();
    const endpoint = `http://${host}/chrome/function?${tokenParam}`;
    const timeoutMs = Number(process.env.QA_BROWSER_TIMEOUT_MS || 180000);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/javascript' },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`browserless ${redact(endpoint)} answered HTTP ${response.status}`);
    }
    const result = await response.json();

    for (const scenario of result.scenarios || []) {
      console.log(`${scenario.ok ? 'PASS' : 'FAIL'} ${scenario.id} — ${scenario.detail}`);
    }
    if (result.unknownHits && result.unknownHits.length > 0) {
      console.log(`FAIL unknown APIs hit (${result.unknownHits.length}): ${result.unknownHits.join(' | ')}`);
    }
    if (result.loopObservation) {
      console.log(`observation dead-token-no-expiry: ${JSON.stringify(result.loopObservation)}`);
    }

    const ok = Boolean(result.pass) && (result.unknownHits || []).length === 0;
    console.log(ok ? 'browser smoke: GREEN' : 'browser smoke: RED');
    process.exitCode = ok ? 0 : 1;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error(`browser smoke error: ${String((err && err.message) || err).slice(0, 500)}`);
  process.exitCode = 1;
});
