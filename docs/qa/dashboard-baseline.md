# Dashboard baseline — A01 (2026-10-05)

Read-only environment + test baseline. No product code changed. No performance numbers (owned by F01).

## 1. Environment versions (actual, measured)

| Item | Value |
|---|---|
| `node` on default PATH | NOT present (`which node` → not found) |
| Pinned binary | `/root/.config/opencode/tools/node-v24.21.0-linux-x64/bin/node` exists, reports `v24.21.0` |
| `npm` (via pinned PATH export) | `11.19.0` |
| `package.json` engines | `node >= 22` — satisfied by v24.21.0 |
| `Dockerfile` base | `node:22-bookworm-slim` (production image; devDeps omitted via `npm ci --omit=dev`) |
| `node_modules` | present in workspace (`.package-lock.json` marker exists); no `npm ci` needed |
| `python3` on PATH | NOT present (focused-gate parsing done with `node -e`) |
| Standalone Chrome | NONE in this container (`/usr/bin/chromium`, `/usr/bin/google-chrome`, `/usr/bin/chromium-browser` all absent; `/root/.cache/puppeteer` absent) |
| Puppeteer | only transitive via `whatsapp-web.js@1.34.6 → puppeteer@24.36.1`; NOT a direct devDependency (owned by A03b) |
| Browser/build scripts | `test:browser:dashboard` and `build:web` do NOT exist yet (owned by A03/F07) |

PATH used for every command below:

```bash
export PATH="/root/.config/opencode/tools/node-v24.21.0-linux-x64/bin:$PATH"
```

## 2. Git state (pre-existing, untouched)

- Branch: `master`
- `git log --oneline -5`:
  - `5a8aabb feat(platform): funnel metrics, relink banner, queue alerts, live-check, mobile guard`
  - `173bcdb fix(dashboard): explain catalog access for other owners`
  - `812189b feat(platform): guide onboarding and connect store catalogs`
  - `3a48e4f fix(dashboard): prevent mobile clipping in settings and admin`
  - `f9eb507 fix(dashboard): clamp grid children min-width on phones`
- `git status --short` BEFORE this task:
  - `M .gitignore`
  - `M AGENTS.md`
  - `?? .github/`
  - `?? docs/internal/FRONTEND_EXECUTION_PLAN.md`
- These dirty entries are pre-existing user/planning work; A01 did not modify, stage, or stash them.

## 3. Full suite — `npm test` (exit 0)

- Command: `npm test` (runs `node scripts/run-tests.js`, spawns each `tests/*.test.js` with `NODE_ENV=test`)
- Exit code: `0`
- Test files present: `40` (`ls tests/*.test.js | wc -l`)
- Totals parsed from output (`ℹ pass/fa­il` summary blocks): **44 summary blocks, 224 pass, 0 fail**
- First failures: none — zero `fail` counts across all blocks; no failure text to quote.
- Full log kept at `/tmp/opencode/a01-npm-test.log` (ephemeral; container `/tmp` does not survive restart).

## 4. Focused dashboard gates (plan §16, all pre-existing files)

| Command | Exit | pass | fail |
|---|---|---|---|
| `node tests/dashboardTranslations.test.js` | 0 | 2 | 0 |
| `node tests/dashboardMobileSidebar.test.js` | 0 | 3 | 0 |
| `node tests/dashboardOnboarding.test.js` | 0 | 3 | 0 |
| `node tests/dashboardChannelStatus.test.js` | 0 | 3 | 0 |
| `node tests/dashboardWhatsappRelink.test.js` | 0 | 5 | 0 |
| `node tests/dashboardCatalogConnector.test.js` | 0 | 3 | 0 |
| `node tests/mobileRegression.test.js` | 0 | 6 | 0 |
| `node tests/chatPageCustomizer.test.js` | 0 | 2 | 0 |
| `NODE_ENV=test node tests/phase0Baseline.test.js` | 0 | 3 | 0 |
| `node --check public/js/dashboard_new.js` | 0 (syntax OK) | — | — |

Not run (do not exist yet / no isolated env — NOT claimed as PASS):
- `npm run test:browser:dashboard` — script absent (A03).
- `npm run build:web` — script absent (F07).
- Staging smoke (`$QA_BASE_URL/health…`) — no isolated QA env; no production calls per constraints.

## 5. Read-only asset observation (NOT a performance baseline)

