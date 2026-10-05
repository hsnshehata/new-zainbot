# D09-council — Idea Council jobs/autosave focused audit
Status: awaiting-review (audit complete; no code changed)
Lead / Implementer / Independent reviewer: Lead D / Lead D (internal) / pending (coordinator assignee)
Base / Dependencies / Lock ownership: base per workspace HEAD. READ-ONLY audit of the council section in `public/js/dashboard_new.js` (fns ~6545–8450 per `docs/qa/council-extraction-map.md`, line numbers re-verified below — file is 8672 lines). No shared-file writes; council copy (C05) and modal lifecycle (E03) untouched per scope.
Changed behavior: none (audit-only — justification under findings).
Touched files: none (NEW report only)
Tests: command | exit | assertions/result | artifact
- Council suites (`tests/ideaCouncil/*.test.js`: Api 10, Crypto 4, Quota 1, Schemas 5) | exit 0 | 20/20 pass | console only
- `npm test` (full suite) | exit 0 | all green | `/tmp/opencode/npm-test-d09council.log` (workspace-local)
- `node --check` not re-run (zero code touched)
Browser: viewport | language | scenario | actual result
- not-run (static audit; interactive council flows await A04 scenarios via D09-full)
Cache versions changed: none

## Findings ledger (workflow → covered / existing-correct / explicit-deferred)

1. Save vs run vs poll errors — COVERED (differentiated):
   - Save (`saveIdeaDraft`, 6795): PUT-or-POST by `curId`; silent autosave surfaces via `ideaAutoSaveStatus` (`idea_msg_saving`→`idea_msg_saved`, cleared after 3s); failure clears status, keeps `currentIdea`, returns null — callers abort (`handleIdeaStructureSubmit` `if (!saved) return`). Distinct from run errors.
   - Run (`handleIdeaStructureSubmit` 6858, `handleConveneCouncilSubmit` 6907, `submitFollowupModal` 8104): distinct keys per failure (`idea_structure_failed/error`, `idea_convene_failed`, `idea_followup_failed/error`, quota) + submit buttons disabled synchronously before first await with `finally` restore — no double-run.
   - Poll (`startIdeaPolling`/`poll`, 7027–7082): GET-only `runs/:runId`; poll failures log + keep polling; terminal COMPLETED/PARTIAL/FAILED clear the 2s interval. No mutation, no restart.
2. No job restart on read-retry — EXISTING-CORRECT: poll issues only reads; convene/followup POSTs carry `Idempotency-Key` headers; zero retry loops and zero auto-retry anywhere in-section (single `apiFetch` per action).
3. Autosave drafts — EXISTING-CORRECT: 2s debounce on `ideaRawText` input within 100–8000 chars (`clearTimeout` re-arm, 8264–8274); inputs never cleared by save paths (draft retained incl. failures); manual save button calls `saveIdeaDraft(false)`.
4. Polling lifecycle (2s) — ownership confirmed F/E per plan: timer cleared before re-arm + on terminal states; immediate `poll()` then `setInterval(poll, 2000)`.

## Explicit-deferred (NOT fixed here — fix vehicle noted per item)
- F1 (misleading empty): `loadIdeaCouncilList` catch (6719–6721) and falsy responses (6629) render the EMPTY state — list failure ≡ empty list. Needs D09-full `renderState(error)` + C05 error keys. Left for D09-full (new keys are C05-locked; F04 extraction imminent).
- F2 (stale poll hijack): `ideaNewBtn` (8231) and view switches never `clearInterval(ideaPollTimer)`; a completing old run's 800ms `openIdea(run.projectId)` (7064) can yank a fresh draft into the old report. Needs F04 `dispose()` + E03 lifecycle sign-off — explicitly their ownership.
- F3 (no save-failure surface): manual `saveIdeaDraft(false)` network failure shows no user-facing error (status text just clears). Same D09-full vehicle as F1.
- F4 (duplicate-save races, minor): draft save button and card save button have no pending guard (rapid clicks → concurrent POSTs/PUTs; PUTs idempotent, POSTs can duplicate drafts). D09-full `withPending` candidate; not touched to avoid conflicting with F04 slices.
- F5 (session view without run): `openIdea` QUEUED/RUNNING without `activeRunId` shows session view with no polling and no progress state. Same vehicle as F1.

## Why audit-only
Every fix above needs at least one of: C05-owned `idea_*` keys, F04-owned slice moves, or E03-owned modal/timer lifecycle. A unilateral D edit now would collide with in-flight F04 extraction briefs that use exact line ranges. No small D03-only fix was available without crossing those locks.
Deviations / blockers / remaining gates:
- None blocking this audit. Remaining: independent review; D09-full + F04 consume F1–F5.
Next task permitted by DAG: D09-full remainder (training/FAQ/agents/admin/channel ledger) after its dependencies; council slice is recorded here before F04.
