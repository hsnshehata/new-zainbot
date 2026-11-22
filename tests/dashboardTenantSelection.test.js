'use strict';

// tests/dashboardTenantSelection.test.js
// Pins the tenant-selection contract of the dashboard:
// - loadBots prefers the explicitly selected bot, then the caller's OWN bot,
//   never silently another tenant's newest bot (superadmin sees all bots).
// - Cross-tenant admin context is visibly marked (overview badge + agent card).
// - Chat-page creation is an intentional POST, never a GET side effect; the
//   customizer offers an explicit create action when no page exists.
// Style mirrors tests/dashboardOnboarding.test.js (source-level contracts).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const js = fs.readFileSync(path.join(__dirname, '../public/js/dashboard_new.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../public/dashboard.html'), 'utf8');

test('loadBots prefers the caller own bot over another tenant newest bot', () => {
  const start = js.indexOf('async function loadBots()');
  assert.ok(start > -1);
  const body = js.slice(start, start + 2500);
  assert.match(body, /bots\.find\(\(bot\) => String\(bot\._id\) === preferredBotId\)/, 'explicit selection still wins');
  assert.match(body, /bots\.find\(isOwn\)/, 'own bot is preferred before any foreign bot');
  assert.match(body, /isOwn = \(bot\) => String\(bot\?\.userId\?\._id \|\| bot\?\.userId \|\| ''\) === String\(currentUser\?\._id \|\| ''\)/, 'ownership compares bot owner to the signed-in user');
});

test('cross-tenant admin context is visibly marked in overview and agent cards', () => {
  assert.match(js, /function isForeignBot\(bot\)/);
  assert.match(js, /function updateCrossTenantMarker\(\)/);
  assert.match(js, /document\.getElementById\('overviewCrossTenantBadge'\)/);
  assert.ok(js.indexOf('isForeignBot(bot)') > -1, 'agent cards check foreign ownership');
  assert.match(html, /id="overviewCrossTenantBadge" hidden/);
});

test('chat-page customizer: missing page shows an intentional create action, not a silent provision', () => {
  assert.match(html, /id="chatPageCreatePanel" hidden/);
  assert.match(html, /id="createChatPageBtn"/);
  assert.match(js, /window\.createChatPageForCurrentBot = async function\(\)/);
  const create = js.slice(js.indexOf('window.createChatPageForCurrentBot'), js.indexOf('window.createChatPageForCurrentBot') + 1200);
  assert.match(create, /method: 'POST'/, 'creation is an explicit POST');
  assert.match(create, /\/api\/chat-page\//, 'creation targets the chat-page collection endpoint');
  assert.match(js, /showCreatePanel\(true\)/, '404 path reveals the create panel');
  assert.match(js, /showCreatePanel\(false\)/, 'existing page reveals the customizer');
});

test('opening a direct chat link without a page routes to the create flow, never to a guessed URL', () => {
  const open = js.slice(js.indexOf('window.openDirectChatPage'), js.indexOf('window.openDirectChatPage') + 900);
  assert.match(open, /window\.openChatPageModal\(targetBot\)/);
  assert.doesNotMatch(open, /chat\/\$\{targetBot\._id\}/, 'no fabricated /chat/<botId> fallback');
});

test('new i18n keys exist in BOTH language tables and match HTML fallbacks', () => {
  const keys = ['workspace_cross_tenant_badge', 'chat_page_missing', 'chat_page_create_btn', 'chat_page_create_failed'];
  for (const key of keys) {
    const occurrences = js.split(`${key}:`).length - 1;
    assert.ok(occurrences >= 2, `${key} must exist in en and ar tables (found ${occurrences})`);
  }
  assert.match(html, /data-i18n="chat_page_missing">No dedicated chat page exists for this agent yet/);
  assert.match(html, /data-i18n="chat_page_create_btn">Create chat page/);
});
