const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../public/js/dashboard_new.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../public/dashboard.html'), 'utf8');
const source = script.slice(script.indexOf('  function deriveChannelStates('), script.indexOf('  function renderChannelStatuses('));
assert.ok(source.includes('function deriveChannelStates'));
const derive = vm.runInNewContext(`${source}\nderiveChannelStates`);

test('stored Meta configuration is not shown as a verified connection', () => {
  const states = derive({ connections: { facebook: true, instagram: true } }, null, null);
  assert.equal(states.facebook, 'unverified');
  assert.equal(states.instagram, 'unverified');
  assert.equal(states.whatsapp, 'unavailable');
  assert.equal(states.telegram, 'unavailable');
});

test('only status endpoint evidence gives a linked label; disabled and paused agents are explicit', () => {
  const bot = { connections: { whatsapp: true, facebook: true } };
  const states = derive(bot, { status: 'connected' }, { linked: true });
  assert.equal(states.whatsapp, 'wa_connected');
  assert.equal(states.telegram, 'tg_linked');
  assert.equal(derive(bot, { status: 'relink_required' }, { linked: false }).whatsapp, 'wa_attention');
  assert.equal(derive({ ...bot, autoReplyEnabled: false }, { status: 'connected' }, { linked: true }).whatsapp, 'paused');
  assert.equal(derive({ ...bot, isActive: false }, { status: 'connected' }, { linked: true }).telegram, 'inactive');
});

test('catalog success is shown only after the real sync API responds', () => {
  assert.match(html, /id="storeConnectorForm"/);
  assert.match(script, /catalogRequestJson\(`\$\{catalogEndpoint\(botId, provider\)\}\/sync`, \{ method: 'POST' \}\)/);
  assert.match(script, /catalogFeedback\('store_synced', \{ count: result.importedCount \}\)/);
  assert.doesNotMatch(script, /store_sync_feedback/);
  assert.match(html, /id="openCatalogTrainingBtn"[^>]*data-i18n="store_open_training"/);
});