- `public/js/dashboard_new.js`: `388133` bytes raw, `88178` bytes gzipped (`gzip -c | wc -c`). Recorded only to match the plan's starting fact; real measured web-asset baseline belongs to F01.
- `public/dashboard.html` script refs observed: `js/utils.js`, `js/dashboard-onboarding.js?v=20260928-journey`, `js/dashboard_new.js?v=20260928-journey2`, `js/settings-summary.js?v=2`, plus `/widget.js` and two empty `src=""` (recorded verbatim for later B/F tasks; no fix attempted).

## 6. Blockers (environment only — no product failures)

1. **No standalone Chrome in this container** — any future browser harness run needs `PUPPETEER_EXECUTABLE_PATH` or a Chrome install decision (owner: A03). No download attempted.
2. **`node`/`python3` missing from default PATH** — all commands must use the pinned-PATH export (owner: A01 documented here; A02 to propagate to leads).
3. **`/tmp` is ephemeral** — full-suite log kept at `/tmp/opencode/a01-npm-test.log` will not survive a container restart (note only; report files live in `docs/qa/` + `.superpowers/sdd/`).

## 7. Reproduce commands

```bash
export PATH="/root/.config/opencode/tools/node-v24.21.0-linux-x64/bin:$PATH"
node --version            # expect v24.21.0
npm --version             # expect 11.19.0
git status --short
git log --oneline -5
npm test                  # expect exit 0
node tests/dashboardTranslations.test.js
node tests/dashboardMobileSidebar.test.js
node tests/dashboardOnboarding.test.js
node tests/dashboardChannelStatus.test.js
node tests/dashboardWhatsappRelink.test.js
node tests/dashboardCatalogConnector.test.js
node tests/mobileRegression.test.js
node tests/chatPageCustomizer.test.js
NODE_ENV=test node tests/phase0Baseline.test.js
node --check public/js/dashboard_new.js
```

## 8. Appendix — full-suite primary evidence (condensed, fix round 1)

- Source: `/tmp/opencode/a01-npm-test.log` — still present at fix time (33059 bytes, 661 lines, written 2026-10-05 ~03:30 UTC by `npm test`, exit 0). ANSI color codes stripped below; no re-run was needed.
- Per-block totals verbatim: 44 `ℹ pass` lines summing to **224** (1x1, 9x2, 8x3, 5x4, 7x5, 2x6, 3x7, 3x8, 1x9, 1x10, 1x11, 1x12, 1x13, 1x14) and 44 `ℹ fail 0` lines — zero failures.
- Tail ~40 lines (final three test files: subscriptionQueue, webhookSecurity, whatsappSessionManager):

```text
[2026-10-05T03:30:34.800Z] info: subscription_request_created | {"userId":"u-ratelimit-1","tier":"growth_1k","billingPeriod":"monthly"}
[2026-10-05T03:30:34.805Z] info: subscription_request_created | {"userId":"u-ratelimit-1","tier":"growth_1k","billingPeriod":"monthly"}
✔ POST /request rate-limits a user to 5 creations per day (6th is 429) (40.934841ms)
✔ GET /mine enriches with queue position + bilingual note and never activates the tier (9.094949ms)
[2026-10-05T03:30:34.832Z] info: subscription_approved | {"userId":"u-customer-1","tier":"growth_10k","months":12}
✔ PUT /requests/:id approve records review, activates tier, writes in-app Notification (10.559932ms)
✔ PUT /requests/:id reject records review + notifies without touching the tier (4.488706ms)
✔ PUT /requests/:id on an already-reviewed request is 409 with no side effects (3.901273ms)
✔ GET /requests validates status and paginates with max limit 100 (9.318986ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 183.985913
[2026-10-05T03:30:35.006Z] warn: webhook_signature_rejected | {"requestId":"request-2","path":"/facebook"}
✔ timing-safe comparison handles equal and unequal values (1.199864ms)
✔ Meta signature middleware accepts only the matching raw body signature (1.151211ms)
✔ Meta signature middleware rejects an invalid signature (3.711558ms)
✔ Telegram webhook middleware requires the configured secret header (0.452419ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 24.748836
✔ stable WhatsApp client ids preserve the legacy bot-id convention (2.288148ms)
✔ manager exposes real QR and ready states and preserves sessions on shutdown (29.55646ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 40.459817
```

- Focused-gate pass/fail lines (from §4, repeated here so the evidence is self-contained): dashboardTranslations pass 2/fail 0; dashboardMobileSidebar 3/0; dashboardOnboarding 3/0; dashboardChannelStatus 3/0; dashboardWhatsappRelink 5/0; dashboardCatalogConnector 3/0; mobileRegression 6/0; chatPageCustomizer 2/0; phase0Baseline 3/0; `node --check dashboard_new.js` exit 0.
