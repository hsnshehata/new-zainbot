'use strict';

// D02 — contract tests for public/js/dashboard-request.js (§7.1).
// NEW file only; dashboard.html wiring is deferred to D03 — this suite
// exercises the module via its Node export without touching shared files.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  requestJson,
  fetchBlob,
  runExclusive,
  RequestError,
  DEFAULT_READ_TIMEOUT_MS,
  DEFAULT_BLOB_FILENAME,
} = require('../public/js/dashboard-request.js');

function fakeResponse({ status = 200, body = '', headers = {} } = {}) {
  const lower = {};
  for (const [key, value] of Object.entries(headers)) {
    lower[String(key).toLowerCase()] = value;
  }
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        const found = lower[String(name).toLowerCase()];
        return found === undefined ? null : found;
      },
    },
    text: async () => body,
  };
}

function withFetch(stub, fn) {
  const previous = globalThis.fetch;
  globalThis.fetch = stub;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = previous;
    });
}

function abortError() {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

/** fetch stub that hangs until its signal aborts (for timeout paths). */
function hangingFetch(capture) {
  return (url, opts = {}) => {
    if (capture) capture.signal = opts.signal;
    return new Promise((resolve, reject) => {
      const signal = opts.signal;
      if (signal) {
        if (signal.aborted) {
          reject(abortError());
          return;
        }
        signal.addEventListener('abort', () => reject(abortError()), { once: true });
      }
    });
  };
}

test('module exposes the §7.1 contract with a 15000ms read default', () => {
  assert.equal(typeof requestJson, 'function');
  assert.equal(typeof fetchBlob, 'function');
  assert.equal(typeof runExclusive, 'function');
  assert.equal(typeof RequestError, 'function');
  assert.equal(DEFAULT_READ_TIMEOUT_MS, 15000);
  assert.equal(DEFAULT_BLOB_FILENAME, 'download');
});

test('read resolves parsed JSON and passes success:false through untouched', async () => {
  await withFetch(
    async () => fakeResponse({ status: 200, body: '{"success":true,"count":2}' }),
    async () => {
      const data = await requestJson('/api/things', {}, { operation: 'read' });
      assert.deepEqual(data, { success: true, count: 2 });
    },
  );
  await withFetch(
    async () => fakeResponse({ status: 200, body: '{"success":false,"code":"PENDING"}' }),
    async () => {
      // No generic success rewriting: the caller interprets success:false.
      const data = await requestJson('/api/things', {}, { operation: 'read' });
      assert.deepEqual(data, { success: false, code: 'PENDING' });
    },
  );
});

test('204 and empty bodies resolve to null', async () => {
  await withFetch(
    async () => fakeResponse({ status: 204, body: '' }),
    async () => {
      assert.equal(await requestJson('/api/gone', {}, { operation: 'read' }), null);
    },
  );
  await withFetch(
    async () => fakeResponse({ status: 200, body: '   ' }),
    async () => {
      assert.equal(await requestJson('/api/empty', {}, { operation: 'read' }), null);
    },
  );
});

test('invalid JSON on 200 throws a parse RequestError', async () => {
  await withFetch(
    async () => fakeResponse({ status: 200, body: 'not-json{{{' }),
    async () => {
      await assert.rejects(requestJson('/api/bad', {}, { operation: 'read' }), (err) => {
        assert.ok(err instanceof RequestError);
        assert.equal(err.kind, 'parse');
        assert.equal(err.status, 200);
        assert.equal(err.outcomeUnknown, false);
        return true;
      });
    },
  );
});

test('HTML 500 is an http failure with no invented code', async () => {
  let calls = 0;
  await withFetch(
    async () => {
      calls += 1;
      return fakeResponse({ status: 500, body: '<html><body>oops</body></html>' });
    },
    async () => {
      await assert.rejects(requestJson('/api/boom', {}, { operation: 'read' }), (err) => {
        assert.ok(err instanceof RequestError);
        assert.equal(err.kind, 'http');
        assert.equal(err.status, 500);
        assert.equal(err.code, null);
        assert.equal(err.outcomeUnknown, false);
        return true;
      });
    },
  );
  assert.equal(calls, 1, 'no automatic retry on 500');
});

test('401 invokes onUnauthorized exactly once; 403 never logs out', async () => {
  let unauthorizedCalls = 0;
  await withFetch(
    async () => fakeResponse({ status: 401, body: '{"error":"UNAUTHORIZED"}' }),
    async () => {
      await assert.rejects(
        requestJson('/api/me', {}, {
          operation: 'read',
          onUnauthorized: () => { unauthorizedCalls += 1; },
        }),
        (err) => {
          assert.ok(err instanceof RequestError);
          assert.equal(err.kind, 'http');
          assert.equal(err.status, 401);
          return true;
        },
      );
    },
  );
  assert.equal(unauthorizedCalls, 1);

  let forbiddenCallbackCalls = 0;
  await withFetch(
    async () => fakeResponse({ status: 403, body: '{"error":"FORBIDDEN"}' }),
    async () => {
      await assert.rejects(
        requestJson('/api/admin', {}, {
          operation: 'read',
          onUnauthorized: () => { forbiddenCallbackCalls += 1; },
        }),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.kind, 'http');
          return true;
        },
      );
    },
  );
  assert.equal(forbiddenCallbackCalls, 0, '403 must not trigger the session callback');
});

