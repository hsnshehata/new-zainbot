# Dashboard responsive findings — B01 (code audit, 2026-10-05)

Base: `master@5a8aabb`. Scope: `public/dashboard.html` embedded `<style>` + inline
layout markup, `public/style.css` shared rules affecting the dashboard,
`public/js/dashboard_new.js` renderers (read-only). No `public/` file edited.

Method (reproducible, no browser — browser measuring waits for A03 harness):

```bash
export PATH="/root/.config/opencode/tools/node-v24.21.0-linux-x64/bin:$PATH"
node -e "
const fs=require('fs');
const html=fs.readFileSync('public/dashboard.html','utf8');
const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
console.log('dvh:',(html.match(/dvh/g)||[]).length,'| reduced-motion:',(html.match(/prefers-reduced-motion/g)||[]).length);
css.split('\n').forEach((l)=>{ if(/100vh/.test(l)) console.log('VH:',l.trim().slice(0,100)); });
for(const m of html.matchAll(/style=\"[^\"]*grid-template-columns:([^\";]+);?/g))
  if(/\d+px/.test(m[1])) console.log('PXGRID:',m[1].trim().slice(0,100));
for(const m of html.matchAll(/<table[^>]*>/g)){
  const ctx=html.slice(Math.max(0,m.index-900),m.index);
  if(!(/custom-table-container/.test(ctx.slice(-600))||/overflow-x\s*:\s*auto/.test(ctx)))
    console.log('UNWRAPPED:',m[0].slice(0,90));
}"
```

Matrix to measure in browser after A03 (per plan §B01/A04):
viewports `360×800 / 390×844 / 768×1024 / 1440×900` + edges `991/992` +
`844×390` landscape × languages `ar/en` × roles `ordinary/superadmin`.
Overflow/clipping measured INSIDE containers (per plan: body `overflow-x:hidden`
+ `html overflow-x:clip` mask page-level symptoms).

## Confirmed findings (code-level, browser must verify geometry)

### F-B01-01 — customizer grid keeps 2 columns with 340px floor on tablets → B03
- Selector: `.chat-customizer-grid` (`dashboard.html:2891`, inline
  `grid-template-columns: minmax(0,1.15fr) minmax(340px,400px)`).
- Only collapse rule: `@media (max-width:600px)` → single column
  (`dashboard.html:849-851`). Band `601–991px` (and narrow desktop windows)
  keeps two columns with a fixed 340px preview floor.
- Repro: `768×1024`, open `#chatPageModal`, ar+en. Controls column is squeezed;
  General-Info grid (`:2957`, plain `1fr 1fr`, no responsive class) stays 2-col
  (~120px inputs at 640px viewport); preset cards (`:2899` `repeat(3,1fr)`)
  ~90px each.
- Expected: collapse by available width (container query on the modal body or a
  higher breakpoint ≈860px); preview + controls + footer Save never hidden;
  keep 2 columns where width allows.
- Proposed B03 patch (bounded): move the grid rule + a container query (or
  `@media (max-width:860px)` fallback) into `dashboard.css`; add
  `.chat-customizer-grid > *{min-width:0}`; collapse preset grid to 1 col under
  the same query. Gate: `node tests/chatPageCustomizer.test.js` + browser.

### F-B01-02 — customizer grid children lack min-width:0 → B03
- Selectors: `.customizer-controls`, `.customizer-preview-pane`
  (`dashboard.html:2894,3029`). Grid items default `min-width:auto`; the 600px
  rule collapses tracks but does not release item minimums, so long
  unbreakable content (URLs are `break-all`, OK; color rows/preset cards less
  so) can force overflow. (Compare: `.db-responsive-grid > *` already has
  `min-width:0`, `:331-333`.)
- Repro: `360×800`, `#chatPageModal`, type a long slug/title, ar+en.
- Expected: no horizontal overflow inside `.db-modal-body`.
- Proposed B03 patch: `.chat-customizer-grid > *{min-width:0}` in
  `dashboard.css`.

