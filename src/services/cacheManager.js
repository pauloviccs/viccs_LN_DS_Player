
const CACHE_NAME = 'lumia-media-v1';

// Timeout wrapper: rejects after N ms to prevent infinite hangs
const withTimeout = (promise, ms, label) =>
    Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`[CacheManager] TIMEOUT after ${ms}ms: ${label}`)), ms)
        ),
    ]);

export const cacheManager = {
    /**
     * Downloads and caches all media items in a playlist.
     * @param {Object} playlist - The playlist object containing an 'items' array.
     * @param {(completed: number, total: number) => void} [onProgress] - Optional progress callback.
     * @returns {Promise<Object>} - The playlist with items pointing to cache-backed URLs.
     */
    async cachePlaylist(playlist, onProgress) {
        if (!playlist || !playlist.items) {
            console.log('[CacheManager] No playlist or items — skipping');
            return playlist;
        }

        console.log('[CacheManager] Starting sync for:', playlist.name, '— items:', playlist.items.length);

        let cache;
        try {
            cache = await caches.open(CACHE_NAME);
            console.log('[CacheManager] Cache opened:', CACHE_NAME);
        } catch (err) {
            console.error('[CacheManager] FATAL: Cannot open Cache Storage:', err);
            // Return playlist as-is — the browser will fetch directly from network
            return playlist;
        }

        const total = playlist.items.length;
        let completed = 0;

        if (onProgress) {
            onProgress(0, total);
        }

        const updatedItems = [];

        for (const item of playlist.items) {
            try {
                // If it's already a blob URL or invalid, skip
                if (!item.url || item.url.startsWith('blob:')) {
                    console.log('[CacheManager] Skipping (no url or blob):', item.title || item.name);
                    updatedItems.push(item);
                } else {
                    const request = new Request(item.url, { mode: 'cors' });
                    const matchingResponse = await cache.match(request);

                    if (!matchingResponse) {
                        console.log('[CacheManager] MISS — downloading:', item.title || item.name);
                        // FIX F: Timeout de 60s — suficiente para vídeos grandes em conexão lenta
                        await withTimeout(cache.add(request), 60000, item.title || item.url);
                        console.log('[CacheManager] Downloaded OK:', item.title || item.name);
                    } else {
                        console.log('[CacheManager] HIT:', item.title || item.name);
                    }

                    // Keep the network URL — the Service Worker will intercept and serve from cache
                    updatedItems.push({
                        ...item,
                        originalUrl: item.url
                    });
                }
            } catch (err) {
                console.error('[CacheManager] Failed to cache item:', item.title || item.name, err.message);
                // IMPORTANT: Still push the item so it plays from network
                updatedItems.push(item);
            } finally {
                completed += 1;
                if (onProgress) {
                    onProgress(completed, total);
                }
            }
        }

        console.log('[CacheManager] Sync complete. Items:', updatedItems.length);
        return { ...playlist, items: updatedItems };
    },

    /**
     * Cleans up cached files that are no longer in the active playlist.
     * @param {Object} activePlaylist 
     */
    async cleanupCache(activePlaylist) {
        if (!activePlaylist || !activePlaylist.items) return;

        try {
            const cache = await caches.open(CACHE_NAME);
            const keys = await cache.keys();
            const activeUrls = new Set(activePlaylist.items.map(i => i.originalUrl || i.url));

            for (const request of keys) {
                if (!activeUrls.has(request.url)) {
                    console.log('[CacheManager] Deleting unused asset:', request.url.split('/').pop());
                    await cache.delete(request);
                }
            }
        } catch (err) {
            console.error('[CacheManager] Cleanup error (non-critical):', err);
        }
    },

    /**
     * Helper kept for backwards-compatibility; no longer needed now that we avoid Blob URLs.
     */
    revokeUrls() {
        // No-op: we no longer create object URLs, so nothing to revoke.
    }
};
