'use strict';

/**
 * F07 — reproducible web-asset minification build.
 *
 * Reads every file under public/, transforms *.js / *.css with esbuild
 * (NO bundling, NO identifier/property mangling, NO sourcemaps — whitespace
 * + syntax minify only, so globals and inline-callback names survive
 * byte-identical), copies everything else byte-identical, and writes the
 * mirror tree to build/public/ plus a manifest at build/web-build-manifest.json
 * (kept OUTSIDE the served tree).
 *
 * Deterministic: same esbuild version + same sources = byte-identical
 * output (proven by tests/webBuild.test.js double-build). Sources stay
 * readable; only build/ output is minified.
 *
 * Usage: npm run build:web   (node scripts/build-web.js)
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const EXPECTED_ESBUILD_VERSION = '0.28.2';

const REPO_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(REPO_ROOT, 'public');
const BUILD_DIR = path.join(REPO_ROOT, 'build', 'public');
const MANIFEST_PATH = path.join(REPO_ROOT, 'build', 'web-build-manifest.json');

function collectFiles(dir, base = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(full, base));
    } else if (entry.isFile()) {
      files.push(path.relative(base, full));
    }
  }
  return files;
}

function gzipBytes(buffer) {
  return zlib.gzipSync(buffer, { level: 9 }).length;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function build() {
  const esbuild = require('esbuild');
  if (esbuild.version !== EXPECTED_ESBUILD_VERSION) {
    throw new Error(
      `[build-web] esbuild version mismatch: expected ${EXPECTED_ESBUILD_VERSION}, got ${esbuild.version}. ` +
      'Pin the exact release (F07a) — never float.'
    );
  }

  fs.rmSync(path.join(REPO_ROOT, 'build'), { recursive: true, force: true });

  const files = collectFiles(SRC_DIR);
  if (files.length === 0) throw new Error('[build-web] no input files under public/');

  const manifest = {
    esbuild: esbuild.version,
    generatedAt: new Date().toISOString(),
    options: {
      bundling: false,
      minifyIdentifiers: false,
      minifyWhitespace: true,
      minifySyntax: true,
      sourcemap: false,
      legalComments: 'none',
    },
    files: [],
  };

  let inRaw = 0;
  let outRaw = 0;
  let inGzip = 0;
  let outGzip = 0;

  for (const rel of files) {
    const srcPath = path.join(SRC_DIR, rel);
    const destPath = path.join(BUILD_DIR, rel);
    const input = fs.readFileSync(srcPath);
    const ext = path.extname(rel).toLowerCase();

    let output;
    let transformed = false;
    if (ext === '.js' || ext === '.css') {
      const loader = ext === '.js' ? 'js' : 'css';
      const result = esbuild.transformSync(input.toString('utf8'), {
        loader,
        minifyWhitespace: true,
        minifySyntax: true,
        minifyIdentifiers: false,
        legalComments: 'none',
        sourcemap: false,
      });
      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          process.stderr.write(`[build-web] warning ${rel}: ${warning.text}\n`);
        }
      }
      output = Buffer.from(result.code, 'utf8');
      transformed = true;
    } else {
      output = input;
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, output);

    const entry = {
      path: rel,
      transformed,
      rawBytes: input.length,
      outBytes: output.length,
      rawGzip: gzipBytes(input),
      outGzip: gzipBytes(output),
      sha256: sha256(output),
    };
    manifest.files.push(entry);
    inRaw += entry.rawBytes;
    outRaw += entry.outBytes;
    inGzip += entry.rawGzip;
    outGzip += entry.outGzip;
  }

  manifest.totals = {
    fileCount: files.length,
    transformedCount: manifest.files.filter((f) => f.transformed).length,
    rawBytes: inRaw,
    outBytes: outRaw,
    rawGzip: inGzip,
    outGzip: outGzip,
  };

  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  const rawDelta = ((1 - outRaw / inRaw) * 100).toFixed(1);
  const gzipDelta = ((1 - outGzip / inGzip) * 100).toFixed(1);
  process.stdout.write(
    `[build-web] esbuild@${manifest.esbuild}: ${manifest.totals.fileCount} files ` +
    `(${manifest.totals.transformedCount} transformed), ` +
    `raw ${inRaw} -> ${outRaw} (-${rawDelta}%), ` +
    `gzip ${inGzip} -> ${outGzip} (-${gzipDelta}%)\n`
  );
  process.stdout.write(`[build-web] output: ${BUILD_DIR}\n`);
  process.stdout.write(`[build-web] manifest: ${MANIFEST_PATH}\n`);

  return manifest;
}

if (require.main === module) {
  try {
    build();
  } catch (err) {
    process.stderr.write(`[build-web] FAILED: ${(err && err.message) || err}\n`);
    process.exit(1);
  }
}

module.exports = { build, EXPECTED_ESBUILD_VERSION };
