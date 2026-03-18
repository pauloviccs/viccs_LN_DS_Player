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
      try {
        // 1. Try cache first (Cache-First strategy)
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
          // Check if this is a Range request (crucial for Smart TV video playback)
          if (request.headers.has('range')) {
            const rangeHeader = request.headers.get('range');
            const buffer = await cachedResponse.arrayBuffer();

            // Parse range: bytes=start-end
            const bytesStr = rangeHeader.replace(/bytes=/, '').split('-');
            const start = parseInt(bytesStr[0], 10);
            const end = bytesStr[1] ? parseInt(bytesStr[1], 10) : buffer.byteLength - 1;
            const chunkSize = end - start + 1;

            // Slice the buffer for the requested range
            const slicedBuffer = buffer.slice(start, end + 1);

            console.log(`[SW] Cache HIT (Range ${start}-${end}):`, request.url.split('/').pop());

            // Create a 206 Partial Content response
            return new Response(slicedBuffer, {
              status: 206,
              statusText: 'Partial Content',
              headers: new Headers({
                'Content-Type': cachedResponse.headers.get('Content-Type') || 'video/mp4',
                'Content-Range': `bytes ${start}-${end}/${buffer.byteLength}`,
                'Content-Length': chunkSize.toString(),
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=31536000'
              })
            });
          }

          // Regular request (not Range)
          console.log('[SW] Cache HIT:', request.url.split('/').pop());
          return cachedResponse;
        }

        // 2. Cache miss — fetch from network and store
        console.log('[SW] Cache MISS — fetching:', request.url.split('/').pop());
        const networkResponse = await fetch(request);

        // Only cache successful, non-opaque responses
        // Opaque responses (status 0) from cross-origin requests without CORS cannot be reliably read for Range requests later
        if (networkResponse.ok && networkResponse.type !== 'opaque') {
          // Clone the response to put in cache since response bodies can only be consumed once
          cache.put(request, networkResponse.clone());
        }

        return networkResponse;
      } catch (err) {
        console.error('[SW] Fetch failed for:', request.url, err);

        // If offline and fetching failed, we try to create an offline fallback or just let it fail
        throw err;
      }
    })
  );
});
