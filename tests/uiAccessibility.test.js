'use strict';

// E01 — focus primitive (§7.3) behavioral fixtures.
//
// No DOM library is available in this workspace, so these fixtures implement
// the exact DOM surface the helper uses (activeElement, focus/focusin,
// keydown dispatch, querySelectorAll for the helper's selector shapes,
// inert + hidden/disabled/type/tabindex state). Browser acceptance with real
// Tab/Shift+Tab/Escape/activeElement waits for the A03 harness.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', 'public', 'js', 'ui-accessibility.js');
const SOURCE = fs.readFileSync(MODULE_PATH, 'utf8');

function loadFresh() {
  delete require.cache[MODULE_PATH];
  return require(MODULE_PATH);
}

// --- Minimal fake DOM -------------------------------------------------------

function tokenMatches(el, token) {
  const trimmed = token.trim();
  const parsed = trimmed.match(/^([a-zA-Z][a-zA-Z0-9]*)?(\[([^\]=]+)(?:="([^"]*)")?\])?$/);
  assert.ok(parsed, `fixture matcher cannot parse selector token: ${token}`);
  const tag = parsed[1] || null;
  const attr = parsed[3] || null;
  const value = parsed[4];
  if (tag && el.tagName !== tag.toUpperCase()) {
    return false;
  }
  if (attr) {
    if (!el.hasAttribute(attr)) {
      return false;
    }
    if (value !== undefined && el.getAttribute(attr) !== value) {
      return false;
    }
  }
  return true;
}

class FakeElement {
  constructor(tagName, attrs = {}) {
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.disabled = false;
    this.hidden = false;
    this.type = undefined;
    this.inert = false;
    this.isConnected = true;
    this.style = {};
    this.className = '';
    for (const [name, value] of Object.entries(attrs)) {
      this.setAttribute(name, value);
    }
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  setAttribute(name, value = '') {
    this.attributes.set(name, String(value));
    if (name === 'disabled') {
      this.disabled = true;
    }
    if (name === 'hidden') {
      this.hidden = true;
    }
    if (name === 'type') {
      this.type = String(value);
    }
    if (name === 'inert') {
      this.inert = true;
    }
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'disabled') {
      this.disabled = false;
    }
    if (name === 'hidden') {
      this.hidden = false;
    }
    if (name === 'inert') {
      this.inert = false;
    }
  }

  appendChild(child) {
    child.parentNode = this;
    child.isConnected = this.isConnected;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.parentNode) {
      const siblings = this.parentNode.children;
      const at = siblings.indexOf(this);
      if (at !== -1) {
        siblings.splice(at, 1);
      }
      this.parentNode = null;
    }
    this.isConnected = false;
  }

  contains(node) {
    let current = node;
    while (current) {
      if (current === this) {
        return true;
      }
      current = current.parentNode;
    }
    return false;
  }

  querySelectorAll(selector) {
    const tokens = String(selector).split(',').map((part) => part.trim()).filter(Boolean);
    const found = [];
    const visit = (el) => {
      for (const child of el.children) {
        if (tokens.some((token) => tokenMatches(child, token))) {
          found.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return found;
  }

  focus() {
    const doc = globalThis.document;
    if (doc && typeof doc._setActive === 'function') {
      doc._setActive(this);
    }
  }
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
    this.addCalls = [];
    this.activeElement = null;
    this.body = new FakeElement('body');
    this.body.isConnected = true;
  }

  addEventListener(type, handler) {
    this.addCalls.push(type);
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    const at = list.indexOf(handler);
    if (at !== -1) {
      list.splice(at, 1);
    }
  }

  listenerCount(type) {
    return (this.listeners.get(type) || []).length;
  }

  _setActive(el) {
    this.activeElement = el;
    this.dispatch('focusin', el);
  }

  dispatch(type, target, extra = {}) {
    const event = {
      type,
      target,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...extra,
    };
    for (const handler of [...(this.listeners.get(type) || [])]) {
      handler(event);
    }
    return event;
  }

  keydown(target, { key, shiftKey = false } = {}) {
    return this.dispatch('keydown', target, { key, shiftKey });
  }
}

function install() {
  const doc = new FakeDocument();
  const previousDocument = globalThis.document;
  const previousA11y = globalThis.ZainBotA11y;
  globalThis.document = doc;
  const api = loadFresh();
  return {
    doc,
    api,
    restore() {
      if (previousDocument === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = previousDocument;
      }
      if (previousA11y === undefined) {
        delete globalThis.ZainBotA11y;
      } else {
        globalThis.ZainBotA11y = previousA11y;
      }
    },
  };
}

function button(attrs = {}) {
  return new FakeElement('button', attrs);
}

function dialogWith(...children) {
  const dlg = new FakeElement('div', { role: 'dialog' });
  dlg.isConnected = true;
  for (const child of children) {
    dlg.appendChild(child);
  }
  return dlg;
}

// --- Contract surface: no business logic ------------------------------------

test('helper exposes exactly openDialog/closeDialog and owns no business state', () => {
  const { api, restore } = install();
  try {
    assert.deepEqual(Object.keys(api).sort(), ['closeDialog', 'openDialog']);
    assert.equal(typeof api.openDialog, 'function');
    assert.equal(typeof api.closeDialog, 'function');
    assert.equal(globalThis.ZainBotA11y, api);

    // The helper must never fetch, poll, time, or restyle: timers and
    // modal classes belong to the integration handler (E02/E03).
    for (const banned of [
      'setTimeout',
      'setInterval',
      'requestAnimationFrame',
      'fetch(',
      'XMLHttpRequest',
      'classList',
      'querySelector(',
    ]) {
      assert.ok(!SOURCE.includes(banned), `helper source must not contain ${banned}`);
    }
    // No `.active` class selector/manipulation (`.activeElement` is fine).
    assert.doesNotMatch(SOURCE, /\.active(?![A-Za-z])/);
  } finally {
    restore();
  }
});

test('openDialog requires an element', () => {
  const { api, restore } = install();
  try {
    assert.throws(() => api.openDialog(null), TypeError);
    assert.throws(() => api.openDialog(undefined), TypeError);
  } finally {
    restore();
  }
});

// --- Initial focus -----------------------------------------------------------

test('open focuses initialFocus, else the first tabbable control', () => {
  const { api, doc, restore } = install();
  try {
    const trigger = button();
    doc.body.appendChild(trigger);
    trigger.focus();

    const first = button();
    const second = button();
    const dlg = dialogWith(first, second);
    api.openDialog(dlg, { opener: trigger, initialFocus: second });
    assert.equal(doc.activeElement, second);
    api.closeDialog(dlg);
    assert.equal(doc.activeElement, trigger);

    api.openDialog(dlg, { opener: trigger });
    assert.equal(doc.activeElement, first);
    api.closeDialog(dlg);
  } finally {
    restore();
  }
});

test('hidden, disabled, type=hidden, and tabindex=-1 controls are skipped', () => {
  const { api, doc, restore } = install();
  try {
    const visible = button();
    const disabledBtn = button({ disabled: '' });
    const hiddenBtn = button({ hidden: '' });
    const hiddenInput = new FakeElement('input', { type: 'hidden' });
    const skipped = button({ tabindex: '-1' });
    const last = button();
    const dlg = dialogWith(visible, disabledBtn, hiddenBtn, hiddenInput, skipped, last);
    api.openDialog(dlg, {});

    assert.equal(doc.activeElement, visible);

    // Forward wrap from the last visible stop returns to the first one,
    // proving the four skipped controls are not in the tab order.
    last.focus();
    const wrapped = doc.keydown(last, { key: 'Tab' });
    assert.equal(wrapped.defaultPrevented, true);
    assert.equal(doc.activeElement, visible);

    // Backward wrap from the first visible stop lands on the last one.
    const wrappedBack = doc.keydown(visible, { key: 'Tab', shiftKey: true });
    assert.equal(wrappedBack.defaultPrevented, true);
    assert.equal(doc.activeElement, last);

    api.closeDialog(dlg);
  } finally {
    restore();
  }
});

test('dynamic content added after open joins the live tab order', () => {
  const { api, doc, restore } = install();
  try {
    const first = button();
    const dlg = dialogWith(first);
    api.openDialog(dlg, {});
    assert.equal(doc.activeElement, first);

    const late = button();
    dlg.appendChild(late);

    const wrapped = doc.keydown(first, { key: 'Tab', shiftKey: true });
    assert.equal(wrapped.defaultPrevented, true);
    assert.equal(doc.activeElement, late);

    const wrappedForward = doc.keydown(late, { key: 'Tab' });
    assert.equal(wrappedForward.defaultPrevented, true);
    assert.equal(doc.activeElement, first);

    api.closeDialog(dlg);
  } finally {
    restore();
  }
});

test('dialog without focusable content falls back to itself and traps Tab', () => {
  const { api, doc, restore } = install();
  try {
    const dlg = dialogWith();
    api.openDialog(dlg, {});
    assert.equal(doc.activeElement, dlg);
    assert.equal(dlg.getAttribute('tabindex'), '-1');

    const trapped = doc.keydown(dlg, { key: 'Tab' });
    assert.equal(trapped.defaultPrevented, true);
    assert.equal(doc.activeElement, dlg);

    api.closeDialog(dlg);
    assert.equal(dlg.getAttribute('tabindex'), null);
  } finally {
    restore();
  }
});

// --- Background isolation + stack --------------------------------------------

test('background stays isolated until the last stacked dialog closes', () => {
  const { api, doc, restore } = install();
  try {
    const trigger = button();
    doc.body.appendChild(trigger);
    trigger.focus();

    const background = new FakeElement('main');
    const firstA = button();
    const dlgA = dialogWith(firstA);
    const firstB = button();
    const dlgB = dialogWith(firstB);

    api.openDialog(dlgA, { opener: trigger, background: [background] });
    assert.equal(background.inert, true);

    // Lower dialogs isolate like background once covered.
    api.openDialog(dlgB, { background: [background] });
    assert.equal(dlgA.inert, true);
    assert.equal(background.inert, true);
    assert.equal(doc.activeElement, firstB);

    // Escape closes only the top dialog; isolation holds for the rest.
    doc.keydown(firstB, { key: 'Escape' });
    assert.equal(background.inert, true);
    assert.equal(dlgA.inert, false);

    api.closeDialog(dlgA);
    assert.equal(background.inert, false);
    assert.equal(doc.activeElement, trigger);
    assert.equal(doc.listenerCount('keydown'), 0);
    assert.equal(doc.listenerCount('focusin'), 0);
  } finally {
    restore();
  }
});

test('Escape closes exactly the top dialog and restores focus inside the next one', () => {
  const { api, doc, restore } = install();
  try {
    const a1 = button();
    const a2 = button();
    const dlgA = dialogWith(a1, a2);
    const b1 = button();
    const b2 = button();
    const dlgB = dialogWith(b1, b2);
    const background = new FakeElement('main');

    api.openDialog(dlgA, { background: [background] });
    api.openDialog(dlgB, { background: [background] });
    assert.equal(doc.activeElement, b1);

    doc.keydown(b2, { key: 'Escape' });
    assert.equal(background.inert, true);
    assert.equal(doc.activeElement, a1);

    // Tab now wraps inside A only.
    a2.focus();
    doc.keydown(a2, { key: 'Tab' });
    assert.equal(doc.activeElement, a1);

    api.closeDialog(dlgA);
    assert.equal(background.inert, false);
  } finally {
    restore();
  }
});

test('prior inert state is preserved instead of blindly cleared', () => {
  const { api, doc, restore } = install();
  try {
    const alreadyInert = new FakeElement('main', { inert: '' });
    const first = button();
    const dlg = dialogWith(first);

    api.openDialog(dlg, { background: [alreadyInert] });
    assert.equal(alreadyInert.inert, true);
    api.closeDialog(dlg);
    assert.equal(alreadyInert.inert, true);
    assert.ok(alreadyInert.hasAttribute('inert'));
  } finally {
    restore();
  }
});

test('an ancestor passed as background is never made inert', () => {
  const { api, doc, restore } = install();
  try {
    const shell = new FakeElement('main');
    const first = button();
    const dlg = dialogWith(first);
    shell.appendChild(dlg);

    api.openDialog(dlg, { background: [shell] });
    assert.equal(shell.inert, false);
    assert.equal(doc.activeElement, first);
    api.closeDialog(dlg);
  } finally {
    restore();
  }
});

// --- Opener fallbacks ----------------------------------------------------------

test('removed or hidden opener falls back instead of stranding focus', () => {
  const { api, doc, restore } = install();
  try {
    const trigger = button();
    doc.body.appendChild(trigger);
    trigger.focus();
    const dlg = dialogWith(button());
    api.openDialog(dlg, { opener: trigger });

    trigger.remove();
    api.closeDialog(dlg);
    assert.equal(doc.activeElement, doc.body);
  } finally {
    restore();
  }
});

// --- Integration hook + listener hygiene ---------------------------------------

test('onClose runs for integration cleanup; helper never touches classes', () => {
  const { api, doc, restore } = install();
  try {
    let calls = 0;
    const dlg = dialogWith(button());
    dlg.className = 'modal active';

    api.openDialog(dlg, {
      background: [],
      onClose: () => {
        calls += 1;
      },
    });
    api.closeDialog(dlg);
    assert.equal(calls, 1);
    assert.equal(dlg.className, 'modal active');
  } finally {
    restore();
  }
});

test('focus is still restored when onClose throws', () => {
  const { api, doc, restore } = install();
  try {
    const trigger = button();
    doc.body.appendChild(trigger);
    trigger.focus();
    const dlg = dialogWith(button());
    api.openDialog(dlg, {
      opener: trigger,
      onClose: () => {
        throw new Error('cleanup boom');
      },
    });
    assert.throws(() => api.closeDialog(dlg), /cleanup boom/);
    assert.equal(doc.activeElement, trigger);
    assert.equal(doc.listenerCount('keydown'), 0);
  } finally {
    restore();
  }
});

test('reopening the same dialog never duplicates stack entries or listeners', () => {
  const { api, doc, restore } = install();
  try {
    const trigger = button();
    doc.body.appendChild(trigger);
    trigger.focus();
    const background = new FakeElement('main');
    const dlg = dialogWith(button());

    api.openDialog(dlg, { opener: trigger, background: [background] });
    api.openDialog(dlg, { opener: trigger, background: [background] });
    api.openDialog(dlg, {});

    assert.equal(doc.addCalls.filter((type) => type === 'keydown').length, 1);

    // A single close drains the one entry: isolation releases and the
    // opener regains focus. A duplicated entry would keep both.
    api.closeDialog(dlg);
    assert.equal(background.inert, false);
    assert.equal(doc.activeElement, trigger);
    assert.equal(doc.listenerCount('keydown'), 0);
  } finally {
    restore();
  }
});

test('closing an unknown or invalid element is a silent no-op', () => {
  const { api, doc, restore } = install();
  try {
    const dlg = dialogWith(button());
    api.openDialog(dlg, {});
    const before = doc.activeElement;

    api.closeDialog(dialogWith(button()));
    api.closeDialog(null);
    assert.equal(doc.activeElement, before);
    assert.equal(doc.listenerCount('keydown'), 1);

    api.closeDialog(dlg);
    assert.equal(doc.listenerCount('keydown'), 0);
  } finally {
    restore();
  }
});

test('closing the top dialog never restores focus into the inert background', () => {
  const { api, doc, restore } = install();
  try {
    const trigger = button();
    const bgAction = button();
    doc.body.appendChild(trigger);
    doc.body.appendChild(bgAction);
    trigger.focus();

    const background = new FakeElement('main');
    const a1 = button();
    const a2 = button();
    const dlgA = dialogWith(a1, a2);
    const b1 = button();
    const dlgB = dialogWith(b1);

    api.openDialog(dlgA, { opener: trigger, background: [background] });
    // B opens from a background control while A still isolates the page.
    api.openDialog(dlgB, { opener: bgAction, background: [background] });
    assert.equal(doc.activeElement, b1);

    api.closeDialog(dlgB);
    // bgAction is visible and connected but sits in the still-inert
    // background: focus must land inside the surviving top dialog instead.
    assert.equal(doc.activeElement, a1);
    assert.equal(background.inert, true);

    api.closeDialog(dlgA);
    assert.equal(background.inert, false);
    assert.equal(doc.activeElement, trigger);
  } finally {
    restore();
  }
});

test('closing a covered dialog leaves focus untouched in the top dialog', () => {
  const { api, doc, restore } = install();
  try {
    const trigger = button();
    doc.body.appendChild(trigger);
    trigger.focus();

    const background = new FakeElement('main');
    const a1 = button();
    const dlgA = dialogWith(a1);
    const b1 = button();
    const b2 = button();
    const dlgB = dialogWith(b1, b2);

    api.openDialog(dlgA, { opener: trigger, background: [background] });
    api.openDialog(dlgB, { background: [background] });
    assert.equal(doc.activeElement, b1);

    // A is covered, not top: closing it must not yank focus to its opener.
    api.closeDialog(dlgA);
    assert.equal(doc.activeElement, b1);
    assert.equal(background.inert, true);

    // The surviving top dialog still owns Escape and the tab order.
    doc.keydown(b2, { key: 'Escape' });
    assert.equal(background.inert, false);
    assert.equal(doc.listenerCount('keydown'), 0);
  } finally {
    restore();
  }
});

test('focus escaping to the background is pulled back into the top dialog', () => {
  const { api, doc, restore } = install();
  try {
    const outside = button();
    doc.body.appendChild(outside);
    const first = button();
    const dlg = dialogWith(first, button());
    api.openDialog(dlg, {});

    doc.dispatch('focusin', outside);
    assert.equal(doc.activeElement, first);

    api.closeDialog(dlg);
  } finally {
    restore();
  }
});
