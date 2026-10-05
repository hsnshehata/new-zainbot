# Dashboard release gates (A06)

Date: 2026-10-05. Owner: Lead A. This file is the runnable gate ledger for the
frontend batch. Every gate below states its command and what PASS / FAIL /
SKIP (not-run) means. **A gate that was not run is recorded SKIP — never
PASS.** No completion percentages are claimed anywhere (no metric exists).

Runtime for every command:

```bash
export PATH="/root/.config/opencode/tools/node-v24.21.0-linux-x64/bin:$PATH"
```

## 1. Baseline gates (runnable now — all PASS at A06 re-run)

| # | Gate | Command | PASS | FAIL | SKIP |
|---|---|---|---|---|---|
| G1 | Full suite | `npm test` | exit 0, every file block `fail 0` | exit ≠ 0 or any `fail ≥ 1` → merge blocked | n/a (always runnable) |
| G2 | Translation contract | `node tests/dashboardTranslations.test.js` | exit 0, 12/12 (covers C01–C08 keys, incl. fix-round dedupe) | any fail → bilingual regression, merge blocked | — |
| G3 | Landing/login i18n | `node tests/landingTranslations.test.js`, `node tests/loginTranslations.test.js` | exit 0 | any fail → merge blocked | — |
| G4 | Dashboard JS syntax | `node --check public/js/dashboard_new.js` | exit 0 | exit ≠ 0 → merge blocked | — |
| G5 | Phase-0 baseline | `NODE_ENV=test node tests/phase0Baseline.test.js` | exit 0, 3/3 | any fail → baseline regression, merge blocked | — |
| G6 | Sidebar/mobile shell | `node tests/dashboardMobileSidebar.test.js`, `node tests/mobileRegression.test.js` | exit 0 | any fail → shell regression, merge blocked | — |
| G7 | Onboarding/channel/relink/catalog/customizer | `node tests/dashboardOnboarding.test.js`, `node tests/dashboardChannelStatus.test.js`, `node tests/dashboardWhatsappRelink.test.js`, `node tests/dashboardCatalogConnector.test.js`, `node tests/chatPageCustomizer.test.js` | exit 0 each | any fail → feature regression, merge blocked | — |

A06 evidence (durable log `docs/qa/reports/attachments/a06-npm-test.log`):
G1 exit 0 — 76 file blocks, all `fail 0`, 651 pass total. G2 12/12. G5 3/3.

## 2. HTTP/API contract gates (runnable now — all PASS at A06 re-run)

| # | Gate | Command | PASS | FAIL | SKIP |
|---|---|---|---|---|---|
| G8 | HTTP boundary contracts (A05) | `node tests/dashboardHttpContract.test.js` | exit 0, 8/8: `/dashboard` HTML identity+MIME, 301 aliases, 404 HTML page for non-API + JSON 404 `{code,traceId}` for API, `/health`, readiness down/up | any fail → contract regression, merge blocked | — |
| G9 | API boundary contracts (A05) | `node tests/dashboardApiContract.test.js` | exit 0, 12/12: 401 codes, profile envelope + no credential leak, ownership 404-indistinguishable, `BOT_ID_REQUIRED`, public link 400/404, catalog 401/404/unconfigured-no-secrets | any fail → merge blocked | — |
| G10 | Ownership contracts (D06b/D06c/D06d) | `node tests/dashboardOwnershipContracts.test.js` | exit 0, 42/42: FP1–FP4 fixed expectations hold (cross-user chat-page PUT→404, cross-user config read/provision→404 zero side effects, malformed ids→404, createChatPage caller-scoped) | any fail → **security regression, merge blocked** | — |

A06 re-run: G8 8/8, G9 12/12 (appended to the durable log).

## 3. Build / assets / cache gates (runnable now — PASS)

| # | Gate | Command | PASS | FAIL | SKIP |
|---|---|---|---|---|---|
| G11 | Web build reproducibility | `npm run build:web` then `node tests/webBuild.test.js` | exit 0, 11/11: exact esbuild pin, double-build byte-identical, 1:1 mirror, no mangling (inline callbacks resolve), `build/` untracked | any fail → build blocked; do not ship `build/` output | SKIP the Docker stage (no daemon in container — recorded, not claimed) |
| G12 | Asset refs + CSP + SW | `node tests/webAssets.test.js`, `node tests/webCsp.test.js`, `node tests/serviceWorker.test.js`, `node tests/webAssetCache.test.js` | exit 0 each: zero missing local refs, CSP self-only chunks, SW `zainbot-v0.0040-release` upgrade purges scoped cache | any fail → release blocked | — |
| G13 | Lazy-asset budget | `node tests/dashboardLazyAssets.test.js`, `node scripts/measure-web-assets.js` | tests exit 0; measured total gzip within +5% of F01 (actual +2.8%, F08) | budget breach → coordinator approval required (F04b request) | Boot-timing ms: SKIP (no harness — never claimed) |

