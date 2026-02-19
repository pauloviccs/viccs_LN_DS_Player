import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { getDeviceId, generatePairingCode } from './lib/device';
import PairingView from './views/PairingView';
import PlayerView from './views/PlayerView';

export default function App() {
  const [status, setStatus] = useState('loading'); // loading, pairing, active
  const [pairingCode, setPairingCode] = useState(null);
  const [screenData, setScreenData] = useState(null);
  const [playlist, setPlaylist] = useState(null);
  const [debugError, setDebugError] = useState(null);

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
          .single();

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
      if (screen.current_playlist_id) {
        fetchPlaylist(screen.current_playlist_id);
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
    const { data, error } = await supabase
      .from('playlists')
      .select('*')
      .eq('id', playlistId)
      .single();

    if (data) {
      setPlaylist(data);
    }
  }

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

  return <PlayerView screenId={screenData?.id} initialPlaylist={playlist} />;
}
