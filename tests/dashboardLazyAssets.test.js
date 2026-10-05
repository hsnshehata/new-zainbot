'use strict';

// F05 — lazy feature assets: loader behavior (fake DOM) + dashboard wiring
// (source asserts) + summary init contract + byte-overhead sanity.
// Eager tags for both chunks are gone from dashboard.html; the loader is the
// only eager mechanism and fetches on first tab entry ONLY.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const workspace = path.resolve(__dirname, '..');
const loaderSource = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard-assets.js'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
const dashboardHtml = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
const summarySource = fs.readFileSync(path.join(workspace, 'public', 'js', 'settings-summary.js'), 'utf8');

// ---------- fake document with manual script outcomes ----------

function makeScriptDoc() {
  const appended = [];
  const scripts = [];
  return {
    appended,
    scripts,
    createElement(tag) {
      const el = {
        tagName: tag,
        src: '',
        async: false,
        onload: null,
        onerror: null,
      };
      scripts.push(el);
      return el;
    },
    head: {
      appendChild(el) {
        appended.push(el);
      },
    },
  };
}

function loadLoader(doc, winExtra = {}) {
  const module = { exports: {} };
  const sandboxWindow = { document: doc, ...winExtra };
  const run = new Function('window', 'document', 'module', 'exports', `${loaderSource}; return { assets: window.ZainBotDashboardAssets, scope: window };`);
  return run(sandboxWindow, doc, module, module.exports);
}

function fireLoad(el, win, namespace, api) {
  win[namespace] = api;
  el.onload();
}

const flush = async (n = 4) => {
  for (let i = 0; i < n; i++) await new Promise((resolve) => setImmediate(resolve));
};

// ---------- loader contract (§7.5) ----------

test('unknown feature ids reject without touching the DOM', async () => {
  const doc = makeScriptDoc();
  const { assets } = loadLoader(doc, {});
  await assert.rejects(assets.loadFeature('nope'), /unknown feature/);
  await assert.rejects(assets.loadFeature('../evil.js'), /unknown feature/);
  assert.equal(doc.appended.length, 0, 'zero requests before a valid first tab entry');
});

test('static map holds versioned same-origin URLs only', () => {
  const doc = makeScriptDoc();
  const { assets } = loadLoader(doc, {});
  assert.deepEqual(Object.keys(assets.FEATURES).sort(), ['ideaCouncil', 'settingsSummary']);
  for (const url of Object.values(assets.FEATURES)) {
    assert.ok(url.startsWith('/js/'), `chunk URL must be same-origin static: ${url}`);
    assert.match(url, /\?v=\d+-f\d+/, `chunk URL must carry a version: ${url}`);
    assert.ok(!url.includes('..'), 'no path traversal in the static map');
  }
  assert.throws(() => { assets.FEATURES.ideaCouncil = 'x'; }, undefined, 'map mutation attempt');
  assert.ok(assets.FEATURES.ideaCouncil.startsWith('/js/'), 'frozen map survives tampering');
});

test('first load appends one script; concurrent callers share it', async () => {
  const doc = makeScriptDoc();
  const { assets, scope } = loadLoader(doc, {});
  const api = { create: () => ({}) };
  const p1 = assets.loadFeature('ideaCouncil');
  const p2 = assets.loadFeature('ideaCouncil');
  const p3 = assets.loadFeature('ideaCouncil');
  assert.equal(doc.appended.length, 1, 'repeated clicks = 1 request');
  assert.ok(doc.appended[0].src.endsWith('.js?v=20261005-f05'), 'versioned chunk URL requested');
  assert.equal(p1, p2, 'concurrent entries share one promise');
  assert.equal(p2, p3);
  fireLoad(doc.scripts[0], scope, 'ZainBotIdeaCouncil', api);
  assert.equal(await p1, api);
  assert.equal(await p2, api);
});

test('loaded namespace resolves with zero new requests', async () => {
  const doc = makeScriptDoc();
  const api = { create: () => ({}) };
  const { assets } = loadLoader(doc, { ZainBotIdeaCouncil: api });
  assert.equal(await assets.loadFeature('ideaCouncil'), api);
  assert.equal(doc.appended.length, 0, 'no request when already present');
});

