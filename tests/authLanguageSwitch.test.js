const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workspace = path.resolve(__dirname, '..');
const authScript = fs.readFileSync(path.join(workspace, 'public', 'js', 'auth.js'), 'utf8');
const loginHtml = fs.readFileSync(path.join(workspace, 'public', 'login.html'), 'utf8');
const registerHtml = fs.readFileSync(path.join(workspace, 'public', 'register.html'), 'utf8');

const AR_REQUIRED = 'أدخل اسم المستخدم وكلمة المرور.';
const EN_REQUIRED = 'Enter your username and password.';
const AR_LOGIN_FAILED = 'فشل تسجيل الدخول. تأكد من اسم المستخدم وكلمة المرور.';
const EN_LOGIN_FAILED = 'Sign-in failed. Check your username and password.';

function makeStorage(initial) {
  const store = { ...(initial || {}) };
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

function makeElement(overrides) {
  return {
    textContent: '',
    value: '',
    hidden: false,
    isConnected: true,
    style: { display: '' },
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeAttribute() {},
    setAttribute() {},
    checkValidity: () => true,
    reset() { this.resetCalls = (this.resetCalls || 0) + 1; },
    ...(overrides || {}),
  };
}

// ---------- Harness A: full auth.js with a fake DOM ----------

function runAuth({ storageValue, handleApiRequest } = {}) {
  const storage = makeStorage(storageValue ? { zainbot_lang: storageValue } : {});
  const calls = { fetch: 0, api: 0, apiFallbacks: [] };
  const errorDiv = makeElement();
  const successDiv = makeElement();
  const usernameInput = makeElement();
  const passwordInput = makeElement();
  const loginForm = makeElement();
  const listeners = {};
  const documentStub = {
    listeners,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    dispatchEvent(event) { (listeners[event.type] || []).forEach((fn) => fn(event)); return true; },
    querySelector(sel) {
      if (sel === '#loginForm') return loginForm;
      if (sel === '#error') return errorDiv;
      if (sel === '#success') return successDiv;
      if (sel === '#username') return usernameInput;
      if (sel === '#password') return passwordInput;
      return null;
    },
    querySelectorAll() { return []; },
  };
  const windowStub = {
    location: { pathname: '/login', search: '', hash: '' },
    history: { replaceState() {} },
    localStorage: storage,
  };
  const sandbox = {
    document: documentStub,
    window: windowStub,
    localStorage: storage,
    fetch: (...args) => { calls.fetch += 1; return Promise.resolve({ ok: true, json: async () => ({}) }); },
    handleApiRequest: handleApiRequest || (async () => {
      calls.api += 1;
      throw new Error('no stubbed request expected');
    }),
    URLSearchParams,
  };
  if (handleApiRequest) {
    const inner = handleApiRequest;
    sandbox.handleApiRequest = async (...args) => {
      calls.api += 1;
      calls.apiFallbacks.push(args[3]);
      return inner(...args);
    };
  }
  vm.createContext(sandbox);
  vm.runInContext(authScript, sandbox, { filename: 'auth.js' });
  (listeners.DOMContentLoaded || []).forEach((fn) => fn());
  return {
    calls, errorDiv, successDiv, usernameInput, passwordInput, loginForm, storage,
    submitLogin: () => {
      const handlers = loginForm.listeners.submit || [];
      assert.ok(handlers.length > 0, 'login submit handler registered');
      return handlers[0]({ preventDefault() {} });
    },
    switchLanguage: (lang) => {
      storage.setItem('zainbot_lang', lang);
      documentStub.dispatchEvent({ type: 'zainbot:languagechange', detail: { language: lang } });
    },
  };
}

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
}

test('visible local error re-renders on language switch without reset or request', async () => {
  const ctx = runAuth({ storageValue: 'ar' });
  await ctx.submitLogin();
  assert.equal(ctx.errorDiv.textContent, AR_REQUIRED);
  assert.equal(ctx.errorDiv.style.display, 'block');
  ctx.switchLanguage('en');
  assert.equal(ctx.errorDiv.textContent, EN_REQUIRED, 'same visible message in the new language');
  ctx.switchLanguage('ar');
  assert.equal(ctx.errorDiv.textContent, AR_REQUIRED, 'switches back without a request');
  assert.equal(ctx.usernameInput.value, '', 'form inputs untouched');
  assert.equal(ctx.passwordInput.value, '', 'form inputs untouched');
  assert.equal(ctx.loginForm.resetCalls || 0, 0, 'no form reset');
  assert.equal(ctx.calls.api, 0, 'no request on validation error or switch');
  assert.equal(ctx.calls.fetch, 0, 'no fetch on switch');
});

test('constructed fallback errors resolve to the key and stay switchable', async () => {
  const ctx = runAuth({
    storageValue: 'ar',
    handleApiRequest: async (url, options, element, fallback) => {
      assert.equal(element, null, 'utils never displays directly');
      throw new Error(fallback + ': Bad Gateway');
    },
  });
  ctx.usernameInput.value = 'someone';
  ctx.passwordInput.value = 'Something1!';
  await ctx.submitLogin();
  await flush();
  assert.equal(ctx.errorDiv.textContent, AR_LOGIN_FAILED, 'constructed message collapses to the key');
  ctx.switchLanguage('en');
  assert.equal(ctx.errorDiv.textContent, EN_LOGIN_FAILED, 'keyed failure re-renders in the new language');
  assert.equal(ctx.calls.api, 1, 'exactly one request total');
});