### F-B01-03 — preset/theme + followup grids fixed multi-col at 360px → B03
- Selectors: preset cards `repeat(3,1fr)` (`:2899`); `#ideaFollowupTypeGrid`
  `repeat(auto-fit,minmax(130px,1fr))` (`:3133`, self-collapsing, OK).
  The preset grid has no collapse at any width.
- Repro: `360×800`, `#chatPageModal` presets row, ar+en.
- Expected: presets stack or scroll without clipping; tap targets reachable.
- Proposed B03 patch: collapse preset grid to `1fr` (or 2-col) under the same
  customizer query. (Followup modal lifecycle is E03-owned; layout-only turn
  via lock.)

### F-B01-04 — 100vh without dvh fallback (7 uses, 0 dvh) → B04
- Selectors: `body`, `.db-wrapper`, `.db-main` (`min-height:100vh`);
  `.db-sidebar` (`height:100vh`, `:61`); `.inbox-layout`
  (`height:calc(100vh - 200px)`, `:431`); `.db-modal-content`
  (`max-height:calc(100vh - 24px)`, `:826`); `#chatPageModal .db-modal-content`
  (`max-height:92vh`, `:2868`); `#ideaFollowupModal` (`90vh`, `:3112`).
- Repro: `390×844` + `844×390` landscape with mobile browser chrome, ar+en:
  sidebar footer (logout), modal bottoms can sit under the URL bar.
- Expected: `height:100vh; height:100dvh` (+ same pattern for calc/max-height).
- Proposed B04 patch (bounded): dvh-with-fallback for the listed selectors in
  `dashboard.css`; scroll regions get `min-height:0` where flex needs it. No
  site-wide change.

### F-B01-05 — no dashboard-scoped reduced-motion → B04
- Evidence: 0 `prefers-reduced-motion` hits in `dashboard.html`. The dashboard
  inherits the site-wide `*` kill-switch in `style.css:1918-1927` (NOT owned by
  B; B02 forbids touching `style.css` globals) and animates
  `.db-page.active{animation:fadeIn}` (`:326-329`) plus `var(--transition)`
  hovers/transforms.
- Expected: dashboard-scoped override (never site-wide) per plan §B04.
- Proposed B04 patch: `@media (prefers-reduced-motion:reduce)` scoped to
  `.db-wrapper`/`.db-modal` disabling fade/slide/transform in `dashboard.css`.

### F-B01-06 — #adminUserFilters 5-col fixed until 600px, card clips (overflow:hidden) → B05c
- Selector: `#adminUserFilters`
  (`:2159`, `minmax(180px,2fr) repeat(3,minmax(120px,1fr)) auto`).
  Collapse to 1 col exists only at `@media (max-width:600px)` (`:846-848`).
  Min-content ≈ 180+3×120+~90(Apply)+40 gaps ≈ 670px; at 601–700px viewports the
  card inner is ~530–600px and `.glass-card{overflow:hidden}` (`:261`) clips
  instead of scrolling → Apply button unreachable, not scrollable.
- Repro: `768×1024` (or `601px` width), superadmin, `#page-admin` users,
  ar+en. Measure Apply button rect vs card rect.
- Expected: intermediate collapse/wrap, or horizontal scroll INSIDE a container.
- Proposed B05 patch (bounded): add a `≤900px` step (2-col wrap) in
  `dashboard.css`, keep 600px 1-col; use logical properties. Browser + sidebar
  test gate.

### F-B01-07 — admin .db-table hardcoded text-align:right in both dirs → B05c
- Selectors: 3× `<table class="db-table" style="...text-align:right;">`
  (`:2184,2286,2322`); 4th table (`:2393`) has no align.
- Repro: EN/LTR superadmin admin tables — content right-aligned; mixed AR/EN
  cells misalign.
- Expected: logical alignment (`text-align:start` via CSS, remove inline).
- Proposed B05 patch: drop inline `text-align`, add
  `.db-table{text-align:start}` (+ keep numeric cells as-is) in `dashboard.css`.