test('onload without namespace rejects (HTML error page is not a chunk)', async () => {
  const doc = makeScriptDoc();
  const { assets } = loadLoader(doc, {});
  const p = assets.loadFeature('settingsSummary');
  assert.equal(doc.appended.length, 1);
  doc.scripts[0].onload();
  await flush();
  await assert.rejects(p, /namespace missing/);
});

test('failure evicts: manual retry issues a fresh request, then dedupes', async () => {
  const doc = makeScriptDoc();
  const { assets, scope } = loadLoader(doc, {});
  const api = { init: () => true };
  const first = assets.loadFeature('settingsSummary');
  doc.scripts[0].onerror();
  await flush();
  await assert.rejects(first, /failed to load/);
  const second = assets.loadFeature('settingsSummary');
  assert.equal(doc.appended.length, 2, 'evicted failure retries with a new request');
  assert.notEqual(first, second, 'retry is a new promise, not the rejected one');
  fireLoad(doc.scripts[1], scope, 'ZainBotSettingsSummary', api);
  assert.equal(await second, api);
  const third = assets.loadFeature('settingsSummary');
  assert.equal(doc.appended.length, 2, 'success dedupes afterwards');
  assert.equal(await third, api);
});

// ---------- dashboard wiring (source asserts; IIFE internals) ----------

test('council chunk loads on first tab entry with a stale guard, never at boot', () => {
  assert.ok(!dashboardSource.includes('ideaCouncilModule.init();\n  checkAuthAndLoad();'), 'boot must not init council eagerly');
  assert.ok(dashboardSource.includes('enterCouncilTab();'), 'tab entry must run the lazy bootstrap');
  assert.ok(dashboardSource.includes('councilLoadToken'), 'a load token must exist for the stale guard');
  assert.match(dashboardSource, /activeTab === 'page-idea-council'/, 'continuation must re-check the active tab');
  assert.match(dashboardSource, /loadFeature\('ideaCouncil'\)/, 'council must load through the loader map');
  assert.ok(dashboardSource.includes('showCouncilLoading();'), 'loading UI must show while fetching');
  assert.ok(dashboardSource.includes('showCouncilLoadError('), 'failure must surface with manual retry');
  assert.ok(dashboardSource.includes("ideaChunkRetryBtn"), 'retry button must exist for the failed load');
  assert.ok(dashboardSource.includes('councilChunkReady = true;'), 'ready flag must skip loading UI on later entries');
});

test('settings chunk loads on first settings entry with explicit init', () => {
  assert.match(dashboardSource, /loadFeature\('settingsSummary'\)/, 'settings must load through the loader map');
  assert.ok(dashboardSource.includes('window.ZainBotSettingsSummary.init();') || dashboardSource.includes('ZainBotSettingsSummary.init();'), 'summary must use explicit init()');
  assert.ok(!dashboardSource.includes('setTimeout(window.__zainbotRenderSettingsSummary, 80);'), 'old eager 80ms render must be gone (entry init replaces it)');
  // Kept freshness paths (all guarded, lazy-safe):
  assert.ok(dashboardSource.includes('setTimeout(window.__zainbotRenderSettingsSummary, 60);'), 'bot-refresh re-render must stay');
  assert.ok(dashboardSource.includes('setTimeout(window.__zainbotRenderSettingsSummary, 150);'), 'post-save re-render must stay (E03)');
});

test('language switch never touches unloaded chunks', () => {
  // applyLanguage renders via guarded globals + the C03 registry only.
  const applyStart = dashboardSource.indexOf('function applyLanguage(');
  assert.notEqual(applyStart, -1);
  const applyEnd = dashboardSource.indexOf('function switchTab(');
  const applyBody = dashboardSource.slice(applyStart, applyEnd);
  assert.ok(!applyBody.includes('ideaCouncilModule'), 'applyLanguage must not call the unloaded council module');
  assert.ok(!applyBody.includes('ZainBotSettingsSummary'), 'applyLanguage must not call the unloaded summary module');
  assert.ok(applyBody.includes('__zainbotRenderSettingsSummary'), 'summary re-render stays guarded (no-op before load)');
  assert.ok(dashboardSource.includes('lazy_load_failed'), 'failure key must be referenced for translation');
});

