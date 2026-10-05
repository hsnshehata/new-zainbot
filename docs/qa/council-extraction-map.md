# Council extraction map — F04a (read-only characterization)

Date: 2026-10-05. Method: static reads of `public/js/dashboard_new.js`
(8672 lines) only. **No code moved, no shared file written.** This map is the
input to F04b/c/d mechanical moves and the `window.ZainBotIdeaCouncil.create`
contract review.

> Plan's "~5484–7339" range is STALE (file has grown). Verified current
> section below — F04b/c/d briefs must use these numbers, not the plan's.

## 1. Section boundaries (verified)

| Item | Lines |
|---|---|
| Banner `IDEA COUNCIL FRONTEND CONTROLLER` | 6541–6543 |
| Council code (state + 33 functions) | 6545–8450 (~1906 lines) |
| Adjacent, NOT council: settings-hooks exposure (`window.switchTab`, `window.__zainbotSettingsHooks`) | 8452–8454 — must stay |
| Next section (`Manual subscriptions`) starts | 8455 |

## 2. State variables (6545–6550) + const (6572–6581)

`currentIdea`, `currentIdeaRunId`, `ideaPollTimer`, `ideaAutoSaveTimer`,
`ideaCurrentFilter` (default `'ALL'`), `ideaUsageData`, `COUNCIL_MEMBERS`
(8 members; `labelKey`/`roleKey` resolved via `ideaT`, e.g. line 7004).

No `window.*` assignments anywhere in 6541–8450 (clean — no new globals to
preserve). No `localStorage`/`sessionStorage`. No bot scoping
(`currentBot`/`botId` never referenced — council is account-level, which
simplifies the contract: no bot dep).

## 3. Function inventory (33 declarations, exact lines)

| Line | Function | F04 slice |
|---|---|---|
| 6552 | `escapeIdeaHtml` | b (pure) |
| 6562 | `ideaT` | — (replaced by contract `t`; see §5) |
| 6583 | `showIdeaView` | b (DOM-only view switch) |
| 6598 | `loadIdeaCouncilData` | c (entry loader: usage + list) |
| 6605 | `loadIdeaCouncilUsage` | c |
| 6620 | `loadIdeaCouncilList` | c |
| 6724 | `openIdea` | c |
| 6761 | `populateStructuredCardForm` | b |
| 6786 | `updateIdeaCharCount` | b |
| 6795 | `saveIdeaDraft` | c |
| 6858 | `handleIdeaStructureSubmit` | c |
| 6907 | `handleConveneCouncilSubmit` | c |
| 6986 | `renderCouncilAgentsGrid` | b |
| 7027 | `startIdeaPolling` (+ inner `poll` ~7033) | d (lifecycle) |
| 7086 | `renderRunsHistoryBar` | b |
| 7157 | `renderIdeaReport` | b/d (render + run-select lifecycle) |
| 7309 | `renderCriticsBreakdown` | b |
| 7557 | `updateUnitEconomicsDisplay` | b |
| 7640 | `renderUnitEconomics` | b |
| 7683 | `openIdeaCompareModal` | c + **E03-owned lifecycle** (§6) |
| 7744 | `closeIdeaCompareModal` | c + E03 |
| 7758 | `handleCompareSelectChange` | c |
| 7769 | `renderRoundsComparison` | b |
| 7897 | `renderTruthBoard` | b |
| 7955 | `updateTruthItem` | c |
| 7979 | `openIdeaFollowupModal` | c + **E03-owned lifecycle** (§6) |
| 8059 | `closeIdeaFollowupModal` | c + E03 |
| 8073 | `updateFollowupTypeButtons` | b |
| 8104 | `submitFollowupModal` | c |
| 8193 | `handleFollowUpClick` | c |
| 8197 | `exportIdeaReport` | d (lifecycle; auth-header gap §7) |
| 8228–8450 | `initIdeaCouncil` (all listener wiring) | c (must become idempotent) |

