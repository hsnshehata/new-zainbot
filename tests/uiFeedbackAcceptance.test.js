const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// E06 — feedback acceptance at the E01×D03 integration seam (behavioral
// fixtures, no DOM library). D03's 16 unit tests prove the helper
// contract; these prove the composition E06 owns: errors land inside the
// open dialog (never the inert background), post-close success announces
// from the body-level region, the composition never moves focus, and
// repeated renders never stack duplicate announcements. Real AT timing
// waits for the browser harness.

const A11Y_PATH = path.join(__dirname, '..', 'public', 'js', 'ui-accessibility.js');
const FEEDBACK_PATH = path.join(__dirname, '..', 'public', 'js', 'dashboard-feedback.js');

function tokenMatches(el, token) {
  const trimmed = token.trim();
  const parsed = trimmed.match(/^([a-zA-Z][a-zA-Z0-9]*)?(\[([^\]=]+)(?:="([^"]*)")?\])?$/);
  assert.ok(parsed, `fixture matcher cannot parse selector token: ${token}`);
  const tag = parsed[1] || null;
  const attr = parsed[3] || null;
  const value = parsed[4];
  if (tag && el.tagName !== tag.toUpperCase()) return false;
  if (attr) {
    if (!el.hasAttribute(attr)) return false;
    if (value !== undefined && el.getAttribute(attr) !== value) return false;
  }
  return true;
}

function install() {
  const listeners = new Map();
  const doc = {
    activeElement: null,
    listeners,
    byId: {},
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      const at = list.indexOf(fn);
      if (at !== -1) list.splice(at, 1);
    },
    dispatch(type, target, extra = {}) {
      const event = { type, target, ...extra };
      for (const fn of [...(listeners.get(type) || [])]) fn(event);
      return event;
    },
    createElement(tag) { return makeEl(tag); },
    getElementById(id) { return doc.byId[id] || null; },
    querySelector() { return null; },
    body: null,
  };
  function makeEl(tag, attrs = {}) {
    const attrMap = new Map(Object.entries(attrs));
    if (attrs.id) doc.byId[attrs.id] = elProxy();
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      children: [],
      parentNode: null,
      disabled: false,
      hidden: false,
      type: undefined,
      inert: false,
      isConnected: true,
      style: {},
      textContent: '',
      buttonCb: null,
      getAttribute: (n) => (attrMap.has(n) ? attrMap.get(n) : null),
      setAttribute: (n, v = '') => {
        attrMap.set(n, String(v));
        if (n === 'id') doc.byId[String(v)] = el;
        if (n === 'disabled') el.disabled = true;
        if (n === 'hidden') el.hidden = true;
        if (n === 'inert') el.inert = true;
      },
      hasAttribute: (n) => attrMap.has(n),
      removeAttribute: (n) => {
        attrMap.delete(n);
        if (n === 'disabled') el.disabled = false;
        if (n === 'hidden') el.hidden = false;
        if (n === 'inert') el.inert = false;
      },
      appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
      remove() {
        if (el.parentNode) {
          const sibs = el.parentNode.children;
          sibs.splice(sibs.indexOf(el), 1);
          el.parentNode = null;
        }
        el.isConnected = false;
      },
      replaceChildren() { el.children = []; },
      get firstChild() { return el.children[0] || null; },
      removeChild(c) {
        el.children.splice(el.children.indexOf(c), 1);
        return c;
      },
      contains(n) {
        let cur = n;
        while (cur) {
          if (cur === el) return true;
          cur = cur.parentNode;
        }
        return false;
      },
      querySelector(sel) {
        const found = el.querySelectorAll(sel);
        return found.length > 0 ? found[0] : null;
      },
      querySelectorAll(selector) {
        const tokens = String(selector).split(',').map((p) => p.trim()).filter(Boolean);
        const found = [];
        const visit = (node) => {
          for (const child of node.children) {
            if (tokens.some((t) => tokenMatches(child, t))) found.push(child);
            visit(child);
          }
        };
        visit(el);
        return found;
      },
      addEventListener(t, fn) { if (t === 'click') el.buttonCb = fn; },
      click() { if (el.buttonCb) el.buttonCb(); },
      focus() {
        doc.activeElement = el;
        doc.dispatch('focusin', el);
      },
    };
    function elProxy() { return el; }
    return el;
  }
  doc.body = makeEl('body');
  doc.body.isConnected = true;

  const prevDoc = globalThis.document;
  const prevA11y = globalThis.ZainBotA11y;
  globalThis.document = doc;
  delete require.cache[A11Y_PATH];
  delete require.cache[FEEDBACK_PATH];
  const a11y = require(A11Y_PATH);
  const feedback = require(FEEDBACK_PATH);
  return {
    doc,
    makeEl,
    a11y,
    feedback,
    t: (key) => `[${key}]`,
    restore() {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
      if (prevA11y === undefined) delete globalThis.ZainBotA11y;
      else globalThis.ZainBotA11y = prevA11y;
    },
  };
}

