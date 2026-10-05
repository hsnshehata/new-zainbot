# Frontend execution state — A02 (coordinator-owned)

> This table is the single-writer ownership ledger for the frontend plan
> (`docs/internal/FRONTEND_EXECUTION_PLAN.md`). **Only the coordinator edits
> this file afterward.** Leads report results or write per-task files under
> `docs/qa/reports/<TASK-ID>.md`; they never edit this table.

## Base revision (frozen for all rows until the coordinator re-baselines)

- Commit: `master@5a8aabb` — `feat(platform): funnel metrics, relink banner, queue alerts, live-check, mobile guard`
- Pre-existing dirty entries (user/planning work, untouched by implementers):
  - `M .gitignore` (coordinator scratch-ignore for `.superpowers/`, untracked execution files)
  - `M AGENTS.md`
  - `?? .github/`
  - `?? docs/internal/FRONTEND_EXECUTION_PLAN.md`
- Untracked execution docs: `?? docs/qa/` (baseline + A02 files + future reports)
- Runtime for every command: `export PATH="/root/.config/opencode/tools/node-v24.21.0-linux-x64/bin:$PATH"` (node `v24.21.0`, npm `11.19.0`)

## Single-writer locks (§5 registry — task holds the lock before writing the shared file, releases after merge+verify; never hold a lock while waiting)

| Resource | Owner / access |
|---|---|
| `public/js/dashboard_new.js` | FULL-FILE lock, one writer at a time (C02/C03/C04 vs D flows vs E dialogs vs F04/F05 serialize) |
| `public/dashboard.html` | FULL-FILE lock, no parallel markup/CSS/script-version edits (B02–B05 vs C04 vs D vs E vs F serialize) |
| `package.json` + `package-lock.json` | UNIT lock: A03 first, then F07 after release |
| `server/server.js` | F02; A writes tests only; any D change needs a separate turn |
| `public/service-worker.js` | F (F03/F08); others request bumps via F |
| auth HTML + `public/js/auth.js` | C02/C07 first, then E07 (or reverse by readiness); no overlap |
| `tests/dashboardTranslations.test.js` | C01 only; A runs/reviews |
| new primitives | D owns request/feedback, E owns focus, F owns lazy loader (parallel-safe, disjoint files) |
| browser harness + fixtures | A owns; other leads submit scenarios to A |
| `AGENTS.md`, `.github/`, plan doc, `.gitignore` | PROTECTED from all leads (prior work; no overwrite/reset/stash/auto-add) |

Statuses: `completed / in-progress / ready / not-started / awaiting-* / blocked / deferred-approved` (plan §17).
`ready` = wave-0 independent-file work, may start once A02 lands. `not-started` = waits for its listed dependency merge.
Report path for future tasks: `docs/qa/reports/<TASK-ID>.md` (written at execution time).
A01 is the exception: report lives at `.superpowers/sdd/A01-report.md` + `docs/qa/dashboard-baseline.md`.

