import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import { getDeviceId, generatePairingCode } from './lib/device';
import { cacheManager } from './services/cacheManager';
import PairingView from './views/PairingView';
import PlayerView from './views/PlayerView';

export default function App() {
  const [status, setStatus] = useState('loading'); // loading, pairing, active
  const [pairingCode, setPairingCode] = useState(null);
  const [screenData, setScreenData] = useState(null);
  const [playlist, setPlaylist] = useState(null);
  const [debugError, setDebugError] = useState(null);
  const [schemaError, setSchemaError] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Keep references for proper cleanup and comparison
  const screenChannelRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const previousScreenRef = useRef(null);

  const enterPairingMode = async (reason) => {
    try {
      const deviceId = getDeviceId();
      const code = generatePairingCode();

      console.log('[Player] Entering pairing mode:', { reason, deviceId, code });

      // Stop playback immediately
      setPlaylist(null);
      setLoadingProgress(0);
      setIsSyncing(false);

      // Reset screen tracking so next UPDATE is treated as fresh
      previousScreenRef.current = null;

      // Show pairing UI right away
      setPairingCode(code);
      setStatus('pairing');

      // Re-create the pending screen row so the admin can pair it manually using the code.
      // Note: Dashboard list is filtered to paired screens only, so this won't "auto-add" to Screens UI.
      const { data, error } = await supabase
        .from('screens')
        .upsert({
          id: deviceId,
          name: screenData?.name || `TV-${code}`,
          status: 'pending',
          pairing_code: code,
          assigned_to: null,
          playlist_id: null,
          last_ping: new Date()
        })
        .select()
        .single();

      if (error) {
        console.error('[Player] Failed to upsert pending screen row:', error);
        return;
      }

      setScreenData(data);
    } catch (e) {
      console.error('[Player] Failed to enter pairing mode:', e);
    }
  };

  if (!supabase) {
    return (
      <div className="bg-black text-white h-screen flex flex-col items-center justify-center p-8 text-center">
        <h1 className="text-3xl font-bold text-red-500 mb-4">Configuration Error</h1>
        <p className="mb-4">Missing Supabase URL or Anonymous Key.</p>
        <p className="text-gray-500 text-sm">Please check your .env file or Vercel Environment Variables.</p>
      </div>
    )
  }

  if (schemaError) {
    return (
      <div className="bg-black text-white h-screen flex flex-col items-center justify-center p-8 text-center animate-fade-in-up">
        <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mb-6">
          <span className="text-3xl">⚠️</span>
        </div>
        <h1 className="text-2xl font-bold text-yellow-500 mb-2">Schema Mismatch (406)</h1>
        <p className="text-gray-400 max-w-md mb-6">
          The database schema needs to be reloaded in Supabase.
        </p>
        <div className="bg-white/10 p-4 rounded-lg text-left text-sm font-mono text-gray-300">
          <p>1. Go to Supabase Dashboard</p>
          <p>2. Settings &gt; API</p>
          <p>3. Click "Reload Schema Cache"</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-8 px-6 py-2 bg-white text-black rounded-full hover:bg-gray-200 transition"
        >
          Retry Connection
        </button>
      </div>
    )
  }

  useEffect(() => {
    const initializePlayer = async () => {
      try {
        const deviceId = getDeviceId();
        console.log('Device ID:', deviceId);

        // 1. Register/Get Screen
        let { data: screen, error } = await supabase
          .from('screens')
          .select('*')
          .eq('id', deviceId)
          .maybeSingle();

        if (error) {
          if (error.code === 'PGRST106' || error.status === 406) {
            setSchemaError(true);
            return;
          }
          throw error;
        }

        if (!screen) {
          // Register new screen
          const code = generatePairingCode();
          const { data: newScreen, error: createError } = await supabase
            .from('screens')
            .upsert({
              id: deviceId,
              name: `TV-${code}`,
              status: 'pending',
              pairing_code: code,
              last_ping: new Date()
            })
            .select()
            .single();

          if (createError) throw createError;
          screen = newScreen;
        }

        handleScreenState(screen);

        // 2. Subscribe to Realtime Updates for this screen
        if (screenChannelRef.current) {
          supabase.removeChannel(screenChannelRef.current);
        }

        screenChannelRef.current = supabase
          .channel('screen_updates')
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'screens', filter: `id=eq.${deviceId}` },
            (payload) => {
              console.log('[Realtime] Screen updated:', payload);
              handleScreenState(payload.new);
            }
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'screens', filter: `id=eq.${deviceId}` },
            (payload) => {
              console.log('[Realtime] Screen deleted (unpaired):', payload);
              enterPairingMode('screen_deleted');
            }
          )
          .subscribe();

        // 3. Periodic Ping (Heartbeat)
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }

        pingIntervalRef.current = setInterval(async () => {
          const { error } = await supabase
            .from('screens')
            .update({ last_ping: new Date() })
            .eq('id', deviceId);

          if (error) {
            console.error('[Heartbeat] Ping failed:', error);
          }
        }, 30000); // 30s ping

      } catch (e) {
        console.error("Init Error:", e);
        setDebugError(e.message);
      }
    };

    initializePlayer();

    // Cleanup on unmount
    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      if (screenChannelRef.current) {
        supabase.removeChannel(screenChannelRef.current);
      }
    }
  }, []);

  const handleScreenState = async (screen) => {
    console.log("Handling state:", screen);
    const previousScreen = previousScreenRef.current;
    previousScreenRef.current = screen;

    const previousPlaylistId = previousScreen?.playlist_id || null;
    const nextPlaylistId = screen?.playlist_id || null;

    setScreenData(screen);

    if (screen.status === 'online' || (screen.assigned_to && screen.pairing_code === null)) {
      // Online/Active
      setStatus('active');
      // Fetch Playlist if assigned
      if (nextPlaylistId) {
        // Only refetch if playlist changed or we don't have one yet
        if (!previousPlaylistId || previousPlaylistId !== nextPlaylistId || !playlist) {
          console.log('[Player] Playlist change detected:', previousPlaylistId, '->', nextPlaylistId);
          fetchPlaylist(nextPlaylistId);
        }
      } else {
        // No playlist assigned anymore – clear current playlist and revoke URLs
        if (playlist) {
          cacheManager.revokeUrls(playlist);
        }
        setPlaylist(null);
      }
    } else {
      // Pending/Pairing
      setPairingCode(screen.pairing_code);
      setStatus('pairing');
    }
  };



  const fetchPlaylist = async (playlistId) => {
    setIsSyncing(true);
    setLoadingProgress(0);
    try {
      const { data, error } = await supabase
        .from('playlists')
        .select('*')
        .eq('id', playlistId)
        .single();

      if (data) {
        // Cache the content before setting it, while reporting progress
        const cachedPlaylist = await cacheManager.cachePlaylist(data, (completed, total) => {
          const pct = total > 0 ? Math.round((completed / total) * 100) : 100;
          setLoadingProgress(pct);
        });

        setPlaylist(cachedPlaylist);

        // Cleanup unused cache
        cacheManager.cleanupCache(cachedPlaylist);
      }
    } catch (e) {
      console.error("Fetch/Cache Error:", e);
    } finally {
      setLoadingProgress(100);
      setIsSyncing(false);
    }
  }

  // Subscribe to Playlist Updates
  useEffect(() => {
    if (!playlist?.id) return;

    console.log('[Player] Subscribing to playlist realtime channel for id:', playlist.id);

    const channel = supabase
      .channel(`playlist:${playlist.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'playlists', filter: `id=eq.${playlist.id}` },
        (payload) => {
          console.log('[Realtime] Playlist updated:', payload);
          // Re-fetch and re-sync
          fetchPlaylist(playlist.id);
        }
      )
      .subscribe();

    return () => {
      console.log('[Player] Removing playlist realtime channel for id:', playlist.id);
      supabase.removeChannel(channel);
    }
  }, [playlist?.id]);

  // Fallback polling: periodically re-fetch screen state
  useEffect(() => {
    const deviceId = getDeviceId();
    let isCancelled = false;

    const pollScreen = async () => {
      try {
        const { data, error } = await supabase
          .from('screens')
          .select('*')
          .eq('id', deviceId)
          .maybeSingle();

        if (error) {
          console.error('[Polling] Screen fetch error:', error);
          return;
        }

        if (isCancelled) return;

        if (!data) {
          console.log('[Polling] Screen row missing (likely unpaired).');
          enterPairingMode('screen_missing');
          return;
        }

        console.log('[Polling] Screen state fetched:', data);
        handleScreenState(data);
      } catch (e) {
        console.error('[Polling] Screen fetch exception:', e);
      }
    };

    // Initial poll and interval
    pollScreen();
    const intervalId = setInterval(pollScreen, 60000); // 60s

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  // Fallback polling: periodically re-fetch current playlist
  useEffect(() => {
    if (!playlist?.id) return;

    let isCancelled = false;

    const pollPlaylist = async () => {
      try {
        const { data, error } = await supabase
          .from('playlists')
          .select('*')
          .eq('id', playlist.id)
          .single();

        if (error) {
          console.error('[Polling] Playlist fetch error:', error);
          return;
        }

        if (isCancelled || !data) return;

        // If updated_at changed, refetch and resync with cache pipeline
        if (!playlist.updated_at || data.updated_at !== playlist.updated_at) {
          console.log('[Polling] Playlist changed (updated_at), refetching:', playlist.id);
          fetchPlaylist(playlist.id);
        }
      } catch (e) {
        console.error('[Polling] Playlist fetch exception:', e);
      }
    };

    // Initial poll and interval
    pollPlaylist();
    const intervalId = setInterval(pollPlaylist, 60000); // 60s

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [playlist?.id, playlist?.updated_at]);


  if (status === 'loading') {
    return (
      <div className="bg-black text-white h-screen flex flex-col items-center justify-center gap-4">
        <div className="text-2xl font-bold">Lumia Player Setup</div>
        <div className="animate-pulse text-sm text-gray-400">Iniciando Sistema...</div>
        {debugError && <div className="text-red-500 text-xs mt-4">{debugError}</div>}
      </div>
    );
  }

  if (status === 'pairing') {
    return <PairingView code={pairingCode} />;
  }

  // Initial/fullscreen loading while media is being cached for the first time
  if (status === 'active' && !playlist && isSyncing) {
    return (
      <div className="bg-black text-white h-screen flex flex-col items-center justify-center gap-6">
        <div className="text-2xl font-bold">Lumia Player</div>
        <div className="text-sm text-gray-400">Carregando mídias e preparando a playlist...</div>
        <div className="w-2/3 max-w-md">
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-2 bg-blue-500 transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="mt-2 text-center text-xs text-gray-400 font-mono">
            {loadingProgress}%
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <PlayerView screenId={screenData?.id} initialPlaylist={playlist} />
      {isSyncing && (
        <div className="fixed top-4 right-4 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-2 z-50 animate-pulse">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
          <span className="text-xs text-white/80 font-mono">
            SYNCING{loadingProgress > 0 && loadingProgress < 100 ? ` ${loadingProgress}%` : ''}
          </span>
        </div>
      )}
    </>
  );
}
