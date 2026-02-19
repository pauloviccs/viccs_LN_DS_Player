
const CACHE_NAME = 'lumia-media-v1';

export const cacheManager = {
    /**
     * Downloads and caches all media items in a playlist.
     * @param {Object} playlist - The playlist object containing an 'items' array.
     * @returns {Promise<Object>} - The playlist with updated item URLs (pointing to cache).
     */
    async cachePlaylist(playlist) {
        if (!playlist || !playlist.items) return playlist;

        console.log('[CacheManager] Starting sync for:', playlist.name);
        const cache = await caches.open(CACHE_NAME);
        const updatedItems = await Promise.all(playlist.items.map(async (item) => {
            try {
                // If it's already a blob URL or invalid, skip
                if (!item.url || item.url.startsWith('blob:')) return item;

                const request = new Request(item.url, { mode: 'cors' });
                const matchingResponse = await cache.match(request);

                if (!matchingResponse) {
                    console.log('[CacheManager] Downloading:', item.title);
                    await cache.add(request);
                } else {
                    console.log('[CacheManager] Match found for:', item.title);
                }

                // Create a Blob URL for the cached item to ensure offline access
                // Note: We could just return the original URL and let the Service Worker handle it,
                // but explicit Blob URLs are more robust if no SW is installed.
                const response = await cache.match(request);
                if (response) {
                    const blob = await response.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    return { ...item, src: objectUrl, originalUrl: item.url }; // src used by PlayerView
                }

                return item;
            } catch (err) {
                console.error('[CacheManager] Failed to cache item:', item.title, err);
                return item; // Fallback to network URL
            }
        }));

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
     * Helper to revoke object URLs to prevent memory leaks.
     * Should be called when switching playlists.
     * @param {Object} oldPlaylist 
     */
    revokeUrls(oldPlaylist) {
        if (!oldPlaylist || !oldPlaylist.items) return;
        oldPlaylist.items.forEach(item => {
            if (item.src && item.src.startsWith('blob:')) {
                URL.revokeObjectURL(item.src);
            }
        });
    }
};
