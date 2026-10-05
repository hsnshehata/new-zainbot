# Dashboard i18n audit — final bilingual verdict (C08)

Date: 2026-10-05. Scope: dashboard (all tabs/modals/statuses) × ar/en. Method: full static
sweep of `public/js/dashboard_new.js` (7610 lines; council code since moved to
`public/js/dashboard-idea-council.js` by F04) + `public/dashboard.html` + `public/js/auth.js`
+ `login.html`/`register.html` + `public/js/settings-summary.js`; re-ran translation suites +
full `npm test`. No product edits in this task — findings doc only.

Dictionary health (asserted in `tests/dashboardTranslations.test.js`, SCAN_PATHS now covers
both dashboard js files):

- `en` 1027 entries, `ar` 1027 entries, full parity both directions, zero empty values.
- Markup: 628 `data-i18n` + 29 `data-i18n-placeholder` + 19 `data-i18n-aria`, all resolve.
- Lookup styles remaining: `t.key` tables, `ideaT(key)` (council, pre-move sites), injected
  `t('key')` (council chunk, 111 refs), `formatDate/formatNumber` (+ `format_date_unavailable`).
- Whole-file sweep: **0** inline `currentLanguage` copy ternaries (2 remain, both non-copy:
  `rtl/ltr`, `EN/AR` toggle label), **0** bare `textContent` literals, **0** `alert/confirm/
  prompt` with literal args, **0** `adminCopy` refs (helper removed in C04e).

## 1. Per-tab audit matrix

| Tab / area | Markup keys | Dynamic renderers | Accessible names | Switch retention | Locale | dir | Verdict |
|---|---|---|---|---|---|---|---|
| Overview/stats | keyed | counts are raw ints (locale-neutral) | ok | n/a (no fetch on switch) | n/a | flips | PASS |
| Agents | keyed (incl. digest options) | registry `agents`, no refetch | E07 done | selection kept | n/a | flips | PASS |
| Inbox | keyed | registry `chat-list`, no `selectChat` refetch; content never translated | send btn → O3 | selected chat kept, drafts kept | n/a | flips | PASS w/ O3 |
| Training/FAQ | keyed | direct re-render, no refetch | E02a/b lifecycles | drafts kept | n/a | flips | PASS |
| Channels/QR/relink | keyed (cards proper nouns → D3) | polling untouched, status keyed | E02 lifecycles | snapshot-guarded | n/a | flips | PASS w/ D3 |
| Orders/bookings | keyed | direct re-render, no refetch | titles keyed | filters kept | C06 helpers + bdi | flips | PASS |
| Settings/summary/keys/webhook/notifs | keyed | summary via adapter, no dict dup | ok | n/a | C06 dates | flips | PASS |
| Admin/subs/impersonation | keyed (filters, banner, exit btn) | registry `admin-users`, pagination kept | ok | filters/pagination kept | C06 dates | flips | PASS |
| Idea council (chunk) | keyed | F04 chunk, injected `t`, no `translations`/`currentLanguage` refs | E03 lifecycles | registry-external | none | flips | PASS |
| Auth (login/register) | parity green | keyed re-render, no request/reset | E07 done | form state kept | n/a | flips | PASS |

## 2. Findings ledger

Resolved (11): R1 duplicates (C04b + this fix round: three `idea_status_*` dupes from
the C05 key landing deleted, dead-first-copies only, live values kept) · R2 Ship/Delivered/
Created/fallbacks (C04b/C04f) · R3 inbox (C04c) · R4 training/agents (C04d) · R5 adminCopy +
Arabic-only block (C04e) · R6 settings/keys/webhook/notifs (C04f) · R7 council+channels
(C05×2) · R8 locale (C06) · R9 auth live-switch (C07) · R10 persistence (C02) ·
R11 adapter+registry (C03).

Deferred by design / with reason (8):
- D1 customer data (names/messages/prompts/results/phones/IDs/service defaults) — never
  translated, plan §3.3. Standing rule, not debt.
- D2 server free-text passthrough — untranslated by C07 rule; only known codes map.
- D3 channel-card proper nouns (`WhatsApp Business`, …) — product names stay; revisit only
  if brand ar-names are decided. Owner: coordinator (product decision; no track owns it).
- D4 dynamic codes (`agentType`, `chat.channel.toUpperCase()`, unknown `ev_*`) fall back to
  raw — code→label maps need a product decision. Owner: coordinator (product decision).
- D5 utils.js hardcoded Arabic throws — out of C allowlist; owner: shared-utils owner +
  coordinator (flagged in C07).
- D6 council unit-econ browser-locale numbers + user subscription-table date — outside C06's
  listed scope; follow up with F04/C08-next.
- D7 agentModalTitle applyLanguage-clobber quirk — needs registry/re-render decision
  (C03/E02 owners); behavior predates C-track, unchanged.
- D8 chat-page title data-defaults (`ZainBot AI Sales Agent`) — merchant-content defaults
  with the D1 class; grouped with O2 for one cleanup.

Open (3, each with owner — none blocks a bilingual PASS for shipped scope):
- O1 SUPERSEDED by F04d: the chunk `t('key')` call-style refs ARE asserted —
  `tests/dashboardTranslations.test.js:174-186` collects them from the council chunk
  and resolves against the dashboard dictionaries, green in the 12/12 run. The earlier
  O1 text checked only the `t.key`-property helper (lines 81-89) and was wrong; the
  test as a whole covers both call styles. Closed, no action needed.
- O2 dead `|| 'English'` fallbacks where keys exist (chat_page ×3, btn_trigger ×2,
  subscription_current_free ×1). Owner: C-lite follow-up or chatPageModal owner. Zero
  behavior change (fallbacks never fire).
- O3 `chatSendBtn` icon-only with no static accessible name. Owner: E (aria). (E07 done;
  single missed button.)
- O4 A04 browser language scenarios (AR→EN→AR UI, hit-tested clicks) — NOT-RUN: no
  `tests/browser` harness exists. Owners: A03/A04. No browser PASS is claimed anywhere
  in the C-track.

## 3. Out-of-scope → page inventory (A06)

Non-dashboard pages were not audited and no claim extends to them: public widget/chat/store/
landing internals beyond `landingTranslations`, auth pages beyond login/register switching.
`landingTranslations` 3/3 green as regression only.

## 4. Evidence

- `node tests/dashboardTranslations.test.js` → 12/12 · `landingTranslations` → 3/3 ·
  `loginTranslations` → 2/2 · `npm test` exit 0 (604 ✔, 0 ✖) | `docs/qa/reports/attachments/c08-fixround.log`
- No whole-site claim: dashboard success ≠ full-site translation (plan §C08).

## 5. Countersign handoff (reviewer ≠ implementer)

Auditor (Lead C) also implemented C01–C07, so this audit is NOT self-countersigned. Handoff:
independent reviewer (assigned by coordinator — must not be Lead C) to countersign §§1–2 and
O1–O4 ownership, then C08 moves to completed. Report: `docs/qa/reports/C08.md`.

---
*Provenance: C01 inventory (13 duplicates, per-renderer literal map, routing table) is
superseded by §§1–2 above; kept in git history.*
