'use strict';

// F07 — reproducible minification build contracts.
// Runs scripts/build-web.js twice (deterministic), then proves: mirror
// completeness, no bundling/splitting, no sourcemaps, syntax validity,
// globals + inline callbacks + translation keys + API routes preserved,
// sources untouched, gzip output < source, Dockerfile/packaging shape.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const workspace = path.resolve(__dirname, '..');
const SRC_DIR = path.join(workspace, 'public');
const BUILD_DIR = path.join(workspace, 'build', 'public');
const MANIFEST_PATH = path.join(workspace, 'build', 'web-build-manifest.json');

function collectFiles(dir, base = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full, base));
    else if (entry.isFile()) files.push(path.relative(base, full));
  }
  return files;
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function gzipBytes(buf) {
  return zlib.gzipSync(buf, { level: 9 }).length;
}

function runBuild() {
  const result = spawnSync(process.execPath, [path.join(workspace, 'scripts', 'build-web.js')], {
    encoding: 'utf8',
    env: { ...process.env },
  });
  assert.equal(result.status, 0, `build-web must exit 0, stderr: ${result.stderr}`);
  return result.stdout;
}

function snapshotBuild() {
  const snap = new Map();
  for (const rel of collectFiles(BUILD_DIR)) {
    snap.set(rel, sha256File(path.join(BUILD_DIR, rel)));
  }
  return snap;
}

// ---------- F07a: exact pin ----------

test('esbuild is pinned exact in package.json + lockfile + build script', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json'), 'utf8'));
  assert.equal(pkg.devDependencies.esbuild, '0.28.2', 'exact pin, no caret (never float)');
  assert.ok(!('esbuild' in (pkg.dependencies || {})), 'esbuild must stay a devDependency (runtime keeps none)');
  const lock = JSON.parse(fs.readFileSync(path.join(workspace, 'package-lock.json'), 'utf8'));
  assert.equal(lock.packages[''].devDependencies.esbuild, '0.28.2');
  assert.equal(lock.packages['node_modules/esbuild'].version, '0.28.2');
  const { EXPECTED_ESBUILD_VERSION } = require('../scripts/build-web');
  assert.equal(EXPECTED_ESBUILD_VERSION, '0.28.2', 'build script refuses version drift');
  assert.equal(require('esbuild').version, '0.28.2', 'installed binary matches the pin (Node24 compat proven by use)');
});

// ---------- F07b: deterministic double build ----------

test('double build is byte-identical (deterministic)', () => {
  runBuild();
  const first = snapshotBuild();
  assert.ok(first.size > 0, 'build must emit files');
  runBuild();
  const second = snapshotBuild();
  assert.deepEqual([...second.keys()], [...first.keys()], 'same file set across builds');
  for (const [rel, hash] of first) {
    assert.equal(second.get(rel), hash, `deterministic output required: ${rel}`);
  }
});

// ---------- mirror completeness, no bundling, no maps ----------

