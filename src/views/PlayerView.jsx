import React, { useState, useEffect, useRef, useMemo } from 'react';

// Helper to resolve media URLs
const getMediaSrc = (item) => {
    if (!item) return '';

    // Priority: Cached Blob URL -> Network URL -> Legacy Source
    if (item.src && item.src.startsWith('blob:')) return item.src;
    if (item.url) return item.url;
    return item.src || '';
};

export default function PlayerView({ screenId, initialPlaylist }) {
    const [playlist, setPlaylist] = useState(initialPlaylist); // Local playlist state
    // In a real implementation, we might fetch playlist updates here or pass them down
    // For now, assuming playlist is passed or we fetch it based on screenId logic in App.jsx

    // If playlist is passed as prop 'playlist' (from App.jsx port), use it.
    // The reference passed 'playlist' prop.

    // SmartTV Patch: Force Fullscreen
    const enterFullscreen = () => {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(err => console.log("Fullscreen request denied:", err));
        } else if (elem.webkitRequestFullscreen) { /* Safari */
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE11 */
            elem.msRequestFullscreen();
        }
    };

    useEffect(() => {
        // Attempt to enter fullscreen on mount (might be blocked by browser policy without interaction)
        const timer = setTimeout(() => {
            enterFullscreen();
        }, 1000);
        return () => clearTimeout(timer);
    }, []);

    const items = playlist?.items || [];

    const [currentIndex, setCurrentIndex] = useState(0);

    const activeItem = items[currentIndex];
    const videoRef = useRef(null);
    const timeoutRef = useRef(null);

    // Update internal playlist whenever prop changes (including clearing it)
    useEffect(() => {
        setPlaylist(initialPlaylist || null);
        // Reset index when playlist changes to avoid out-of-bounds
        setCurrentIndex(0);
    }, [initialPlaylist]);

    // Resolve URL
    const src = useMemo(() => getMediaSrc(activeItem), [activeItem]);

    // Preload próxima mídia para reduzir tela preta em TVs
    useEffect(() => {
        if (!items.length) return;

        const nextIndex = items.length > 1 ? (currentIndex + 1) % items.length : 0;
        const nextItem = items[nextIndex];
        if (!nextItem) return;

        const nextSrc = getMediaSrc(nextItem);
        if (!nextSrc) return;

        try {
            if (nextItem.type === 'image') {
                const img = new Image();
                img.src = nextSrc;
            } else if (nextItem.type === 'video') {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.src = nextSrc;
            }
        } catch (e) {
            console.error('Preload error:', e);
        }
    }, [items, currentIndex]);

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

                videoRef.current.play().catch(e => {
                    console.error("Autoplay Error:", e);
                });
            }
        }

        return () => clearTimeout(timeoutRef.current);
    }, [activeItem, currentIndex]); // Add currentIndex dependency to ensure re-run on change

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
        <div
            className="bg-black w-full h-full relative overflow-hidden"
            onClick={enterFullscreen} // SmartTV Patch: Click to force fullscreen if auto fails
        >

            {activeItem?.type === 'video' ? (
                <video
                    key={src}
                    ref={videoRef}
                    src={src}
                    className="w-full h-full object-cover"
                    muted={true}
                    autoPlay={true}
                    playsInline={true}
                    preload="auto"
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
        </div>
    );
}
