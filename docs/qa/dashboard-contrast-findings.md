# Dashboard contrast findings — B06 measure (evidence only, 2026-10-05)

Base: `master@5a8aabb`. Scope: dashboard (embedded `<style>` in
`public/dashboard.html` + `public/style.css` `:root` tokens + dashboard JS
renderers). READ-ONLY: no `public/` / `server/` / `tests/` file touched;
`public/css/dashboard.css` does not exist yet (B02 not landed) — nothing created.
Token implementation waits for the B02+ turn; this doc is the dataset it builds on.

## Method (reproducible)

```bash
export PATH="/root/.config/opencode/tools/node-v24.21.0-linux-x64/bin:$PATH"
node --version   # v24.21.0
```

- WCAG 2.1 relative-luminance + contrast formula implemented inline in `node -e`
  (sRGB linearization, `(L1+0.05)/(L2+0.05)`); no new dependency.
- Opaque pairs computed hex-on-hex. Translucent layers composited
  (`out = α·fg + (1−α)·bg`) over the documented base before ratio:
  page `#06070f`, modal `#0a0c1b`, menu `#111425`, card ≈ white 4% over page,
  inputs ≈ white 3% over page, sidebar ≈ `#0a0c1b` 70% over page (`#090b17`).
- Thresholds: normal text ≥ 4.5:1; large text (≥24px, or ≥18.66px bold) ≥ 3:1;
  UI boundaries / focus indicators ≥ 3:1 where WCAG applies (input borders,
  focus rings). Decorative card borders recorded but out of WCAG scope.
  Disabled pairs are WCAG-exempt — recorded, not graded.
- Dashboard has NO explicit `:disabled` or `::placeholder` rule (verified by
  grep: zero hits in `dashboard.html` embedded CSS) → UA default applies;
  computed values must be sampled in-browser after A03 (gap G-B06-01).

## Dataset — per-pair values

### A. Text on dark surfaces — PASS (all ≥ 4.5:1, normal text)

| # | Foreground | Background (effective) | Ratio | Use |
|---|---|---|---|
| A01 | `#e8eaf6` text | page `#06070f` | 16.78 | body copy |
| A02 | `#e8eaf6` text | modal `#0a0c1b` | 16.21 | modal copy |
| A03 | `#f8fafc` | menu `#111425` | 17.44 | select options |
| A04 | `#8b8fa3` muted | page | 6.27 | secondary text |
| A05 | `#8b8fa3` muted | modal | 6.06 | modal secondary |
| A06 | `#8b8fa3` muted | card-comp | 5.87 | `stat-info h4` (13px caps), card help |
| A07 | `#8b8fa3` muted | preview chip bg | 4.99 | preview placeholder chip (11px) |
| A08 | `#06b6d4` cyan | page / modal / card | 8.28 / 8.00 / 7.75 | links, status, `onboarding-status` (12px bold) |
| A09 | `#10b981` green | page | 7.92 | success text |
| A10 | `#f59e0b` orange | page | 9.36 | warnings, impersonate actions |
| A11 | `#ef4444` red | page | 5.34 | errors, logout text (sidebar bg: 5.21) |
| A12 | `#3b82f6` blue | page | 5.46 | info text, channel icons |
| A13 | `#a855f7` purple-light | page | 5.08 | accents |
| A14 | `#fff` | input bg (white 3% comp) | 19.24 | `.form-control` entered text |
| A15 | `#fff` | bot bubble `#1E293B` | 14.63 | preview bot text (12px) |
| A16 | `#e8eaf6` | secondary-btn bg (white 5% comp) | 15.45 | `.btn-secondary` labels |

### B. Badges / pills (11px ⇒ normal text, ≥ 4.5:1)

| # | Pair | Ratio | Verdict |
|---|---|---|---|
| B01 | green on green-tint (page / card) | 6.57 / 5.98 | PASS |
| B02 | orange on orange-tint (page / card) | 7.58 / 6.86 | PASS |
| B03 | cyan on cyan-tint (page / card) | 6.85 / 6.17 | PASS |
| B04 | red on red-tint, page-level | 4.73 | PASS (marginal) |
| B05 | red on red-tint, **card-level (real context)** | **4.33** | **FAIL → F-B06-03** |
| B06 | `#fff` on `var(--blue)` admin Merchant badge | **3.68** | **FAIL → F-B06-01** |
| B07 | `#000` on `var(--orange)` admin SuperAdmin badge | 9.78 | PASS |
| B08 | `#111827` on `#d97706` impersonation banner | 5.57 | PASS |

### C. Buttons / preview (normal-size text ⇒ ≥ 4.5:1)

