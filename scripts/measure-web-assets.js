'use strict';

/**
 * F01 — static web-asset measurement for the ZainBot dashboard.
 *
 * Measures FRESH on every run (never hardcodes old sizes as truth):
 *  - raw + gzip byte sizes of the dashboard-critical web assets,
 *  - existence of every local asset referenced by public/dashboard.html
 *    (<script src>, <link href>, <img src>),
 *  - existence of every service-worker precache entry.
 *
 * Network cold/warm timings (cold/warm x ordinary/superadmin, 5 samples each
 * at fixed viewport/network/CPU) are INTENTIONALLY NOT measured here: they
 * wait for the A03 browser harness. They are reported as `pending`.
 *
 * No provider requests, no credentials, no production calls.
 *
 * Usage:
 *   node scripts/measure-web-assets.js            # JSON report on stdout
 *
 * Exit code is always 0; the gate lives in tests/webAssets.test.js, which
 * fails on any missing asset reference.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const REPO_ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const DASHBOARD_HTML = path.join(PUBLIC_DIR, 'dashboard.html');
const SERVICE_WORKER = path.join(PUBLIC_DIR, 'service-worker.js');

// Dashboard-critical assets whose sizes form the F01 baseline. Freshly
// statted on every run; this list is scope (which files), not truth (sizes).
const DASHBOARD_ASSET_SET = [
  'public/dashboard.html',
  'public/js/dashboard_new.js',
  'public/js/dashboard-onboarding.js',
  'public/js/utils.js',
  'public/js/settings-summary.js',
  'public/style.css',
  'public/service-worker.js',
];

function gzipSizeBytes(buffer) {
  return zlib.gzipSync(buffer, { level: 9 }).length;
}

function measureFile(repoRoot, relPath) {
  const abs = path.join(repoRoot, relPath);
  const raw = fs.readFileSync(abs);
  return {
    path: relPath,
    rawBytes: raw.length,
    gzipBytes: gzipSizeBytes(raw),
  };
}

function isExternalRef(ref) {
  return (
    ref.startsWith('http://') ||
    ref.startsWith('https://') ||
    ref.startsWith('//')
  );
}

function isSkippableRef(ref) {
  // Empty src (dynamic placeholder set at runtime, e.g. avatar <img src="">),
  // anchors, and non-file schemes are not on-disk asset references.
  return (
    ref === '' ||
    ref.startsWith('#') ||
    ref.startsWith('data:') ||
    ref.startsWith('blob:')
  );
}

function stripQueryHash(ref) {
  const cut = ref.search(/[?#]/);
  return cut === -1 ? ref : ref.slice(0, cut);
}

/**
 * Extract local file references from dashboard HTML script/link/img tags.
 * Returns { local: [{ raw, resolved }], external: [raw], skipped: [raw] }.
 * `resolved` is repo-root-relative (e.g. "public/js/utils.js").
 */
function extractHtmlRefs(html, htmlAbsPath) {
  const patterns = [
    /<script\b[^>]*?\bsrc\s*=\s*["']([^"']*)["']/gi,
    /<link\b[^>]*?\bhref\s*=\s*["']([^"']*)["']/gi,
    /<img\b[^>]*?\bsrc\s*=\s*["']([^"']*)["']/gi,
  ];
  const local = [];
  const external = [];
  const skipped = [];
  const htmlDir = path.dirname(htmlAbsPath);
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const raw = match[1].trim();
      if (isSkippableRef(raw)) {
        skipped.push(raw);
        continue;
      }
      if (isExternalRef(raw)) {
        external.push(raw);
        continue;
      }
      const clean = stripQueryHash(raw);
      const abs = clean.startsWith('/')
        ? path.join(PUBLIC_DIR, clean.slice(1))
        : path.join(htmlDir, clean);
      local.push({ raw, resolved: path.relative(REPO_ROOT, abs) });
    }
  }
  return { local, external, skipped };
}