test('empty-body and HTML 401s also invoke onUnauthorized exactly once', async () => {
  for (const [label, body] of [
    ['empty-body', ''],
    ['html-login-page', '<html><body>login</body></html>'],
  ]) {
    let calls = 0;
    await withFetch(
      async () => fakeResponse({ status: 401, body }),
      async () => {
        await assert.rejects(
          requestJson('/api/session', {}, {
            operation: 'read',
            onUnauthorized: () => { calls += 1; },
          }),
          (err) => {
            assert.ok(err instanceof RequestError);
            assert.equal(err.kind, 'http');
            assert.equal(err.status, 401);
            return true;
          },
        );
      },
    );
    assert.equal(calls, 1, `${label} 401 must fire the session callback once`);
  }
});

test('429 carries retry-after without retrying', async () => {
  let calls = 0;
  await withFetch(
    async () => {
      calls += 1;
      return fakeResponse({
        status: 429,
        body: '{"code":"RATE_LIMITED"}',
        headers: { 'retry-after': '3' },
      });
    },
    async () => {
      await assert.rejects(requestJson('/api/busy', {}, { operation: 'read' }), (err) => {
        assert.equal(err.kind, 'http');
        assert.equal(err.status, 429);
        assert.equal(err.code, 'RATE_LIMITED');
        assert.equal(err.retryAfterSeconds, 3);
        return true;
      });
    },
  );
  assert.equal(calls, 1, 'no automatic retry on 429');
});

test('http errors extract code/traceId with header fallbacks', async () => {
  await withFetch(
    async () => fakeResponse({
      status: 422,
      body: '{"code":"VALIDATION_FAILED","traceId":"trace-1"}',
    }),
    async () => {
      await assert.rejects(requestJson('/api/save', { method: 'POST' }, { operation: 'mutation' }), (err) => {
        assert.equal(err.kind, 'http');
        assert.equal(err.status, 422);
        assert.equal(err.code, 'VALIDATION_FAILED');
        assert.equal(err.traceId, 'trace-1');
        assert.equal(err.outcomeUnknown, false);
        return true;
      });
    },
  );
  await withFetch(
    async () => fakeResponse({
      status: 500,
      body: '{"message":"kaboom"}',
      headers: { 'x-request-id': 'req-9' },
    }),
    async () => {
      await assert.rejects(requestJson('/api/save', {}, { operation: 'read' }), (err) => {
        assert.equal(err.code, null);
        assert.equal(err.traceId, 'req-9');
        return true;
      });
    },
  );
});

test('network failure: single attempt, outcomeUnknown only for mutations', async () => {
  for (const operation of ['read', 'mutation']) {
    let calls = 0;
    await withFetch(
      async () => {
        calls += 1;
        throw new TypeError('fetch failed');
      },
      async () => {
        await assert.rejects(requestJson('/api/down', {}, { operation }), (err) => {
          assert.ok(err instanceof RequestError);
          assert.equal(err.kind, 'network');
          assert.equal(err.status, null);
          assert.equal(err.outcomeUnknown, operation === 'mutation');
          return true;
        });
      },
    );
    assert.equal(calls, 1, `no retry for ${operation} network failure`);
  }
});

test('timeout: read defaults are honored, mutations stay silent unless asked', async () => {
  await withFetch(hangingFetch(), async () => {
    await assert.rejects(
      requestJson('/api/slow', {}, { operation: 'read', timeoutMs: 20 }),
      (err) => {
        assert.equal(err.kind, 'timeout');
        assert.equal(err.outcomeUnknown, false);
        return true;
      },
    );
  });
  await withFetch(hangingFetch(), async () => {
    await assert.rejects(
      requestJson('/api/slow-save', { method: 'POST' }, { operation: 'mutation', timeoutMs: 20 }),
      (err) => {
        assert.equal(err.kind, 'timeout');
        assert.equal(err.outcomeUnknown, true);
        return true;
      },
    );
  });
});