function openDialogWithBody(fx, opener) {
  const main = fx.makeEl('main');
  const dlg = fx.makeEl('div', { role: 'dialog' });
  const dlgBody = fx.makeEl('div');
  const first = fx.makeEl('button');
  dlgBody.appendChild(first);
  dlg.appendChild(dlgBody);
  fx.a11y.openDialog(dlg, { opener, background: [main] });
  return { main, dlg, dlgBody, first };
}

test('error renders inside the open dialog, never the inert background', () => {
  const fx = install();
  try {
    const opener = fx.makeEl('button');
    fx.doc.body.appendChild(opener);
    opener.focus();
    const { main, dlgBody } = openDialogWithBody(fx, opener);
    assert.equal(main.inert, true, 'background isolated while dialog open');

    fx.feedback.renderState(dlgBody, { phase: 'error', key: 'chan_load_error' }, { t: fx.t });
    const note = dlgBody.querySelector('[data-feedback-note]');
    assert.ok(note, 'error note present in the dialog container');
    assert.equal(note.inert, false, 'in-dialog note is not inerted');
    const alert = note.querySelector('[role]');
    assert.ok(alert, 'announcement node present');
    assert.equal(alert.getAttribute('role'), 'alert', 'errors use the assertive role');
    assert.equal(alert.textContent, '[chan_load_error]', 'key resolved through t(), never raw');
  } finally {
    fx.restore();
  }
});

test('post-close success announces from the visible body region', () => {
  const fx = install();
  try {
    const opener = fx.makeEl('button');
    fx.doc.body.appendChild(opener);
    opener.focus();
    const { main, dlg } = openDialogWithBody(fx, opener);
    fx.a11y.closeDialog(dlg);
    assert.equal(main.inert, false, 'isolation released on close');
    assert.equal(fx.doc.activeElement, opener, 'opener restored');

    fx.feedback.notify({ level: 'success', key: 'booking_saved_ok' }, fx.t);
    const region = fx.doc.getElementById('feedbackLiveRegion');
    assert.ok(region, 'single shared region provisioned at body level');
    assert.equal(region.getAttribute('role'), 'status', 'success is polite');
    assert.equal(region.textContent, '[booking_saved_ok]');
    assert.equal(region.inert, false, 'announcement region is never inert');
    assert.ok(!region.parentNode || region.parentNode === fx.doc.body || region.isConnected);
  } finally {
    fx.restore();
  }
});

test('dialog open plus loading plus notify never moves focus', () => {
  const fx = install();
  try {
    const opener = fx.makeEl('button');
    fx.doc.body.appendChild(opener);
    opener.focus();
    const { dlgBody, first } = openDialogWithBody(fx, opener);
    assert.equal(fx.doc.activeElement, first, 'helper focuses into the dialog (E01 behavior)');

    fx.feedback.renderState(dlgBody, { phase: 'loading', key: 'feedback_loading' }, { t: fx.t });
    assert.equal(fx.doc.activeElement, first, 'loading render steals no focus');
    fx.feedback.notify({ level: 'success', key: 'booking_saved_ok' }, fx.t);
    assert.equal(fx.doc.activeElement, first, 'notify steals no focus');
  } finally {
    fx.restore();
  }
});

test('repeated renders and notifies never stack duplicate announcements', () => {
  const fx = install();
  try {
    const opener = fx.makeEl('button');
    fx.doc.body.appendChild(opener);
    opener.focus();
    const { dlgBody } = openDialogWithBody(fx, opener);

    fx.feedback.renderState(dlgBody, { phase: 'error', key: 'chan_load_error' }, { t: fx.t });
    fx.feedback.renderState(dlgBody, { phase: 'error', key: 'chan_load_error' }, { t: fx.t });
    assert.equal(dlgBody.querySelectorAll('[data-feedback-note]').length, 1, 'exactly one note per container');

    fx.feedback.notify({ level: 'error', key: 'chan_load_error' }, fx.t);
    fx.feedback.notify({ level: 'error', key: 'chan_load_error' }, fx.t);
    assert.equal(fx.doc.body.children.filter((c) => c.getAttribute('id') === 'feedbackLiveRegion').length, 1, 'exactly one shared region');
  } finally {
    fx.restore();
  }
});
