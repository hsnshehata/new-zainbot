'use strict';

// D03 — feedback/resource primitive (§7.2) behavioral fixtures.
//
// No DOM library is available in this workspace, so these fixtures implement
// the exact DOM surface the helper uses (createElement, textContent,
// setAttribute, appendChild, replaceChildren, querySelector for the helper's
// single note selector, click dispatch, disabled state). Browser acceptance
// with real assistive-tech timing waits for the A04 harness.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', 'public', 'js', 'dashboard-feedback.js');
const SOURCE = fs.readFileSync(MODULE_PATH, 'utf8');

let focusCalls = 0;

class FakeElement {
  constructor(tagName, attrs = {}) {
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.disabled = false;
    this.listeners = {};
    this._text = '';
    for (const [name, value] of Object.entries(attrs)) {
      this.setAttribute(name, value);
    }
  }
  get textContent() {
    return this._text + this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('');
  }
  set textContent(value) {
    this.children = [];
    this._text = String(value);
  }
  setAttribute(name, value = '') {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i !== -1) this.children.splice(i, 1);
    child.parentNode = null;
    return child;
  }
  get firstChild() {
    return this.children.length ? this.children[0] : null;
  }
  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._text = '';
    for (const node of nodes) this.appendChild(node);
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  querySelector(selector) {
    const match = selector.match(/^\[([^\]=]+)(?:="([^"]*)")?\]$/);
    assert.ok(match, `fixture querySelector supports [attr] only, got: ${selector}`);
    const queue = [...this.children].filter((c) => typeof c !== 'string');
    while (queue.length) {
      const el = queue.shift();
      const value = el.getAttribute(match[1]);
      if (value !== null && (match[2] === undefined || value === match[2])) return el;
      queue.push(...el.children.filter((c) => typeof c !== 'string'));
    }
    return null;
  }
  addEventListener(type, fn) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(fn);
  }
  click() {
    for (const fn of this.listeners.click || []) fn();
  }
  focus() {
    focusCalls += 1; // the helper must never move focus
  }
}

function makeDocument() {
  const registry = new Map();
  const body = new FakeElement('div', { id: 'body' });
  const doc = {
    body,
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => {
      if (registry.has(id)) return registry.get(id);
      const queue = [body];
      while (queue.length) {
        const el = queue.shift();
        if (el.getAttribute('id') === id) {
          registry.set(id, el);
          return el;
        }
        queue.push(...el.children.filter((c) => typeof c !== 'string'));
      }
      return null;
    },
  };
  const originalCreate = doc.createElement;
  doc.createElement = (tag) => {
    const el = originalCreate(tag);
    const originalSet = el.setAttribute.bind(el);
    el.setAttribute = (name, value) => {
      originalSet(name, value);
      if (name === 'id') registry.set(String(value), el);
    };
    return el;
  };
  return doc;
}

function makeT(lang, dict) {
  const fn = (key, params) => {
    let template = (dict[lang] && dict[lang][key]) ?? (dict.en && dict.en[key]) ?? key;
    if (params) {
      template = String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (m, name) => (
        params[name] !== undefined && params[name] !== null ? String(params[name]) : m
      ));
    }
    return template;
  };
  fn.lang = lang;
  return fn;
}

const DICT = {
  en: {
    feedback_loading: 'Loading…',
    feedback_retry: 'Retry',
    feedback_stale: 'Showing saved data while refreshing…',
    feedback_no_bot: 'Select an agent to load this section.',
    orders_empty: 'No orders yet.',
    orders_filtered_empty: 'No orders match these filters.',
    orders_failed: 'Could not load orders.',
  },
  ar: {
    feedback_loading: 'جارٍ التحميل…',
    feedback_retry: 'إعادة المحاولة',
    feedback_stale: 'تُعرض بيانات محفوظة أثناء التحديث…',
    feedback_no_bot: 'اختر وكيلًا لعرض هذا القسم.',
    orders_empty: 'لا توجد طلبات بعد.',
    orders_filtered_empty: 'لا توجد طلبات مطابقة لهذه المرشحات.',
    orders_failed: 'تعذر تحميل الطلبات.',
  },
};