/**
 * Parse the service worker's CACHE_NAME + urlsToCache entries.
 * Route entries (no file extension, e.g. "/" or "/dashboard") are mapped to
 * the HTML file that serves them; file entries map under public/.
 */
function extractServiceWorkerEntries(swSource) {
  const nameMatch = swSource.match(/const\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
  const arrayMatch = swSource.match(/const\s+urlsToCache\s*=\s*\[([\s\S]*?)\];/);
  const entries = [];
  if (arrayMatch) {
    const stringPattern = /['"]([^'"]+)['"]/g;
    let match;
    while ((match = stringPattern.exec(arrayMatch[1])) !== null) {
      const url = match[1];
      const clean = stripQueryHash(url);
      const stripped = clean.startsWith('/') ? clean.slice(1) : clean;
      let resolved;
      let kind;
      if (stripped === '') {
        resolved = 'public/index.html';
        kind = 'route:/';
      } else if (!path.extname(stripped)) {
        resolved = `public/${stripped}.html`;
        kind = `route:${url}`;
      } else {
        resolved = `public/${stripped}`;
        kind = 'file';
      }
      entries.push({ url, resolved, kind });
    }
  }
  return { cacheName: nameMatch ? nameMatch[1] : null, entries };
}

function existsFile(repoRoot, relPath) {
  try {
    return fs.statSync(path.join(repoRoot, relPath)).isFile();
  } catch {
    return false;
  }
}

function measureWebAssets(options = {}) {
  const repoRoot = options.root || REPO_ROOT;
  const dashboardHtml = fs.readFileSync(path.join(repoRoot, 'public', 'dashboard.html'), 'utf8');
  const swSource = fs.readFileSync(path.join(repoRoot, 'public', 'service-worker.js'), 'utf8');

  const files = DASHBOARD_ASSET_SET.map((rel) => measureFile(repoRoot, rel));
  const totals = {
    fileCount: files.length,
    rawBytes: files.reduce((sum, f) => sum + f.rawBytes, 0),
    gzipBytes: files.reduce((sum, f) => sum + f.gzipBytes, 0),
  };

  const htmlRefs = extractHtmlRefs(dashboardHtml, path.join(repoRoot, 'public', 'dashboard.html'));
  const htmlMissing = htmlRefs.local
    .filter((ref) => !existsFile(repoRoot, ref.resolved))
    .map((ref) => ref.resolved);

  const sw = extractServiceWorkerEntries(swSource);
  const swMissing = sw.entries
    .filter((entry) => !existsFile(repoRoot, entry.resolved))
    .map((entry) => entry.resolved);

  const missing = [...new Set([...htmlMissing, ...swMissing])].sort();

  return {
    generatedAt: new Date().toISOString(),
    nodeVersion: process.version,
    files,
    totals,
    htmlRefs: {
      localCount: htmlRefs.local.length,
      externalCount: htmlRefs.external.length,
      skippedCount: htmlRefs.skipped.length,
      external: [...new Set(htmlRefs.external)].sort(),
      skipped: [...new Set(htmlRefs.skipped)].sort(),
      missing: htmlMissing,
    },
    serviceWorker: {
      cacheName: sw.cacheName,
      entryCount: sw.entries.length,
      entries: sw.entries,
      missing: swMissing,
    },
    missing,
    network: {
      status: 'pending',
      reason: 'Cold/warm timings wait for the A03 browser harness (isolated Puppeteer runner + fixtures). Not measured here; nothing invented.',
      matrix: 'cold/warm x ordinary/superadmin, 5 samples each at fixed viewport/network/CPU: median bytes/requests/boot timing, SW-install share separated.',
      owner: 'A03 harness, then F-measurement follow-up (F08 final comparison).',
    },
  };
}

if (require.main === module) {
  const report = measureWebAssets();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

module.exports = {
  measureWebAssets,
  extractHtmlRefs,
  extractServiceWorkerEntries,
  DASHBOARD_ASSET_SET,
};