| # | Pair | Ratio | Verdict |
|---|---|---|---|
| C01 | `#fff` on gradient stop `#7c3aed` | 5.70 | PASS |
| C02 | `#fff` on gradient stop `#3b82f6` | **3.68** | **FAIL → F-B06-01** (worst end; 15px/14px labels are normal text) |
| C03 | `#fff` on preview user bubble `#06B6D4` (12px) | **2.43** | **FAIL normal AND large → F-B06-02** |
| C04 | send-btn white glyph on `#06B6D4` disc | n/a (icon-only) | noted; fix with F-B06-02 |

### D. Boundaries / focus (≥ 3:1 where WCAG applies)

| # | Pair | Ratio | Verdict |
|---|---|---|---|
| D01 | cyan focus ring vs page | 8.28 | PASS (thickness/offset + clipping still need browser verify — see V-B06-01) |
| D02 | `.form-control` default border (`glass-border`, white 8%) vs page | **1.17** | **FAIL → F-B06-04** (input identifying boundary) |
| D03 | `glass-border-hover` (white 15%) vs page | 1.45 | FAIL as boundary; hover-only, fix with F-B06-04 |
| D04 | logout red border (α 0.3) vs sidebar bg | 1.42 | FLAG → F-B06-05 (low priority; text itself passes) |
| D05 | card `glass` borders | 1.17–1.45 | recorded; decorative containers, WCAG-exempt — no fix proposed |

### Gaps (no static value — browser must sample after A03)

- G-B06-01: `:disabled` (reply input, send btn, toggles, sync btn) and
  `::placeholder` (all `.form-control` placeholders) fall back to UA defaults.
  No grade possible from code. Proposal P-B06-06 covers explicit tokens.

### Out of scope (measured, no action)

- `--text-dim` `#5a5e72` on page = 3.14:1 — ZERO dashboard usage (only
  `style.css` landing rules + `#demoChatInput::placeholder`). B must not touch
  `style.css` globals; no token change proposed.

## Confirmed findings → B02+ implementation turn

- F-B06-01 — white on blue fails normal text (C02 3.68, B06 3.68). Affects
  `.btn-primary` (gradient worst end) + admin Merchant badge. Proposal P-B06-01
  (scoped, in `dashboard.css` only): darken the blue stop / badge bg to
  `#2563eb` (white 5.17 ✓; `#2563eb` on page 3.89 keeps icon use ≥3:1).
  Alternative: keep gradient, force a dark overlay under text — costlier, not
  recommended.
- F-B06-02 — white on `#06B6D4` preview user bubble 2.43 (C03/C04). Proposal
  P-B06-02: default preview bubble/send glyph to near-black `#062a33` on cyan
  (6.24 ✓). Limitation to document: preview mirrors USER theme colors, so
  arbitrary user combos can't be guaranteed — patch covers shipped defaults;
  user-choice validation (if any) is a separate product decision, not B06.
- F-B06-03 — badge-danger on card-tint 4.33 (B05). Proposal P-B06-03: lighten
  badge text `#ef4444` → `#f87171` (5.89 on card-tint ✓), scoped.
- F-B06-04 — input default border 1.17 (D02). Proposal P-B06-04: raise
  `.form-control` border to white 35% (3.11 ✓), keep cyan focus. Decorative
  card borders untouched.
- F-B06-05 — logout red border 1.42 (D04, low). Proposal P-B06-05: raise border
  alpha to ≥0.45 or drop border reliance (text passes independently).
- P-B06-06 (gap G-B06-01): add explicit scoped `:disabled` + `::placeholder`
  tokens (placeholder `color:var(--text-muted); opacity:1` ≈ 6.1 on input bg ✓;
  disabled readable but visibly disabled, not color-alone). Values for the
  implementation turn to finalize against browser-sampled UA defaults.

## Browser-verify items (after A03/A04)

- V-B06-01 — cyan 2px focus outline: verify visible (not clipped by
  `overflow:hidden` cards/modals) on every focusable control, ar/en, 360px +
  desktop. Focus-lifecycle expansion itself is E04-owned.
- V-B06-02 — sample computed `:disabled` + `::placeholder` colors in-browser,
  ordinary/superadmin, ar/en; confirm P-B06-06 values.
- V-B06-03 — gradient button: measure text legibility across the full gradient
  (worst-end reasoning verified visually, not just computed).

## Color-alone check (code-level)

Sampled error/success surfaces pair color with text labels + icons + retry
buttons (`inbox_load_error` + retry, recipients errors + retry, badges carry
text, channel status text). No color-alone meaning found in sampled renderers.
Screen-reader announcement behavior belongs to E06 — not claimed here.

## Counts

Measured pairs: 31 (16 text + 8 badge + 4 button/preview + 5 boundary, minus
overlaps counted once) — 26 PASS, 5 FAIL (F-B06-01..05; F-B06-01 spans 2 rows),
1 gap (G-B06-01), 1 out-of-scope. No WCAG-compliance claim beyond this dataset.
