# Dashboard performance baseline — F01 (2026-10-05)

Static, reproducible web-asset baseline. Every size below was measured FRESH
by `scripts/measure-web-assets.js` (raw bytes from disk + `zlib.gzipSync`
level 9) — the plan's old `388133 / 88178` figures are NOT reused as truth.
No improvement percentage is promised or claimed against this baseline.

- Source of truth command: `node scripts/measure-web-assets.js` (JSON on stdout).
- Gate: `node tests/webAssets.test.js` (fails on any missing asset reference).
- Runtime: `export PATH="/root/.config/opencode/tools/node-v24.21.0-linux-x64/bin:$PATH"` (node `v24.21.0`).

## 1. Static sizes (measured 2026-10-05, node v24.21.0)

Dashboard-critical set (`DASHBOARD_ASSET_SET` in the script):

| File | raw (bytes) | gzip (bytes) |
|---|---|---|
| `public/dashboard.html` | 211428 | 35733 |
| `public/js/dashboard_new.js` | 388133 | 87667 |
| `public/js/dashboard-onboarding.js` | 1263 | 581 |
| `public/js/utils.js` | 5701 | 2070 |
| `public/js/settings-summary.js` | 7847 | 2367 |
| `public/style.css` | 52058 | 9464 |
| `public/service-worker.js` | 6502 | 2057 |
| **Total (7 files)** | **672932** | **139939** |

Notes:

- `dashboard_new.js` raw matches the plan's starting fact (`388133`) only
  because the file is unchanged — it is re-statted on every run, and the test
  asserts `rawBytes === fs.statSync().size` so a drift fails loudly instead of
  silently reusing this table.
- gzip here uses level 9, so values differ slightly from ad-hoc `gzip -c`
  (default level) readings. The method is fixed in the script; compare only
  against runs of the same script.
- External CDN refs (Google Fonts ×3, Font Awesome) are classified
  `external` and NOT measured — no provider requests in this task.

## 2. Asset-reference existence: ZERO missing

- `public/dashboard.html`: 5 local refs (4 JS + `style.css`), all resolve;
  4 external (fonts/Font Awesome) skipped as non-local; 2 empty `src=""`
  avatar placeholders skipped (runtime-filled, not files).
- `public/service-worker.js` (`CACHE_NAME=zainbot-v0.0022-cleanup`): 16
  precache entries, all resolve (`/`→`index.html`, `/dashboard`→
  `dashboard.html`, rest direct files).

## 3. Network timings: PENDING (wait for A03, nothing invented)

Cold/warm × ordinary/superadmin, 5 samples each at fixed viewport/network/CPU
(median bytes/requests/boot timing, SW-install share separated) — blocked on
the A03 browser harness (`npm run test:browser:dashboard` does not exist
yet). F01 does not block A03: static work ships now, network follow-up lands
with the harness (final comparison in F08).

## 4. Reproduce

```bash
export PATH="/root/.config/opencode/tools/node-v24.21.0-linux-x64/bin:$PATH"
node scripts/measure-web-assets.js   # full JSON report
node tests/webAssets.test.js         # gate: exit 0, 4 pass
```

## 5. Budget use (for F05–F08, not a target)

- Post-split total gzip must stay within +5% of `139939` unless approved (F04).
- F05 must show initial-bytes reduction ≈ chunk-minus-overhead, measured with
  the same script. No 40–50% figure is adopted from the old report.
