'use strict';

// Council live-note retirement: the F05 loading announcement fired into the
// shared #feedbackLiveRegion must be cleared once the list paints — but ONLY
// when the region still holds one of OUR four strings (loading/error x
// en/ar). Any other flow's message stays untouched.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workspace = path.resolve(__dirname, '..');
const dashboardSource = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
const chunkSource = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard-idea-council.js'), 'utf8');

function loadPredicate() {
  const m = dashboardSource.match(/function shouldClearCouncilLiveNote\(currentText\) \{[\s\S]*?\n    \}/);
  assert.ok(m, 'shouldClearCouncilLiveNote present in dashboard_new.js');
  const sandbox = {
    translations: {
      en: { feedback_loading: 'Loading…', lazy_load_failed: 'FAIL-EN' },
      ar: { feedback_loading: 'جارٍ التحميل…', lazy_load_failed: 'FAIL-AR' },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(m[0] + '\nthis.__pred = shouldClearCouncilLiveNote;', sandbox);
  return sandbox.__pred;
}

test('clears our loading note in both languages', () => {
  const pred = loadPredicate();
  assert.equal(pred('جارٍ التحميل…'), true);
  assert.equal(pred('Loading…'), true);
});

test('clears our error note in both languages', () => {
  const pred = loadPredicate();
  assert.equal(pred('FAIL-EN'), true);
  assert.equal(pred('FAIL-AR'), true);
});

test('preserves other flows’ messages, empty and non-strings', () => {
  const pred = loadPredicate();
  assert.equal(pred('تم الحفظ بنجاح!'), false);
  assert.equal(pred('Some other announcement'), false);
  assert.equal(pred(''), false);
  assert.equal(pred(null), false);
  assert.equal(pred(undefined), false);
});

test('chunk calls onListReady after successful list paint (guarded)', () => {
  assert.ok(/onListReady\(\)/.test(chunkSource), 'chunk invokes onListReady');
  assert.ok(/try \{ onListReady\(\); \}/.test(chunkSource), 'hook call is guarded');
  assert.ok(/const onListReady = typeof opts\.onListReady/.test(chunkSource), 'hook is optional dep');
});

test('host wires onListReady into create()', () => {
  assert.ok(/onListReady: \(\) => clearCouncilLiveNote\(\)/.test(dashboardSource), 'host passes the hook');
});

test('stale council load (user navigated away) retires the loading note', () => {
  const hits = dashboardSource.match(/if \(!stillActive\(\)\) \{ clearCouncilLiveNote\(\); return; \}/g) || [];
  assert.equal(hits.length, 2, 'both then() and catch() clear the note on stale runs, none stuck');
});

test('chunk list-API failure replaces the stuck loading note with a real error', () => {
  assert.ok(/feedback\.notify\(\{ level: 'error', key: 'idea_list_error' \}/.test(chunkSource), 'catch notifies idea_list_error');
});

const FEEDBACK_MODULE_PATH = path.join(workspace, 'public', 'js', 'dashboard-feedback.js');

function makeLiveRegionDoc() {
  const attrs = new Map([['id', 'feedbackLiveRegion']]);
  const region = {
    textContent: '',
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
  };
  return {
    region,
    doc: {
      getElementById(id) { return id === 'feedbackLiveRegion' ? region : null; },
    },
  };
}

function loadFreshFeedback() {
  delete require.cache[FEEDBACK_MODULE_PATH];
  return require(FEEDBACK_MODULE_PATH);
}

function loadClearCouncilLiveNote({ doc, feedback }) {
  const predMatch = dashboardSource.match(/function shouldClearCouncilLiveNote\(currentText\) \{[\s\S]*?\n    \}/);
  const clearMatch = dashboardSource.match(/function clearCouncilLiveNote\(\) \{[\s\S]*?\n    \}/);
  assert.ok(predMatch, 'shouldClearCouncilLiveNote present in dashboard_new.js');
  assert.ok(clearMatch, 'clearCouncilLiveNote present in dashboard_new.js');
  const sandbox = {
    translations: {
      en: { feedback_loading: 'Loading…', lazy_load_failed: 'FAIL-EN', other_notice: 'Saved!' },
      ar: { feedback_loading: 'جارٍ التحميل…', lazy_load_failed: 'FAIL-AR', other_notice: 'تم الحفظ!' },
    },
    document: doc,
    window: { ZainBotFeedback: feedback },
  };
  vm.createContext(sandbox);
  vm.runInContext(predMatch[0] + '\n' + clearMatch[0] + '\nthis.__clear = clearCouncilLiveNote;', sandbox);
  return sandbox.__clear;
}

test('clearCouncilLiveNote wires clearNotify so language switch never resurrects stale loading text', () => {
  const dict = {
    en: { feedback_loading: 'Loading…', lazy_load_failed: 'FAIL-EN', other_notice: 'Saved!' },
    ar: { feedback_loading: 'جارٍ التحميل…', lazy_load_failed: 'FAIL-AR', other_notice: 'تم الحفظ!' },
  };
  const tEn = (key) => dict.en[key] || key;
  const tAr = (key) => dict.ar[key] || key;

  // Control: without clearNotify wired (only DOM text cleared), refreshLanguage resurrects the stale note.
  {
    const { doc, region } = makeLiveRegionDoc();
    global.document = doc;
    const feedback = loadFreshFeedback();
    feedback.notify({ level: 'info', key: 'feedback_loading' }, tEn);
    assert.equal(region.textContent, 'Loading…');
    region.textContent = '';
    feedback.refreshLanguage(tAr);
    assert.equal(region.textContent, 'جارٍ التحميل…', 'without clearNotify, refreshLanguage resurrects stale loading text');
    delete global.document;
  }

  // With dashboard_new.js clearCouncilLiveNote() wired to ZainBotFeedback.clearNotify:
  {
    const { doc, region } = makeLiveRegionDoc();
    global.document = doc;
    const feedback = loadFreshFeedback();
    const clearCouncilLiveNote = loadClearCouncilLiveNote({ doc, feedback });

    feedback.notify({ level: 'info', key: 'feedback_loading' }, tEn);
    assert.equal(region.textContent, 'Loading…');
    clearCouncilLiveNote();
    assert.equal(region.textContent, '');
    feedback.refreshLanguage(tAr);
    assert.equal(region.textContent, '', 'language switch after clearCouncilLiveNote must NOT re-post loading text');

    // Same for lazy_load_failed
    feedback.notify({ level: 'error', key: 'lazy_load_failed' }, tEn);
    assert.equal(region.textContent, 'FAIL-EN');
    clearCouncilLiveNote();
    assert.equal(region.textContent, '');
    feedback.refreshLanguage(tAr);
    assert.equal(region.textContent, '', 'language switch after clearing lazy_load_failed must NOT re-post it');

    // Unrelated notification survives clearCouncilLiveNote + language switch (key-scoping)
    feedback.notify({ level: 'success', key: 'other_notice' }, tEn);
    assert.equal(region.textContent, 'Saved!');
    clearCouncilLiveNote();
    assert.equal(region.textContent, 'Saved!', 'DOM keeps unrelated flow message');
    feedback.refreshLanguage(tAr);
    assert.equal(region.textContent, 'تم الحفظ!', 'unrelated lastNotify still refreshes on language switch');

    delete global.document;
  }
});

test('clearCouncilLiveNote guards missing ZainBotFeedback or missing clearNotify', () => {
  const { doc, region } = makeLiveRegionDoc();
  region.textContent = 'Loading…';
  const clearWithoutFeedback = loadClearCouncilLiveNote({ doc, feedback: null });
  assert.doesNotThrow(() => clearWithoutFeedback());
  assert.equal(region.textContent, '');

  region.textContent = 'جارٍ التحميل…';
  const clearWithoutFn = loadClearCouncilLiveNote({ doc, feedback: {} });
  assert.doesNotThrow(() => clearWithoutFn());
  assert.equal(region.textContent, '');
});
