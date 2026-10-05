'use strict';

// F08 — final assets/CSP/cache release gate (static half; interactive CSP
// violation + warm-browser proof waits for the A03 harness and is recorded
// as not-run, never claimed).
//
// Proves: chunks work under the CURRENT CSP with nothing beyond 'self'
// (no blanket unsafe-inline removal, no nonce/strict-dynamic that would
// break the F05 loader); every local JS/CSS tag in every page carries a
// version; every local asset ref + SW precache entry resolves (zero-404
// proactive); SW carries the release cache name with a public-shell-only
// precache.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(workspace, 'server', 'server.js'), 'utf8');
const swSource = fs.readFileSync(path.join(workspace, 'public', 'service-worker.js'), 'utf8');

function publicHtmlFiles() {
  return fs.readdirSync(path.join(workspace, 'public'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => path.join(workspace, 'public', f));
}

function localRefs(html) {
  const refs = [];
  const patterns = [
    /<script\b[^>]*?\bsrc\s*=\s*["']([^"']*)["']/gi,
    /<link\b[^>]*?\bhref\s*=\s*["']([^"']*)["']/gi,
    /<img\b[^>]*?\bsrc\s*=\s*["']([^"']*)["']/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const raw = match[1].trim();
      if (raw === '' || raw.startsWith('#') || raw.startsWith('data:') || raw.startsWith('blob:')) continue;
      if (/^(https?:)?\/\//.test(raw)) continue; // external CDN: allowlist-checked below
      refs.push(raw);
    }
  }
  return refs;
}

function resolvePublic(ref, fromHtml) {
  const clean = ref.split(/[?#]/)[0];
  const base = clean.startsWith('/')
    ? path.join(workspace, 'public', clean.slice(1))
    : path.join(path.dirname(fromHtml), clean);
  return { clean, abs: base };
}

// ---------- 1. chunks work under the CURRENT CSP ----------

test('dashboard CSP allows same-origin chunks; unsafe-inline retained, no nonce regime', () => {
  // Helmet dashboard policy (server/server.js): chunks need 'self' only.
  assert.match(serverSource, /scriptSrc:\s*\[[^\]]*'self'/, 'script-src must include self');
  assert.match(serverSource, /scriptSrcAttr:\s*\["'unsafe-inline'"\]/, 'inline handlers stay allowed (no blanket removal in this plan)');
  assert.ok(!serverSource.includes('nonce-'), 'no nonce regime that would break loader-injected scripts');
  assert.ok(!serverSource.includes('strict-dynamic'), 'no strict-dynamic that would break the F05 loader');
  // Chat embedding exceptions preserved alongside.
  assert.match(serverSource, /frame-ancestors \*/);
});

test('every chunk + loader URL is same-origin (nothing beyond self)', () => {
  const assets = require('../public/js/dashboard-assets');
  const urls = Object.values(assets.FEATURES).sort();
  assert.deepEqual(urls, ['/js/dashboard-idea-council.js?v=20261005-f05', '/js/settings-summary.js?v=20261005-f05']);
  for (const url of urls) {
    assert.ok(!/^(https?:)?\/\//.test(url), `chunk must be same-origin: ${url}`);
    const { abs } = resolvePublic(url, path.join(workspace, 'public', 'dashboard.html'));
    assert.ok(fs.existsSync(abs), `lazy chunk must exist: ${url}`);
  }
  // The service worker itself is same-origin.
  assert.ok(fs.existsSync(path.join(workspace, 'public', 'service-worker.js')));
});

// ---------- 2. versions on every local tag ----------

test('every local JS/CSS tag in every page carries a version query', () => {
  const offenders = [];
  for (const htmlPath of publicHtmlFiles()) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    for (const ref of localRefs(html)) {
      const { clean } = resolvePublic(ref, htmlPath);
      if (!/\.(js|css)$/i.test(clean)) continue;
      if (!ref.includes('?v=')) offenders.push(`${path.basename(htmlPath)}: ${ref}`);
    }
  }
  assert.deepEqual(offenders, [], `unversioned local tags (F08 release ledger): ${offenders.join('; ')}`);
});

// ---------- 3. zero asset-404 (proactive, all pages) ----------

test('every local asset ref in every page resolves on disk', () => {
  const missing = [];
  for (const htmlPath of publicHtmlFiles()) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    for (const ref of localRefs(html)) {
      const { abs } = resolvePublic(ref, htmlPath);
      if (!fs.existsSync(abs)) missing.push(`${path.basename(htmlPath)}: ${ref}`);
    }
  }
  assert.deepEqual(missing, [], `missing asset refs: ${missing.join('; ')}`);
});

test('SW precache entries resolve; precache stays public-shell-only', () => {
  const body = swSource.match(/const\s+urlsToCache\s*=\s*\[([\s\S]*?)\];/)[1];
  const entries = [...body.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(entries.length > 0);
  for (const url of entries) {
    const stripped = url.startsWith('/') ? url.slice(1) : url;
    const resolved = stripped === '' ? 'index.html'
      : path.extname(stripped) ? stripped : `${stripped}.html`;
    assert.ok(
      fs.existsSync(path.join(workspace, 'public', resolved.split(/[?#]/)[0])),
      `precache entry must resolve: ${url}`
    );
  }
  for (const banned of ['/dashboard', 'dashboard_new.js', '/login', '/register', 'settings-summary', 'dashboard-idea-council', '/api']) {
    assert.ok(!entries.includes(banned), `precache must not contain ${banned}`);
  }
});

// ---------- 4. release cache name ----------

test('service worker carries the F08 release cache name', () => {
  const name = swSource.match(/const\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"]/)[1];
  assert.equal(name, 'zainbot-v0.0040-release');
  assert.notEqual(name, 'zainbot-v0.0030-public-shell', 'release must rotate past the F03 name (warm upgrade path)');
});
