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

test('real app upload boundary: owner bearer accepted, anonymous rejected, no image means no provider call', async () => {
  process.env.NODE_ENV='test';process.env.JWT_SECRET='test-only-secret-that-is-at-least-32-bytes-long';
  const User=require('../server/models/User');
  const original=User.findById;
  const id='507f191e810c19729de86001';
  User.findById=()=>({select(){return this;},lean:async()=>({_id:id,username:'synthetic',role:'user',status:'active',sessionVersion:0})});
  const axios=require('axios');const originalPost=axios.post;let sends=0;
  axios.post=async()=>{sends++;throw Error('Provider calls forbidden in fixture');};
  try {
    const app=require('../server/server');const request=require('supertest');
    const {signAccessToken}=require('../server/utils/authTokens');
    const token=signAccessToken({_id:id,role:'user',username:'synthetic',sessionVersion:0});
    const anon=await request(app).post('/api/upload');assert.equal(anon.status,401);
    const owner=await request(app).post('/api/upload').set('Authorization',`Bearer ${token}`);
    assert.equal(owner.status,400);assert.equal(sends,0);
    assert.match(source,/function getToken\(\)\s*\{\s*return localStorage.getItem\('token'\);/);
  } finally {User.findById=original;axios.post=originalPost;}
});
