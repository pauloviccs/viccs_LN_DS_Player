import React, { useState, useEffect, useRef, useCallback } from 'react';

// Helper to resolve media URLs
const getMediaSrc = (item) => {
    if (!item) return '';
    // Priority: Cached Blob URL -> Network URL -> Legacy Source
    if (item.src && item.src.startsWith('blob:')) return item.src;
    if (item.url) return item.url;
    return item.src || '';
};

export default function PlayerView({ screenId, initialPlaylist }) {
    const [playlist, setPlaylist] = useState(initialPlaylist);
    const [currentIndex, setCurrentIndex] = useState(0);

    // ── Refs to avoid stale closures ──────────────────────────────────
    // These refs are the SINGLE SOURCE OF TRUTH for the current state
    // inside callbacks/timers/event-listeners that would otherwise
    // capture stale values via closure.
    const itemsRef = useRef([]);
    const currentIndexRef = useRef(0);
    const videoRef = useRef(null);
    const timeoutRef = useRef(null);
    const isTransitioningRef = useRef(false); // Guard against double-fire

    // Keep refs in sync with state
    const items = playlist?.items || [];
    itemsRef.current = items;
    currentIndexRef.current = currentIndex;

    // ── SmartTV Patch: Force Fullscreen ───────────────────────────────
    const enterFullscreen = useCallback(() => {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(() => { });
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        }
    }, []);

    useEffect(() => {
        const timer = setTimeout(enterFullscreen, 1000);
        return () => clearTimeout(timer);
    }, [enterFullscreen]);

    // ── Update internal playlist when prop changes ────────────────────
    useEffect(() => {
        setPlaylist(initialPlaylist || null);
        setCurrentIndex(0);
    }, [initialPlaylist]);

    // ── nextItem: ALWAYS reads from refs, never from closure ──────────
    const nextItem = useCallback(() => {
        const totalItems = itemsRef.current.length;
        if (totalItems === 0) return;

        // Guard: prevent double-fire from overlapping onEnded + timeout
        if (isTransitioningRef.current) {
            console.log('[Player] Transition already in progress, skipping duplicate call');
            return;
        }
        isTransitioningRef.current = true;

        // Handle single-item playlist (loop the same video)
        if (totalItems === 1) {
            const singleItem = itemsRef.current[0];
            if (singleItem?.type === 'video' && videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(e => console.error('[Player] Loop Error:', e));
            }
            // For single image, the timeout will just re-fire
            isTransitioningRef.current = false;
            return;
        }

        // Standard playlist navigation — deterministic sequential order
        const prevIdx = currentIndexRef.current;
        const nextIdx = (prevIdx + 1) % totalItems;

        console.log(`[Player] Transitioning: index ${prevIdx} → ${nextIdx} (total: ${totalItems})`);

        setCurrentIndex(nextIdx);

        // Release the guard after a short delay to absorb any duplicate events
        setTimeout(() => {
            isTransitioningRef.current = false;
        }, 100);
    }, []); // No deps — reads everything from refs

    // ── Derived values ────────────────────────────────────────────────
    const activeItem = items[currentIndex];
    const src = activeItem ? getMediaSrc(activeItem) : '';

    // ── Effect: Handle playback per item ──────────────────────────────
    useEffect(() => {
        if (!activeItem) return;

        // Clear any previous timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        if (activeItem.type === 'image') {
            // Image: advance after duration seconds
            const duration = (activeItem.duration || 10) * 1000;
            timeoutRef.current = setTimeout(() => {
                nextItem();
            }, duration);
        } else if (activeItem.type === 'video') {
            // Video: play from start, onEnded will call nextItem
            if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.muted = true; // Force muted for autoplay policy

                const playPromise = videoRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        console.error('[Player] Autoplay Error:', e);
                        // If autoplay fails (common on TCL/Android TV), skip after 3s
                        timeoutRef.current = setTimeout(() => {
                            nextItem();
                        }, 3000);
                    });
                }
            }
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentIndex]); // ONLY depend on currentIndex — not activeItem (object ref changes every render)

    // ── Video event handlers (stable references via useCallback) ──────
    const handleVideoEnded = useCallback(() => {
        console.log('[Player] Video ended naturally');
        nextItem();
    }, [nextItem]);

    const handleVideoError = useCallback((e) => {
        console.error('[Player] Video Error:', e.nativeEvent?.message || e);
        // Skip to next item after delay (handles codec issues on TCL etc.)
        setTimeout(() => {
            nextItem();
        }, 2000);
    }, [nextItem]);

    const handleImageError = useCallback((e) => {
        console.error('[Player] Image Error:', e.nativeEvent?.message || e);
        setTimeout(() => {
            nextItem();
        }, 1000);
    }, [nextItem]);

    // ── Render: Empty playlist ────────────────────────────────────────
    if (items.length === 0) {
        return (
            <div className="bg-black flex items-center justify-center h-screen text-white">
                <div className="text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {/* Spinner ring — CSS-only, SmartTV-safe */}
                    <div className="lumia-spinner" style={{ marginBottom: '24px' }}></div>

                    <p className="text-xl font-bold mb-2">Lumia Player</p>
                    <p className="lumia-pulse-text" style={{ color: 'rgba(255,255,255,0.5)' }}>Aguardando conteúdo</p>

                    {/* Bouncing dots — replace static "..." */}
                    <div style={{ marginTop: '8px', display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <span className="lumia-dot"></span>
                        <span className="lumia-dot"></span>
                        <span className="lumia-dot"></span>
                    </div>

                    <p className="text-xs text-white/30 mt-4 font-mono">{screenId}</p>
                </div>
            </div>
        );
    }

    // ── Render: Active playback ───────────────────────────────────────
    return (
        <div
            className="bg-black w-full h-full relative overflow-hidden"
            onClick={enterFullscreen}
        >
            {activeItem?.type === 'video' ? (
                <video
                    key={`video-${currentIndex}`}
                    ref={videoRef}
                    src={src}
                    className="w-full h-full object-cover"
                    style={{ backgroundColor: '#000' }}
                    muted={true}
                    autoPlay={true}
                    playsInline={true}
                    preload="metadata"
                    onEnded={handleVideoEnded}
                    onError={handleVideoError}
                >
                    {/* Fallback text for browsers that can't play the video */}
                    Seu navegador não suporta este formato de vídeo.
                </video>
            ) : (
                <img
                    key={`img-${currentIndex}`}
                    src={src}
                    className="w-full h-full object-cover"
                    style={{ backgroundColor: '#000' }}
                    alt="Content"
                    onError={handleImageError}
                />
            )}
        </div>
    );
}