test('lazy failure key ships in both dictionaries', () => {
  for (const lang of ['en', 'ar']) {
    const start = dashboardSource.indexOf(`    ${lang}: {`);
    assert.notEqual(start, -1);
    const endMarker = lang === 'en' ? '    ar: {' : '  };\n\n  // Helper: Get JWT token from storage';
    const section = dashboardSource.slice(start, dashboardSource.indexOf(endMarker, start + 1));
    assert.ok(section.includes('lazy_load_failed:'), `lazy_load_failed must exist in ${lang}`);
  }
});

// ---------- summary init contract (factory, isolated per test) ----------

function summaryDoc() {
  const byId = new Map();
  const el = () => {
    const listeners = {};
    return {
      innerHTML: '',
      textContent: '',
      value: '',
      style: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      setAttribute() {},
      getAttribute() { return null; },
      addEventListener(type, fn) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      appendChild() {},
      _listeners: listeners,
    };
  };
  return {
    _byId: byId,
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, el());
      return byId.get(id);
    },
    querySelectorAll: () => [],
    createElement: el,
    body: el(),
  };
}

function loadSummary(doc) {
  const module = { exports: {} };
  const sandboxWindow = { document: doc };
  const run = new Function('window', 'document', 'module', 'exports', `${summarySource}; return module.exports;`);
  return run(sandboxWindow, doc, module, module.exports);
}

test('summary create() renders from adapter state with key echo, no focus tricks', () => {
  const doc = summaryDoc();
  const { create } = loadSummary(doc);
  const bot = { welcomeMessage: 'Hello', customInstructions: 'a\nb', objectives: [], autoReplyEnabled: false, agentTools: {}, agentSkills: [] };
  const s = create({ getState: () => ({ translations: {}, bot }), t: (k) => k });
  s.init();
  const ins = doc.getElementById('settingsInstructionsSummary');
  const cap = doc.getElementById('settingsCapabilitiesSummary');
  assert.ok(ins.innerHTML.includes('Hello'), 'welcome renders from adapter state');
  assert.ok(ins.innerHTML.includes('2 set_unit_lines'), 'counts use injected t (no dict copy)');
  assert.ok(cap.innerHTML.includes('set_label_tools'), 'capabilities render');
  assert.ok(!summarySource.includes('.focus('), 'summary must stay focus-free (E03)');
  assert.ok(!summarySource.includes("addEventListener('DOMContentLoaded'"), 'no DOMContentLoaded listener (would never fire lazy)');
  assert.ok(!summarySource.includes('refreshActiveBot ='), 'must never patch refreshActiveBot');
});

test('summary init() wires once and repaints every entry', () => {
  const doc = summaryDoc();
  const { create } = loadSummary(doc);
  const bot = { welcomeMessage: 'v1', agentTools: {}, agentSkills: [] };
  let state = { translations: {}, bot };
  const s = create({ getState: () => state, t: (k) => k });
  const trainingBtn = doc.getElementById('openTrainingFromSettingsBtn');
  s.init();
  assert.equal(trainingBtn._listeners.click.length, 1, 'buttons wire exactly once');
  s.init();
  assert.equal(trainingBtn._listeners.click.length, 1, 'repeat entries add no listeners');
  state = { translations: {}, bot: { ...bot, welcomeMessage: 'v2' } };
  s.init();
  assert.ok(doc.getElementById('settingsInstructionsSummary').innerHTML.includes('v2'), 'every entry repaints fresh');
  assert.ok(typeof s.render === 'function', 'render stays exposed for guarded call sites');
});

// ---------- byte overhead sanity ----------

test('loader overhead stays a fraction of the deferred chunk', () => {
  const loaderGzip = zlib.gzipSync(Buffer.from(loaderSource, 'utf8'), { level: 9 }).length;
  const chunkGzip = zlib.gzipSync(fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard-idea-council.js')), { level: 9 }).length;
  const summaryGzip = zlib.gzipSync(fs.readFileSync(path.join(workspace, 'public', 'js', 'settings-summary.js')), { level: 9 }).length;
  assert.ok(loaderGzip < chunkGzip, `loader (${loaderGzip}B) must be smaller than the deferred council chunk (${chunkGzip}B)`);
  assert.ok(loaderGzip < summaryGzip, `loader (${loaderGzip}B) must be smaller than the deferred summary (${summaryGzip}B)`);
});
