'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/dashboard_new.js'), 'utf8');
const block = source.slice(source.indexOf("  const chatPageForm = document.getElementById('chatPageForm');"), source.indexOf('  // 6. DEVELOPER SETTINGS & WEBHOOKS'));

async function run({ token = 'synthetic-token', response = { ok: true, json: async () => ({ imageUrl: 'https://example.invalid/new-logo.png' }) }, file = true, fetchError } = {}) {
  let handler; const requests = []; const saves = []; const alerts = [];
  const context = {
    document: { getElementById: id => id === 'chatPageForm' ? { addEventListener: (_, cb) => { handler = cb; } } : { value: id === 'chatPageId' ? 'synthetic-page' : 'fixture', checked: false } },
    translations: { en: { chat_logo_upload_failed: 'UPLOAD_FAILED', chat_page_saved_ok: 'SAVED' } }, currentLanguage: 'en',
    currentChatLogoUrl: 'https://example.invalid/old-logo.png',
    chatLogoFileToUpload: file ? new Blob(['synthetic image'], { type: 'image/png' }) : null,
    FormData, getToken: () => token,
    fetch: async (url, options) => { requests.push({ url, options }); if (fetchError) throw new Error('network'); return response; },
    apiFetch: async (url, options) => { saves.push({ url, payload: JSON.parse(options.body) }); return { success: true }; },
    alert: x => alerts.push(x), console: { warn() {}, error() {} }, window: {}, localStorage: { removeItem() {} }, closeChatPageDialog() {},
  };
  vm.runInNewContext(block, context);
  await handler({ preventDefault() {} });
  return { requests, saves, alerts };
}

test('logo upload carries bearer auth and leaves multipart boundary to the browser', async () => {
  const r = await run();
  assert.equal(r.requests[0].options.headers.Authorization, 'Bearer synthetic-token');
  assert.equal(r.requests[0].options.headers['Content-Type'], undefined);
  assert.equal(r.saves.length, 1);
  assert.equal(r.saves[0].payload.logoUrl, 'https://example.invalid/new-logo.png');
  assert.deepEqual(r.alerts, ['SAVED']);
});

test('upload HTTP errors, missing URL, bad JSON, network error and missing token never save or claim success', async () => {
  for (const config of [
    { response: { ok: false } },
    { response: { ok: true, json: async () => ({}) } },
    { response: { ok: true, json: async () => ({ imageUrl: ' ' }) } },
    { response: { ok: true, json: async () => { throw Error('bad JSON'); } } },
    { fetchError: true }, { token: null },
  ]) {
    const r = await run(config);
    assert.equal(r.saves.length, 0);
    assert.deepEqual(r.alerts, ['UPLOAD_FAILED']);
  }
});

test('saving without a new logo does not upload and preserves existing logo', async () => {
  const r = await run({ file: false });
  assert.equal(r.requests.length, 0);
  assert.equal(r.saves[0].payload.logoUrl, 'https://example.invalid/old-logo.png');
});
