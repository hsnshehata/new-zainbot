'use strict';

// F04b — council eager-chunk contracts: helper behavior (fake DOM) + shim
// wiring (source asserts) + single-init + key parity (F-owned coverage for
// the moved t('…') refs; tests/dashboardTranslations.test.js is C01-owned
// and untouched by this task).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const chunkPath = path.join(workspace, 'public', 'js', 'dashboard-idea-council.js');
const chunkSource = fs.readFileSync(chunkPath, 'utf8');
const dashboardSource = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
const dashboardHtml = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');

// ---------- minimal fake DOM (no jsdom in this repo) ----------

function makeEl() {
  const listeners = {};
  const el = {
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    selectedIndex: 0,
    options: [],
    style: {},
    dataset: {},
    className: '',
    classList: {
      _set: [],
      add(...c) { this._set.push(...c); },
      remove(...c) { this._set = this._set.filter((x) => !c.includes(x)); },
      toggle() {},
      contains(x) { return this._set.includes(x); },
    },
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    appendChild() {},
    remove() {},
    click() {},
    focus() {},
    closest() { return null; },
    querySelectorAll(sel) {
      // innerHTML-aware: fabricate one fake per data-id for council lists.
      // Memoized per selector so listeners attached by the code under test
      // are visible to later test queries of the same selector.
      this._qsaCache = this._qsaCache || {};
      const cacheKey = `${sel}::${this.innerHTML.length}`;
      if (!this._qsaCache[cacheKey]) {
        if (!sel.startsWith('.idea-')) {
          this._qsaCache[cacheKey] = [];
        } else {
          const ids = [...new Set([...this.innerHTML.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]))];
          this._qsaCache[cacheKey] = ids.map((id) => {
            const item = makeEl();
            item.getAttribute = (n) => (n === 'data-id' ? id : null);
            item._dataId = id;
            return item;
          });
        }
      }
      return this._qsaCache[cacheKey];
    },
    _listeners: listeners,
  };
  return el;
}

function makeDocument() {
  const byId = new Map();
  const bySelector = new Map();
  return {
    _byId: byId,
    _bySelector: bySelector,
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, makeEl());
      return byId.get(id);
    },
    querySelector(sel) {
      if (sel === '.db-wrapper') return makeEl();
      return null;
    },
    querySelectorAll(sel) {
      return bySelector.get(sel) || [];
    },
    createElement() { return makeEl(); },
    body: makeEl(),
  };
}

function loadChunk(doc, winExtra = {}) {
  const module = { exports: {} };
  const sandboxWindow = { document: doc, ...winExtra };
  const run = new Function('window', 'document', 'module', 'exports', `${chunkSource}; return window.ZainBotIdeaCouncil;`);
  return run(sandboxWindow, doc, module, module.exports);
}

const fakeT = (key, fallback = '') => fallback || key;
const fakeLang = () => 'en';

function makeCouncil(doc) {
  const api = loadChunk(doc);
  return api.create({
    t: fakeT,
    getLanguage: fakeLang,
    requestJson: async () => null,
    fetchBlob: async () => ({ blob: null, filename: 'download' }),
  });
}

function makeRequestJson(routes = {}) {
  const calls = [];
  const fn = async (url, options = {}, policy = {}) => {
    calls.push({ url, options, policy });
    const key = `${options.method || 'GET'} ${url}`;
    if (routes[key] instanceof Error) throw routes[key];
    if (routes[key] !== undefined) return routes[key];
    return { success: false };
  };
  fn.calls = calls;
  return fn;
}

function makeFetchBlob(routes = {}) {
  const calls = [];
  const fn = async (url, options = {}, policy = {}) => {
    calls.push({ url, options, policy });
    if (routes[url] instanceof Error) throw routes[url];
    if (routes[url] !== undefined) return routes[url];
    return { blob: 'BLOB', filename: 'server.md' };
  };
  fn.calls = calls;
  return fn;
}

function makeCouncilFull(doc, opts = {}) {
  const api = loadChunk(doc, opts.winExtra);
  const req = makeRequestJson(opts.routes);
  const blob = makeFetchBlob(opts.blobRoutes);
  const council = api.create({
    t: opts.t || fakeT,
    getLanguage: opts.lang || fakeLang,
    requestJson: req,
    fetchBlob: blob,
    a11y: opts.a11y,
  });
  return { council, req, blob, api };
}

const flush = async (n = 4) => {
  for (let i = 0; i < n; i++) await new Promise((resolve) => setImmediate(resolve));
};

// ---------- contract shape + single-init ----------