test('reads carry a timeout signal; mutations without timeoutMs carry none', async () => {
  const seen = {};
  await withFetch(
    async (url, opts) => {
      seen[url] = opts.signal;
      return fakeResponse({ status: 200, body: '{"ok":true}' });
    },
    async () => {
      await requestJson('/api/read-default', {}, { operation: 'read' });
      await requestJson('/api/mutation-default', { method: 'POST' }, { operation: 'mutation' });
    },
  );
  assert.ok(
    seen['/api/read-default'] instanceof AbortSignal,
    'read without explicit timeoutMs must still race the 15000ms default',
  );
  assert.equal(
    seen['/api/mutation-default'],
    undefined,
    'mutation without explicit timeoutMs must not be timed out',
  );
});

test('headers: FormData untouched, JSON defaulted, caller values win', async () => {
  const seen = {};
  await withFetch(
    async (url, opts) => {
      seen[url] = opts.headers;
      return fakeResponse({ status: 200, body: '{"ok":true}' });
    },
    async () => {
      await requestJson('/api/json-string', { method: 'POST', body: '{"a":1}' }, { operation: 'mutation' });
      await requestJson('/api/json-object', { method: 'POST', body: { a: 1 } }, { operation: 'mutation' });
      await requestJson('/api/form', { method: 'POST', body: new FormData() }, { operation: 'mutation' });
      await requestJson('/api/custom', {
        method: 'POST',
        body: '{"a":1}',
        headers: { 'Content-Type': 'text/custom', Authorization: 'Bearer abc' },
      }, { operation: 'mutation' });
    },
  );
  assert.equal(seen['/api/json-string']['Content-Type'], 'application/json');
  assert.equal(seen['/api/json-object']['Content-Type'], 'application/json');
  assert.ok(!('Content-Type' in seen['/api/form']), 'FormData must keep its browser-set boundary');
  assert.equal(seen['/api/custom']['Content-Type'], 'text/custom');
  assert.equal(seen['/api/custom'].Authorization, 'Bearer abc');
  for (const url of Object.keys(seen)) {
    assert.equal(seen[url].Accept, 'application/json');
  }
});

test('runExclusive shares one promise per key and unlocks in finally', async () => {
  let runs = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const operation = async () => {
    runs += 1;
    await gate;
    return 'done';
  };
  const first = runExclusive('send-once', operation);
  const second = runExclusive('send-once', operation);
  assert.equal(first, second, 'same key in flight must return the same promise');
  assert.equal(runs, 1, 'operation must run exactly once');

  const other = runExclusive('other-key', async () => 'other');
  assert.notEqual(other, first, 'different keys run independently');
  assert.equal(await other, 'other');

  release();
  assert.equal(await first, 'done');
  assert.equal(await second, 'done');

  // Lock released after success: a new call runs again.
  const third = runExclusive('send-once', async () => 'again');
  assert.notEqual(third, first);
  assert.equal(await third, 'again');
});

test('runExclusive releases the lock after rejection (no replay, retry allowed)', async () => {
  let runs = 0;
  const failing = runExclusive('locked-op', async () => {
    runs += 1;
    throw new Error('boom');
  });
  const joined = runExclusive('locked-op', async () => {
    runs += 1;
    throw new Error('boom');
  });
  assert.equal(failing, joined);
  await assert.rejects(failing);
  await assert.rejects(joined);
  assert.equal(runs, 1, 'concurrent sharers must not re-run the operation');

  const retry = runExclusive('locked-op', async () => 'recovered');
  assert.notEqual(retry, failing, 'rejection must clear the lock for a later attempt');
  assert.equal(await retry, 'recovered');
});

test('runExclusive sync throw rejects without holding the lock', async () => {
  await assert.rejects(runExclusive('sync-key', () => {
    throw new Error('sync boom');
  }));
  const after = runExclusive('sync-key', async () => 'free');
  assert.equal(await after, 'free');
});

// --- fetchBlob (D02 blob extension for the F04 council export move) ---

function fakeBlobResponse({ status = 200, body = '', blobType = 'text/markdown', headers = {} } = {}) {
  const lower = {};
  for (const [key, value] of Object.entries(headers)) {
    lower[String(key).toLowerCase()] = value;
  }
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        const found = lower[String(name).toLowerCase()];
        return found === undefined ? null : found;
      },
    },
    text: async () => body,
    blob: async () => new Blob([body], { type: blobType }),
  };
}

test('fetchBlob resolves {blob, filename} from Content-Disposition', async () => {
  await withFetch(
    async () => fakeBlobResponse({
      status: 200,
      body: '# Idea Report\n',
      headers: { 'content-disposition': 'attachment; filename="idea-report-abc123.md"' },
    }),
    async () => {
      const result = await fetchBlob('/api/idea-council/ideas/abc123/export?format=markdown');
      assert.equal(result.filename, 'idea-report-abc123.md');
      assert.ok(result.blob instanceof Blob);
      assert.equal(await result.blob.text(), '# Idea Report\n');
    },
  );
});

