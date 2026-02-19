import React, { useState, useEffect } from 'react';
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

        // 2. Subscribe to Realtime Updates
        supabase
          .channel('screen_updates')
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'screens', filter: `id=eq.${deviceId}` },
            (payload) => {
              console.log('Realtime update:', payload);
              handleScreenState(payload.new);
            }
          )
          .subscribe();

        // 3. Periodic Ping (Heartbeat)
        const pingInterval = setInterval(async () => {
          await supabase
            .from('screens')
            .update({ last_ping: new Date() })
            .eq('id', deviceId);
        }, 30000); // 30s ping

        return () => clearInterval(pingInterval);

      } catch (e) {
        console.error("Init Error:", e);
        setDebugError(e.message);
      }
    };

    initializePlayer();
  }, []);

  const handleScreenState = async (screen) => {
    console.log("Handling state:", screen);
    setScreenData(screen);

    if (screen.status === 'online' || (screen.assigned_to && screen.pairing_code === null)) {
      // Online/Active
      setStatus('active');
      // Fetch Playlist if assigned
      if (screen.playlist_id) {
        fetchPlaylist(screen.playlist_id);
      } else {
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
    try {
      const { data, error } = await supabase
        .from('playlists')
        .select('*')
        .eq('id', playlistId)
        .single();

      if (data) {
        // Cache the content before setting it
        const cachedPlaylist = await cacheManager.cachePlaylist(data);

        // Revoke old URLs if switching playlists
        if (playlist) {
          cacheManager.revokeUrls(playlist);
        }

        setPlaylist(cachedPlaylist);

        // Cleanup unused cache
        cacheManager.cleanupCache(cachedPlaylist);
      }
    } catch (e) {
      console.error("Fetch/Cache Error:", e);
    } finally {
      setIsSyncing(false);
    }
  }

  // Subscribe to Playlist Updates
  useEffect(() => {
    if (!playlist?.id) return;

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
      supabase.removeChannel(channel);
    }
  }, [playlist?.id]);


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

  return (
    <>
      <PlayerView screenId={screenData?.id} initialPlaylist={playlist} />
      {isSyncing && (
        <div className="fixed top-4 right-4 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full flex items-center gap-2 z-50 animate-pulse">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
          <span className="text-xs text-white/80 font-mono">SYNCING</span>
        </div>
      )}
    </>
  );
}
