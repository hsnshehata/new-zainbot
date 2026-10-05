'use strict';

// D04 — bootstrap/overview/inbox/send contracts: recoverable bootstrap,
// generation-guarded reads, single-flight manual reply with snapshots.
// Static contract assertions over the dashboard source (the flows live inside
// the dashboard IIFE); behavioral browser double-submit/slow-A-fast-B waits
// for the A04 harness.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
const script = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function sliceBetween(startMarker, endMarker) {
  const start = script.indexOf(startMarker);
  assert.notEqual(start, -1, `missing section ${startMarker}`);
  const end = script.indexOf(endMarker, start + 1);
  assert.notEqual(end, -1, `missing section end ${endMarker}`);
  return script.slice(start, end);
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// ---------- (a) bootstrap ----------

test('bootstrap redirects only on absent token or 401, else recovers with retry', () => {
  const boot = sliceBetween('async function checkAuthAndLoad', 'async function loadBots');
  assert.match(boot, /dashboardRequest\('\/api\/users\/profile'\)/, 'profile uses the request core');
  assert.doesNotMatch(boot, /apiFetch\('\/api\/users\/profile'\)/);
  assert.match(script, /onUnauthorized: \(\) => \{ window\.location\.href = '\/login'; \}/, '401-only session callback lives in the request helper');
  assert.equal(
    count(boot, "window.location.href = '/login'"),
    1,
    'bootstrap itself redirects only for an absent token (401 goes through the helper callback)'
  );
  assert.match(boot, /showBootstrapError\(\)/, 'failures surface a recoverable error');
  assert.match(boot, /e\.status !== 401/, '401 skips the error UI (redirect already in flight)');
  assert.match(boot, /bootstrapBusy/, 'concurrent bootstrap guarded');
  assert.match(script, /bootstrapRetryBtn.+checkAuthAndLoad/s, 'manual retry wired');
});

test('bootstrap error region is bilingual, assertive, and hidden by default', () => {
  assert.match(html, /id="bootstrapError"[^>]*hidden[^>]*role="alert"/);
  assert.match(html, /data-i18n="bootstrap_load_failed"/);
  assert.match(html, /id="bootstrapRetryBtn"/);
});

// ---------- (b) overview ----------

test('overview drops stale replies and never paints failed stats', () => {
  const overview = sliceBetween('async function loadOverviewData', '// 2. OMNICHANNEL INBOX LOADER');
  assert.match(overview, /overviewRun/, 'per-call generation counter');
  assert.ok(
    count(overview, 'String(currentBot?._id) !== botId') >= 2,
    'bot-id guard after fetch and after channel refresh'
  );
  assert.match(overview, /dashboardRequest\(`\/api\/analytics\/summary/, 'stats use the request core');
  assert.match(overview, /throw new Error\('Overview stats unavailable'\)/, 'unsuccessful shape is a failure, not zeros');
  const caught = overview.slice(overview.indexOf('} catch (e) {'));
  assert.doesNotMatch(caught, /statConversations|statMessages|statTrainingRules|overviewOrders/, 'catch writes no stats');
  assert.match(caught, /overview_stats_failed/, 'failure announces instead of faking zeros');
});

// ---------- (c) inbox ----------

test('inbox reads are generation-guarded and failures never render as empty', () => {
  const inbox = sliceBetween('async function loadInboxData', 'function renderChatList');
  assert.match(inbox, /inboxRun/, 'per-call generation counter');
  assert.match(inbox, /String\(currentBot\?._id\) !== botId/, 'bot-id guard drops stale replies');
  assert.match(inbox, /dashboardRequest\(`\/api\/messages\/conversations/, 'reads use the request core');
  assert.match(inbox, /else if \(res && res\.success\)/, 'empty renders only on a successful empty response');
  assert.match(inbox, /phase: 'error', key: 'inbox_load_error'/, 'failure renders a persistent error');
  assert.match(inbox, /onRetry: \(\) => loadInboxData\(\)/, 'manual retry reruns the READ only');
  const emptyBranch = inbox.slice(inbox.indexOf('} else if (res && res.success) {'), inbox.indexOf('} catch (e) {'));
  assert.doesNotMatch(emptyBranch, /inbox_load_error/, 'empty branch carries no error copy');
  const caught = inbox.slice(inbox.indexOf('} catch (e) {'));
  assert.doesNotMatch(caught, /inbox_empty/, 'error branch never renders the empty state');
});

test('no-bot resets selection and disables the composer', () => {
  const inbox = sliceBetween('function resetInboxForNoBot', 'async function loadInboxData');
  assert.match(inbox, /selectedConversationId = null/, 'selection cleared');
  assert.match(inbox, /phase: 'no-bot', key: 'inbox_no_bot'/, 'no-bot state rendered');
  assert.match(inbox, /setComposerEnabled\(false\)/, 'composer disabled');
  const loader = sliceBetween('async function loadInboxData', 'function renderChatList');
  assert.match(loader, /resetInboxForNoBot\(\)/, 'loader delegates when there is no bot');
});

// ---------- (d) manual reply ----------

test('manual reply is single-flight with a bot/chat/text snapshot', () => {
  const reply = sliceBetween('async function sendManualReply', 'autoReplyToggleEl');
  assert.match(reply, /const snapshot = \{ botId, chatId, text \}/, 'snapshot taken at send time');
  assert.match(reply, /runExclusive/, 'Enter+click share one in-flight POST');
  assert.match(reply, /manual-reply:\$\{botId\}:\$\{chatId\}/, 'lock key pins bot+chat');
  assert.match(reply, /postManualReply\(snapshot\)/, 'the snapshot (not live state) is sent');
  assert.match(reply, /withPending/, 'send button guarded during flight');
});

test('delayed reply never clears a new draft nor leaks into another chat', () => {
  const reply = sliceBetween('async function postManualReply', 'async function sendManualReply');
  assert.match(
    reply,
    /chatReplyInput\.value\.trim\(\) === snapshot\.text/,
    'input cleared only when it still holds the sent text'
  );
  assert.match(
    reply,
    /String\(selectedConversationId\) === snapshot\.chatId/,
    'bubbles append only to the still-selected snapshot chat'
  );
  assert.match(reply, /conversations\.find\(c => String\(c\._id\) === snapshot\.chatId\)/, 'memory updates target the snapshot chat');
  assert.match(reply, /res\.delivered === false/, 'delivered:false distinguished from channel success');
  assert.match(reply, /inbox_reply_failed/, 'failure notifies with outcome-unknown-safe copy');
  assert.match(reply, /conversationId: snapshot\.chatId/, 'request carries the snapshot chat');
  assert.equal(count(reply, "dashboardRequest('/api/messages/reply'"), 1, 'exactly one send attempt — no auto-resend');
});

// ---------- dictionaries + wiring ----------

test('D04 keys exist for both languages', () => {
  for (const key of ['bootstrap_load_failed', 'inbox_no_bot', 'inbox_reply_failed', 'overview_stats_failed']) {
    assert.match(script, new RegExp(`      ${key}: '[^']+'`), `missing dictionary key ${key}`);
  }
  assert.match(html, /dashboard_new\.js\?v=[^"]+/, 'bundle carries a cache-busting version (exact value pinned by the latest task test)');
});
