const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../public/dashboard.html'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '../public/js/dashboard_new.js'), 'utf8');

test('connector form distinguishes providers, protects credentials and retains manual training', () => {
  for (const id of ['storeProvider', 'storeUrl', 'storeCurrency', 'storeToken', 'storeConsumerKey', 'storeConsumerSecret']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const id of ['storeToken', 'storeConsumerKey', 'storeConsumerSecret']) {
    assert.match(html, new RegExp(`<input id="${id}" class="form-control" type="password" autocomplete="off"`));
  }
  assert.match(html, /id="syncStoreCatalog"[^>]*disabled/);
  assert.match(html, /id="storeConnectorStatus"[^>]*role="status" aria-live="polite"/);
  assert.match(html, /id="openCatalogTrainingBtn"[^>]*data-i18n="store_open_training"/);
  assert.match(script, /catalogToken\.value = catalogKey\.value = catalogSecret\.value = ''/);
  assert.doesNotMatch(script.slice(script.indexOf('  const catalogForm ='), script.indexOf('  \/\/ 5. ORDERS')), /localStorage\.setItem/);
});

test('requests target the selected bot and provider, and reject unknown errors without exposing them', () => {
  const source = script.slice(script.indexOf('  function catalogText('), script.indexOf('  function catalogFeedback('));
  const endpoint = script.slice(script.indexOf('  function catalogEndpoint('), script.indexOf('  async function loadCatalogStatus()'));
  const context = { translations: { en: { store_error_generic: 'Retry' } }, currentLanguage: 'en', encodeURIComponent };
  vm.createContext(context);
  vm.runInContext(`${source}\n${endpoint}`, context);
  assert.equal(context.catalogEndpoint('bot/id', 'woocommerce'), '/api/catalog-connectors/bots/bot%2Fid/woocommerce');
  assert.equal(context.catalogErrorKey('REMOTE_AUTH_FAILED'), 'store_error_auth');
  assert.equal(context.catalogErrorKey('CATALOG_LIMIT_EXCEEDED'), 'store_error_limit');
  assert.equal(context.catalogErrorKey('unexpected secret'), 'store_error_generic');
  assert.equal(context.catalogText('unexpected secret'), 'Retry');
  assert.match(script, /catalogRequestJson\(`\$\{catalogEndpoint\(botId, provider\)\}\/sync`, \{ method: 'POST' \}\)/);
  assert.match(script, /catalogRequestJson\(catalogEndpoint\(botId, provider\), \{ method: 'PUT', body: payload \}\)/);
  assert.match(script, /catalogSyncButton\.disabled = catalogBusy \|\| !canManageCatalog\(\) \|\| !catalogStatus\?\.configured/);
  assert.doesNotMatch(script.slice(script.indexOf('  const catalogForm ='), script.indexOf('  \/\/ 5. ORDERS')), /!currentBot\?\.storeId/);
});

test('catalog form is available to bot owner, including a newly created bot without a store', () => {
  const source = script.slice(script.indexOf('  function canManageCatalog()'), script.indexOf('  function catalogText('));
  const context = { currentBot: { _id: 'bot-1', userId: 'owner-1' }, currentUser: { _id: 'owner-1' } };
  vm.createContext(context);
  vm.runInContext(`${source}\ncanManageCatalog`, context);
  assert.equal(context.canManageCatalog(), true);
  context.currentBot.userId = 'another-owner';
  assert.equal(context.canManageCatalog(), false);
});