test('create() requires t + getLanguage + requestJson + fetchBlob', () => {
  const api = loadChunk(makeDocument());
  const req = makeRequestJson();
  const blob = makeFetchBlob();
  const base = { t: fakeT, getLanguage: fakeLang, requestJson: req, fetchBlob: blob };
  assert.throws(() => api.create({ ...base, t: undefined }), /requires t/);
  assert.throws(() => api.create({ ...base, getLanguage: undefined }), /requires getLanguage/);
  assert.throws(() => api.create({ ...base, requestJson: undefined }), /requires requestJson/);
  assert.throws(() => api.create({ ...base, fetchBlob: undefined }), /requires fetchBlob/);
  const c = api.create(base);
  for (const name of ['init', 'load', 'dispose', 'refreshLanguage', 'selectRun', 'paintIdeaList']) {
    assert.equal(typeof c[name], 'function', `${name} must be a function`);
  }
  for (const name of ['escapeIdeaHtml', 'showIdeaView', 'renderIdeaReport', 'renderTruthBoard', 'updateFollowupTypeButtons', 'openIdea', 'saveIdeaDraft', 'submitFollowupModal', 'loadIdeaCouncilList', 'handleConveneCouncilSubmit', 'startIdeaPolling', 'exportIdeaReport']) {
    assert.equal(typeof c[name], 'function', `moved controller/helper ${name} must be exposed`);
  }
  assert.equal(typeof c.getState, 'undefined', 'host-side state accessor must be gone (F04d)');
});

test('init() wires host-free and stays single-shot', () => {
  const full = makeCouncilFull(makeDocument());
  assert.equal(full.council.init(), true);
  assert.equal(full.council.init(), false);
});

test('dispose() releases the init claim; load() runs usage+list', async () => {
  const doc = makeDocument();
  const { council, req } = makeCouncilFull(doc, {
    routes: {
      'GET /api/idea-council/usage': { success: true, data: { ideasRemaining: 2, monthlyLimit: 3 } },
      'GET /api/idea-council/ideas': { success: true, data: [] },
    },
  });
  assert.equal(council.init(), true);
  council.dispose();
  assert.equal(council.init(), true);
  await council.load();
  assert.equal(doc.getElementById('ideaQuotaRemaining').textContent, 2);
  assert.equal(council.refreshLanguage(), true, 'loaded empty list repaints without fetch');
  const fresh = makeCouncilFull(makeDocument());
  assert.equal(fresh.council.refreshLanguage(), false, 'nothing cached yet paints nothing');
});

// ---------- pure helper behavior ----------

test('escapeIdeaHtml escapes markup and blanks', () => {
  const c = makeCouncil(makeDocument());
  assert.equal(c.escapeIdeaHtml(''), '');
  assert.equal(c.escapeIdeaHtml(null), '');
  assert.equal(
    c.escapeIdeaHtml('<img src=x onerror="a&b">\'"'),
    '&lt;img src=x onerror=&quot;a&amp;b&quot;&gt;&#039;&quot;'
  );
});

test('showIdeaView toggles exactly the requested view', () => {
  const doc = makeDocument();
  const c = makeCouncil(doc);
  c.showIdeaView('card');
  assert.equal(doc._byId.get('ideaCardView').style.display, 'block');
  assert.equal(doc._byId.get('ideaListView').style.display, 'none');
  assert.equal(doc._byId.get('ideaReportView').style.display, 'none');
});

test('updateIdeaCharCount paints count + range color', () => {
  const doc = makeDocument();
  const c = makeCouncil(doc);
  doc.getElementById('ideaRawText').value = 'x'.repeat(150);
  c.updateIdeaCharCount();
  assert.equal(doc.getElementById('ideaCharCount').textContent, '150 / 8,000');
  assert.equal(doc.getElementById('ideaCharCount').style.color, 'var(--cyan)');
  doc.getElementById('ideaRawText').value = 'short';
  c.updateIdeaCharCount();
  assert.equal(doc.getElementById('ideaCharCount').style.color, 'var(--text-muted)');
});

test('populateStructuredCardForm maps card fields to inputs', () => {
  const doc = makeDocument();
  const c = makeCouncil(doc);
  c.populateStructuredCardForm({ title: 'T', coreProblem: 'P', currentAlternatives: ['a', 'b'] });
  assert.equal(doc.getElementById('ideaCardFldTitle').value, 'T');
  assert.equal(doc.getElementById('ideaCardFldProblem').value, 'P');
  assert.equal(doc.getElementById('ideaCardFldAlternatives').value, 'a, b');
});

test('renderCouncilAgentsGrid escapes hostile agent content via t-echo keys', () => {
  const doc = makeDocument();
  const c = makeCouncil(doc);
  c.renderCouncilAgentsGrid([{ role: 'COLD_CUSTOMER', status: 'COMPLETED', output: { summary: '<script>alert(1)</script>' } }]);
  const html = doc.getElementById('ideaAgentsGrid').innerHTML;
  assert.ok(!html.includes('<script>'), 'agent output must be escaped');
  assert.ok(html.includes('&lt;script&gt;'), 'escaped output must be present');
  assert.ok(html.includes('COLD_CUSTOMER'), 'member label resolves through injected t (fallback echo, no dict copy)');
});