test('fetchBlob 401 invokes onUnauthorized exactly once; 403 never logs out', async () => {
  for (const [label, body] of [
    ['json-body', '{"error":"UNAUTHORIZED"}'],
    ['empty-body', ''],
    ['html-login-page', '<html><body>login</body></html>'],
  ]) {
    let calls = 0;
    await withFetch(
      async () => fakeBlobResponse({ status: 401, body }),
      async () => {
        await assert.rejects(
          fetchBlob('/api/export', {}, {
            onUnauthorized: () => { calls += 1; },
          }),
          (err) => {
            assert.ok(err instanceof RequestError);
            assert.equal(err.kind, 'http');
            assert.equal(err.status, 401);
            return true;
          },
        );
      },
    );
    assert.equal(calls, 1, `${label} 401 must fire the session callback once`);
  }

  let forbiddenCallbackCalls = 0;
  await withFetch(
    async () => fakeBlobResponse({ status: 403, body: '{"error":"FORBIDDEN"}' }),
    async () => {
      await assert.rejects(
        fetchBlob('/api/export', {}, {
          onUnauthorized: () => { forbiddenCallbackCalls += 1; },
        }),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.kind, 'http');
          return true;
        },
      );
    },
  );
  assert.equal(forbiddenCallbackCalls, 0, '403 must not trigger the session callback');
});

test('fetchBlob filename parsing: variants and safe fallback', async () => {
  const cases = [
    ['quoted', 'attachment; filename="idea-report-abc123.md"', 'idea-report-abc123.md'],
    ['bare', 'attachment; filename=rules_global.json', 'rules_global.json'],
    ['single-quoted', "attachment; filename='report.md'", 'report.md'],
    ['rfc5987', "attachment; filename*=UTF-8''report%20final.md", 'report final.md'],
    ['no-filename-param', 'attachment', 'download'],
    ['empty-filename', 'attachment; filename=""', 'download'],
    ['path-traversal', 'attachment; filename="../../etc/passwd"', 'passwd'],
  ];
  for (const [label, header, expected] of cases) {
    await withFetch(
      async () => fakeBlobResponse({
        status: 200,
        body: 'x',
        headers: { 'content-disposition': header },
      }),
      async () => {
        const { filename } = await fetchBlob('/api/export');
        assert.equal(filename, expected, `${label}: ${header}`);
      },
    );
  }
  // Missing header entirely falls back too.
  await withFetch(
    async () => fakeBlobResponse({ status: 200, body: 'x' }),
    async () => {
      const { filename } = await fetchBlob('/api/export');
      assert.equal(filename, 'download', 'missing Content-Disposition must fall back');
    },
  );
});

test('fetchBlob network failure: single attempt, outcomeUnknown per operation', async () => {
  for (const [operation, expectedUnknown] of [['read', false], ['mutation', true]]) {
    let calls = 0;
    await withFetch(
      async () => {
        calls += 1;
        throw new TypeError('fetch failed');
      },
      async () => {
        await assert.rejects(fetchBlob('/api/export', {}, { operation }), (err) => {
          assert.ok(err instanceof RequestError);
          assert.equal(err.kind, 'network');
          assert.equal(err.status, null);
          assert.equal(err.outcomeUnknown, expectedUnknown);
          return true;
        });
      },
    );
    assert.equal(calls, 1, `no retry for ${operation} blob network failure`);
  }
});

test('fetchBlob does not retry on http errors', async () => {
  let calls = 0;
  await withFetch(
    async () => {
      calls += 1;
      return fakeBlobResponse({ status: 500, body: '<html><body>oops</body></html>' });
    },
    async () => {
      await assert.rejects(fetchBlob('/api/export'), (err) => {
        assert.ok(err instanceof RequestError);
        assert.equal(err.kind, 'http');
        assert.equal(err.status, 500);
        assert.equal(err.outcomeUnknown, false);
        return true;
      });
    },
  );
  assert.equal(calls, 1, 'no automatic retry on 500');
});

test('fetchBlob injects Bearer auth; caller values win; no JSON Accept default', async () => {
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: (key) => (key === 'token' ? 'tok-1' : null) };
  try {
    const seen = {};
    await withFetch(
      async (url, opts) => {
        seen[url] = opts.headers;
        return fakeBlobResponse({ status: 200, body: 'x' });
      },
      async () => {
        await fetchBlob('/api/blob-a');
        await fetchBlob('/api/blob-b', { headers: { Authorization: 'Bearer abc' } });
      },
    );
    assert.equal(seen['/api/blob-a'].Authorization, 'Bearer tok-1');
    assert.equal(seen['/api/blob-b'].Authorization, 'Bearer abc');
    assert.equal(seen['/api/blob-a'].Accept, undefined, 'blob must not default Accept to JSON');
  } finally {
    globalThis.localStorage = previousStorage;
  }
});