All 33 names verified UNIQUE file-wide (no duplicate definitions to
disambiguate). Zero inline `onclick=` handlers — all wiring is
`addEventListener` inside `initIdeaCouncil` (~30 bindings: `ideaNewBtn`,
`ideaCancelInputBtn`, `ideaRawText` input, `ideaSaveDraftBtn`,
`ideaCreateForm` submit, `ideaCardBackBtn`, `ideaSaveCardBtn`,
`ideaCardEditForm` submit, `ideaReportBackBtn`, `ideaExportMdBtn`,
`ideaExportPdfBtn`, `.idea-filter-btn[]`, `.idea-followup-btn[]`,
`.idea-followup-modal-close[]`, `#ideaFollowupModal` backdrop,
`.idea-strategy-chip[]`, `.idea-fup-type-btn[]`, followup input/counter,
`ideaFollowupSubmitBtn`, `ideaCompareRoundsBtn`,
`.idea-compare-modal-close[]`, `#ideaRoundsComparisonModal` backdrop,
`ideaCompareSelectA/B` change).

## 4. API surface (13 `apiFetch` sites → 13 route shapes, all `/api/idea-council/…`)

`usage` (6607) · `ideas`+query (6628) · `ideas/:id` DELETE (6710) ·
`ideas/:ideaId` GET (6726) · `draft/:curId` PUT (6832) · `draft` POST (6837) ·
`ideas/:id/structure` (6885) · `ideas/:id/card` POST (6953) +
`ideas/:id/card` PUT (8327) · `ideas/:id/convene` (6959) · `runs/:runId`
poll (7035) · truth-items ×2 variants (7959–7960, via 7955) ·
`ideas/:id/follow-up` (8154). Plus RAW `fetch` (not apiFetch) for
`ideas/:id/export?format=` (8201, blob download — see §7 gap).

## 5. i18n surface (C05-relevant)

- **91 unique `ideaT('…')` keys** used in-section (full list recoverable via
  `grep -o "ideaT('[A-Za-z0-9_]*'" public/js/dashboard_new.js | sort -u`).
  Dictionaries stay in `dashboard_new.js` per plan — the chunk consumes `t`,
  never copies them.
- 16 `member_*` label/role keys via `ideaT(member.labelKey…)` (6573–6580,
  consumed ~7004); verdict `labelKey`s (~7183, e.g. `idea_verdict_build`).
- Direct `translations`/`currentLanguage` coupling OUTSIDE `ideaT` (contract
  must cover each): `ideaT` fallback body (6562–6570); locale date format
  `ar-EG`/`en-US` (~6658, C06-adjacent — keep call-site behavior, do not
  reformat); RTL arrow icon swap (~6684); report-language default
  `currentIdea.reportLanguage || currentLanguage` (~6741); output-lang
  default (~8248).

## 6. E03 lifecycle touchpoints (E03 owns, F04 must not change semantics)

- `openIdeaCompareModal`/`closeIdeaCompareModal` (7683–7757) and
  `openIdeaFollowupModal`/`closeIdeaFollowupModal` (7979–8072) already consume
  the E01 primitive via `window.ZainBotA11y.openDialog(modal, { opener:
  activeElement-or-undefined, background: .db-wrapper, onClose: remove
  .active })` with try/catch + explicit `closeDialog` + `finally` fallback.
- E03e timer guard present in-section: delayed prompt focus fires ONLY while
  `.active` (~8056). These two dialogs ARE E03's `ideaFollowup` /
  `ideaRoundsComparison` scope — F04 moves wiring only after E03 signs off
  the lifecycle; no open/close semantic change in the extraction patch.

## 7. Feedback / timers (contract `feedback`, `dispose`)

- ~15 `confirm()`/`alert()` sites (delete confirm ~6770, length/validation
  alerts, quota/structure/convene/compare/followup/export failures) — all map
  to the contract `feedback` dep (D03-style `notify`), never `window.alert`
  new code. Blocking-`confirm` for delete needs a confirm-pattern decision
  at F04c time (not in this map).
