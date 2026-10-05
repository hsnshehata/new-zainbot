'use strict';

// D07 — settings/recipients/webhook flows: independent settings reads,
// recipient states + entity locks + D06 outcomes, guarded redelivery.
// Static contract assertions over the dashboard source (flows live inside
// the dashboard IIFE); double-send browser cases go to A04.

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

// ---------- (a) independent settings reads ----------

test('settings resources load independently with per-section failure scope', () => {
  for (const [name, start, end] of [
    ['loadSettingsApiKeys', 'async function loadSettingsApiKeys', 'async function loadSettingsWebhookConfig'],
    ['loadSettingsWebhookConfig', 'async function loadSettingsWebhookConfig', 'async function loadSettingsWebhookLogs'],
    ['loadSettingsWebhookLogs', 'async function loadSettingsWebhookLogs', 'async function loadSettingsData'],
  ]) {
    const body = sliceBetween(start, end);
    assert.match(body, /try \{/, `${name} guards its own failures`);
    assert.match(body, /\} catch/, `${name} never propagates to siblings`);
    assert.match(body, /dashboardRequest\(/, `${name} uses the request core`);
  }
  const wrapper = sliceBetween('async function loadSettingsData', 'function modelOptionValue');
  for (const dep of ['loadSettingsApiKeys', 'loadSettingsWebhookConfig', 'loadSettingsWebhookLogs', 'loadPrimaryModelSelect', 'loadNotificationRecipients']) {
    assert.match(wrapper, new RegExp(dep), `wrapper still drives ${dep}`);
  }
  assert.match(wrapper, /settingsRun/, 'superseded settings runs stop before painting');
});

// ---------- (b) recipients states + create guard ----------

test('recipients loading/error/empty states with a read-only retry', () => {
  const loader = sliceBetween('async function loadNotificationRecipients', 'window.openRecipientModal');
  assert.match(loader, /dashboardRequest\(`\/api\/notifications\/recipients/, 'recipients read uses the request core');
  assert.match(loader, /recipients_load_error/, 'failure renders an error state');
  assert.match(loader, /retryRecipientsList/, 'error state retries only the failed read');
  assert.match(loader, /renderNotificationRecipients\(\)/, 'success renders the list');
  assert.match(script, /window\.retryRecipientsList = function/, 'retry exposed');
  const render = sliceBetween('function renderNotificationRecipients', 'window.openRecipientModal');
  assert.match(render, /recipients_empty/, 'genuinely empty renders the empty state');
});

test('recipient create is single-flight with control guard and no 403 logout', () => {
  const submit = sliceBetween("recipientForm.addEventListener('submit'", '// 5.5 DEDICATED WEB CHAT');
  assert.match(submit, /runExclusive/, 'double submit attaches instead of duplicating');
  assert.match(submit, /recipient-create/, 'create owns a stable lock key');
  assert.match(submit, /withPending/, 'submit control disables during flight');
  assert.match(submit, /dashboardRequest\('\/api\/notifications\/recipients'/, 'create uses the request core');
  assert.doesNotMatch(submit, /location/, 'free-plan 403 surfaces its message, never logs out');
  assert.doesNotMatch(submit, /\.value = ''/, 'inputs retained on failure paths');
});

// ---------- (c) test/delete lock + D06 outcomes ----------

test('test and delete share one lock per recipient row', () => {
  for (const [name, start, end] of [
    ['testNotificationRecipient', 'window.testNotificationRecipient = ', 'window.deleteNotificationRecipient = '],
    ['deleteNotificationRecipient', 'window.deleteNotificationRecipient = ', "addRecipientBtn"],
  ]) {
    const body = sliceBetween(start, end);
    assert.match(body, /withEntityLock\(`recipient:\$\{id\}`/, `${name} shares the row lock`);
  }
});

test('configured outcome renders as configured-not-sent, never as sent', () => {
  const tester = sliceBetween('window.testNotificationRecipient = ', 'window.deleteNotificationRecipient = ');
  assert.match(tester, /res\.outcome === 'delivered'/, 'delivered gates the sent message');
  assert.match(tester, /res\.outcome === 'configured'/, 'configured branches distinctly');
  const configuredBranch = tester.slice(tester.indexOf("res.outcome === 'configured'"));
  assert.match(configuredBranch, /recipient_test_configured/, 'configured alerts configured copy');
  assert.doesNotMatch(configuredBranch, /recipient_test_sent/, 'configured never reports sent');
  assert.match(tester, /\{ operation: 'mutation' \}/, 'test send is a mutation (no read timeout)');
});

// ---------- (d) webhook redelivery ----------

test('redelivery confirms first, locks per log, and never resends on timeout', () => {
  const retry = sliceBetween('window.retryWebhook = ', 'window.toggleAdminKeyActive = ');
  assert.ok(
    retry.indexOf('webhook_retry_confirm') < retry.indexOf('/retry'),
    'translated confirmation precedes any request'
  );
  assert.match(retry, /withEntityLock\(`webhook-log:\$\{id\}`/, 'one in-flight redelivery per log id');
  assert.match(retry, /\{ operation: 'mutation' \}/, 'redelivery is a mutation');
  assert.doesNotMatch(retry, /timeoutMs/, 'no timeout to misread — a timeout never resends');
  assert.equal(
    (retry.match(/dashboardRequest\(`/g) || []).length, 1,
    'exactly one dispatch per confirmation — double-click attaches'
  );
});

test('HTTP-200 success:false fails visibly; refresh failure never rewrites a confirmed send', () => {
  const retry = sliceBetween('window.retryWebhook = ', 'window.toggleAdminKeyActive = ');
  assert.match(retry, /webhook_retry_failed/, 'delivery failure (incl. 200 success:false) alerts failure');
  assert.match(retry, /webhook_retry_ok/, 'confirmed send alerts success first');
  assert.ok(
    retry.indexOf('webhook_retry_ok') < retry.indexOf('loadSettingsWebhookLogs'),
    'refresh runs only after the confirmed outcome is reported'
  );
  assert.doesNotMatch(retry, /loadSettingsData\(\)/, 'refresh is logs-scoped, not a full settings reload');
  assert.match(retry, /webhook_logs_refresh_failed/, 'refresh failure reports distinctly without touching the confirmation');
});

// ---------- dictionaries + wiring ----------

test('D07 keys exist and the bundle version bumps', () => {
  for (const key of [
    'recipients_loading',
    'recipients_load_error',
    'recipient_test_configured',
    'recipient_delete_failed',
    'webhook_retry_confirm',
    'webhook_logs_refresh_failed',
  ]) {
    assert.match(script, new RegExp(`      ${key}: '[^']+'`), `missing dictionary key ${key}`);
  }
  assert.match(html, /dashboard_new\.js\?v=[^"]+/, 'bundle carries a cache-busting version (exact value pinned by the latest task test)');
});