test('server free-text stays raw and is never re-rendered', async () => {
  const ctx = runAuth({
    storageValue: 'en',
    handleApiRequest: async () => { throw new Error('Server says no (custom backend text)'); },
  });
  ctx.usernameInput.value = 'someone';
  ctx.passwordInput.value = 'Something1!';
  await ctx.submitLogin();
  await flush();
  assert.equal(ctx.errorDiv.textContent, 'Server says no (custom backend text)');
  ctx.switchLanguage('ar');
  assert.equal(ctx.errorDiv.textContent, 'Server says no (custom backend text)', 'server text untouched by the switch');
});

test('auth maps known codes only — never guesses from server text', () => {
  const codeBased = [...authScript.matchAll(/err\.status === (\d+)/g)].map((m) => m[1]);
  assert.ok(codeBased.includes('503'), 'known 503 delivery mapping present');
  for (const pattern of [/data\.message\.(includes|indexOf|match|startsWith)\(/, /err\.message\.(includes|indexOf|match)\(/, /\/[^/\n]+\/\.test\((data\.message|err\.message|response)/]) {
    assert.doesNotMatch(authScript, pattern, `no free-text guessing via ${pattern}`);
  }
  assert.doesNotMatch(authScript, /handleApiRequest\([^)]*errorDiv/, 'utils never displays into auth containers directly');
});

// ---------- Harness B: page inline scripts (Google button locale, no double-init) ----------

function extractInlineScript(html, name) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length > 0, `${name}: inline script present`);
  return scripts[0];
}

function persistenceStub(storage) {
  return {
    readStoredLanguage: (def) => {
      const v = storage.getItem('zainbot_lang');
      return v === 'ar' || v === 'en' ? v : def;
    },
    writeStoredLanguage: (lang, def) => {
      const next = lang === 'ar' || lang === 'en' ? lang : def;
      try { storage.setItem('zainbot_lang', next); } catch (err) { /* ignore */ }
      return next;
    },
    resolveExternalLanguage: (event, current, def) => {
      if (!event || (event.key !== null && event.key !== undefined && event.key !== 'zainbot_lang')) return null;
      const next = event.newValue === 'ar' || event.newValue === 'en' ? event.newValue : def;
      return next === current ? null : next;
    },
  };
}

function runPageScript(html, name, expectedText) {
  const storage = makeStorage({});
  const google = { initializeCalls: [], renderCalls: [] };
  const toggle = makeElement();
  const googleSlot = makeElement();
  const docElement = { lang: '', dir: '' };
  const listeners = {};
  const titleHolder = { title: '' };
  const documentStub = {
    listeners,
    documentElement: docElement,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    dispatchEvent(event) { (listeners[event.type] || []).forEach((fn) => fn(event)); return true; },
    getElementById(id) {
      if (id === 'loginLanguageToggle' || id === 'registerLanguageToggle') return toggle;
      if (id === 'googleSignInButton') return googleSlot;
      return null;
    },
    querySelectorAll() { return []; },
  };
  Object.defineProperty(documentStub, 'title', { get: () => titleHolder.title, set: (v) => { titleHolder.title = v; } });
  const sandbox = {
    document: documentStub,
    // Browsers expose window props as globals (bare `google` in-page);
    // mirror that for the sandbox or the load handler silently no-ops.
    get google() { return sandbox.window.google; },
    window: {
      location: { search: '' },
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      ZainbotLangPersistence: persistenceStub(storage),
      google: { accounts: { id: {
        initialize: (opts) => google.initializeCalls.push(opts),
        renderButton: (el, opts) => google.renderCalls.push({ el, opts }),
      } } },
    },
    localStorage: storage,
    fetch: async () => ({ ok: true, json: async () => ({ googleClientId: 'test-client-id' }) }),
    URLSearchParams,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = (init && init.detail) || {}; } },
  };
  vm.createContext(sandbox);
  vm.runInContext(extractInlineScript(html, name), sandbox, { filename: `${name}-inline.js` });
  return {
    storage, google, toggle, listeners,
    fireLoad: async () => {
      for (const fn of listeners.load || []) await fn();
      await flush();
    },
    clickToggle: () => {
      for (const fn of toggle.listeners.click || []) fn();
    },
    fireLanguageChange: (lang) => {
      documentStub.dispatchEvent(new sandbox.CustomEvent('zainbot:languagechange', { detail: { language: lang } }));
    },
    expectedText,
  };
}

for (const [name, html, expectedText] of [['login', loginHtml, 'signin_with'], ['register', registerHtml, 'signup_with']]) {
  test(`${name} Google button renders once, then re-renders locale without re-initializing`, async () => {
    const ctx = runPageScript(html, name, expectedText);
    await ctx.fireLoad();
    assert.equal(ctx.google.initializeCalls.length, 1, 'initialize exactly once');
    assert.equal(ctx.google.renderCalls.length, 1, 'one initial render');
    assert.equal(ctx.google.renderCalls[0].opts.locale, 'ar', 'default page language applied');
    assert.equal(ctx.google.renderCalls[0].opts.text, expectedText);
    ctx.clickToggle();
    assert.equal(ctx.storage.getItem('zainbot_lang'), 'en', 'toggle persists the new language');
    assert.equal(ctx.google.renderCalls.length, 2, 'language switch re-renders the button');
    assert.equal(ctx.google.renderCalls[1].opts.locale, 'en', 'new locale applied without a request');
    assert.equal(ctx.google.initializeCalls.length, 1, 'no duplicate initialize');
    ctx.fireLanguageChange('ar');
    assert.equal(ctx.google.renderCalls.length, 3, 'external languagechange also re-renders');
    assert.equal(ctx.google.renderCalls[2].opts.locale, 'ar');
    assert.equal(ctx.google.initializeCalls.length, 1, 'still a single initialize');
  });
}