- `ideaPollTimer`: cleared before re-arm (7027/7068), cleared on terminal
  states, `setInterval(poll, 2000)`; NOTHING clears it on tab-leave today —
  `dispose()` must `clearInterval`. `ideaAutoSaveTimer`: re-armed per input
  with `clearTimeout` (~8326–8329) + 3s status-clear `setTimeout` (~6847) +
  1.2s truth-flash `setTimeout` (~7969) — `dispose()` must clear both named
  timers; fire-and-forget UI timeouts are benign but documented here.

## 8. Hooks AFTER the section that must stay (never moved)

- 8452–8454 settings-hooks exposure (adjacent, unrelated).
- `switchTab` → `loadIdeaCouncilData()` (2350–2351): post-extraction call
  site becomes the chunk's `load()`; `switchTab` itself stays.
- Boot `initIdeaCouncil()` (8668, beside `checkAuthAndLoad()` +
  `applyLanguage`): becomes `create(…).init()`; call ORDER preserved.
- `applyLanguage` (2272+) re-renders orders/bookings/keys/logs/admin/menus
  but **no council view**, and no council renderer is registered
  (2322–2329 cover agents/recipients/admin/chat/feedback only) — council
  dynamic content is STALE across language switches today. Contract
  `refreshLanguage` must specify the re-render set (list/report from
  in-memory state, no refetch); requires C03 adapter first (F04 waits C03).

## 9. Break-if-moved flags (F04b/c/d briefs must respect)

1. Partial moves break: all 33 fns are IIFE-hoisted declarations calling each
   other (`initIdeaCouncil` alone references ~20). Move per-slice ONLY with
   its callees or after the full set lands; never extract one renderer
   mid-edit by another track (shared LOCKs).
2. `initIdeaCouncil` is NOT idempotent (unconditional `addEventListener`) —
   contract `init()` must guard; `dispose()` must detach (AbortController or
   named-handler removal), else re-init double-binds ~30 listeners.
3. `exportIdeaReport` needs an AUTH HEADER for blob `fetch` — `requestJson`
   (§7.1) has no blob/download shape. Contract gap: either extend
   `requestJson` for blob responses (D02 owner) or declare an explicit
   `getAuthedBlob(url)` dep. Do NOT silently keep a `getToken()` closure
   capture (current line 8200–8202).
4. `tests/dashboardTranslations.test.js` (C01-OWNED lock) scans
   `dashboard_new.js` source for `ideaT('key')` and requires each key in both
   dicts. Moving code OUT shrinks the scanned set (no false failure) but the
   new file's `t('…')` keys would go UNSCANNED unless the test also reads
   `dashboard-idea-council.js` — that edit needs C01 coordination, never a
   unilateral F04 change; "update WITHOUT silencing" per plan.
5. Verdict/unit-econ label maps (~7183+) resolve keys at render time — keep
   resolution call sites intact, not the key strings.
6. F05-lazy readiness: after eager split, total gzip must stay within +5% of
   the F01 baseline (139939 gzip); chunk names must match the F03-tested
   assumption (install prefetches NO `dashboard-idea-council` chunk —
   `tests/serviceWorker.test.js` asserts this; keep the filename stable or
   update that test in the same patch).

## 10. Proposed contract boundary (for review, not implemented)

`window.ZainBotIdeaCouncil.create({ requestJson, getLanguage, t, feedback,
a11y }) → { init, load, dispose, refreshLanguage }` where: `init` = today's
8228–8450 wiring (idempotent-guarded); `load` = 6598 entry (usage + list);
`dispose` = clear `ideaPollTimer` + `ideaAutoSaveTimer` + detach listeners +
unregister language hook; `refreshLanguage` = re-render from
`currentIdea`/`ideaUsageData`/list state, no fetch. Extra deps to declare:
blob-download auth (flag 3), `switchTab`-adjacent `showIdeaView` stays
internal. No new mutable globals.