## 4. Browser gates (BLOCKED — infra, not code)

Status: **BLOCKED-behind-A03-infra**. Remote Chromium (Browserless REST) is
proven working (`example.com` → 200 via raw-JS `/chrome/function`), but it
cannot open inbound TCP to a container-hosted QA app (A03 probe: navigation
timeout, zero hits in the probe server log). No browser gate below may be
marked PASS until one of these lands (owner: Hassan/infra, cheapest first —
see `docs/qa/reports/A03.md`):

1. Ephemeral reverse tunnel exposing only the QA port for the run (`QA_BROWSER_URL`); no firewall change, no production touch.
2. Host firewall/NAT forward of one QA-only port to this container, ideally source-restricted to Browserless egress.
3. Point the harness at a Coolify preview/staging deployment (`QA_BASE_URL`) instead of direct-to-container.
4. Re-scope A03/A04 gates to §16 staging-smoke curls until 1–3 lands.

| # | Gate | Command (once unblocked) | PASS | FAIL | Today |
|---|---|---|---|---|---|
| G14 | Browser smoke harness | `npm run test:browser:dashboard` (exists since A03 retry: `scripts/run-dashboard-browser-tests.js` + `tests/browser/dashboardSmoke.browser.js` + fixtures; remote Chromium via container-IP URL, ephemeral port, Puppeteer-style page API) | harness green, no uncaught page errors, no asset 404, unknown API fails the run | any of the above → merge blocked | PASS at A03 retry (4/4 scenarios, 0 unknown APIs, 15 s wall; durable log `docs/qa/reports/attachments/a03-npm-test.log` covers the Node suite — browser output is console-evidenced in `docs/qa/reports/A03.md`) |
| G15 | Behavior matrix (A04) | ar/en × 360×800 / 390×844 / 768×1024 / 1440×900 + 991/992 edges, real `mouse.click` after `elementFromPoint` | all scenarios green | fake clicks / skipped viewports → FAIL | SKIP (blocked) |
| G16 | Warm-cache / SW-controlled / release-upgrade | same scenarios with SW `zainbot-v0.0040-release` controlling + upgrade from F03 cache | no mixed chunks, no sensitive cache, upgrade purges scoped set | stale chunk served / sensitive cached → FAIL | SKIP (blocked) |
| G17 | Firefox/Safari | run G15 subset where available | green | — | SKIP (not available — recorded, no cross-browser claim) |
| G18 | Staging smoke (§16) | `curl --fail-with-body $QA_BASE_URL/health`, `/health/readiness`, `-D - -H 'Accept: text/html' $QA_BASE_URL/dashboard`, alias check | health 200, readiness 200 + DB up, dashboard HTML+MIME, alias 301 | readiness 503 is NOT a PASS for end-to-end | SKIP (no isolated QA env; no production calls per constraints) |

## 5. Recorded non-gates (decisions, not test commands)

- **Menu-item role removal is E04-by-design (confirmed, do not re-litigate):**
  sidebar items are native `<button type="button">`; `role=menu/menuitem` +
  `aria-haspopup` were dropped because no menubar arrow-key semantics exist —
  the account control is a plain disclosure (`aria-expanded`+`aria-controls`,
  Escape returns focus). Evidence: `docs/qa/reports/E04.md` + 15/15 keyboard
  tests + `docs/COMPONENT_LIBRARY.md` §6.
- **F06 second extraction: deferred-approved (CLOSE with reason)** — no
  candidate clears the plan's bar; dictionaries (42%) are not lazy-eligible.
  Evidence: `docs/qa/reports/F06.md`.
- **Conditionals not activated:** B07 (theme decision needs Hassan),
  E08 (widget/chat/store a11y needs scope approval + A06 inventory),
  F09 (store/chat assets needs scope approval + F01). None blocks this batch;
  each needs a fresh acceptance supplement if activated.
- **D06b observation (cosmetic, accepted):** rules 404s use `{message}`
  without a stable `error` code while siblings use `{success:false, error}` —
  future uniformity pass, not a security issue, not a merge blocker.
- **F07 open item (accepted, coordinator-owned):** `build/` output stays
  untracked; `.gitignore` is PROTECTED so F07 could not add the ignore entry
  — coordinator decides (ignore `build/` or leave untracked; never commit it).
