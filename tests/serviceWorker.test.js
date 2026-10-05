'use strict';

// F03 — service worker coherence contracts.
// Executes the REAL public/service-worker.js inside a minimal fake SW
// runtime (vm sandbox): scripted network (online/offline/failing),
// Map-backed CacheStorage, captured event listeners. No browser, no
// network, no providers.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SW_PATH = path.join(__dirname, '..', 'public', 'service-worker.js');
const ORIGIN = 'https://test.local';
const OLD_CACHE = 'zainbot-v0.0030-public-shell'; // F08: immediate predecessor (F03); upgrade must purge it, keep foreign caches

function readCacheName() {
  const source = fs.readFileSync(SW_PATH, 'utf8');
  return source.match(/const\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"]/)[1];
}

function readPrecacheList() {
  const source = fs.readFileSync(SW_PATH, 'utf8');
  const body = source.match(/const\s+urlsToCache\s*=\s*\[([\s\S]*?)\];/)[1];
  return [...body.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

function createSWEnv() {
  const listeners = {};
  const fetchCalls = [];
  const errors = [];
  let claimed = false;
  let fetchBehavior = async (url) => new Response(`live:${url}`, { status: 200 });
  const stores = new Map(); // cacheName -> Map(key -> { status, headers, body })

  const normalizeKey = (input) => {
    const url = typeof input === 'string' ? input : input.url;
    const parsed = new URL(url, ORIGIN);
    return parsed.origin + parsed.pathname;
  };

  const rebuild = (entry) => new Response(entry.body, { status: entry.status, headers: entry.headers });

  const cacheLike = (storeMap) => ({
    // Atomic like the real addAll: fetch everything first, commit only on
    // full success; any failure rejects with nothing committed.
    async addAll(urls) {
      const staged = [];
      for (const u of urls) {
        const res = await fakeFetch(u);
        if (!res.ok) throw new TypeError(`addAll failed for ${u}: ${res.status}`);
        const body = await res.clone().text();
        staged.push([normalizeKey(u), {
          status: res.status,
          headers: Object.fromEntries(res.headers.entries()),
          body,
        }]);
      }
      for (const [key, entry] of staged) storeMap.set(key, entry);
    },
    async put(key, res) {
      const body = await res.clone().text();
      storeMap.set(normalizeKey(key), {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body,
      });
    },
    async match(key) {
      const entry = storeMap.get(normalizeKey(key));
      return entry ? rebuild(entry) : undefined;
    },
  });

  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      return cacheLike(stores.get(name));
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
    async match(key) {
      const needle = normalizeKey(key);
      for (const storeMap of stores.values()) {
        if (storeMap.has(needle)) return rebuild(storeMap.get(needle));
      }
      return undefined;
    },
  };

  async function fakeFetch(input, init) {
    const url = typeof input === 'string' ? input : input.url;
    fetchCalls.push({ url, init });
    return fetchBehavior(url, init);
  }

  const self = {
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    skipWaiting: async () => true,
    location: { origin: ORIGIN },
    clients: {
      claim: async () => {
        claimed = true;
      },
    },
  };

  const sandbox = {
    self,
    caches,
    fetch: fakeFetch,
    console: {
      log: () => {},
      warn: () => {},
      error: (...args) => {
        errors.push(args);
      },
    },
    URL,
    Response,
  };

  vm.runInNewContext(fs.readFileSync(SW_PATH, 'utf8'), sandbox, { filename: 'service-worker.js' });

  const flush = async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };

  return {
    listeners,
    fetchCalls,
    errors,
    stores,
    setFetchBehavior: (fn) => {
      fetchBehavior = fn;
    },
    caches_open: (name) => caches.open(name),
    isClaimed: () => claimed,
    storeKeys: (name) => [...(stores.get(name) || new Map()).keys()],
    async install() {
      const pending = [];
      listeners.install({ waitUntil: (p) => pending.push(Promise.resolve(p)) });
      await Promise.all(pending);
      await flush();
    },
    async activate() {
      const pending = [];
      listeners.activate({ waitUntil: (p) => pending.push(Promise.resolve(p)) });
      await Promise.all(pending);
      await flush();
    },
    async fetch(request) {
      const event = {
        request,
        response: null,
        respondWith(p) {
          this.response = Promise.resolve(p);
        },
      };
      listeners.fetch(event);
      if (!event.response) return { intercepted: false };
      return { intercepted: true, response: await event.response };
    },
  };
}

const get = (url, extra = {}) => ({
  url: new URL(url, ORIGIN).toString(),
  method: 'GET',
  mode: 'navigate',
  destination: '',
  ...extra,
});

// --- Precache allowlist: public shell only ---

test('precache list holds the public shell only (no monolith, private, API)', () => {
  const list = readPrecacheList();
  assert.ok(list.length > 0, 'expected a non-empty precache list');
  for (const banned of ['/dashboard', '/js/dashboard_new.js', '/login.html', '/register.html', '/js/auth.js', '/css/login.css']) {
    assert.ok(!list.includes(banned), `precache must not contain private/monolith entry ${banned}`);
  }
  assert.ok(!list.some((u) => u.startsWith('/api')), 'precache must not contain API');
  for (const required of ['/', '/index.html', '/style.css', '/js/utils.js', '/js/script.js']) {
    assert.ok(list.includes(required), `precache must contain public shell entry ${required}`);
  }
});

test('install fetches exactly the precache list (no deferred chunks prefetched)', async () => {
  const env = createSWEnv();
  await env.install();
  const fetched = [...new Set(env.fetchCalls.map((c) => new URL(c.url, ORIGIN).pathname))].sort();
  assert.deepEqual(fetched, [...readPrecacheList()].sort());
  assert.ok(!fetched.some((p) => p.includes('dashboard-idea-council') || p.includes('dashboard-assets')),
    'install must not prefetch lazy chunks');
  const name = readCacheName();
  assert.deepEqual(env.storeKeys(name).sort(), [...readPrecacheList()].map((p) => ORIGIN + p).sort());
});

test('cache version was bumped off the pre-F03 name', () => {
  assert.notEqual(readCacheName(), OLD_CACHE);
  assert.match(readCacheName(), /^zainbot-/);
});

// --- Upgrade: old→new purges only ZainBot-prefixed caches ---

test('activate purges stale ZainBot caches but preserves foreign caches', async () => {
  const env = createSWEnv();
  const oldCache = await env.caches_open(OLD_CACHE);
  await oldCache.put('/index.html', new Response('old-shell', { status: 200 }));
  const foreign = await env.caches_open('third-party-cache');
  await foreign.put('https://other.example/asset.js', new Response('foreign', { status: 200 }));
  await env.activate();
  assert.ok(!env.stores.has(OLD_CACHE), 'stale ZainBot cache must be purged');
  assert.ok(env.stores.has('third-party-cache'), 'foreign cache must survive');
  assert.equal(await (await foreign.match('https://other.example/asset.js')).text(), 'foreign');
  assert.ok(env.isClaimed(), 'activate must claim clients');
});

// --- Install failure is resilient, never half-committed ---

test('install failure rejects loudly in logs but never half-commits the cache', async () => {
  const env = createSWEnv();
  env.setFetchBehavior(async () => {
    throw new Error('network down');
  });
  await env.install();
  assert.ok(env.errors.length > 0, 'install failure must be logged');
  assert.equal(env.storeKeys(readCacheName()).length, 0, 'failed install must commit nothing');
});

// --- Offline public shell + query-version separation ---

test('offline public shell serves from cache, query-blind', async () => {
  const env = createSWEnv();
  await env.install();
  env.setFetchBehavior(async () => {
    throw new Error('offline');
  });
  env.fetchCalls.length = 0;

  const css = await env.fetch(get('/style.css', { mode: 'no-cors' }));
  assert.ok(css.intercepted);
  assert.equal(css.response.status, 200);
  assert.match(await css.response.text(), /live:/);

  const skewed = await env.fetch(get('/js/utils.js?v=999', { mode: 'no-cors' }));
  assert.ok(skewed.intercepted);
  assert.equal(skewed.response.status, 200, 'query-skewed URL must hit the same cache entry offline');

  const nav = await env.fetch(get('/'));
  assert.ok(nav.intercepted);
  assert.equal(nav.response.status, 200);
});

test('query versions share a single cache entry online', async () => {
  const env = createSWEnv();
  env.setFetchBehavior(async (url) => new Response(`live:${url}`, { status: 200 }));
  const first = await env.fetch(get('/js/script.js?v=1', { mode: 'no-cors' }));
  const second = await env.fetch(get('/js/script.js?v=2', { mode: 'no-cors' }));
  assert.equal(await first.response.text(), `live:${ORIGIN}/js/script.js?v=1`);
  assert.equal(await second.response.text(), `live:${ORIGIN}/js/script.js?v=2`);
  const scriptKeys = env.storeKeys(readCacheName()).filter((k) => k.endsWith('/js/script.js'));
  assert.equal(scriptKeys.length, 1, 'both query variants must share one cache entry');
});

// --- Sensitive paths: never cached, never served from cache ---

test('API never touches the cache and fails closed with 503 offline', async () => {
  const env = createSWEnv();
  const online = await env.fetch(get('/api/bots'));
  assert.ok(online.intercepted);
  assert.equal(online.response.status, 200);
  assert.ok(!env.storeKeys(readCacheName()).some((k) => k.includes('/api/')), 'API responses must not be cached');

  env.setFetchBehavior(async () => {
    throw new Error('offline');
  });
  const offline = await env.fetch(get('/api/bots'));
  assert.ok(offline.intercepted);
  assert.equal(offline.response.status, 503);
  assert.doesNotMatch(await offline.response.text(), /<!DOCTYPE html>|<html/, 'API failure must never fall back to an HTML page');
});

test('no-store network responses are served fresh but never written to cache', async () => {
  const env = createSWEnv();
  env.setFetchBehavior(async (url) => new Response(`sensitive:${url}`, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  }));
  const res = await env.fetch(get('/style.css', { mode: 'no-cors' }));
  assert.ok(res.intercepted);
  assert.equal(res.response.status, 200);
  assert.ok(!env.storeKeys(readCacheName()).some((k) => k.endsWith('/style.css')),
    'no-store responses must be respected, not cached');
});

