
const CACHE_NAME = 'lumia-media-v1';

export const cacheManager = {
    /**
     * Downloads and caches all media items in a playlist.
     * @param {Object} playlist - The playlist object containing an 'items' array.
     * @param {(completed: number, total: number) => void} [onProgress] - Optional progress callback.
     * @returns {Promise<Object>} - The playlist with items pointing to cache-backed URLs.
     */
    async cachePlaylist(playlist, onProgress) {
        if (!playlist || !playlist.items) return playlist;

        console.log('[CacheManager] Starting sync for:', playlist.name);
        const cache = await caches.open(CACHE_NAME);

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
                    updatedItems.push(item);
                } else {
                    const request = new Request(item.url, { mode: 'cors' });
                    const matchingResponse = await cache.match(request);

                    if (!matchingResponse) {
                        console.log('[CacheManager] Downloading:', item.title);
                        await cache.add(request);
                    } else {
                        console.log('[CacheManager] Match found for:', item.title);
                    }

                    // We deliberately avoid creating Blob URLs here to reduce memory usage,
                    // especially on constrained SmartTV browsers. The browser will still
                    // use the HTTP cache / Cache Storage for subsequent requests.
                    updatedItems.push({
                        ...item,
                        originalUrl: item.url
                    });
                }
            } catch (err) {
                console.error('[CacheManager] Failed to cache item:', item.title, err);
                updatedItems.push(item); // Fallback to network URL
            } finally {
                completed += 1;
                if (onProgress) {
                    onProgress(completed, total);
                }
            }
        }

        console.log('[CacheManager] Sync complete.');
        return { ...playlist, items: updatedItems };
    },

    /**
     * Cleans up cached files that are no longer in the active playlist.
     * @param {Object} activePlaylist 
     */
    async cleanupCache(activePlaylist) {
        if (!activePlaylist || !activePlaylist.items) return;

        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        const activeUrls = new Set(activePlaylist.items.map(i => i.originalUrl || i.url));

        for (const request of keys) {
            if (!activeUrls.has(request.url)) {
                console.log('[CacheManager] Deleting unused asset:', request.url);
                await cache.delete(request);
            }
        }
    },

    /**
     * Helper kept for backwards-compatibility; no longer needed now that we avoid Blob URLs.
     */
    revokeUrls() {
        // No-op: we no longer create object URLs, so nothing to revoke.
    }
};