function loadFresh() {
  delete require.cache[MODULE_PATH];
  focusCalls = 0;
  global.document = makeDocument();
  const mod = require(MODULE_PATH);
  delete global.document;
  return mod;
}

function findByRole(root, role) {
  const queue = [root];
  while (queue.length) {
    const el = queue.shift();
    if (typeof el === 'string') continue;
    if (el.getAttribute('role') === role) return el;
    queue.push(...el.children);
  }
  return null;
}

function findButton(root) {
  const queue = [root];
  while (queue.length) {
    const el = queue.shift();
    if (typeof el === 'string') continue;
    if (el.tagName === 'BUTTON') return el;
    queue.push(...el.children);
  }
  return null;
}

// ---------- static contract guards ----------

test('helper owns no dictionary and parses no HTML', () => {
  assert.doesNotMatch(SOURCE, /innerHTML/);
  assert.doesNotMatch(SOURCE, /outerHTML/);
  assert.doesNotMatch(SOURCE, /insertAdjacentHTML/);
  assert.doesNotMatch(SOURCE, /\.focus\(/);
  assert.doesNotMatch(SOURCE, /fetch\(/);
  assert.doesNotMatch(SOURCE, /XMLHttpRequest/);
  assert.doesNotMatch(SOURCE, /translations\s*=\s*\{/);
});

test('module exposes the §7.2 surface', () => {
  const mod = loadFresh();
  assert.deepEqual(mod.PHASES, ['loading', 'ready', 'empty', 'filtered-empty', 'error', 'stale', 'no-bot']);
  assert.equal(typeof mod.renderState, 'function');
  assert.equal(typeof mod.notify, 'function');
  assert.equal(typeof mod.withPending, 'function');
  assert.equal(typeof mod.refreshLanguage, 'function');
});

// ---------- renderState flows ----------

test('loading announces politely with aria-busy and never focuses', () => {
  const mod = loadFresh();
  global.document = makeDocument();
  const box = global.document.createElement('section');
  mod.renderState(box, { phase: 'loading' }, { t: makeT('en', DICT) });
  assert.equal(box.getAttribute('aria-busy'), 'true');
  const status = findByRole(box, 'status');
  assert.ok(status, 'loading must render a polite status node');
  assert.equal(status.textContent, 'Loading…');
  assert.equal(focusCalls, 0);
  delete global.document;
});

test('loading→error→retry→ready keeps one attempt per click and clears', async () => {
  const mod = loadFresh();
  global.document = makeDocument();
  const box = global.document.createElement('section');
  const t = makeT('en', DICT);
  let attempts = 0;
  const onRetry = () => {
    attempts += 1;
    mod.renderState(box, { phase: 'loading' }, { t });
    mod.renderState(box, { phase: 'ready' }, { t });
  };
  mod.renderState(box, { phase: 'loading' }, { t });
  mod.renderState(box, { phase: 'error', key: 'orders_failed' }, { t, onRetry });
  const alert = findByRole(box, 'alert');
  assert.ok(alert, 'error must render a persistent alert node');
  assert.match(alert.textContent, /Could not load orders/);
  const retry = findButton(box);
  assert.ok(retry, 'read errors carry a retry button');
  assert.equal(retry.textContent, 'Retry');
  retry.click();
  assert.equal(attempts, 1);
  assert.equal(box.getAttribute('aria-busy'), 'false');
  assert.equal(box.children.length, 0, 'ready must clear the region');
  assert.equal(findByRole(box, 'alert'), null);
  assert.equal(focusCalls, 0);
  delete global.document;
});

test('mutation-style error renders no retry button and persists across other renders', () => {
  const mod = loadFresh();
  global.document = makeDocument();
  const box = global.document.createElement('section');
  const other = global.document.createElement('section');
  const t = makeT('en', DICT);
  mod.renderState(box, { phase: 'error', key: 'orders_failed' }, { t });
  assert.equal(findButton(box), null, 'no onRetry means no retry affordance (mutations)');
  assert.ok(findByRole(box, 'alert'));
  mod.renderState(other, { phase: 'loading' }, { t });
  assert.ok(findByRole(box, 'alert'), 'error stays until its own container re-renders');
  delete global.document;
});

test('empty and filtered-empty use distinct caller keys', () => {
  const mod = loadFresh();
  global.document = makeDocument();
  const box = global.document.createElement('section');
  const t = makeT('en', DICT);
  mod.renderState(box, { phase: 'empty', key: 'orders_empty' }, { t });
  assert.equal(findByRole(box, 'status').textContent, 'No orders yet.');
  mod.renderState(box, { phase: 'filtered-empty', key: 'orders_filtered_empty' }, { t });
  assert.equal(findByRole(box, 'status').textContent, 'No orders match these filters.');
  delete global.document;
});

test('error and stale preserve existing content instead of faking empty', () => {
  const mod = loadFresh();
  global.document = makeDocument();
  const box = global.document.createElement('section');
  const row = global.document.createElement('p');
  row.textContent = 'existing row';
  box.appendChild(row);
  const t = makeT('en', DICT);
  mod.renderState(box, { phase: 'error', key: 'orders_failed' }, { t });
  assert.match(box.textContent, /existing row/, 'error must not wipe rendered data');
  assert.ok(findByRole(box, 'alert'));
  mod.renderState(box, { phase: 'stale' }, { t });
  assert.match(box.textContent, /existing row/, 'stale must not wipe rendered data');
  assert.match(box.textContent, /Showing saved data/);
  assert.equal(box.getAttribute('aria-busy'), 'true');
  // A second stale replaces the note instead of stacking it.
  mod.renderState(box, { phase: 'stale' }, { t });
  const occurrences = box.textContent.split('Showing saved data').length - 1;
  assert.equal(occurrences, 1);
  delete global.document;
});

test('no-bot state is polite and busy-free', () => {
  const mod = loadFresh();
  global.document = makeDocument();
  const box = global.document.createElement('section');
  mod.renderState(box, { phase: 'no-bot' }, { t: makeT('en', DICT) });
  assert.equal(box.getAttribute('aria-busy'), 'false');
  assert.equal(findByRole(box, 'status').textContent, 'Select an agent to load this section.');
  delete global.document;
});

test('HTML-like text is escaped via textContent, never parsed', () => {
  const mod = loadFresh();
  global.document = makeDocument();
  const box = global.document.createElement('section');
  const evil = { en: { orders_failed: '<img src=x onerror="SENTINEL_XSS"> failed' }, ar: {} };
  mod.renderState(box, { phase: 'error', key: 'orders_failed' }, { t: makeT('en', evil) });
  const alert = findByRole(box, 'alert');
  assert.equal(alert.textContent, '<img src=x onerror="SENTINEL_XSS"> failed');
  assert.equal(box.children.length, 1, 'payload must not become child nodes');
  delete global.document;
});

test('language switch mid-loading re-renders in place without refetch', () => {
  const mod = loadFresh();
  global.document = makeDocument();
  const box = global.document.createElement('section');
  mod.renderState(box, { phase: 'loading' }, { t: makeT('en', DICT) });
  assert.equal(findByRole(box, 'status').textContent, 'Loading…');
  mod.refreshLanguage(makeT('ar', DICT));
  assert.equal(findByRole(box, 'status').textContent, 'جارٍ التحميل…');
  assert.equal(box.getAttribute('aria-busy'), 'true', 'busy state survives the switch');
  assert.equal(focusCalls, 0);
  delete global.document;
});

test('colSpan wraps the status node for table containers', () => {
  const mod = loadFresh();
  global.document = makeDocument();
  const body = global.document.createElement('tbody');
  mod.renderState(body, { phase: 'empty', key: 'orders_empty' }, { t: makeT('en', DICT), colSpan: 5 });
  assert.equal(body.children.length, 1);
  const tr = body.children[0];
  assert.equal(tr.tagName, 'TR');
  assert.equal(tr.children[0].getAttribute('colspan'), '5');
  assert.match(tr.textContent, /No orders yet/);
  delete global.document;
});

test('validation fails loudly: unknown phase, missing key, missing t', () => {
  const mod = loadFresh();
  global.document = makeDocument();
  const box = global.document.createElement('section');
  const t = makeT('en', DICT);
  assert.throws(() => mod.renderState(box, { phase: 'nonsense' }, { t }), /phase/);
  assert.throws(() => mod.renderState(box, { phase: 'error' }, { t }), /state\.key/);
  assert.throws(() => mod.renderState(box, { phase: 'loading' }, {}), /requires t/);
  assert.throws(() => mod.notify({ level: 'info' }, t), /requires key/);
  assert.throws(() => mod.notify({ level: 'bogus', key: 'orders_empty' }, t), /level/);
  assert.throws(() => mod.withPending('', [], async () => 1), /non-empty key/);
  delete global.document;
});

// ---------- notify ----------

test('notify routes politely except errors, persists, never focuses', () => {
  const mod = loadFresh();
  const doc = makeDocument();
  global.document = doc;
  const t = makeT('en', DICT);
  mod.notify({ level: 'success', key: 'orders_empty' }, t);
  const region = doc.getElementById('feedbackLiveRegion');
  assert.ok(region, 'notify provisions the live region when absent');
  assert.equal(region.getAttribute('role'), 'status');
  assert.equal(region.textContent, 'No orders yet.');
  mod.notify({ level: 'error', key: 'orders_failed' }, t);
  assert.equal(region.getAttribute('role'), 'alert');
  assert.equal(region.textContent, 'Could not load orders.');
  mod.refreshLanguage(makeT('ar', DICT));
  assert.equal(region.textContent, 'تعذر تحميل الطلبات.');
  assert.equal(focusCalls, 0);
  delete global.document;
});

// ---------- withPending ----------

test('withPending guards controls and restores original disabled states', async () => {
  const mod = loadFresh();
  global.document = makeDocument();
  const doc = global.document;
  const save = doc.createElement('button');
  const cancel = doc.createElement('button');
  cancel.disabled = true; // pre-disabled stays disabled
  let seenDuring = null;
  const value = await mod.withPending('orders-save', [save, cancel], async () => {
    seenDuring = [save.disabled, cancel.disabled];
    return 'saved';
  });
  assert.equal(value, 'saved');
  assert.deepEqual(seenDuring, [true, true], 'controls locked during the operation');
  assert.equal(save.disabled, false, 'enabled control restored to enabled');
  assert.equal(cancel.disabled, true, 'pre-disabled control restored to disabled');
  delete global.document;
});

test('withPending restores controls on rejection and sync throw', async () => {
  const mod = loadFresh();
  global.document = makeDocument();
  const btn = global.document.createElement('button');
  await assert.rejects(
    mod.withPending('op-fail', [btn], async () => { throw new Error('boom'); }),
    /boom/
  );
  assert.equal(btn.disabled, false);
  assert.throws(
    () => mod.withPending('op-sync', [btn], () => { throw new Error('sync'); }),
    /sync/
  );
  assert.equal(btn.disabled, false);
  assert.equal(focusCalls, 0);
  delete global.document;
});

// ---------- hookup proof (shared-file hunks stay tight) ----------

test('dashboard wires the primitive: scripts, live region, keys, renderer', () => {
  const workspace = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
  const script = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
  assert.match(html, /<script src="js\/dashboard-request\.js\?v=[^"]+"><\/script>/);
  assert.match(html, /<script src="js\/dashboard-feedback\.js\?v=[^"]+"><\/script>/);
  const requestIndex = html.indexOf('<script src="js/dashboard-request.js');
  const feedbackIndex = html.indexOf('<script src="js/dashboard-feedback.js');
  const mainIndex = html.indexOf('<script src="js/dashboard_new.js');
  assert.ok(requestIndex !== -1 && requestIndex < mainIndex, 'request core loads before dashboard_new.js');
  assert.ok(feedbackIndex !== -1 && feedbackIndex < mainIndex, 'feedback loads before dashboard_new.js');
  assert.match(html, /id="feedbackLiveRegion"/);
  for (const key of ['feedback_loading', 'feedback_retry', 'feedback_stale', 'feedback_no_bot']) {
    assert.match(script, new RegExp(`      ${key}: '[^']+'`), `missing dictionary key ${key}`);
  }
  assert.match(script, /registerLanguageRenderer\('feedback'/);
  const wiringLine = script.split('\n').find((line) => line.includes("registerLanguageRenderer('feedback'"));
  assert.ok(wiringLine && wiringLine.includes('});'), 'feedback wiring opens and closes on one line (line-sliced harnesses execute it standalone)');
});
