# ZainBot dashboard frontend guide (A06)

Date: 2026-10-05. Audience: the next implementer touching the dashboard.
This guide describes the contracts **as they are in-tree** (vanilla JS +
Express, no framework). Shared UI *patterns* (cards/buttons/forms/modals)
live in `docs/COMPONENT_LIBRARY.md`; this file covers the five JS
*primitives*, their init order, language interplay, and per-feature cleanup.
For gate commands see `docs/qa/dashboard-release-gates.md`; for route
coverage see `docs/qa/page-inventory.md`.

## 1. Primitives (owner + file + global)

| # | Primitive | Owner | File | Global |
|---|---|---|---|---|
| P1 | Request core (§7.1) | D02 | `public/js/dashboard-request.js` | `window.ZainBotRequest` (`requestJson`, `fetchBlob`, `runExclusive`, `RequestError`) |
| P2 | Feedback / resource states (§7.2) | D03 (E reviews protocol) | `public/js/dashboard-feedback.js` | `window.ZainBotFeedback` (`renderState`, `notify`, `withPending`, `refreshLanguage`) |
| P3 | Focus primitive (§7.3) | E01 | `public/js/ui-accessibility.js` | `window.ZainBotA11y` (`openDialog`, `closeDialog`) |
| P4 | Language adapter (§7.4) | C03 | inside `dashboard_new.js` IIFE (dictionaries stay there by plan) | `window.ZainBotDashboardI18n` (`t`, `getLanguage`, `registerLanguageRenderer`) |
| P5 | Feature loader (§7.5) | F05 | `public/js/dashboard-assets.js` | `window.ZainBotDashboardAssets` (`loadFeature('ideaCouncil'|'settingsSummary')`) |

Rules that cross all five: no automatic retries of mutations; network
timeout after a mutation means *outcome unknown* (reconcile with GET, never
replay); HTTP 401 alone triggers the session callback — 403 is not a logout;
customer data (names, message bodies) is never translated and only ever
lands in `textContent`, never `innerHTML`.

## 2. Initialization order (`public/dashboard.html`, bottom scripts)

```
utils.js → dashboard-onboarding.js → ui-accessibility.js (P3)
  → dashboard-request.js (P1) → dashboard-feedback.js (P2)
  → dashboard-assets.js (P5) → dashboard_new.js (P4 + all consumers)
  → end-of-file boot call `checkAuthAndLoad()` (profile → bots → overview → tab renderers)
```

`settings-summary.js` loads lazily via P5 on first settings entry (not in
the static chain). `dashboard-idea-council.js` likewise loads lazily on
first council entry. Each primitive is dependency-free at load (reads
`document` lazily) and Node-exportable for tests, so unit gates never need
a DOM. If you add a script tag: keep this order, give it a `?v=` pin owned
by your task, and record the pin in your report (plan §3.5; F08 owns the
ledger convention).

## 3. How consumers wire the primitives (copy this shape)

```js
// 1. Request: reads default to 15 s; mutations pass explicit timeout or none.
const data = await window.ZainBotRequest.requestJson(url, { method: 'GET' }, { operation: 'read' });
// 2. Guard concurrency: one in-flight mutation per entity key.
await window.ZainBotRequest.runExclusive('bot:' + botId + ':save', () => save());
// 3. States: loading → ready|empty|filtered-empty|error|stale|no-bot; retry only for READS.
window.ZainBotFeedback.renderState(box, { phase: 'loading' }, { t });
window.ZainBotFeedback.renderState(box, { phase: 'error', key: 'inbox_load_error' },
  { t, onRetry: () => load() }); // reads only — mutations get error text, no retry button
// 4. Pending: disable involved controls, original disabled states restored after.
await window.ZainBotFeedback.withPending('save', [btn], () => save());
// 5. Dialogs: every open/close goes through P3; the integration onClose owns timers/classes.
window.ZainBotA11y.openDialog(el, { opener, background: ['.db-wrapper'], onClose: cleanup });
window.ZainBotA11y.closeDialog(el); // Escape on the top dialog only; stacked dialogs keep isolation
// 6. Language: register once, re-render without refetch, unregister on teardown.
const off = window.ZainBotDashboardI18n.registerLanguageRenderer('my-tab', render);
```

## 4. Language + translation interplay

- Dictionaries (`en`/`ar`) live in the dashboard IIFE (C03); helpers own no
  copy — P2 receives `t` injected per call, P5 chunks consume
  `t`/`getLanguage` passed in at `create()` (never copied).
- Markup text uses `data-i18n`; placeholders `data-i18n-placeholder`;
  accessible labels `data-i18n-aria`. Every new key lands in **both** `en`
  and `ar` in the same change (AGENTS.md contract), enforced by
  `tests/dashboardTranslations.test.js` (12/12 at A06).
- Language switch re-runs registered renderers in place: filters,
  pagination, selected chat, and message drafts are preserved; no refetch on
  switch; no listener is added per switch. Unknown key: loud in development,
  English-fallback-then-key in production (never invented copy).
- Dates/numbers use explicit `ar-EG`/`en-US` formatting (C06); IDs, phones,
  and emails stay unformatted strings.

## 5. Cleanup contract per feature (checklist before you call a tab done)

1. **Polling/timers:** every `setInterval`/`setTimeout` the tab starts is
   cleared on tab-leave, dialog-close (`onClose`), bot-switch, and logout.
   Stale-poll replies must never render into a newer bot/tab (generation
   guard — see D04/D05).
2. **Dialogs:** close removes `.active`, restores focus to the opener (or
   the page heading for user-navigation selections, E04), releases `inert`,
   and restores scroll-lock. Verify all close paths: button, cancel, save,
   Escape, outside-click, and (drawer) scrim/resize/menu-selection.
3. **Locks:** `runExclusive` keys are per-entity (`bot:<id>:save`); rejection
   releases in `finally`. No lock is held across navigation.
4. **Language renderers:** each `registerLanguageRenderer` returns an
   unregister — call it when the feature unmounts (P5 chunks do this in
   `dispose()`).
5. **Lazy chunks:** a failed `loadFeature` evicts the pending promise so a
   manual retry issues a fresh request; the loader map is static same-origin
   (never a user-supplied URL); loading/error surfaces reuse P2.
6. **Secrets:** serialized payloads never carry API keys/tokens/session
   state (serializers strip them; G9/G10 assert this). Credential inputs are
   `type="password"` + `autocomplete="off"` and are cleared from memory
   after submit; connector secrets are never written to `localStorage`.

## 6. What is deliberately NOT in this guide

- Visual shell extraction (B02, not-started) and theme choice (B07,
  conditional) — no new stylesheet or toggle exists to document.
- Store/chat-widget internals beyond the dashboard boundary (E08/F09,
  conditional) — see the inventory for the activation conditions.
- Any browser-only behavior as proven fact: keyboard/focus/announcement
  claims rest on fixture-level gates (E01/E06/D03 suites); live SR order,
  timing, and cross-browser quirks are recorded NOT-RUN (`COMPONENT_LIBRARY.md` §7).
