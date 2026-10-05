'use strict';

// D08 — subscription lists, submit guard, and review lock. Static contract
// assertions over the dashboard source (flows live inside the dashboard
// IIFE); approve/reject races + timeout browser cases go to A04. UI ONLY —
// no activation-atomicity assertions here.

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

// ---------- (a) lists with loading/error/empty ----------

test('own and admin lists render loading, error+retry, and empty distinctly', () => {
  for (const [name, start, end, emptyKey] of [
    ['loadMySubscriptionRequests', 'async function loadMySubscriptionRequests', "subscriptionRequestForm')?.addEventListener", 'subscription_my_requests_empty'],
    ['loadAdminSubs', 'async function loadAdminSubs', "adminSubsRefreshBtn')?.addEventListener", 'subscription_admin_empty'],
  ]) {
    const body = sliceBetween(start, end);
    assert.match(body, /dashboardRequest\(/, `${name} uses the request core`);
    assert.match(body, /admin_subs_loading/, `${name} shows a loading state`);
    assert.match(body, new RegExp(emptyKey), `${name} shows a genuine empty state`);
    assert.match(body, /subscription_list_error/, `${name} shows a failure state, never a silent catch`);
    assert.match(body, /feedback_retry/, `${name} offers a manual retry`);
    assert.doesNotMatch(body, /catch \(e\) \{\}/, `${name} has no silent catch`);
  }
});

// ---------- (b) submit guard ----------

test('submit sends a single POST and reconciles conflicts via GET', () => {
  const submit = sliceBetween("subscriptionRequestForm')?.addEventListener", 'async function loadAdminSubs');
  assert.match(submit, /runExclusive/, 'Enter+click share one in-flight POST');
  assert.match(submit, /subscription-request/, 'submit owns a stable lock key');
  assert.match(submit, /withPending/, 'submit control guards the flight');
  assert.match(submit, /dashboardRequest\('\/api\/subscriptions\/request'/, 'submit uses the request core');
  assert.match(submit, /\{ operation: 'mutation' \}/, 'submit is a mutation (no read timeout)');
  assert.equal(
    (submit.match(/dashboardRequest\('/g) || []).length, 1,
    'exactly one dispatch site — conflict/timeout paths GET-reconcile, never re-POST'
  );
  assert.match(submit, /loadMySubscriptionRequests\(\)/, 'reconciliation reads the list');
});

test('pending conflict and unknown outcomes keep the payment reference', () => {
  const submit = sliceBetween("subscriptionRequestForm')?.addEventListener", 'async function loadAdminSubs');
  assert.match(submit, /PENDING_REQUEST_EXISTS/, '409 conflict understood');
  assert.match(submit, /subscription_request_pending/, 'conflict shows pending state, no re-POST');
  assert.match(submit, /err\.kind === 'timeout' \|\| err\.kind === 'network'/, 'timeout/network treated as outcome-unknown');
  assert.match(submit, /subscription_request_unknown/, 'unknown outcome keeps the reference with guidance');
  const clears = [...submit.matchAll(/refEl\.value = ''/g)];
  assert.equal(clears.length, 1, 'reference clears in exactly one place');
  const successIdx = submit.indexOf('res && res.success');
  assert.ok(successIdx !== -1 && submit.indexOf("refEl.value = ''") > successIdx, 'reference clears only on confirmed success');
});

// ---------- (c) review lock ----------

test('approve and reject share one lock per request with control guards', () => {
  const review = sliceBetween('async function reviewSubscriptionRequest', "checkAuthAndLoad = async function");
  assert.match(review, /withEntityLock\(`subscription-request:\$\{id\}`/, 'one lock per request id');
  assert.match(review, /b\.disabled = true/, 'conflicting approve/reject disable during flight');
  assert.match(review, /finally/, 'controls restore after settle');
  assert.match(review, /dashboardRequest\('\/api\/subscriptions\/requests\/' \+ id/, 'review uses the request core');
  assert.equal(
    (review.match(/dashboardRequest\(/g) || []).length, 1,
    'ONE PUT per approve+reject race — no second attempt inside'
  );
});

test('409 conflicts reconcile via GET; 500 never auto-retries the review', () => {
  const review = sliceBetween('async function reviewSubscriptionRequest', "checkAuthAndLoad = async function");
  assert.match(review, /err\.status === 409/, 'already-reviewed conflict understood');
  assert.match(review, /subscription_review_conflict/, 'conflict reports + reconciles, never re-PUTs');
  assert.ok(
    review.indexOf('subscription_review_conflict') < review.indexOf('loadAdminSubs', review.indexOf('subscription_review_conflict')),
    'conflict reconciles via GET immediately after reporting'
  );
  const puts = [...review.matchAll(/method: 'PUT'/g)];
  assert.equal(puts.length, 1, 'a 500 path contains no second PUT — the review is never auto-retried');
});

// ---------- dictionaries + wiring ----------

test('D08 keys exist and the bundle version bumps', () => {
  for (const key of [
    'subscription_request_pending',
    'subscription_request_unknown',
    'subscription_review_conflict',
    'subscription_list_error',
  ]) {
    assert.match(script, new RegExp(`      ${key}: '[^']+'`), `missing dictionary key ${key}`);
  }
  assert.match(html, /dashboard_new\.js\?v=[^"]+/, 'bundle carries a cache-busting version (presence only — the exact value rotates with every JS turn per §3.5)');
});
