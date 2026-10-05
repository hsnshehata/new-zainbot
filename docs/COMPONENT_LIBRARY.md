# ZainBot shared UI patterns (as used — E06 acceptance record)

> This document DESCRIBES patterns already in the codebase. It invents no
> new components and proposes no native-element replacements (no custom
> select/toggle). Counts were measured 2026-10-05 against
> `public/dashboard.html` + `public/js/dashboard_new.js`; they will drift
> as tracks land — re-measure, never quote stale numbers.

## 1. Cards — `.glass-card` (88 uses: 83 html + 5 JS-rendered)

Frosted container for dashboard sections and modal sub-panels. Usage:
info panels, stat cards, tool-setting sub-cards inside `agentForm`,
channel rows. No heading/role contract — authors supply their own
headings; do not rely on a card alone to name a region.

## 2. Buttons — `.btn` + variant + size (native `<button>`)

- Variants in use: `btn-primary` (submit/save), `btn-secondary`
  (cancel/close/utility). Sizes: default, `btn-sm` (modal/footer/d dense
  rows), `btn-block` (full-width, e.g. sidebar logout).
- Icon-only buttons MUST carry an accessible name via the C dictionaries
  (`data-i18n-aria` → `aria-label` through `applyLanguage`); icon `<i>`
  elements are decorative.
- Never `type`-less buttons inside forms: modal submits use explicit
  `type="submit"` (often with `form=` from the footer); cancel/close use
  `type="button"`. Navigation items are native `type="button"` (E04).
- Danger actions keep the red-border convention
  (`border-color:rgba(239,68,68,.3); color:var(--red)`), never color alone.

## 3. Forms — `.form-group` + `.form-control` (128 controls: 124 html + 4 JS-rendered)

- One `.form-group` per field: `<label for>` ↔ control `id` (E05 slices;
  hidden inputs exempt). Native inputs/selects/textareas only.
- Help text is a `<small>` linked via `aria-describedby` ONLY where it
  exists in markup (recipient target, admin password); never invent a
  link to form-level prose.
- Checkbox groups (recipient events, webhook events, agent skills,
  customizer toggles) use wrapping `<label>`s; multi-box groups add
  `role="group"` + `aria-labelledby` on the group caption.
- Client-invalid fields get `aria-invalid` + describedby linkage and first-
  invalid focus (auth forms, E07); server-general errors stay on the
  shared region, never pinned to a random field.

## 4. Modals — `.db-modal` × 12 (E02/E03 lifecycle)

Structure: `.db-modal#id[role=dialog][aria-modal][aria-labelledby]`
> `.db-modal-content` > `.db-modal-header` (title + X close) +
`form/.db-modal-body` + optional `.db-modal-footer` (cancel/submit).
Every open/cancel/close/save-success path runs
`window.ZainBotA11y.openDialog/closeDialog` (§7.3): opener captured,
`.db-wrapper` isolated, focus trapped + restored, Escape closes the top
dialog only. `.active` is the visual switch AND the QR session-poll gate
(channelModal) — every close path removes it. Close buttons are scoped
to their own dialog; no global fan-out. Dynamic content is injected
synchronously before open (or live-queried after) so focus never traps a
stale set. Exception: `openUserBotsModal` reuses channelModal (E03c).

## 5. Feedback — the ONE helper (`window.ZainBotFeedback`, §7.2)

- `renderState(container, state, { t, onRetry?, colSpan? })`: phases
  loading/ready/empty/filtered-empty/error/stale/no-bot. Replace-phases
  clear; error/stale PRESERVE content (failures never fake empty).
- `notify({ level, key, params }, t)`: success/info → polite
  `role="status"`; error → persistent `role="alert"`. Single shared
  `#feedbackLiveRegion` (direct `<body>` child — never inert, never
  inside a dialog). Never moves focus, never auto-dismisses errors.
- `withPending`: disables controls, restores ORIGINAL disabled states.
- All strings come from injected `t()` (C03/C07 keys); external data lands
  in `textContent` only. No toast framework, no second region per event.
- Errors belong in the ACTIVE dialog's container (proven in
  `tests/uiFeedbackAcceptance.test.js`); post-close success belongs on
  the body region. Feature-specific regions (bootstrap, relink banner,
  channel statuses, store connector) are disjoint by feature — do not
  mirror one outcome into two regions.

## 6. Navigation & disclosure (E04)

- Sidebar items are native buttons with `data-target`; the active one
  carries `aria-current="page"`. User navigation focuses the page
  heading (section fallback where no heading exists); refresh paths
  never move focus. Mobile drawer opens through the dialog lifecycle
  (trap + `.db-main` isolation; scrim stays live); scrim/Escape/
  selection/resize converge on one cleanup. Account menu is a plain
  disclosure (`aria-expanded` + `aria-controls`; no menu/menuitem
  roles): Escape returns to the trigger, outside-click closes silently.
- Keyboard focus is always visible via scoped `:focus-visible` rules
  (cyan outline, nav + header controls only).

## 7. Screen-reader pass record (E06 — NOT comprehensive)

- Method: static markup audit + `node:test` behavioral fixtures with a
  fake DOM (live tab queries, focus tracking, role assertions). Tool:
  repo harness only (`node --check`, `node tests/*.test.js`, full
  `npm test`). No browser, no Chrome, no assistive technology is
  available in this container (per A01 baseline), so no live SR run
  exists.
- Covered: dialog semantics/close names (12 modals, static), focus trap
  + Escape + restore logic (fixture-level, E01 18 tests), polite vs
  assertive roles + single-region + no-focus-theft (D03 16 unit +
  E06 4 integration tests), label associations (E05 slices + E07 auth).
- NOT covered (no claim): real screen-reader announcement order/timing
  (NVDA/VoiceOver/TalkBack), braille output, high-contrast/forced-colors
  behavior beyond the scoped focus outline, cross-browser AT quirks.
  These need the A03/A04 browser harness + a human AT pass before any
  "accessible" claim beyond tested keyboard/focus semantics.
