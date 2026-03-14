/**
 * Lumia Player — Service Worker
 *
 * Strategy: Cache-First for Supabase Storage URLs.
 * On first request, downloads and caches. On subsequent requests (every time
 * a <img> or <video> loads the same URL), serves from local Cache Storage
 * without hitting the Supabase CDN — eliminating Cached Egress.
 *
 * All other requests (PostgREST, realtime, etc.) pass through normally.
 */

const CACHE_NAME = 'lumia-media-v1';

// Match any Supabase Storage object URL
const STORAGE_PATTERN = /supabase\.co\/storage\/v1\/object\//;

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installed:', CACHE_NAME);
  // Activate immediately without waiting for old SW to be replaced
  self.skipWaiting();
});

// ── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activated. Claiming clients...');
  // Clean up old cache versions
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only intercept GET requests to Supabase Storage
  if (request.method !== 'GET' || !STORAGE_PATTERN.test(request.url)) {
    return; // Pass-through: realtime, postgrest, auth, etc.
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Try cache first (Cache-First strategy)
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        console.log('[SW] Cache HIT:', request.url.split('/').pop());
        return cachedResponse;
      }

      // 2. Cache miss — fetch from network and store
      try {
        console.log('[SW] Cache MISS — fetching:', request.url.split('/').pop());
        const networkResponse = await fetch(request);

        // Only cache successful, non-opaque responses
        if (networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }

        return networkResponse;
      } catch (err) {
        console.error('[SW] Fetch failed for:', request.url, err);
        // Let the browser handle the error naturally
        throw err;
      }
    })
  );
});