### F-B01-08 — fixed 1fr-1fr sub-grids with no responsive class stay 2-col at 360px → B05c
- Selectors: `#bookingToolSettingsGroup` (`:2574`),
  `#dailyDigestSettingsGroup` (`:2639`), `#salesUpsellSettingsGroup`
  (`:2662`), customizer General-Info (`:2957`, B03-owned),
  `#ideaFollowupModal` critic/tone grid (`:3171`), compare selects (`:3240`).
  None carries `.db-responsive-grid`, so the 991px collapse does not apply;
  at 360px columns are ~140px → inputs/selects cramped.
- Repro: `360×800`, settings automation groups + followup/compare modals, ar+en.
- Expected: stack to 1 col ≤600px (or carry the responsive class).
- Proposed B05 patch: give these rows a shared collapse rule in
  `dashboard.css`. Council modals need E03 lock coordination (layout-only).

### F-B01-09 — modal footers/headers can overflow at 360px with long AR labels → B05
- Selectors: `.db-modal-footer` (`:707-713`, `display:flex;
  justify-content:flex-end; gap:12px`, NO `flex-wrap`); `.db-modal-header`
  h3 has no `min-width:0`/ellipsis (e.g. followup header `:3113-3127`:
  icon + title + badge + close).
- Repro: `360×800`, ar, booking/chatOrder/agent/admin modals with long titles
  and two-button footers. Measure footer row overflow.
- Expected: footer wraps (`flex-wrap:wrap`) with actions still clickable;
  header title truncates instead of pushing the close button out.
- Proposed B05 patch: `.db-modal-footer{flex-wrap:wrap}` +
  `.db-modal-header h3{min-width:0; overflow-wrap:anywhere}` in `dashboard.css`.

## Browser-verify items (no code defect proven; measure after A03)

- V-B01-01 — `#chatActiveUser` has no ellipsis rule (unlike `.chat-item-name`);
  long names may push the auto-reply toggle in `.chat-area-header` (no wrap) at
  360px. Scenario for B05a with long AR/EN names.
- V-B01-02 — short-height desktop (e.g. `1440×500`): `.inbox-layout`
  `min-height:500px` floor vs `calc(100vh-200px)`; drawer logout + last menu
  item (incl. superadmin admin entry) reachability at `844×390` landscape.
  Scenario for B04.
- V-B01-03 — touch targets on touched controls only: `.btn-sm` computes to
  ~38px height (`9px×2 + ~20px` text at 14px) under the 44px recommendation;
  icon-only closes (`padding:6px 10/12px`) are smaller. Do NOT inflate all
  buttons; B05 measures and fixes only controls it touches.

## Checked and OK (no finding)

- `.custom-table` (orders/bookings/settings/webhook, `:1833,1859,1929,1989,2112`):
  all inside `.custom-table-container{overflow-x:auto}` — unwrap scan clean.
- Orders filter grid (`2fr 1fr 1fr`, `:1803`), training grid (`1fr 1fr`,
  `:1601`), overview/admin-keys grids (`2fr 1fr`, `:1008,2214`), all
  `auto-fit/fill` card grids, `#plansGrid`/`#subscriptionRequestForm`
  (`min()` floors, `:1895,1902`): carry `.db-responsive-grid` or self-collapse.
- RTL shell: sidebar translate/margins per `dir`, select chevron flip,
  `.custom-table` align per `dir`, `inset-inline-end` account menu
  (`width:min(300px,100vw-32px)` fits 360px). New patches must still use
  logical properties for mixed content.
- `.overview-status-grid` 3-col until 600px: `strong` uses nowrap+ellipsis, no
  overflow by construction.
- Existing static gates cover sidebar RTL toggle, settings min() floors,
  shrink rules, table wrappers (see B01 report Tests row).

## Mapping to B03/B04/B05

| Finding | Owner | Gate |
|---|---|---|
| F-B01-01, 02, 03 | B03 (1 CSS patch) | `node tests/chatPageCustomizer.test.js` + browser customizer scenario |
| F-B01-04, 05 (+V-02) | B04 (scoped patch) | sidebar test + browser portrait/landscape + reduced-motion |
| F-B01-06..09 (+V-01, V-03) | B05 (a/b/c per brief) | browser geometry + real clicks, no global button width |
