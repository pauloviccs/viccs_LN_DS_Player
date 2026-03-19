# Project Overview

## Project Name

Lumia_DigitalSinage_Player

## Description

The display client app for LumenDS. This runs on remote Smart TVs (LG WebOS, Samsung Tizen, Android TV). It pairs with the dashboard, fetches the assigned playlist, caches media via Service Workers, and plays items in sequence. It handles device constraints and features a visual Lumia Debug log.

## Tech Stack

- Languages: JavaScript, JSX
- Frameworks: React, Vite
- Tools: Tailwind CSS
- Services: Supabase (Realtime Subscriptions, Broadcast Channels)

## Folder Structure

```text
src/
├── lib/          (Platform detection, Supabase client, Device ID logic)
├── services/     (Cache Manager)
└── views/        (PlayerView.jsx, PairingView.jsx)
```

## Current Features

- Automatic Device ID generation and pairing logic
- Background media caching with Service Workers
- JIT Blob generation for legacy WebOS compatibility
- Realtime Postgres updates for screen assignments
- **Debug Log Toggle**: Sincronizado globalmente via Supabase Broadcast Channel e por tela via campo `show_debug`.

## Recent Changes (2026-03-19)

### Debug Log Toggle Feature

- **`globalDebug` state** (`useState(false)`): novo estado que controla a visibilidade do overlay de debug globalmente no player.
- **Fetch inicial de `app_settings`**: ao inicializar, o player consulta `app_settings` (id=1) para obter o valor atual de `global_debug` e aplicá-lo imediatamente, antes mesmo de qualquer broadcast.
- **Broadcast Channel `system_updates`**: novo canal Supabase Realtime que escuta o evento `DEBUG_TOGGLE`. Quando o Dashboard emite esse broadcast, o player aplica a mudança em **tempo real** sem nova query ao banco.
- **Heartbeat sincroniza `global_debug`**: o intervalo de 90s (heartbeat) agora faz query paralela em `app_settings` e atualiza `globalDebug` — safety-net caso o broadcast seja perdido.
- **`show_debug` por tela**: a prop `showDebug` passada ao `PlayerView` é `screenData?.show_debug || globalDebug`, respeitando tanto o toggle global quanto o per-screen.
- **`systemChannelRef`**: nova ref para gerenciar o ciclo de vida do canal de broadcasts do sistema, com cleanup correto no `useEffect` de inicialização.
