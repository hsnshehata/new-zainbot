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
