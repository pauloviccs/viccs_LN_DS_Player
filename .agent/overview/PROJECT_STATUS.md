# Project Overview

## Project Name

Lumia_DigitalSinage_Player

## Description

The display client app for LumenDS. This runs on remote Smart TVs (LG WebOS, Samsung Tizen, Android TV). It pairs with the dashboard, fetches the assigned playlist, caches media via Service Workers, and plays items in sequence. It handles device constraints and features a visual Lumia Debug log.

## Tech Stack

- Languages: JavaScript, JSX
- Frameworks: React, Vite
- Tools: Tailwind CSS
- Services: Supabase (Realtime Subscriptions)

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
- Debug mode overlay: To be synced globally via Broadcast Channel or per-screen metadata.