test('non-GET requests are never intercepted', async () => {
  const env = createSWEnv();
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const res = await env.fetch(get('/api/bots', { method }));
    assert.equal(res.intercepted, false, `${method} must pass through untouched`);
  }
  assert.equal(env.fetchCalls.length, 0, 'SW must not issue its own fetch for non-GET');
});

// --- Unchanged policies: images + cross-origin ---

test('image policy unchanged: network-only no-store, 504 offline, never cached', async () => {
  const env = createSWEnv();
  const online = await env.fetch(get('/icon-192.png', { destination: 'image' }));
  assert.ok(online.intercepted);
  assert.equal(online.response.status, 200);
  assert.equal(env.fetchCalls[0].init && env.fetchCalls[0].init.cache, 'no-store');
  assert.equal(env.storeKeys(readCacheName()).length, 0, 'images must never be cached');

  env.setFetchBehavior(async () => {
    throw new Error('offline');
  });
  const offline = await env.fetch(get('/icon-192.png', { destination: 'image' }));
  assert.ok(offline.intercepted);
  assert.equal(offline.response.status, 504);
});

test('cross-origin requests stay network-only and uncached', async () => {
  const env = createSWEnv();
  const res = await env.fetch(get('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css', { mode: 'no-cors' }));
  assert.ok(res.intercepted);
  assert.equal(res.response.status, 200);
  assert.equal(env.storeKeys(readCacheName()).length, 0, 'cross-origin must never be cached');
});
