// A03 dashboard smoke — runs INSIDE remote Chromium via Browserless
// /chrome/function (raw-JS body, Playwright `page` injected).
//
// Transport contract (enforced by scripts/run-dashboard-browser-tests.js):
// - The text of tests/browser/fixtures/dashboardApi.js is prepended, so
//   SMOKE_TOKENS and matchSmokeApi() are in scope here.
// - The placeholder __SMOKE_BASE_URL__ is replaced with the quoted target
//   URL before sending. No other templating exists.
// - This file MUST stay free of import/export (except the single
//   `export default` below), require(), or Node APIs.
// - This file MUST NOT end in .test.js (it is driven by the runner, never
//   by scripts/run-tests.js).

export default async function ({ page }) {
  const BASE_URL = '__SMOKE_BASE_URL__';
  const TARGET_HOST = new URL(BASE_URL).hostname;
  // Real document bytes, fetched by the runner over loopback (Node has no
  // HSTS) and injected here. Rationale: the app sends
  // Strict-Transport-Security over plain HTTP, so the shared Browserless
  // profile cached HSTS for the container IP and upgrades every later http
  // request to unreachable https. Fulfilling document navigations with these
  // byte-identical bodies keeps the STS response out of the browser, while
  // every subresource and API request still hits the real server.
  const DOC_BODIES = __DOC_BODIES__;
  const unknownHits = [];
  let profileMode = 'ok';

  await page.setDefaultNavigationTimeout(30000);

  // NOTE: this Browserless instance exposes a Puppeteer-style page
  // (page.route / waitForURL do NOT exist here). Interception uses
  // setRequestInterception + request.respond; waiting uses waitForFunction.
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    let url;
    try {
      url = new URL(req.url());
    } catch (_ignored) {
      try { req.continue(); } catch (_e2) { /* already handled */ }
      return;
    }
    if (typeof req.isNavigationRequest === 'function' && req.isNavigationRequest()) {
      const docBody = DOC_BODIES[url.pathname];
      if (typeof docBody === 'string') {
        try {
          await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: docBody });
        } catch (_eNav) { /* already handled */ }
        return;
      }
    }
    if (url.pathname.indexOf('/api/') === -1) {
      // Foreign third-party hosts (fonts, GSI, CDNs) are aborted: the smoke
      // asserts first-party behavior only, and this keeps the run fast and
      // independent of internet egress. Same-host static assets continue.
      if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== TARGET_HOST) {
        try { await req.abort(); } catch (_e3) { /* already handled */ }
        return;
      }
      try { req.continue(); } catch (_e3b) { /* already handled */ }
      return;
    }
    const path = url.pathname + url.search;
    const headers = req.headers();
    const decision = matchSmokeApi(
      req.method(), path, headers['authorization'] || '', req.postData() || '', profileMode
    );
    if (!decision || decision.kind === 'unknown') {
      unknownHits.push(req.method() + ' ' + path);
      try {
        await req.respond({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'UNKNOWN_API_FIXTURE' }),
        });
      } catch (_e4) { /* already handled */ }
      return;
    }
    if (decision.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, decision.delayMs));
    }
    try {
      await req.respond({
        status: decision.status,
        contentType: 'application/json',
        body: JSON.stringify(decision.body),
      });
    } catch (_e5) { /* already handled */ }
  });

  // Real-click rule (plan §3.6): center → elementFromPoint must be the target
  // or a descendant → mouse.click. evaluate().click() is never used.
  async function realClick(selector) {
    const target = await page.waitForSelector(selector, { visible: true, timeout: 15000 });
    const box = await target.boundingBox();
    if (!box) throw new Error('no bounding box for ' + selector);
    const point = [box.x + box.width / 2, box.y + box.height / 2];
    const hit = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      return { tag: el.tagName, id: el.id || '', cls: String(el.className || '').slice(0, 80) };
    }, point);
    const ok = await target.evaluate(
      (node, p) => {
        const el = document.elementFromPoint(p[0], p[1]);
        return el === node || node.contains(el);
      },
      point
    );
    if (!ok) throw new Error('elementFromPoint blocked for ' + selector + ': ' + JSON.stringify(hit));
    await page.mouse.click(point[0], point[1]);
  }

  async function waitForUrl(part, timeoutMs) {
    await page.waitForFunction(
      (needle) => window.location.href.indexOf(needle) !== -1,
      { timeout: timeoutMs || 15000 },
      part
    );
  }

  async function readStorage() {
    return page.evaluate(() => ({
      token: localStorage.getItem('token'),
      expiry: localStorage.getItem('tokenExpiry'),
      url: window.location.href,
      lang: document.documentElement.getAttribute('lang'),
    }));
  }

  const scenarios = [];
  function record(id, ok, detail) {
    scenarios.push({ id, ok: Boolean(ok), detail: String(detail || '') });
  }

  // S1 — no token → login.
  try {
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForUrl('/login');
    const state = await readStorage();
    record('no-token-login', state.url.indexOf('/login') !== -1, 'landed ' + state.url);
  } catch (err) {
    record('no-token-login', false, String((err && err.message) || err).slice(0, 300));
  }

  // S2 — expired dead token + profile 401 → settles on login with the token cleared.
  // (Same origin as S1's landing page, so no extra navigation is needed
  // before setting storage.)
  try {
    profileMode = 'unauthorized';
    await page.evaluate((dead) => {
      localStorage.clear();
      localStorage.setItem('token', dead);
      localStorage.setItem('tokenExpiry', String(Date.now() - 60 * 1000));
    }, SMOKE_TOKENS.DEAD);
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForUrl('/login');
    const state = await readStorage();
    record(
      'profile-401-login',
      state.url.indexOf('/login') !== -1 && state.token === null,
      'landed ' + state.url + ' token=' + String(state.token)
    );
  } catch (err) {
    record('profile-401-login', false, String((err && err.message) || err).slice(0, 300));
  }

  // S3 — real click on the login language toggle flips the page language.
  try {
    profileMode = 'ok';
    await page.goto(BASE_URL + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    const before = await page.evaluate(() => document.documentElement.getAttribute('lang'));
    await realClick('#loginLanguageToggle');
    await page.waitForFunction(
      (prev) => document.documentElement.getAttribute('lang') !== prev,
      { timeout: 10000 },
      before
    );
    const after = await page.evaluate(() => document.documentElement.getAttribute('lang'));
    record('real-click-lang-toggle', before !== after, 'lang ' + before + ' -> ' + after);
  } catch (err) {
    record('real-click-lang-toggle', false, String((err && err.message) || err).slice(0, 300));
  }

  // S4 — slow profile 500 → recoverable state: stays on dashboard, error
  // shown, session kept (D04a contract).
  try {
    profileMode = 'error500slow';
    await page.evaluate((dead) => {
      localStorage.clear();
      localStorage.setItem('token', dead);
      localStorage.setItem('tokenExpiry', String(Date.now() + 3600 * 1000));
    }, SMOKE_TOKENS.DEAD);
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      () => {
        const box = document.getElementById('bootstrapError');
        return box && !box.hasAttribute('hidden');
      },
      { timeout: 20000 }
    );
    const state = await readStorage();
    record(
      'profile-500-recoverable',
      state.url.indexOf('/dashboard') !== -1 && state.token === SMOKE_TOKENS.DEAD,
      'stayed ' + state.url + ' token-kept=' + String(state.token === SMOKE_TOKENS.DEAD)
    );
  } catch (err) {
    record('profile-500-recoverable', false, String((err && err.message) || err).slice(0, 300));
  }

  // S5 — OBSERVATION ONLY (never fails the run): dead token WITHOUT expiry +
  // profile 401. Counts dashboard↔login transitions over 9s. A bounce loop
  // here means the request-core 401 path redirects without clearing the raw
  // token while the login page bounces it back (finding FP-A03-1, D-track).
  let loopObservation = { bounces: 0, loopDetected: false, sampled: [] };
  try {
    profileMode = 'unauthorized';
    await page.evaluate((dead) => {
      localStorage.clear();
      localStorage.setItem('token', dead);
      localStorage.removeItem('tokenExpiry');
    }, SMOKE_TOKENS.DEAD);
    await page.goto(BASE_URL + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
    let last = '';
    for (let i = 0; i < 16; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const current = page.url();
      if (last && current !== last) loopObservation.bounces += 1;
      last = current;
      if (i % 5 === 0) loopObservation.sampled.push(current);
    }
    loopObservation.loopDetected = loopObservation.bounces >= 5;
  } catch (err) {
    loopObservation.error = String((err && err.message) || err).slice(0, 200);
  }

  const failed = scenarios.filter((s) => !s.ok);
  return {
    pass: failed.length === 0 && unknownHits.length === 0,
    scenarios,
    unknownHits,
    loopObservation,
  };
}
