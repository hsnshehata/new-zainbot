'use strict';

// D09 — remaining dashboard workflows: training saves, agents/admin CRUD,
// channel QR lifecycle, council jobs/autosave ledger, catalog regression
// reference. Static contract assertions over dashboard_new.js and the
// extracted dashboard-idea-council.js; interactive browser cases go to A04.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
const script = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8')
  .replace(/\r\n/g, '\n');
const council = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard-idea-council.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing section ${startMarker}`);
  const end = source.indexOf(endMarker, start + 1);
  assert.notEqual(end, -1, `missing section end ${endMarker}`);
  return source.slice(start, end);
}

// ---------- (1) training/FAQ/instructions ----------

test('training saves are single-flight with retained drafts and failure alerts', () => {
  for (const [name, start, end, key, failKey] of [
    ['instruction submit', "instructionForm.addEventListener('submit'", 'window.editInstruction', 'instruction-save', 'instruction_save_failed'],
    ['faq submit', "faqForm.addEventListener('submit'", '// Guidelines form', 'faq-save', 'faq_save_failed'],
    ['guidelines submit', "promptTrainingForm.addEventListener('submit'", '// 4. CONNECTIONS LOADER', 'guidelines-save', 'training_guidelines_failed'],
  ]) {
    const body = sliceBetween(script, start, end);
    assert.match(body, /runExclusive/, `${name} cannot duplicate-saves on double submit`);
    assert.match(body, new RegExp(key), `${name} owns a stable lock key`);
    assert.match(body, /withPending/, `${name} guards its submit control`);
    assert.match(body, new RegExp(failKey), `${name} alerts failure with drafts retained`);
  }
  assert.doesNotMatch(
    sliceBetween(script, "instructionForm.addEventListener('submit'", 'window.editInstruction'),
    /\.value = ''/,
    'instruction inputs never cleared by the submit path'
  );
});

test('training deletes share a row lock; failed reads keep data with warning', () => {
  for (const [name, start, end] of [
    ['deleteInstruction', 'window.deleteInstruction = ', 'window.deleteFaq = '],
    ['deleteFaq', 'window.deleteFaq = ', 'window.revokeApiKey = '],
  ]) {
    const body = sliceBetween(script, start, end);
    assert.match(body, /withEntityLock\(`training-rule:\$\{id\}`/, `${name} is single-flight per rule`);
  }
  const loader = sliceBetween(script, 'async function loadTrainingData', 'function renderFaqs');
  assert.match(loader, /dashboardRequest\(/, 'training reads use the request core');
  const caught = loader.slice(loader.indexOf('} catch (e) {'));
  assert.match(caught, /training_load_failed/, 'read failure announces instead of wiping lists');
});

// ---------- (2) agents/admin CRUD ----------

test('agent save is single-flight with the dialog kept on failure', () => {
  const submit = sliceBetween(script, "agentForm')?.addEventListener('submit'", '// Wire AI Sales Automation Center');
  assert.match(submit, /agent-save/, 'agent save owns a lock key');
  assert.match(submit, /runExclusive/, 'double submit attaches instead of duplicating agents');
  assert.match(submit, /withPending/, 'submit control guards the flight');
  assert.match(submit, /agent_save_failed/, 'failure alerts with the draft kept open');
  // Transport-shape pinned by E03's dialog test (payload + PUT/POST routes
  // unchanged); D09 adds only the single-flight guard around it.
  assert.match(submit, /apiFetch\(id \? `\/api\/bots\/\$\{id\}` : '\/api\/bots', \{ method: id \? 'PUT' : 'POST'/, 'edit stays PUT, create stays POST');
});

test('admin status/archive share one lock per account; reads keep data', () => {
  for (const [name, start, end] of [
    ['updateAdminUserStatus', 'async function updateAdminUserStatus', 'async function archiveAdminUser'],
    ['archiveAdminUser', 'async function archiveAdminUser', 'Remote agent (bot) administration'],
  ]) {
    const body = sliceBetween(script, start, end);
    assert.match(body, /withEntityLock\(`admin-user:\$\{userId\}`/, `${name} is single-flight per account`);
    assert.match(body, /dashboardRequest\(/, `${name} uses the request core`);
  }
  const loader = sliceBetween(script, 'async function loadAdminUsers(page', 'function renderAdminUsers');
  assert.match(loader, /dashboardRequest\(/, 'admin list uses the request core');
  assert.match(loader, /admin_load_failed/, 'admin read failure alerts with the old list kept');
});

// ---------- (3) channel QR lifecycle ----------

test('QR failures announce via live roles and polling stops on close/bot-switch', () => {
  assert.match(script, /id="waQrContainer" role="status"/, 'QR container is a live region (E06)');
  const qr = sliceBetween(script, "if (type === 'whatsapp')", "else if (type === 'facebook')");
  assert.match(qr, /qrBotId/, 'QR poll pins the bot id at open');
  assert.ok(
    (qr.match(/String\(currentBot\?._id\) !== qrBotId/g) || []).length >= 2,
    'bot switch breaks the loop before fetch and drops late responses before paint'
  );
  assert.match(qr, /encodeURIComponent\(qrBotId\)/, 'poll queries the pinned bot, not the live selection');
  assert.match(qr, /modal\.classList\.contains\('active'\)/, 'modal close breaks the poll loop');
  assert.match(qr, /chan_wa_session_failed/, 'session failure writes announced text');
  assert.match(qr, /chan_wa_qr_failed/, 'QR failure writes announced text');
  assert.match(qr, /waDisconnectBtn/, 'disconnect path intact');
});

// ---------- (4) council jobs/autosave ----------

test('council stops stale polling on every view switch', () => {
  assert.match(council, /function stopIdeaPolling\(\)/, 'stop helper exists');
  const view = sliceBetween(council, 'function showIdeaView(viewName)', 'function populateStructuredCardForm');
  assert.match(view, /stopIdeaPolling\(\)/, 'every navigation stops poll + pending-open timers');
});

test('council list failure renders an error with retry, never an empty list', () => {
  assert.match(council, /renderIdeaListError/, 'error renderer exists');
  assert.match(council, /if \(!\(res && res\.success\)\) throw/, 'unsuccessful list is a failure, not an empty paint');
  const loader = sliceBetween(council, 'async function loadIdeaCouncilList', 'function paintIdeaList');
  assert.match(loader, /renderIdeaListError\(\)/, 'catch renders the error state');
  assert.match(council, /onRetry: \(\) => loadIdeaCouncilList\(ideaCurrentFilter\)/, 'retry reruns the read only');
  assert.match(council, /idea_list_error/, 'error copy key referenced');
});

test('council saves share one flight; save/run/poll errors stay distinct', () => {
  assert.match(council, /ideaSaveFlight/, 'concurrent saves share one request (F3/F4)');
  assert.match(council, /saveIdeaDraftOnce/, 'single-flight wrapper preserves the body');
  assert.match(council, /idea_msg_saving/, 'save pending state kept');
  assert.match(council, /idea_structure_error/, 'run errors stay distinct from save states');
  assert.match(council, /Idea polling error/, 'poll errors stay distinct (read-only, no restart)');
  assert.doesNotMatch(
    sliceBetween(council, 'async function poll()', 'ideaPollTimer = setInterval'),
    /method: 'POST'|method: 'PUT'/,
    'poll never mutates — no job restart on read-retry'
  );
});

// ---------- (5) catalog regression reference ----------

test('catalog client is untouched (regression reference, no rewrite)', () => {
  assert.match(script, /async function catalogRequestJson/, 'catalog client entry intact');
  assert.match(script, /catalogRequestJson\(catalogEndpoint\(botId, provider\), \{ method: 'PUT', body: payload \}\)/, 'catalog save call intact');
  const catalog = sliceBetween(script, 'function catalogEndpoint', '// 5. ORDERS');
  assert.doesNotMatch(catalog, /runExclusive|withEntityLock/, 'no lock helpers introduced into the catalog flow');
});

// ---------- dictionaries + wiring ----------

test('D09 keys exist and the bundle version bumps', () => {
  for (const key of [
    'faq_save_failed',
    'instruction_save_failed',
    'training_guidelines_failed',
    'training_load_failed',
    'idea_list_error',
  ]) {
    assert.match(script, new RegExp(`      ${key}: '[^']+'`), `missing dictionary key ${key}`);
  }
  assert.match(html, /dashboard_new\.js\?v=\d{8}-[a-z0-9]+/, 'dashboard bundle carries a dated version pin');
});