| Task | Status | Owner | Depends on | Lock / shared file | Report path |
|---|---|---|---|---|---|
| A01 env+baseline | completed | Lead A (internal) | — | read-only + new doc | `docs/qa/dashboard-baseline.md` (+ `.superpowers/sdd/A01-report.md`) |
| A02 workspaces/locks/agy-isolation | completed | Lead A + coordinator | A01 | new docs only, no product writes | `.superpowers/sdd/A02-report.md` |
| A03 browser harness (a/b/c) | in-progress (UNBLOCKED: container-IP route proven PROBE_OK; runtime hostname -i, no Puppeteer) | Lead A (internal contract; agy pieces A03b/c) | A01, A02 | package.json UNIT lock (A03 first) | `docs/qa/reports/A03.md` |
| A04 behavior matrix + hit testing | not-started | Lead A (internal assertions; agy 1 scenario) | A03 (+ owner tasks per scenario) | A-owned browser files | `docs/qa/reports/A04.md` |
| A05 HTTP/API boundary contracts | completed (review clean; DB-isolated ownership follow-up filed as D06b) | Lead A (internal; agy 1 endpoint) | A01 (backend fixes at merge) | A-owned test files; no prod cache change | `docs/qa/reports/A05.md` |
| A06 batch review + docs | completed (non-A confirmed; doc fixes applied; merge = conditional, browser gates blocked) | Lead A (internal; independent reviewer) | merged B–F core (not E08/F09/conditional) | docs + README/CONTRIBUTING (additive) | `docs/qa/reports/A06.md` |
| B01 responsive audit | awaiting-verification (9 findings + bounded proposals; browser waits A03) | Lead B (internal) | A03 (reads may start early) | new findings doc | `docs/qa/reports/B01.md` |
| B02 shell CSS extraction (a/b) | not-started | Lead B (agy, 2 sequential pieces) | B01, A04 baseline | dashboard.html LOCK | `docs/qa/reports/B02.md` |
| B03 customizer tablet sizing | not-started | Lead B (agy, 1 CSS patch) | B02, E03 (locks) | dashboard.css via B; markup via html LOCK | `docs/qa/reports/B03.md` |
| B04 drawer short-screen + reduced motion | not-started | Lead B (agy, scoped patch) | B02, E04 | dashboard.css | `docs/qa/reports/B04.md` |
| B05 responsive work pages + RTL (a/b/c) | not-started | Lead B (agy, 1 renderer/layout per brief) | B01, B02, C03 | dashboard.css + html LOCK | `docs/qa/reports/B05.md` |
| B06 contrast/focus consistency | not-started | Lead B (internal measure; agy tokens patch) | B02, E04, E05 | dashboard.css only | `docs/qa/reports/B06.md` |
| B07 theme decision (CONDITIONAL) | not-started | Lead B (internal; Hassan decision first) | B06 | findings only until decided | `docs/qa/reports/B07.md` |
| C01 translation contract hardening | completed (review clean; double-quote regex suggestion routed to C04b) | Lead C (internal) | A01 | tests/dashboardTranslations.test.js (C01 OWNS) | `docs/qa/reports/C01.md` |
| C02 language persistence | completed (review clean; render-normalized cleanup routed to C03) | Lead C (internal) | C01 | dashboard_new.js LOCK + auth files (C turn) | `docs/qa/reports/C02.md` |
| C03 adapter + stateless rerender | completed (Critical typo caught by review, fixed + guarded, re-review ADDRESSED) | Lead C (internal) | C02 | dashboard_new.js LOCK | `docs/qa/reports/C03.md` |
| C04 labels/operational copy (a–f, 1 slice per brief) | in-progress (C04b done ✅; C04c queued behind E02b lock) | Lead C (agy slices; E sets semantics for a) | C01, C03 (+E04/E05/D per slice) | dashboard_new.js + html LOCKs | `docs/qa/reports/C04.md` |
| C05 council/channels/remaining copy | not-started | Lead C (agy, 1 feature per brief) | C03 (council slice before F04 moves it) | dashboard_new.js + html LOCKs | `docs/qa/reports/C05.md` |
| C06 locale formatting | not-started | Lead C (internal contract; agy 1 renderer) | C03, C04 | dashboard_new.js LOCK | `docs/qa/reports/C06.md` |
| C07 auth live switching | not-started | Lead C (internal) | C02 (before E07 on same files) | auth files (C turn) | `docs/qa/reports/C07.md` |
| C08 final bilingual audit | not-started | Lead C (internal, non-implementer reviewer) | C04–C07 + D/E/F integrations | findings doc only | `docs/qa/reports/C08.md` |
| D01 orders/bookings route contracts | completed (H1+M1 fixed, re-review ADDRESSED, suite 440 green) | Lead D (internal) | A01 | dashboard_new.js LOCK + bookingsController | `docs/qa/reports/D01.md` |
| D02 request core | completed (fix round 1: 401-hook hoisted, re-review ADDRESSED) | Lead D (internal) | A01 | NEW files only (parallel-safe) | `docs/qa/reports/D02.md` |
| D03 feedback/resource primitive | completed (Spec ✅ + E-review Approved; full suite 426 green) | Lead D (internal; E reviews) | D02, C03 | NEW files + html/js hookup via LOCKs | `docs/qa/reports/D03.md` |
| D04 bootstrap/overview/inbox (a–d) | completed (Spec ✅ Approved; suite 574 green) | Lead D (internal lifecycle; agy 1 renderer/loader) | D02, D03, C03 | dashboard_new.js + html LOCKs | `docs/qa/reports/D04.md` |
| D05 orders/bookings states + locks (a–d) | completed (Spec ✅ Approved; suite green) | Lead D (internal; agy trial on D06d-minors runs parallel, disjoint files) | D01, D02, D03 | dashboard_new.js + html LOCKs | `docs/qa/reports/D05.md` |
| D07 recipients/webhook/settings (a–d) | completed (Spec ✅; runtime covered by coordinator 8/8 + suite 593) | Lead D (internal) | D02, D03, D06 | dashboard_new.js + html LOCKs | `docs/qa/reports/D07.md` |
| D08 subscription request/review (a–c) | completed (Spec ✅ Approved; suite 599 green) | Lead D (internal) | D02, D03, C04e | dashboard_new.js + html LOCKs | `docs/qa/reports/D08.md` |
| E04 keyboard/drawer/disclosure | completed (Spec ✅ Approved + fix round ADDRESSED; lock released; browser waits A03) | Lead E (internal) | E01, C03; B02 styling settled | dashboard_new.js + html LOCKs + sidebar test | `docs/qa/reports/E04.md` |
| D05 orders/bookings states + locks (a–d) | not-started | Lead D (agy, 4 pieces) | D01, D02, D03 | dashboard_new.js + html LOCKs | `docs/qa/reports/D05.md` |
| D06 safe errors + notification outcome | completed (review clean; outcome-branching routed to D07) | Lead D (internal backend) | A01 | server middleware/controllers + new tests | `docs/qa/reports/D06.md` |
| D06b ownership/impersonation contracts (A05 Medium follow-up) | completed (Spec ✅ Approved; FP1-FP3 proven → D06c) | Lead D (internal) | A05, D06 | NEW test file only | `docs/qa/reports/D06b.md` |
| D07 recipients/webhook/settings (a–d) | not-started | Lead D (agy, 4 pieces) | D02, D03, D06 | dashboard_new.js + html LOCKs | `docs/qa/reports/D07.md` |
| D08 subscription request/review (a–c) | not-started | Lead D (agy, 3 briefs) | D02, D03, C04e | dashboard_new.js + html LOCKs | `docs/qa/reports/D08.md` |
| D09 remaining workflows | completed (Spec ✅ Approved; 3 chunk edits need F countersign at merge) | Lead D (internal audit; agy 1 flow) | D03, C04, C05, E02, E03 | dashboard_new.js + html LOCKs | `docs/qa/reports/D09.md` |
| C08 final bilingual audit | completed (COUNTERSIGNED; stale pointers cleaned) | Lead C (internal, non-implementer reviewer) | C04–C07 + D/E/F integrations | findings doc only | `docs/qa/reports/C08.md` |
| E01 focus primitive | awaiting-verification (fix round 1: M1+M2 ADDRESSED; browser waits A03) | Lead E (internal) | A01 (browser acceptance after A03) | NEW files only (parallel-safe) | `docs/qa/reports/E01.md` |
| E02 operational dialogs (1 dialog per brief) | completed 6/6 (all awaiting-verification on browser only) | Lead E (agy) | E01, C03 | dashboard_new.js + html LOCKs | `docs/qa/reports/E02.md` |
| E03 management/customizer/council dialogs | completed 6/6 (code-conformant; browser + commit-serialization gates open) | Lead E (internal) | E01, E02 (before F04 moves council wiring) | dashboard_new.js + html LOCKs | `docs/qa/reports/E03.md` |
| E05 labels/help/error association (1 form per brief) | completed (inventory: 15 covered + 5 excluded-with-reason; browser gates open) | Lead E (internal; agy trials paused 1/4) | E02, C04 | dashboard.html LOCK | `docs/qa/reports/E05.md` |
| E06 announcements + reusable UI | completed (Spec ✅ Approved; component counts corrected) | Lead E (internal, with D03) | D03, E02, E03 | dashboard-feedback.js (consume) + css via B | `docs/qa/reports/E06.md` |
| E07 auth focus/forms | completed (fix round ALL ADDRESSED; browser waits A03) | Lead E (internal) | C07 | auth files (E turn, after C) | `docs/qa/reports/E07.md` |
| E08 widget/chat/store a11y (CONDITIONAL) | not-started | Lead E (internal; needs scope approval) | A06 inventory + approval | files fixed at activation | `docs/qa/reports/E08.md` |
| F01 asset measurement | completed (review clean; network waits A03) | Lead F (internal) | A01 (network measures wait A03) | NEW script/test/doc only | `docs/qa/reports/F01.md` |
| F02 HTTP cache policy | completed (review clean; SW no-cache foundation for F03) | Lead F (internal) | F01, A05 | server/server.js (F OWNS) | `docs/qa/reports/F02.md` |
| F03 service worker | completed (review clean; 3 Lows routed to F08 polish) | Lead F (internal) | F02 | service-worker.js (F OWNS) | `docs/qa/reports/F03.md` |
| F04 council extraction eager (a–d) | completed (code; browser + budget-approval gates open) | Lead F (internal contract; agy mechanical moves) | C03, D03, E03, D09-council, C05-council + shared LOCKs | dashboard_new.js + html LOCKs + NEW council module | `docs/qa/reports/F04.md` |
| F05 lazy council + settings summary | completed (reviewer re-ran; -20830B first-paint; budget + browser gates open) | Lead F (internal) | F03, F04, C03, D03 | dashboard_new.js + council module + settings-summary + html LOCK | `docs/qa/reports/F05.md` |
| F06 second extraction (CONDITIONAL) | deferred-approved (CLOSE with evidence; superadmin-shell noted future) | Lead F (internal; evidence decision first) | F05, F01 | fixed in subplan only | `docs/qa/reports/F06.md` |
| F08 final assets/CSP/cache gate | completed (Spec ✅; budget WITHIN +5% → F04b request satisfied) | Lead F (internal) | F07 + all merged JS tasks | versions + SW via F | `docs/qa/reports/F08.md` |
| F07 minify build (a internal; b/c agy) | in-progress (package lock released by A03-block ruling) | Lead F (mixed) | F05 + package-lock released by A03 | package.json UNIT lock (F turn) + Dockerfile + NEW build script | `docs/qa/reports/F07.md` |
| F08 final assets/CSP/cache gate | not-started | Lead F (internal) | F07 + all merged JS tasks | versions + SW via F | `docs/qa/reports/F08.md` |
| F09 store/chat assets (CONDITIONAL) | not-started | Lead F (internal; needs scope approval) | F01 + approval | files fixed at activation | `docs/qa/reports/F09.md` |

## Transfer rule (no auto-commits)

No commits without Hassan's explicit approval. The coordinator moves only the
task's own patches/untracked files from the worker's baseline, reviews them,
re-runs gates, then applies. Stale shared-file patches are rebased to the new
baseline and re-gated before merge — never force-overwritten. See
`docs/qa/agy-session-isolation.md` for why agy runs stay at one session for now.