test('renderIdeaReport returns the active run id and honors explicit selection', () => {
  const doc = makeDocument();
  const host = {};
  const c = makeCouncil(doc, host);
  const idea = {
    _id: 'idea1',
    runs: [
      { runId: 'r1', roundNumber: 1, agents: [], finalReport: { verdict: 'BUILD' } },
      { runId: 'r2', roundNumber: 2, agents: [], finalReport: { verdict: 'BUILD' } },
    ],
  };
  const active = c.renderIdeaReport(idea, null, null, null);
  assert.equal(active, 'r2', 'defaults to the latest run');
  assert.ok(doc.getElementById('ideaVerdictBadge').textContent.length > 0, 'verdict badge must paint');
  const reselect = c.renderIdeaReport(idea, 'r1', null, active);
  assert.equal(reselect, 'r1', 'explicit selection wins; prev id threads through');
});

test('renderTruthBoard routes updates through the injected updater, never a global', () => {
  const doc = makeDocument();
  const calls = [];
  const c = makeCouncil(doc);
  const sel = makeEl();
  sel.getAttribute = () => 'item-7';
  sel.value = 'VERIFIED';
  const container = doc.getElementById('truthBoardItemsList');
  container.querySelectorAll = () => [sel];
  c.renderTruthBoard([{ _id: 'item-7', title: 'Claim', status: 'OPEN' }], async (...args) => { calls.push(args); });
  assert.ok(container.innerHTML.includes('item-7'), 'truth items must render');
  assert.equal(sel._listeners.change.length, 1, 'status select must be wired');
  return sel._listeners.change[0]().then(() => {
    assert.deepEqual(calls[0][0], 'item-7');
    assert.deepEqual(calls[0][1], { status: 'VERIFIED', workflowState: 'VERIFIED' });
  });
});

test('updateFollowupTypeButtons paints selection without owning state', () => {
  const doc = makeDocument();
  const btnA = makeEl();
  btnA.getAttribute = () => 'DEFEND';
  const btnB = makeEl();
  btnB.getAttribute = () => 'PIVOT';
  doc._bySelector.set('.idea-fup-type-btn', [btnA, btnB]);
  const c = makeCouncil(doc);
  c.updateFollowupTypeButtons('PIVOT');
  assert.equal(btnB.style.color, '#fff');
  assert.equal(btnA.style.color, '');
  assert.equal(doc.getElementById('ideaFollowupModalIcon').className, 'fas fa-shuffle');
});

test('unit-economics helpers compute without throwing', () => {
  const doc = makeDocument();
  const c = makeCouncil(doc);
  doc.getElementById('ideaCalcRangeAov').value = '100';
  doc.getElementById('ideaCalcRangeMargin').value = '50';
  doc.getElementById('ideaCalcRangeDirectCosts').value = '10';
  doc.getElementById('ideaCalcRangeFixedCosts').value = '3000';
  c.updateUnitEconomicsDisplay('EGP');
  assert.ok(doc.getElementById('ideaCalcNetContribution').textContent.includes('EGP'));
  c.renderUnitEconomics({ aov: 100, marginPct: 50 });
});

// ---------- shim wiring (source asserts, no behavior change by construction) ----------

test('dashboard_new.js bootstraps council lazily: entry flow + on-demand instance', () => {
  assert.ok(dashboardSource.includes('window.ZainBotIdeaCouncil.create({'), 'chunk instance must be created with the contract deps');
  assert.ok(dashboardSource.includes('requestJson: (...args) => window.ZainBotRequest.requestJson(...args)'), 'transport must come from the D02 primitive');
  assert.ok(dashboardSource.includes('fetchBlob: (...args) => window.ZainBotRequest.fetchBlob(...args)'), 'blob transport must come from the D02-blob primitive');
  assert.ok(dashboardSource.includes('function enterCouncilTab()'), 'tab entry must run the lazy bootstrap');
  assert.ok(dashboardSource.includes('function ensureCouncilModule()'), 'instance must be created on demand, not at parse');
  assert.ok(!dashboardSource.includes('ideaCouncilModule.init();\n  checkAuthAndLoad();'), 'boot must not init council eagerly');
  const refs = dashboardSource.match(/ideaCouncilModule/g) || [];
  assert.ok(refs.length <= 8, `council surface in dashboard must stay tiny (got ${refs.length})`);
  for (const gone of ['function openIdea(', 'function renderCouncilAgentsGrid(', 'function startIdeaPolling(', 'function exportIdeaReport(', 'ideaPollTimer', 'getState(', 'onStartPolling', 'onExportReport', 'host:']) {
    assert.ok(!dashboardSource.includes(gone), `no council leftover may remain host-side: ${gone}`);
  }
  assert.ok(!chunkSource.includes('translations['), 'chunk must not read dictionaries directly');
  assert.ok(!chunkSource.includes('ideaT('), 'chunk must not use the host helper (uses injected t)');
});

test('dashboard.html loads chunks lazily via the loader (F05: no eager chunk tags)', () => {
  const loaderTag = dashboardHtml.indexOf('js/dashboard-assets.js?v=');
  const mainTag = dashboardHtml.indexOf('js/dashboard_new.js?v=');
  assert.ok(loaderTag !== -1, 'eager loader tag must exist (loads chunks on demand)');
  assert.ok(mainTag !== -1, 'main tag must keep its version');
  assert.ok(loaderTag < mainTag, 'loader must load before dashboard_new.js');
  assert.ok(dashboardHtml.indexOf('js/dashboard-idea-council.js?v=') === -1, 'council chunk must NOT be eager (first-tab-entry load)');
  assert.ok(dashboardHtml.indexOf('js/settings-summary.js?v=') === -1, 'summary chunk must NOT be eager (first-settings-entry load)');
});

