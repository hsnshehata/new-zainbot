const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { measureWebAssets } = require('../scripts/measure-web-assets');

const workspace = path.resolve(__dirname, '..');
const report = measureWebAssets({ root: workspace });

test('dashboard HTML asset references all resolve to files on disk', () => {
  assert.deepEqual(report.htmlRefs.missing, []);
  assert.deepEqual(report.missing, []);
  assert.ok(report.htmlRefs.localCount > 0, 'expected at least one local ref to check');
});

test('service-worker precache entries all resolve to files on disk', () => {
  assert.ok(report.serviceWorker.cacheName, 'expected a CACHE_NAME to parse');
  assert.ok(report.serviceWorker.entryCount > 0, 'expected precache entries to check');
  assert.deepEqual(report.serviceWorker.missing, []);
});

test('sizes are freshly measured: match disk and gzip never exceeds raw', () => {
  assert.ok(report.files.length > 0, 'expected measured files');
  let rawTotal = 0;
  let gzipTotal = 0;
  for (const file of report.files) {
    const onDisk = fs.statSync(path.join(workspace, file.path)).size;
    assert.equal(file.rawBytes, onDisk, `${file.path} raw must be measured fresh, not hardcoded`);
    assert.ok(file.rawBytes > 0, `${file.path} raw must be non-empty`);
    assert.ok(file.gzipBytes > 0, `${file.path} gzip must be non-empty`);
    assert.ok(file.gzipBytes <= file.rawBytes, `${file.path} gzip must not exceed raw`);
    rawTotal += file.rawBytes;
    gzipTotal += file.gzipBytes;
  }
  assert.equal(report.totals.rawBytes, rawTotal);
  assert.equal(report.totals.gzipBytes, gzipTotal);
});

test('network cold/warm timings stay pending until the A03 harness exists', () => {
  assert.equal(report.network.status, 'pending');
});
