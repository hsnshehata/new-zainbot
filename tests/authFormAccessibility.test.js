const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// E07 — auth focus/forms (behavioral fixtures: vm + fake DOM with focus
// tracking. Real keyboard/AT acceptance waits for the browser harness).

const workspace = path.resolve(__dirname, '..');
const authScript = fs.readFileSync(path.join(workspace, 'public', 'js', 'auth.js'), 'utf8');
const loginHtml = fs.readFileSync(path.join(workspace, 'public', 'login.html'), 'utf8');
const registerHtml = fs.readFileSync(path.join(workspace, 'public', 'register.html'), 'utf8');

function makeStorage(initial) {
  const store = { ...(initial || {}) };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

function makeElement(doc, overrides) {
  const attrs = new Map();
  const el = {
    textContent: '',
    value: '',
    hidden: false,
    isConnected: true,
    style: { display: '' },
    listeners: {},
    children: [],
    parent: null,
    focused: false,
    focusCalls: 0,
    valid: true,
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
    setAttribute: (name, value) => { attrs.set(name, String(value)); },
    removeAttribute: (name) => { attrs.delete(name); },
    hasAttribute: (name) => attrs.has(name),
    addEventListener(type, fn) { (el.listeners[type] = el.listeners[type] || []).push(fn); },
    appendChild(child) { child.parent = el; el.children.push(child); return child; },
    contains(node) {
      let current = node;
      while (current) {
        if (current === el) return true;
        current = current.parent;
      }
      return false;
    },
    checkValidity: () => el.valid,
    reset() {},
    focus() {
      el.focusCalls += 1;
      el.focused = true;
      if (doc) doc.activeElement = el;
    },
    ...(overrides || {}),
  };
  return el;
}

function runAuth({ pathname = '/login', apiImpl, lang, hash } = {}) {
  const calls = { api: 0 };
  let doc = null;
  const byId = {};
  const get = (id) => {
    if (!byId[id]) byId[id] = makeElement(doc);
    return byId[id];
  };
  doc = {
    activeElement: null,
    listeners: {},
    addEventListener(type, fn) { (doc.listeners[type] = doc.listeners[type] || []).push(fn); },
    dispatchEvent(event) { (doc.listeners[event.type] || []).forEach((fn) => fn(event)); return true; },
    querySelector(sel) {
      if (sel.startsWith('#')) return get(sel.slice(1));
      return null;
    },
    querySelectorAll() { return []; },
  };
  doc.body = makeElement(doc);
  // Parent the recovery inputs inside their forms for contains() checks.
  get('forgotForm').appendChild(get('recoveryEmail'));
  get('resendForm').appendChild(get('resendEmail'));
  get('resetForm').appendChild(get('newPassword'));
  get('resetForm').appendChild(get('resetConfirm'));
  const storage = makeStorage(lang ? { zainbot_lang: lang } : {});
  const sandbox = {
    document: doc,
    window: {
      location: { pathname, search: '', hash: hash || '' },
      history: { replaceState() {} },
      localStorage: storage,
    },
    localStorage: storage,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    handleApiRequest: async (...args) => {
      calls.api += 1;
      if (apiImpl) return apiImpl(...args);
      throw new Error('no stubbed request expected');
    },
    URLSearchParams,
  };
  vm.createContext(sandbox);
  vm.runInContext(authScript, sandbox, { filename: 'auth.js' });
  (doc.listeners.DOMContentLoaded || []).forEach((fn) => fn());
  const fire = (el, type, event) => {
    (el.listeners[type] || []).forEach((fn) => fn(event || { preventDefault() {}, target: el, currentTarget: el }));
  };
  return { calls, doc, get, fire };
}

async function flush() {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
}

// --- Recovery reveal/hide focus ----------------------------------------------

test('revealing forgot recovery focuses its email field', () => {
  const { get, fire } = runAuth();
  const toggle = get('forgotToggle');
  const form = get('forgotForm');
  form.hidden = true;
  fire(toggle, 'click', { currentTarget: toggle });
  assert.equal(form.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.ok(get('recoveryEmail').focusCalls > 0, 'email field focused on reveal');
});

test('hiding recovery returns focus to the toggle instead of stranding it', () => {
  const { doc, get, fire } = runAuth();
  const toggle = get('forgotToggle');
  const form = get('forgotForm');
  form.hidden = false;
  doc.activeElement = get('recoveryEmail');
  fire(toggle, 'click', { currentTarget: toggle });
  assert.equal(form.hidden, true);
  assert.equal(doc.activeElement, toggle);
});

test('revealing resend recovery focuses its email field', () => {
  const { get, fire } = runAuth({ pathname: '/register' });
  const toggle = get('resendToggle');
  get('resendForm').hidden = true;
  fire(toggle, 'click');
  assert.equal(get('resendForm').hidden, false);
  assert.ok(get('resendEmail').focusCalls > 0, 'resend field focused on reveal');
});

test('invalid recovery email links the field and focuses it', async () => {
  const { calls, get, fire } = runAuth();
  const field = get('recoveryEmail');
  field.valid = false;
  fire(get('forgotForm'), 'submit');
  await flush();
  assert.equal(field.getAttribute('aria-invalid'), 'true');
  assert.match(field.getAttribute('aria-describedby') || '', /error/);
  assert.ok(field.focusCalls > 0, 'invalid field focused');
  assert.equal(calls.api, 0, 'no request on client-invalid submit');
});

// --- Register validation -------------------------------------------------------

test('password mismatch flags only the confirm field and focuses it', async () => {
  const { calls, get, fire } = runAuth({ pathname: '/register' });
  get('username').value = 'samir99';
  get('password').value = 'Strong1!x';
  get('confirmPassword').value = 'Strong1!y';
  get('botName').value = 'Agent';
  get('email').value = 'a@b.co';
  fire(get('registerForm'), 'submit');
  await flush();
  assert.equal(get('error').textContent, 'كلمات المرور غير متطابقة.');
  assert.equal(get('confirmPassword').getAttribute('aria-invalid'), 'true');
  assert.match(get('confirmPassword').getAttribute('aria-describedby') || '', /error/);
  assert.equal(get('password').getAttribute('aria-invalid'), null, 'valid field not flagged');
  assert.ok(get('confirmPassword').focusCalls > 0, 'confirm focused');
  assert.equal(calls.api, 0, 'no request on mismatch');
});

test('weak password flags the password field (mismatch covered separately)', async () => {
  const { get, fire } = runAuth({ pathname: '/register' });
  get('username').value = 'samir99';
  get('password').value = 'weak';
  get('confirmPassword').value = 'weak';
  get('botName').value = 'Agent';
  get('email').value = 'a@b.co';
  fire(get('registerForm'), 'submit');
  await flush();
  assert.equal(get('error').textContent, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف كبير وصغير ورقم ورمز وبدون مسافات.');
  assert.equal(get('password').getAttribute('aria-invalid'), 'true');
  assert.ok(get('password').focusCalls > 0, 'weak password focused');
});

test('bad username format flags the username field', async () => {
  const { get, fire } = runAuth({ pathname: '/register', lang: 'en' });
  get('username').value = 'Bad Name!';
  get('password').value = 'Strong1!x';
  get('confirmPassword').value = 'Strong1!x';
  get('botName').value = 'Agent';
  get('email').value = 'a@b.co';
  fire(get('registerForm'), 'submit');
  await flush();
  assert.equal(get('error').textContent, 'Username can only contain English letters, numbers, _ or -.');
  assert.equal(get('username').getAttribute('aria-invalid'), 'true');
  assert.ok(get('username').focusCalls > 0, 'username focused');
});

test('fixing a field clears its invalid flag', async () => {
  const { get, fire } = runAuth({ pathname: '/register' });
  get('username').value = 'samir99';
  get('password').value = 'Strong1!x';
  get('confirmPassword').value = 'Strong1!y';
  get('botName').value = 'Agent';
  get('email').value = 'a@b.co';
  fire(get('registerForm'), 'submit');
  await flush();
  assert.equal(get('confirmPassword').getAttribute('aria-invalid'), 'true');
  fire(get('confirmPassword'), 'input');
  assert.equal(get('confirmPassword').getAttribute('aria-invalid'), null, 'invalid cleared on fix');
  assert.equal(get('confirmPassword').getAttribute('aria-describedby'), null, 'describedby cleared on fix');
});

// --- Login + reset ---------------------------------------------------------------

test('login with empty fields focuses the first empty one', async () => {
  const { calls, get, fire } = runAuth();
  get('username').value = '';
  get('password').value = '';
  fire(get('loginForm'), 'submit');
  await flush();
  assert.equal(get('error').textContent, 'أدخل اسم المستخدم وكلمة المرور.');
  assert.equal(get('username').getAttribute('aria-invalid'), 'true');
  assert.ok(get('username').focusCalls > 0, 'first empty focused');
  assert.equal(calls.api, 0, 'no request on empty login');
});

test('reset success hides the form and never leaves focus on it', async () => {
  const { doc, get, fire } = runAuth({
    apiImpl: async () => ({ success: true }),
  });
  const form = get('resetForm');
  form.hidden = false;
  get('newPassword').value = 'Strong1!x';
  get('resetConfirm').value = 'Strong1!x';
  doc.activeElement = get('resetConfirm');
  fire(form, 'submit');
  await flush();
  assert.equal(form.hidden, true, 'reset form hidden on success');
  assert.notEqual(doc.activeElement, get('resetConfirm'), 'focus moved off the hidden form');
  assert.equal(doc.activeElement, get('username'), 'focus falls back to sign-in');
  assert.equal(get('success').textContent, 'تم تغيير كلمة المرور. سجّل الدخول الآن.');
});

test('reset mismatch flags the confirm field', async () => {
  const { get, fire } = runAuth();
  get('resetForm').hidden = false;
  get('newPassword').value = 'Strong1!x';
  get('resetConfirm').value = 'Strong1!y';
  fire(get('resetForm'), 'submit');
  await flush();
  assert.equal(get('resetConfirm').getAttribute('aria-invalid'), 'true');
  assert.ok(get('resetConfirm').focusCalls > 0, 'reset confirm focused');
});

test('all-empty register flags every required field and focuses the first', async () => {
  const { calls, get, fire } = runAuth({ pathname: '/register' });
  for (const id of ['username', 'password', 'confirmPassword', 'botName', 'email']) {
    get(id).value = '';
  }
  fire(get('registerForm'), 'submit');
  await flush();
  for (const id of ['username', 'password', 'confirmPassword', 'botName', 'email']) {
    assert.equal(get(id).getAttribute('aria-invalid'), 'true', `${id} flagged`);
    assert.match(get(id).getAttribute('aria-describedby') || '', /error/, `${id} described`);
  }
  assert.ok(get('username').focusCalls > 0, 'first empty focused');
  assert.equal(calls.api, 0, 'no request on empty register');
});

test('reset success writes the success region exactly once', async () => {
  const { get, fire } = runAuth({
    apiImpl: async () => ({ success: true }),
  });
  let writes = 0;
  let value = '';
  Object.defineProperty(get('success'), 'textContent', {
    get: () => value,
    set: (next) => { writes += 1; value = next; },
    configurable: true,
  });
  get('resetForm').hidden = false;
  get('newPassword').value = 'Strong1!x';
  get('resetConfirm').value = 'Strong1!x';
  fire(get('resetForm'), 'submit');
  await flush();
  assert.equal(value, 'تم تغيير كلمة المرور. سجّل الدخول الآن.');
  assert.equal(writes, 1, `single announcement write, got ${writes}`);
});

test('reset-token reveal focuses the new-password field', () => {
  const token = 'a'.repeat(64);
  const { get } = runAuth({ hash: `#reset=${token}` });
  assert.ok(get('newPassword').focusCalls > 0, 'new password focused on reveal');
});

test('hidden fallbacks fall through to the page body', async () => {
  const { doc, get, fire } = runAuth({
    apiImpl: async () => ({ success: true }),
  });
  get('resetForm').hidden = false;
  get('username').hidden = true;
  get('forgotToggle').hidden = true;
  get('newPassword').value = 'Strong1!x';
  get('resetConfirm').value = 'Strong1!x';
  doc.activeElement = get('resetConfirm');
  fire(get('resetForm'), 'submit');
  await flush();
  assert.equal(get('resetForm').hidden, true);
  assert.equal(doc.activeElement, doc.body, 'focus falls back to body');
});

// --- Server errors stay general -----------------------------------------------------

test('server failure attributes nothing to any field', async () => {
  const { get, fire } = runAuth({
    pathname: '/register',
    apiImpl: async () => ({ success: false, message: 'Username is taken.' }),
  });
  get('username').value = 'taken1';
  get('password').value = 'Strong1!x';
  get('confirmPassword').value = 'Strong1!x';
  get('botName').value = 'Agent';
  get('email').value = 'a@b.co';
  fire(get('registerForm'), 'submit');
  await flush();
  assert.equal(get('error').textContent, 'Username is taken.');
  for (const id of ['username', 'password', 'confirmPassword', 'botName', 'email']) {
    assert.equal(get(id).getAttribute('aria-invalid'), null, `${id} must not carry a server error`);
  }
});

// --- Live regions preserved, no duplicates --------------------------------------------

test('existing live regions are preserved and auth.js creates none', () => {
  for (const [name, html] of [['login', loginHtml], ['register', registerHtml]]) {
    assert.equal((html.match(/id="success"/g) || []).length, 1, `${name}: single success region`);
    assert.equal((html.match(/id="error"/g) || []).length, 1, `${name}: single error region`);
    assert.match(html, /id="success" class="login-success" role="status" aria-live="polite"/);
    assert.match(html, /id="error" class="login-error" role="alert" aria-live="polite"/);
  }
  assert.doesNotMatch(authScript, /createElement/, 'no provisioned regions (no duplicates)');
  assert.doesNotMatch(authScript, /aria-live/, 'roles come from markup, not script');
  assert.doesNotMatch(authScript, /role="status"|role="alert"/, 'no script-set live roles');
});