// ---------- key parity for moved refs (C01 file untouched) ----------

test('every t() key + idea_* literal in the chunk exists in both dictionaries', () => {
  const called = new Set([...chunkSource.matchAll(/(?<![A-Za-z0-9_$])t\(\s*['"]([A-Za-z0-9_]+)['"]/g)].map((m) => m[1]));
  const literals = new Set([...chunkSource.matchAll(/['"]((?:idea|member)_[A-Za-z0-9_]+)['"]/g)].map((m) => m[1]).filter((k) => !k.endsWith('_')));
  const refs = new Set([...called, ...literals]);
  // idea_report is a download-filename default, not an i18n key.
  refs.delete('idea_report');
  assert.ok(refs.size > 80, `expected the moved key surface (got ${refs.size})`);
  for (const lang of ['en', 'ar']) {
    const start = dashboardSource.indexOf(`    ${lang}: {`);
    assert.notEqual(start, -1, `missing ${lang} dictionary`);
    const endMarker = lang === 'en' ? '    ar: {' : '  };\n\n  // Helper: Get JWT token from storage';
    const end = dashboardSource.indexOf(endMarker, start + 1);
    const section = dashboardSource.slice(start, end);
    const missing = [...refs].filter((k) => !section.includes(`${k}:`));
    assert.deepEqual(missing, [], `chunk keys missing from ${lang}: ${missing.join(', ')}`);
  }
});

// ---------- F04c controller behavior (scripted requestJson) ----------

const DRAFT_IDEA = { _id: 'idea-1', status: 'DRAFT', rawIdea: { rawText: 'x'.repeat(150) } };

function seedDraftInputs(doc, text = 'x'.repeat(150)) {
  doc.getElementById('ideaRawText').value = text;
  doc.getElementById('ideaTargetMarket').value = '';
  doc.getElementById('ideaTargetAudience').value = '';
  doc.getElementById('ideaPrimaryConcern').value = '';
  doc.getElementById('ideaOutputLang').value = 'ar';
}

test('saveIdeaDraft validates length, then POSTs (new) or PUTs (existing)', async () => {
  const doc = makeDocument();
  const alerts = [];
  const realAlert = globalThis.alert;
  globalThis.alert = (m) => { alerts.push(m); };
  try {
    const { council, req } = makeCouncilFull(doc, {
      routes: {
        'POST /api/idea-council/draft': { success: true, data: { _id: 'idea-9', status: 'DRAFT' } },
        'PUT /api/idea-council/draft/idea-9': { success: true, data: { _id: 'idea-9', status: 'DRAFT' } },
      },
    });
    seedDraftInputs(doc, 'too short');
    assert.equal(await council.saveIdeaDraft(false), null);
    assert.equal(req.calls.length, 0, 'validation failure must not fetch');
    assert.equal(alerts.length, 1, 'manual save must surface validation');

    seedDraftInputs(doc);
    const out = await council.saveIdeaDraft(false);
    assert.deepEqual(out, { _id: 'idea-9', status: 'DRAFT' });
    assert.equal(req.calls[0].url, '/api/idea-council/draft');
    assert.equal(req.calls[0].options.method, 'POST');
    assert.equal(req.calls[0].policy.operation, 'mutation');
    assert.equal(typeof req.calls[0].policy.onUnauthorized, 'function');
    // State proof, behaviorally: the next save PUTs to the created id.
    seedDraftInputs(doc);
    await council.saveIdeaDraft(true);
    assert.ok(req.calls.some((c) => c.url === '/api/idea-council/draft/idea-9' && c.options.method === 'PUT'), 'second save must PUT to the created draft');
    assert.equal(doc.getElementById('ideaAutoSaveStatus').textContent, 'idea_msg_saved');
  } finally {
    globalThis.alert = realAlert;
  }
});

test('saveIdeaDraft PUTs when a draft exists; silent mode stays quiet', async () => {
  const doc = makeDocument();
  const { council, req } = makeCouncilFull(doc, {
    routes: {
      'GET /api/idea-council/ideas/idea-1': { success: true, data: DRAFT_IDEA },
      'PUT /api/idea-council/draft/idea-1': { success: true, data: DRAFT_IDEA },
    },
  });
  await council.openIdea('idea-1');
  assert.equal(doc.getElementById('ideaRawText').value, 'x'.repeat(150));
  seedDraftInputs(doc);
  await council.saveIdeaDraft(true);
  const put = req.calls.find((c) => c.url === '/api/idea-council/draft/idea-1');
  assert.ok(put, 'existing draft must PUT');
  assert.equal(put.policy.operation, 'mutation');
});

test('structure submit saves silently, then structures into the card view', async () => {
  const doc = makeDocument();
  const { council, req } = makeCouncilFull(doc, {
    routes: {
      'POST /api/idea-council/draft': { success: true, data: { _id: 'idea-2', status: 'DRAFT' } },
      'POST /api/idea-council/ideas/idea-2/structure': { success: true, data: { structuredCard: { title: 'T' } } },
    },
  });
  seedDraftInputs(doc);
  await council.handleIdeaStructureSubmit({ preventDefault() {} });
  const urls = req.calls.map((c) => `${c.options.method || 'GET'} ${c.url}`);
  assert.deepEqual(urls, ['POST /api/idea-council/draft', 'POST /api/idea-council/ideas/idea-2/structure']);
  assert.ok(req.calls.every((c) => c.policy.operation === 'mutation'), 'writes must be untimed mutations');
  assert.equal(doc.getElementById('ideaCardFldTitle').value, 'T');
  assert.equal(doc.getElementById('ideaCardView').style.display, 'block');
});

test('convene persists the card, sends idempotency, starts polling', async () => {
  const doc = makeDocument();
  const { council, req } = makeCouncilFull(doc, {
    routes: {
      'GET /api/idea-council/ideas/idea-1': { success: true, data: { ...DRAFT_IDEA, status: 'AWAITING_CONFIRMATION', structuredCard: {} } },
      'PUT /api/idea-council/ideas/idea-1/card': { success: true, data: {} },
      'POST /api/idea-council/ideas/idea-1/convene': { success: true, runId: 'run-7' },
      'GET /api/idea-council/usage': { success: true, data: { ideasRemaining: 2 } },
      'GET /api/idea-council/runs/run-7': { success: true, data: { status: 'RUNNING', stage: 'RESEARCH', agents: [] } },
    },
  });
  await council.openIdea('idea-1');
  doc.getElementById('ideaConfirmCheckbox').checked = true;
  await council.handleConveneCouncilSubmit({ preventDefault() {} });
  const convene = req.calls.find((c) => c.url === '/api/idea-council/ideas/idea-1/convene');
  assert.ok(convene, 'convene must fire');
  assert.ok(convene.options.headers['Idempotency-Key'].startsWith('convene-idea-1-'), 'idempotency key preserved');
  assert.deepEqual(JSON.parse(convene.options.body).idempotencyKey, convene.options.headers['Idempotency-Key']);
  await flush();
  assert.ok(req.calls.some((c) => c.url === '/api/idea-council/runs/run-7'), 'polling must start for the convened run');
  assert.equal(doc.getElementById('ideaSessionView').style.display, 'block');
  council.dispose();
});

test('list renders cards, delete confirms then refetches, open routes by status', async () => {
  const doc = makeDocument();
  const confirms = [];
  const realConfirm = globalThis.confirm;
  globalThis.confirm = () => { confirms.push(1); return true; };
  try {
    const ideas = [
      { _id: 'd1', status: 'DRAFT', title: 'Draft one' },
      { _id: 'c1', status: 'COMPLETED', title: 'Done one', runs: [], latestRun: { runId: 'r1', finalReport: { verdict: 'BUILD' } } },
    ];
    const { council, req } = makeCouncilFull(doc, {
      routes: {
        'GET /api/idea-council/ideas': { success: true, data: ideas },
        'GET /api/idea-council/ideas?status=DRAFT': { success: true, data: [ideas[0]] },
        'DELETE /api/idea-council/ideas/d1': { success: true },
        'GET /api/idea-council/usage': { success: true, data: {} },
      },
    });
    await council.loadIdeaCouncilList('ALL');
    const container = doc.getElementById('ideasListContainer');
    assert.ok(container.innerHTML.includes('d1') && container.innerHTML.includes('c1'), 'both cards render');
    const delBtn = container.querySelectorAll('.idea-delete-btn')[0];
    const fakeEvent = { stopPropagation() {}, target: { closest: () => null } };
    await delBtn._listeners.click[0](fakeEvent);
    assert.equal(confirms.length, 1, 'destructive action must confirm');
    assert.ok(req.calls.some((c) => c.url === '/api/idea-council/ideas/d1' && c.options.method === 'DELETE'), 'DELETE must fire');
    assert.ok(req.calls.filter((c) => c.url === '/api/idea-council/ideas').length >= 2, 'list must reload after delete');
  } finally {
    globalThis.confirm = realConfirm;
  }
});

test('compare modal guards single-run, else opens through injected a11y', async () => {
  const doc = makeDocument();
  const alerts = [];
  const realAlert = globalThis.alert;
  globalThis.alert = (m) => { alerts.push(m); };
  try {
    const a11yCalls = [];
    const a11y = {
      openDialog: (...a) => { a11yCalls.push(['open', a[1]]); },
      closeDialog: (...a) => { a11yCalls.push(['close']); },
    };
    const runs = [{ runId: 'r1', roundNumber: 1 }, { runId: 'r2', roundNumber: 2, followupType: 'PIVOT' }];
    const { council } = makeCouncilFull(doc, {
      a11y,
      routes: {
        'GET /api/idea-council/ideas/idea-1': { success: true, data: { _id: 'idea-1', status: 'COMPLETED', runs, latestRun: runs[1] } },
        'GET /api/idea-council/ideas/idea-single': { success: true, data: { _id: 'idea-single', status: 'COMPLETED', runs: [runs[0]], latestRun: runs[0] } },
      },
    });
    await council.openIdea('idea-single');
    council.openIdeaCompareModal();
    assert.equal(alerts.length, 1, 'single run must refuse comparison');
    await council.openIdea('idea-1');
    council.openIdeaCompareModal();
    assert.equal(a11yCalls[0][0], 'open');
    assert.ok(a11yCalls[0][1] && typeof a11yCalls[0][1].onClose === 'function', 'E03 onClose contract preserved');
    assert.ok(doc.getElementById('ideaRoundsComparisonModal').classList.contains('active'), 'modal must activate');
    council.closeIdeaCompareModal();
    assert.deepEqual(a11yCalls[a11yCalls.length - 1], ['close']);
  } finally {
    globalThis.alert = realAlert;
  }
});

test('followup submit validates, posts with idempotency, polls', async () => {
  const doc = makeDocument();
  const alerts = [];
  const realAlert = globalThis.alert;
  globalThis.alert = (m) => { alerts.push(m); };
  try {
    const { council, req } = makeCouncilFull(doc, {
      routes: {
        'GET /api/idea-council/ideas/idea-1': { success: true, data: DRAFT_IDEA },
        'POST /api/idea-council/ideas/idea-1/follow-up': { success: true, runId: 'run-9' },
        'GET /api/idea-council/usage': { success: true, data: {} },
        'GET /api/idea-council/runs/run-9': { success: true, data: { status: 'RUNNING', stage: 'RESEARCH', agents: [] } },
      },
    });
    await council.openIdea('idea-1');
    const criticSelect = doc.getElementById('ideaFollowupTargetCritic');
    criticSelect.options = [{ text: 'Entire Council' }];
    criticSelect.selectedIndex = 0;
    criticSelect.value = 'ALL';
    const modeSelect = doc.getElementById('ideaFollowupReviewMode');
    modeSelect.options = [{ text: 'Balanced' }];
    modeSelect.selectedIndex = 0;
    modeSelect.value = 'BALANCED';
    await council.submitFollowupModal();
    assert.equal(alerts.length, 1, 'empty followup must validate');
    assert.ok(!req.calls.some((c) => c.url.includes('/follow-up')), 'no fetch before valid input');
    doc.getElementById('ideaFollowupPromptInput').value = 'defend this';
    await council.submitFollowupModal();
    const post = req.calls.find((c) => c.url === '/api/idea-council/ideas/idea-1/follow-up');
    assert.ok(post, 'follow-up must POST');
    assert.equal(post.policy.operation, 'mutation');
    assert.ok(post.options.headers['Idempotency-Key'].startsWith('followup-idea-1-'));
    await flush();
    assert.ok(req.calls.some((c) => c.url === '/api/idea-council/runs/run-9'), 'polling must start for the follow-up run');
    council.dispose();
  } finally {
    globalThis.alert = realAlert;
  }
});

test('truth PATCH carries mutation policy; session-expiry shape matches apiFetch', async () => {
  const doc = makeDocument();
  const { council, req } = makeCouncilFull(doc, {
    routes: { 'PATCH /api/idea-council/truth-items/t1': { success: true } },
  });
  await council.updateTruthItem('t1', { status: 'VERIFIED' }, null);
  assert.equal(req.calls[0].policy.operation, 'mutation');
  assert.equal(typeof req.calls[0].policy.onUnauthorized, 'function');
  assert.ok(chunkSource.includes("localStorage.removeItem('token')"), '401 must clear the session token (apiFetch parity)');
  assert.ok(chunkSource.includes("window.location.href = '/login'"), '401 must redirect to login (apiFetch parity)');
});

test('every recorded call carries the 401 policy; reads stay timed, writes untimed', async () => {
  const doc = makeDocument();
  const { council, req } = makeCouncilFull(doc, {
    routes: {
      'GET /api/idea-council/usage': { success: true, data: {} },
      'GET /api/idea-council/ideas': { success: true, data: [] },
      'POST /api/idea-council/draft': { success: true, data: { _id: 'i', status: 'DRAFT' } },
    },
  });
  seedDraftInputs(doc);
  await council.load();
  await council.saveIdeaDraft(false);
  assert.ok(req.calls.length >= 3);
  for (const c of req.calls) {
    assert.equal(typeof c.policy.onUnauthorized, 'function', `${c.url} must carry the session-expiry policy`);
  }
  const writes = req.calls.filter((c) => (c.options.method || 'GET') !== 'GET');
  assert.ok(writes.length > 0 && writes.every((c) => c.policy.operation === 'mutation'), 'writes must be untimed mutations');
  const reads = req.calls.filter((c) => (c.options.method || 'GET') === 'GET');
  assert.ok(reads.every((c) => c.policy.operation === undefined), 'reads keep the 15s D02 default (documented delta)');
});

// ---------- F04d lifecycle: poll / dispose / export / language ----------

const { mock } = require('node:test');

function withMockTimers() {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  return () => mock.timers.reset();
}

const POLL_RUNNING = { status: 'RUNNING', stage: 'AGENT_ANALYSIS', agents: [], runId: 'run-7', projectId: 'idea-1' };

test('poll terminal COMPLETED paints 100% then opens the idea after 800ms', async () => {
  const restore = withMockTimers();
  try {
    const doc = makeDocument();
    const doneRun = { status: 'COMPLETED', stage: 'SYNTHESIS', agents: [], runId: 'run-7', projectId: 'idea-1' };
    const { council, req } = makeCouncilFull(doc, {
      routes: {
        'GET /api/idea-council/runs/run-7': { success: true, data: doneRun },
        'GET /api/idea-council/ideas/idea-1': { success: true, data: { _id: 'idea-1', status: 'COMPLETED', runs: [], latestRun: doneRun } },
      },
    });
    council.startIdeaPolling('run-7');
    await flush();
    assert.equal(doc.getElementById('ideaSessionProgressBar').style.width, '100%');
    const runsBefore = req.calls.filter((c) => c.url === '/api/idea-council/runs/run-7').length;
    mock.timers.tick(800);
    await flush();
    assert.ok(req.calls.some((c) => c.url === '/api/idea-council/ideas/idea-1'), 'completed run must open its idea after the delay');
    mock.timers.tick(10000);
    await flush();
    assert.equal(req.calls.filter((c) => c.url === '/api/idea-council/runs/run-7').length, runsBefore, 'interval must be cleared on terminal state');
    council.dispose();
  } finally {
    restore();
  }
});

test('poll FAILED paints red and stops; dispose() freezes a live loop', async () => {
  const restore = withMockTimers();
  try {
    const doc = makeDocument();
    const { council, req } = makeCouncilFull(doc, {
      routes: { 'GET /api/idea-council/runs/run-7': { success: true, data: { status: 'FAILED', stage: 'RESEARCH', agents: [] } } },
    });
    council.startIdeaPolling('run-7');
    await flush();
    assert.equal(doc.getElementById('ideaSessionStageText').style.color, 'var(--red)');
    const n = req.calls.length;
    mock.timers.tick(10000);
    await flush();
    assert.equal(req.calls.length, n, 'failed runs must not keep polling');

    const doc2 = makeDocument();
    const live = makeCouncilFull(doc2, {
      routes: { 'GET /api/idea-council/runs/run-7': { success: true, data: POLL_RUNNING } },
    });
    live.council.startIdeaPolling('run-7');
    await flush();
    assert.ok(live.req.calls.length >= 1);
    live.council.dispose();
    mock.timers.tick(20000);
    await flush();
    assert.equal(live.req.calls.length, 1, 'dispose must stop the poll interval (D09-F2)');
  } finally {
    restore();
  }
});

test('dispose() drops a pending autosave and the delayed open', async () => {
  const restore = withMockTimers();
  try {
    const doc = makeDocument();
    const { council, req } = makeCouncilFull(doc, {
      routes: { 'POST /api/idea-council/draft': { success: true, data: { _id: 'i', status: 'DRAFT' } },
        'GET /api/idea-council/runs/run-7': { success: true, data: { status: 'COMPLETED', stage: 'SYNTHESIS', agents: [], runId: 'run-7', projectId: 'idea-1' } } },
    });
    assert.equal(council.init(), true);
    const raw = doc.getElementById('ideaRawText');
    raw.value = 'x'.repeat(150);
    raw._listeners.input[0]();
    council.dispose();
    mock.timers.tick(5000);
    await flush();
    assert.equal(req.calls.filter((c) => c.url === '/api/idea-council/draft').length, 0, 'disposed autosave must never fire');

    // Positive control on a fresh instance: the same arming saves after 2s.
    const doc2 = makeDocument();
    const armed = makeCouncilFull(doc2, {
      routes: { 'POST /api/idea-council/draft': { success: true, data: { _id: 'i', status: 'DRAFT' } } },
    });
    assert.equal(armed.council.init(), true);
    const raw2 = doc2.getElementById('ideaRawText');
    raw2.value = 'y'.repeat(150);
    raw2._listeners.input[0]();
    mock.timers.tick(2000);
    await flush();
    assert.equal(armed.req.calls.filter((c) => c.url === '/api/idea-council/draft').length, 1, 'armed autosave must fire once');
    armed.council.dispose();
  } finally {
    restore();
  }
});

function makeWindowStub() {
  const opened = [];
  const revoked = [];
  return {
    win: {
      URL: {
        createObjectURL: () => 'blob:fake-url',
        revokeObjectURL: (u) => { revoked.push(u); },
      },
      open: (url) => { opened.push(url); return null; },
    },
    opened,
    revoked,
  };
}

test('export downloads markdown with the title filename via fetchBlob', async () => {
  const doc = makeDocument();
  const { win, revoked } = makeWindowStub();
  const { council, blob } = makeCouncilFull(doc, {
    winExtra: { URL: win.URL, open: win.open },
    routes: { 'GET /api/idea-council/ideas/idea-1': { success: true, data: { _id: 'idea-1', status: 'COMPLETED', title: 'My Idea!', runs: [] } } },
    blobRoutes: { '/api/idea-council/ideas/idea-1/export?format=markdown': { blob: 'BLOB', filename: 'server.md' } },
  });
  await council.openIdea('idea-1');
  await council.exportIdeaReport('markdown');
  assert.equal(blob.calls.length, 1);
  assert.equal(blob.calls[0].url, '/api/idea-council/ideas/idea-1/export?format=markdown');
  assert.equal(typeof blob.calls[0].policy.onUnauthorized, 'function', 'export carries the session-expiry policy');
  assert.equal(blob.calls[0].policy.operation, undefined, 'export is a read (D02 default timeout)');
  assert.deepEqual(revoked, ['blob:fake-url'], 'object URL must be revoked after download');
});

test('export html opens the print window; failure alerts; missing idea no-ops', async () => {
  const doc = makeDocument();
  const { win, opened } = makeWindowStub();
  const alerts = [];
  const realAlert = globalThis.alert;
  globalThis.alert = (m) => { alerts.push(m); };
  try {
    const { council, blob } = makeCouncilFull(doc, {
      winExtra: { URL: win.URL, open: win.open },
      routes: { 'GET /api/idea-council/ideas/idea-1': { success: true, data: { _id: 'idea-1', status: 'COMPLETED', title: 'T', runs: [] } } },
      blobRoutes: { '/api/idea-council/ideas/idea-1/export?format=html': { blob: 'HTML', filename: 'r.html' } },
    });
    await council.exportIdeaReport('html');
    assert.equal(blob.calls.length, 0, 'no current idea must not fetch');
    await council.openIdea('idea-1');
    await council.exportIdeaReport('html');
    assert.deepEqual(opened, ['blob:fake-url'], 'html export must open the print window');

    const failing = makeCouncilFull(makeDocument(), {
      winExtra: { URL: win.URL, open: win.open },
      routes: { 'GET /api/idea-council/ideas/idea-1': { success: true, data: { _id: 'idea-1', status: 'COMPLETED', title: 'T', runs: [] } } },
      blobRoutes: { '/api/idea-council/ideas/idea-1/export?format=markdown': new Error('down') },
    });
    await failing.council.openIdea('idea-1');
    await failing.council.exportIdeaReport('markdown');
    assert.equal(alerts.length, 1, 'blob failure must surface the translated error');
  } finally {
    globalThis.alert = realAlert;
  }
});

test('refreshLanguage repaints list + report with zero new fetches', async () => {
  const doc = makeDocument();
  const langState = { lang: 'en' };
  const tLang = (k, fb = '') => (langState.lang === 'ar' ? `AR:${k}` : (fb || k));
  const ideas = [{ _id: 'c1', status: 'COMPLETED', title: 'Done', runs: [], latestRun: { runId: 'r1', finalReport: { verdict: 'BUILD' } } }];
  const { council, req } = makeCouncilFull(doc, {
    t: tLang,
    lang: () => langState.lang,
    routes: {
      'GET /api/idea-council/ideas': { success: true, data: ideas },
      'GET /api/idea-council/ideas/c1': { success: true, data: { _id: 'c1', status: 'COMPLETED', title: 'Done', runs: [], latestRun: { runId: 'r1', finalReport: { verdict: 'BUILD' } } } },
    },
  });
  await council.loadIdeaCouncilList('ALL');
  assert.ok(doc.getElementById('ideasListContainer').innerHTML.includes('idea_action_view'), 'EN list paints');
  langState.lang = 'ar';
  assert.equal(council.refreshLanguage(), true);
  assert.ok(doc.getElementById('ideasListContainer').innerHTML.includes('AR:idea_action_view'), 'list repaints in AR');
  await council.openIdea('c1');
  langState.lang = 'en';
  council.refreshLanguage();
  assert.equal(doc.getElementById('ideaVerdictBadge').textContent, 'BUILD', 'report repaints from cache (fallback echo proves EN repaint, not stale AR)');
  const fetches = req.calls.length;
  council.refreshLanguage();
  assert.equal(req.calls.length, fetches, 'refresh must never fetch');
});

test('init registers the C03 language hook; dispose unregisters it', async () => {
  const doc = makeDocument();
  const registered = [];
  const unregistered = [];
  const registry = {
    registerLanguageRenderer: (id, fn) => { registered.push([id, fn]); return () => { unregistered.push(id); }; },
  };
  const { council } = makeCouncilFull(doc, {
    winExtra: { ZainBotDashboardI18n: registry },
    routes: {},
  });
  assert.equal(council.init(), true);
  assert.deepEqual(registered.map(([id]) => id), ['idea-council'], 'council must join the C03 renderer registry');
  assert.equal(typeof registered[0][1], 'function');
  registered[0][1]();
  council.dispose();
  assert.deepEqual(unregistered, ['idea-council'], 'dispose must release the language hook');
});
