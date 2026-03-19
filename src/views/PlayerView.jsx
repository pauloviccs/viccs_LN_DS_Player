import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from '../lib/platform';

// Helper to resolve media URLs
const getMediaSrc = (item) => {
    if (!item) return '';
    if (item.src && item.src.startsWith('blob:')) return item.src;
    if (item.url) return item.url;
    return item.src || '';
};

export default function PlayerView({ screenId, initialPlaylist }) {
    const [playlist, setPlaylist] = useState(initialPlaylist);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [debugInfo, setDebugInfo] = useState('Initializing...');
    const [showDebug, setShowDebug] = useState(true); // Visual debug overlay

    // ── Refs ──────────────────────────────────────────────────────────
    const itemsRef = useRef([]);
    const currentIndexRef = useRef(0);
    const videoRef = useRef(null);
    const imgRef = useRef(null); // ← FIX A: ref para <img> persistente
    const timeoutRef = useRef(null);
    const isTransitioningRef = useRef(false);
    const playRetryRef = useRef(null);

    // Keep refs in sync
    const items = playlist?.items || [];
    itemsRef.current = items;
    currentIndexRef.current = currentIndex;

    // ── Debug logger: updates both console AND visual overlay ─────────
    const dbg = useCallback((msg) => {
        console.log('[Player]', msg);
        setDebugInfo(msg);
    }, []);

    // ── SmartTV Patch: Force Fullscreen ───────────────────────────────
    const enterFullscreen = useCallback(() => {
        const elem = document.documentElement;
        try {
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(() => { });
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
        } catch (_) { /* fullscreen not supported */ }
    }, []);

    useEffect(() => {
        const timer = setTimeout(enterFullscreen, 1000);
        return () => clearTimeout(timer);
    }, [enterFullscreen]);

    // ── Update internal playlist when prop changes ────────────────────
    useEffect(() => {
        setPlaylist(initialPlaylist || null);
        setCurrentIndex(0);
        dbg('Playlist received: ' + (initialPlaylist?.name || 'null') + ' — items: ' + (initialPlaylist?.items?.length || 0));
    }, [initialPlaylist, dbg]);

    // ── nextItem ──────────────────────────────────────────────────────
    const nextItem = useCallback(() => {
        const totalItems = itemsRef.current.length;
        if (totalItems === 0) return;

        if (isTransitioningRef.current) {
            console.log('[Player] Transition guard — skipping duplicate');
            return;
        }
        isTransitioningRef.current = true;

        // Clear any pending play retry
        if (playRetryRef.current) {
            clearTimeout(playRetryRef.current);
            playRetryRef.current = null;
        }

        if (totalItems === 1) {
            const singleItem = itemsRef.current[0];
            if (singleItem?.type === 'video' && videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.play().catch(() => { });
            }
            isTransitioningRef.current = false;
            return;
        }

        const prevIdx = currentIndexRef.current;
        const nextIdx = (prevIdx + 1) % totalItems;
        const nextName = itemsRef.current[nextIdx]?.name || itemsRef.current[nextIdx]?.title || `Item ${nextIdx}`;

        dbg(`Transition: ${prevIdx} → ${nextIdx} / ${totalItems} [${nextName}]`);
        setCurrentIndex(nextIdx);

        setTimeout(() => {
            isTransitioningRef.current = false;
        }, 100);
    }, [dbg]);

    // ── Derived values ────────────────────────────────────────────────
    const activeItem = items[currentIndex];

    // State for the currently resolving source (Native URL or Blob URL)
    const [mediaSrc, setMediaSrc] = useState('');

    // ── JIT Blob URL for Videos (Bypass SW for LG WebOS) ──────────────
    // FIX C: Otimizado com Platform.useJITBlob — só cria JIT Blob para WebOS legado
    useEffect(() => {
        let objectUrl = null;
        let isCancelled = false;

        async function resolveSource() {
            if (!activeItem) return;

            const originalUrl = activeItem.originalUrl || activeItem.url || activeItem.src;

            // If it's an image, or already a blob, just use the URL directly
            if (activeItem.type === 'image' || originalUrl.startsWith('blob:')) {
                setMediaSrc(originalUrl);
                return;
            }

            // FIX C: JIT Blob apenas para plataformas onde o SW causa stall (WebOS legado)
            if (!Platform.useJITBlob) {
                // Android TV, Samsung Tizen, Philips: usar URL direto — SW cuida do cache
                dbg(`Direct URL (non-WebOS): ${originalUrl.split('/').pop()?.substring(0, 30)}`);
                setMediaSrc(originalUrl);
                return;
            }

            // WebOS legado: JIT Blob para contornar limitações do SW
            dbg(`Resolving JIT Blob for ${activeItem.name || 'video'}...`);
            try {
                const cache = await caches.open('lumia-media-v1');
                const response = await cache.match(originalUrl);

                if (response && !isCancelled) {
                    const blob = await response.blob();
                    if (!isCancelled) {
                        objectUrl = URL.createObjectURL(blob);
                        dbg(`JIT Blob created: ${objectUrl.substring(0, 30)}...`);
                        setMediaSrc(objectUrl);
                    }
                } else if (!isCancelled) {
                    dbg(`JIT Blob failed - not in cache, fallback to network`);
                    setMediaSrc(originalUrl);
                }
            } catch (err) {
                if (!isCancelled) {
                    dbg(`JIT Error: ${err.message}. Fallback to network.`);
                    setMediaSrc(originalUrl);
                }
            }
        }

        resolveSource();

        return () => {
            isCancelled = true;
            if (objectUrl) {
                // Aggressively revoke the URL to prevent Out of Memory crashes on TVs
                URL.revokeObjectURL(objectUrl);
                dbg(`Revoked JIT Blob`);
            }
        };
    }, [activeItem, dbg]);

    // ── tryPlay: attempts to play with retries ────────────────────────
    const tryPlay = useCallback((attempt = 1) => {
        const video = videoRef.current;
        if (!video) {
            dbg('tryPlay: no video element ref');
            return;
        }

        // Wait until mediaSrc is fully resolved into state
        if (!video.src || video.src === window.location.href || video.src.endsWith('/')) {
            dbg('tryPlay postponed: src not ready');
            return;
        }

        dbg(`tryPlay attempt #${attempt} — readyState: ${video.readyState}, networkState: ${video.networkState}`);

        // readyState: 0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA
        // networkState: 0=EMPTY, 1=IDLE, 2=LOADING, 3=NO_SOURCE

        video.muted = true;

        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    dbg(`Playing ✓ [${activeItem?.name || activeItem?.title || 'video'}] attempt #${attempt}`);
                })
                .catch((e) => {
                    dbg(`play() FAILED attempt #${attempt}: ${e.name}: ${e.message}`);

                    if (attempt < 5) {
                        // Retry after increasing delay: 500ms, 1s, 2s, 3s, 5s
                        const delays = [500, 1000, 2000, 3000, 5000];
                        const delay = delays[attempt - 1] || 3000;
                        dbg(`Scheduling retry #${attempt + 1} in ${delay}ms`);
                        playRetryRef.current = setTimeout(() => tryPlay(attempt + 1), delay);
                    } else {
                        dbg(`GIVING UP after ${attempt} attempts — skipping to next item`);
                        setTimeout(() => nextItem(), 1000);
                    }
                });
        }
    }, [activeItem, dbg, nextItem]);

    // ── Effect: Handle playback per item ──────────────────────────────
    useEffect(() => {
        if (!activeItem) {
            dbg('No active item');
            return;
        }

        // Clear previous timers
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (playRetryRef.current) {
            clearTimeout(playRetryRef.current);
            playRetryRef.current = null;
        }

        const itemName = activeItem.name || activeItem.title || `Item ${currentIndex}`;
        dbg(`Loading [${currentIndex}]: ${itemName} (${activeItem.type})`);

        if (activeItem.type === 'image') {
            const duration = (activeItem.duration || 10) * 1000;
            dbg(`Image: showing for ${duration / 1000}s`);
            timeoutRef.current = setTimeout(() => nextItem(), duration);
        } else if (activeItem.type === 'video') {
            // For SmartTV compatibility:
            // 1. Set src via ref (more reliable than React prop on some WebViews)
            // 2. Wait for canplay/loadeddata before calling play()
            // 3. Fallback: try play() immediately as well
            const video = videoRef.current;
            if (video) {
                // Force attributes that some SmartTV WebViews need
                video.muted = true;
                video.autoplay = true;
                video.playsInline = true;
                video.setAttribute('muted', '');
                video.setAttribute('autoplay', '');
                video.setAttribute('playsinline', '');
                video.setAttribute('webkit-playsinline', '');
                video.setAttribute('x5-playsinline', '');
                video.preload = 'auto';

                // Reset and load
                video.currentTime = 0;

                // FIX C: Android TV WebView precisa de load() explícito para iniciar download do novo src
                if (Platform.requiresExplicitLoad) {
                    video.load();
                    dbg(`Android TV: video.load() chamado explicitamente`);
                }

                // FIX B: flag para garantir que tryPlay só é chamado uma vez por item
                let playInitiated = false;

                // Strategy: try play immediately + listen for canplay as backup
                const onCanPlay = () => {
                    if (playInitiated) return; // ← FIX B: guard
                    playInitiated = true;
                    dbg(`canplay fired for [${itemName}] — calling play()`);
                    video.removeEventListener('canplay', onCanPlay);
                    tryPlay(1);
                };

                video.addEventListener('canplay', onCanPlay);

                // Also try immediately (works on Chrome, some SmartTVs)
                // Small delay to let React commit the new src
                setTimeout(() => {
                    if (playInitiated) return; // ← FIX B: guard
                    playInitiated = true;
                    dbg(`Immediate play attempt for [${itemName}]`);
                    tryPlay(1);
                }, 200);

                // FIX C: Safety net com timeout por plataforma
                const safetyMs = Platform.safetyTimeoutMs;
                timeoutRef.current = setTimeout(() => {
                    dbg(`SAFETY TIMEOUT ${safetyMs / 1000}s — video never played [${itemName}]`);
                    video.removeEventListener('canplay', onCanPlay);
                    nextItem();
                }, safetyMs);
            }
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            if (playRetryRef.current) {
                clearTimeout(playRetryRef.current);
                playRetryRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentIndex]);

    // ── Video event handlers ─────────────────────────────────────────
    const handleVideoEnded = useCallback(() => {
        // Clear safety timeout since video played successfully
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        dbg('Video ended naturally ✓');
        nextItem();
    }, [nextItem, dbg]);

    const handleVideoError = useCallback((e) => {
        const video = videoRef.current;
        const errorCode = video?.error?.code || 'unknown';
        const errorMsg = video?.error?.message || e?.nativeEvent?.message || 'Unknown error';
        dbg(`VIDEO ERROR code=${errorCode}: ${errorMsg}`);
        setTimeout(() => nextItem(), 2000);
    }, [nextItem, dbg]);

    const handleVideoPlaying = useCallback(() => {
        // Video actually started rendering frames — clear safety timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        // Also clear any pending retries
        if (playRetryRef.current) {
            clearTimeout(playRetryRef.current);
            playRetryRef.current = null;
        }
        dbg(`▶ PLAYING [${currentIndex}] ${activeItem?.name || ''}`);
    }, [currentIndex, activeItem, dbg]);

    const handleVideoStalled = useCallback(() => {
        dbg(`⏸ STALLED [${currentIndex}] — network issue or buffering`);
    }, [currentIndex, dbg]);

    const handleVideoWaiting = useCallback(() => {
        dbg(`⏳ WAITING [${currentIndex}] — buffering`);
    }, [currentIndex, dbg]);

    const handleImageError = useCallback(() => {
        dbg('Image load error — skipping');
        setTimeout(() => nextItem(), 1000);
    }, [nextItem, dbg]);

    // ── Render: Empty playlist ────────────────────────────────────────
    if (items.length === 0) {
        return (
            <div className="bg-black flex items-center justify-center h-screen text-white">
                <div className="text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div className="lumia-spinner" style={{ marginBottom: '24px' }}></div>
                    <p className="text-xl font-bold mb-2">Lumia Player</p>
                    <p className="lumia-pulse-text" style={{ color: 'rgba(255,255,255,0.5)' }}>Aguardando conteúdo</p>
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
    // FIX A: Ambos <video> e <img> SEMPRE presentes no DOM, visibilidade via style.
    // NUNCA usar key={} em <video> — causa destruição e recriação do pipeline de decode.
    return (
        <div
            className="bg-black w-full h-full relative overflow-hidden"
            onClick={enterFullscreen}
            style={{ width: '100vw', height: '100vh' }}
        >
            {/* Video — sempre presente no DOM, escondido quando não é o tipo ativo */}
            <video
                ref={videoRef}
                src={mediaSrc}
                className="w-full h-full object-cover"
                style={{
                    backgroundColor: '#000',
                    width: '100%',
                    height: '100%',
                    display: activeItem?.type === 'video' ? 'block' : 'none',
                    // GPU compositing layer — crítico para WebOS 4.x
                    transform: 'translateZ(0)',
                    WebkitTransform: 'translateZ(0)',
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                }}
                muted
                autoPlay
                playsInline
                preload="auto"
                onEnded={handleVideoEnded}
                onError={handleVideoError}
                onPlaying={handleVideoPlaying}
                onStalled={handleVideoStalled}
                onWaiting={handleVideoWaiting}
            />

            {/* Image — sempre presente no DOM, escondida quando não é o tipo ativo */}
            <img
                ref={imgRef}
                src={activeItem?.type === 'image' ? mediaSrc : undefined}
                className="w-full h-full object-cover"
                style={{
                    backgroundColor: '#000',
                    width: '100%',
                    height: '100%',
                    display: activeItem?.type === 'image' ? 'block' : 'none',
                }}
                alt="Content"
                onError={handleImageError}
            />

            {/* ── Visual Debug Overlay ─────────────────────────────────── */}
            {/* Shows on Smart TVs where DevTools is not available */}
            {showDebug && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: 'rgba(0,0,0,0.85)',
                        color: '#4ade80',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        padding: '8px 12px',
                        zIndex: 9999,
                        lineHeight: 1.4,
                        pointerEvents: 'none',
                    }}
                >
                    <div>📺 Lumia Debug | {screenId?.substring(0, 8)}</div>
                    <div>🎬 [{currentIndex + 1}/{items.length}] {activeItem?.name || activeItem?.title || 'Unknown'}</div>
                    <div>📝 {debugInfo}</div>
                    <div>🔗 {mediaSrc?.startsWith('blob:') ? 'blob: [JIT Memory]' : mediaSrc?.split('/').pop()?.substring(0, 40) || 'no src'}</div>
                </div>
            )}
        </div>
    );
}