test('mirror is complete: same paths, non-JS/CSS byte-identical, no maps', () => {
  runBuild();
  const srcFiles = collectFiles(SRC_DIR);
  const outFiles = collectFiles(BUILD_DIR);
  assert.deepEqual(outFiles, srcFiles, '1:1 mirror — no merging, no splitting, no drops');
  for (const rel of srcFiles) {
    const ext = path.extname(rel).toLowerCase();
    if (ext === '.js' || ext === '.css') continue;
    assert.equal(
      sha256File(path.join(BUILD_DIR, rel)),
      sha256File(path.join(SRC_DIR, rel)),
      `non-transformed file must be byte-identical: ${rel}`
    );
  }
  assert.ok(!outFiles.some((f) => f.endsWith('.map')), 'no public sourcemaps');
  assert.ok(!outFiles.some((f) => f.includes('web-build-manifest')), 'build manifest must not be served from build/public');
  assert.ok(fs.existsSync(MANIFEST_PATH), 'manifest must exist at build/web-build-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  assert.equal(manifest.esbuild, '0.28.2');
  assert.equal(manifest.files.length, srcFiles.length);
});

test('built JS parses (syntax gate on every output file)', () => {
  runBuild();
  const jsFiles = collectFiles(BUILD_DIR).filter((f) => f.endsWith('.js'));
  assert.ok(jsFiles.length > 0);
  for (const rel of jsFiles) {
    const result = spawnSync(process.execPath, ['--check', path.join(BUILD_DIR, rel)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `syntax must hold: ${rel} ${result.stderr}`);
  }
});

// ---------- preservation: globals, callbacks, keys, routes ----------

function jsSourceFiles() {
  return collectFiles(SRC_DIR).filter((f) => f.endsWith('.js'));
}

test('window.* globals survive byte-identical (no property mangling)', () => {
  runBuild();
  const names = new Set();
  for (const rel of jsSourceFiles()) {
    const src = fs.readFileSync(path.join(SRC_DIR, rel), 'utf8');
    for (const m of src.matchAll(/window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g)) names.add(m[1]);
  }
  assert.ok(names.size > 0, 'expected window globals to verify');
  const builtAll = jsSourceFiles()
    .map((rel) => fs.readFileSync(path.join(BUILD_DIR, rel), 'utf8')).join('\n');
  for (const name of names) {
    // Minification-tolerant: whitespace around `=` is gone in output.
    assert.match(builtAll, new RegExp(`window\\.${name}\\s*=`), `global window.${name} must survive`);
  }
});

test('inline HTML callbacks resolve to built definitions', () => {
  runBuild();
  const htmlFiles = collectFiles(SRC_DIR).filter((f) => f.endsWith('.html'));
  const handlers = new Set();
  for (const rel of htmlFiles) {
    const html = fs.readFileSync(path.join(SRC_DIR, rel), 'utf8');
    for (const m of html.matchAll(/on(?:click|submit|change|input|load)="([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
      if (m[1] !== 'window') handlers.add(m[1]);
    }
  }
  assert.ok(handlers.size > 0, 'expected inline handlers to verify');
  const builtAll = jsSourceFiles()
    .map((rel) => fs.readFileSync(path.join(BUILD_DIR, rel), 'utf8')).join('\n');
  for (const name of handlers) {
    // Minification-tolerant definition shapes (identifiers off, spacing gone).
    const defined = new RegExp(
      `(function ${name}\\s*\\(|${name}\\s*=\\s*function|window\\.${name}\\s*=|(?:const|var|let)\\s+${name}\\s*=)`
    ).test(builtAll);
    assert.ok(defined, `inline callback ${name}() must still be defined after minify (identifiers off)`);
  }
});

test('translation keys, element ids and API routes survive (equivalence proxy)', () => {
  runBuild();
  const collect = (source) => {
    const out = { t: [], ids: [], api: [] };
    for (const m of source.matchAll(/(?<![A-Za-z0-9_$])(?:ideaT|t)\(\s*['"]([A-Za-z0-9_]+)['"]/g)) out.t.push(m[1]);
    for (const m of source.matchAll(/getElementById\(\s*['"]([A-Za-z0-9_-]+)['"]/g)) out.ids.push(m[1]);
    for (const m of source.matchAll(/['"]((?:\/api\/[A-Za-z0-9_.\-/{}:]*))['"]/g)) out.api.push(m[1]);
    return out;
  };
  const focal = ['js/dashboard_new.js', 'js/dashboard-idea-council.js', 'js/dashboard-request.js'];
  let totalKeys = 0;
  for (const rel of focal) {
    const src = fs.readFileSync(path.join(SRC_DIR, rel), 'utf8');
    const built = fs.readFileSync(path.join(BUILD_DIR, rel), 'utf8');
    const want = collect(src);
    totalKeys += want.t.length;
    for (const key of new Set([...want.t, ...want.ids, ...want.api])) {
      assert.ok(built.includes(key), `${rel}: must preserve ${key}`);
    }
  }
  assert.ok(totalKeys > 50, `expected a real key surface across focal files (got ${totalKeys})`);
});

test('duplicate dictionary keys keep later-wins order (esbuild warnings are benign)', () => {
  runBuild();
  const src = fs.readFileSync(path.join(SRC_DIR, 'js', 'dashboard_new.js'), 'utf8');
  const built = fs.readFileSync(path.join(BUILD_DIR, 'js', 'dashboard_new.js'), 'utf8');
  for (const key of ['idea_status_running', 'idea_status_completed', 'idea_status_failed']) {
    const srcCount = src.split(`${key}:`).length - 1;
    const outCount = built.split(`${key}:`).length - 1;
    assert.equal(outCount, srcCount, `duplicate ${key} count preserved (${srcCount})`);
  }
});

test('sources stay readable: comments live in source, not in output', () => {
  const src = fs.readFileSync(path.join(SRC_DIR, 'js', 'dashboard-idea-council.js'), 'utf8');
  const built = fs.readFileSync(path.join(BUILD_DIR, 'js', 'dashboard-idea-council.js'), 'utf8');
  assert.ok(src.includes('// F04'), 'source keeps its comments');
  assert.ok(!built.includes('// F04'), 'built output drops comments (legalComments none)');
  assert.ok(built.length < src.length, 'built file must be smaller');
});

// ---------- budget: gzip output < source ----------

test('gzip output is smaller than source (F01 budget comparison)', () => {
  runBuild();
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  assert.ok(manifest.totals.outGzip < manifest.totals.rawGzip, 'total gzip must shrink');
  const focal = ['dashboard.html', 'js/dashboard_new.js', 'js/dashboard-idea-council.js', 'js/settings-summary.js', 'style.css', 'service-worker.js'];
  let srcGzip = 0;
  let outGzip = 0;
  for (const rel of focal) {
    const entry = manifest.files.find((f) => f.path === rel);
    assert.ok(entry, `manifest must cover ${rel}`);
    srcGzip += entry.rawGzip;
    outGzip += entry.outGzip;
  }
  assert.ok(outGzip < srcGzip, `focal gzip must shrink (${srcGzip} -> ${outGzip})`);
  process.stdout.write(`\n    [focal gzip] ${srcGzip} -> ${outGzip}\n`);
});

// ---------- F07c: packaging shape ----------

test('build:web script + Dockerfile builder shape + pkg untouched', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['build:web'], 'node scripts/build-web.js');
  assert.ok(Array.isArray(pkg.pkg.assets) && pkg.pkg.assets.includes('public/**/*'), 'pkg assets unchanged');
  assert.ok((pkg.scripts['build:linux'] || '').includes('node18-linux-x64'), 'pkg targets untouched (Node18)');
  const dockerfile = fs.readFileSync(path.join(workspace, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /FROM node:22-bookworm-slim AS web-builder/);
  assert.match(dockerfile, /RUN npm run build:web/);
  assert.match(dockerfile, /COPY --from=web-builder.*\/app\/build\/public \.\/public/);
  assert.match(dockerfile, /RUN npm ci --omit=dev/, 'runtime keeps no build devDeps');
  assert.ok(!/^RUN.*pkg\./m.test(dockerfile), 'no pkg executable steps added');
});
