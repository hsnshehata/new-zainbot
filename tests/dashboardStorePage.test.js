'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pub = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(pub, 'dashboard.html'), 'utf8');
const code = fs.readFileSync(path.join(pub, 'js', 'dashboard-store.js'), 'utf8');
const main = fs.readFileSync(path.join(pub, 'js', 'dashboard_new.js'), 'utf8');

test('dashboard has a Store menu item, page section and script', () => {
  assert.match(html, /data-target="page-store"/);
  assert.match(html, /<section id="page-store" class="db-page">/);
  assert.match(html, /<div id="storePageRoot">/);
  assert.match(html, /js\/dashboard-store\.js/);
  assert.match(main, /menu_store: 'Store'/);
  assert.match(main, /menu_store: 'المتجر'/);
  assert.match(main, /tabId === 'page-store'/);
});

test('module has matching AR and EN text and sanitizes link input', () => {
  const win = { location: { origin: 'https://zainbot.com' }, document: {} };
  vm.runInNewContext(code, { window: win, globalThis: win }, { filename: 'dashboard-store.js' });
  const { _text, _normalizeLink } = win.ZainBotStore;
  assert.deepEqual(Object.keys(_text.en).sort(), Object.keys(_text.ar).sort());
  assert.equal(_normalizeLink('  My Shop!! 2 '), 'my-shop-2');
  assert.equal(_normalizeLink('<script>'), 'script');
});

test('create flow posts the selected agent and keeps the cart on', () => {
  assert.match(code, /selectedBotId: String\(ctx\.bot\._id\)/);
  assert.match(code, /enableCart: true/);
  assert.match(code, /\/api\/stores\/mine\?botId=/);
});
