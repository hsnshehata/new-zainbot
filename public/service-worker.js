// public/service-worker.js (F03)
// Canonical service worker. It must live at the site root so its default
// scope is "/" and it can control every page.

const CACHE_NAME = 'zainbot-v0.0040-release'; // F08: release gate — flushes F05/F06-noop/F07-era caches on warm upgrade
// Pre-cache the PUBLIC shell only: landing + shared shell assets. addAll()
// is atomic — one missing URL aborts the whole precache, so every entry
// must exist (proven by tests/webAssets.test.js: zero missing refs).
// NEVER here: the dashboard monolith (/dashboard, dashboard_new.js),
// private/auth pages (login/register/auth.js/login.css), API, or non-GET.
// Rationale: precache is an explicit allowlist snapshot; the server marks
// HTML/API no-store (F02), so auth-gated content must not be snapshotted.
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/css/common.css',
  '/js/utils.js',
  '/js/script.js',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
];

// Server-rendered / sensitive surfaces: network-only, never cached, never
// served from cache (no sensitive fallback). Kept as exact/boundary
// prefixes — same explicit style as server/middleware/webAssetCache.js.
function isNetworkOnlyPath(pathname) {
  return (
    pathname === '/api' || pathname.startsWith('/api/') ||
    pathname === '/health' || pathname.startsWith('/health/') ||
    pathname.startsWith('/store/') ||
    pathname.startsWith('/chat/')
  );
}

// Same-origin static shell assets eligible for network-first runtime
// caching: the precache list plus version-agnostic css/js/font extensions.
// Dashboard/lazy chunks are NOT prefetched at install; a chunk is only
// ever cached after the page itself explicitly requests it (F05 contract).
function isShellAsset(pathname) {
  if (urlsToCache.includes(pathname)) return true;
  return /\.(css|js|woff2?|ttf)$/i.test(pathname);
}

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    self.skipWaiting().then(() => caches.open(CACHE_NAME))
      .then((cache) => {
        console.log('Service Worker: Caching public shell');
        return cache.addAll(urlsToCache)
          .catch(error => {
            console.error('Service Worker: Failed to cache resource:', error);
          });
      })
      .catch(error => {
        console.error('Service Worker: Failed to open cache:', error);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Purge ONLY ZainBot-prefixed caches from previous releases;
          // foreign/third-party caches are left untouched.
          if (cacheName !== CACHE_NAME && cacheName.startsWith('zainbot-')) {
            console.log('Service Worker: Clearing old cache:', cacheName);
            return caches.delete(cacheName);
          }
          return undefined;
        })
      ).then(() => self.clients.claim());
    })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Non-GET (POST/PUT/DELETE/...): never intercept, never cache.
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  const pathname = requestUrl.pathname;
  const isSameOrigin = requestUrl.origin === self.location.origin;
  // Query-blind cache key: ?v= is a version label, not a content
  // fingerprint — all query variants share one entry (no skew, no growth).
  const cacheKey = requestUrl.origin + pathname;
  const dest = request.destination;

  // 1) الصور: ممنوع تتحط في أي كاش وممنوع تتقري من الكاش
  // هنستخدم network fetch مع cache: 'no-store' دايمًا علشان كل مرة تتحمل من السيرفر
  if (dest === 'image') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => {
          // لو الشبكة وقعت مفيش fallback للصور (حسب الطلب: الصور لازم تتجاب من الشبكة)
          console.warn('Service Worker: Image fetch failed (no-store)', request.url);
          return new Response('', { status: 504, statusText: 'Image fetch failed' });
        })
    );
    return;
  }

  // 2) API والديناميك الحساس: شبكة فقط، بلا كاش قراءةً أو كتابةً، وبلا
  // fallback حساس — الفشل يرجع 503 صريحًا وليس صفحة مخزنة.
  if (isNetworkOnlyPath(pathname)) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          console.log(`Service Worker: Network failed for ${pathname}, no cached fallback for sensitive path`);
          return new Response('Service unavailable', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        })
    );
    return;
  }

  // 3) أي روابط خارجية (Cross-Origin): لا كاش نهائيًا
  if (!isSameOrigin) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => {
          console.warn('Service Worker: External request failed (no-store)', request.url);
          return new Response('External resource unavailable', { status: 502 });
        })
    );
    return;
  }

  // 4) أصول الشل العامة same-origin: network-first بمفتاح query-blind، مع
  // احترام no-store (رد no-store لا يُكتب في الكاش أبدًا).
  if (isShellAsset(pathname)) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseCacheControl = networkResponse.headers
              ? (networkResponse.headers.get('Cache-Control') || '')
              : '';
            if (!/no-store/i.test(responseCacheControl)) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  console.log(`Service Worker: Updating cache for ${cacheKey}`);
                  cache.put(cacheKey, responseToCache);
                });
            } else {
              console.log(`Service Worker: Respecting no-store for ${cacheKey}`);
            }
            console.log(`Service Worker: Serving fresh content from network for ${request.url}`);
            return networkResponse;
          }
          // If network response is not valid, fall back to cache
          return caches.match(cacheKey)
            .then((cacheResponse) => {
              if (cacheResponse) {
                console.log(`Service Worker: Serving cached content for ${cacheKey}`);
                return cacheResponse;
              }
              console.error(`Service Worker: No cache available for ${cacheKey}`);
              return new Response('Resource not found', { status: 404 });
            });
        })
        .catch(async () => {
          // If network fails (offline), fall back to cache
          console.log(`Service Worker: Network failed, falling back to cache for ${cacheKey}`);
          const cacheResponse = await caches.match(cacheKey);
          if (cacheResponse) {
            return cacheResponse;
          }
          if (request.mode === 'navigate') {
            const indexHtml = await caches.match(self.location.origin + '/index.html');
            if (indexHtml) return indexHtml;
          }
          return new Response('Resource unavailable offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        })
    );
    return;
  }

  // 5) باقي same-origin (صفحات خاصة/HTML غير مخزن): شبكة فقط مع fallback
  // الملاحة للشل العام عند الانقطاع — بلا قراءة/كتابة كاش هنا.
  event.respondWith(
    fetch(request)
      .catch(async () => {
        if (request.mode === 'navigate') {
          const indexHtml = await caches.match(self.location.origin + '/index.html');
          if (indexHtml) return indexHtml;
        }
        return new Response('Network request failed', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      })
  );
});
