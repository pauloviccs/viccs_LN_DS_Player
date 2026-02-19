import React, { useState, useEffect, useRef, useMemo } from 'react';

// Helper to resolve media URLs
const getMediaSrc = (item) => {
    if (!item) return '';
    // Web Version: Direct URL from Supabase Storage
    if (item.url) return item.url;

    // Fallback/Legacy
    return item.src || '';
};

export default function PlayerView({ screenId, initialPlaylist }) {
    const [playlist, setPlaylist] = useState(initialPlaylist); // Local playlist state
    // In a real implementation, we might fetch playlist updates here or pass them down
    // For now, assuming playlist is passed or we fetch it based on screenId logic in App.jsx

    // If playlist is passed as prop 'playlist' (from App.jsx port), use it.
    // The reference passed 'playlist' prop.

    const items = playlist?.items || [];

    const [currentIndex, setCurrentIndex] = useState(0);
    const [needsInteraction, setNeedsInteraction] = useState(false);

    const activeItem = items[currentIndex];
    const videoRef = useRef(null);
    const timeoutRef = useRef(null);

    // Update internal playlist if prop changes (if functionality requires it)
    useEffect(() => {
        if (initialPlaylist) setPlaylist(initialPlaylist);
    }, [initialPlaylist]);

    // Resolve URL
    const src = useMemo(() => getMediaSrc(activeItem), [activeItem]);

    const nextItem = () => {
        if (!items.length) return;

        // Handle single-item playlist looping (specifically for video)
        if (items.length === 1 && activeItem?.type === 'video' && videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(e => console.error("Loop Error:", e));
            return;
        }

        // Standard playlist navigation
        if (items.length > 1) {
            setCurrentIndex((prev) => (prev + 1) % items.length);
        }
    };

    // Effect: Handle Video Playback & Image Duration
    useEffect(() => {
        if (!activeItem) return;

        if (activeItem.type === 'image') {
            const duration = (activeItem.duration || 10) * 1000;
            timeoutRef.current = setTimeout(nextItem, duration);
        } else if (activeItem.type === 'video') {
            if (videoRef.current) {
                videoRef.current.currentTime = 0;
                videoRef.current.muted = true; // Force muted for autoplay policy

                const playPromise = videoRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        console.error("Autoplay Error:", e);
                        setNeedsInteraction(true);
                    });
                }
            }
        }

        return () => clearTimeout(timeoutRef.current);
    }, [activeItem, currentIndex]); // Add currentIndex dependency to ensure re-run on change

    const handleUserInteraction = () => {
        setNeedsInteraction(false);
        const videos = document.querySelectorAll('video');
        videos.forEach(v => {
            v.muted = false;
            v.play().catch(e => console.error("Retry failed:", e));
        });
    };

    if (items.length === 0) {
        return (
            <div className="bg-black flex items-center justify-center h-screen text-white">
                <div className="text-center">
                    <p className="text-xl font-bold mb-2">Lumia Player</p>
                    <p className="text-white/50">Aguardando conteúdo...</p>
                    <p className="text-xs text-white/30 mt-4 font-mono">{screenId}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-black w-full h-full relative overflow-hidden" onClick={() => { if (needsInteraction) handleUserInteraction(); }}>

            {activeItem?.type === 'video' ? (
                <video
                    key={src}
                    ref={videoRef}
                    src={src}
                    className="w-full h-full object-cover"
                    muted={true}
                    autoPlay={true}
                    playsInline={true}
                    onEnded={nextItem}
                    onError={(e) => {
                        console.error("Video Error:", e);
                        // Skip to next item on error after short delay
                        setTimeout(nextItem, 1000);
                    }}
                />
            ) : (
                <img
                    key={src}
                    src={src}
                    className="w-full h-full object-cover"
                    alt="Content"
                    onError={(e) => {
                        console.error("Image Error:", e);
                        setTimeout(nextItem, 1000);
                    }}
                />
            )}

            {/* Interaction Overlay */}
            {needsInteraction && (
                <div
                    className="absolute inset-0 flex items-center justify-center bg-black/90 cursor-pointer"
                    style={{ zIndex: 9999, pointerEvents: 'auto' }}
                    onClick={handleUserInteraction}
                >
                    <div className="text-center">
                        <div className="text-6xl mb-6 text-yellow-400">👆</div>
                        <h2 className="text-4xl font-bold text-white mb-2">Toque para Iniciar</h2>
                        <button className="mt-4 px-6 py-2 bg-yellow-500 text-black font-bold rounded">INICIAR</button>
                    </div>
                </div>
            )}
        </div>
    );
}
