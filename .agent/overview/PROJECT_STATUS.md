# Project Overview

## Project Name
Lumia Digital Signage — **Player App** (`Lumia_DigitalSinage_Player`)

## Description
The Player App is a fullscreen React web application deployed to Smart TVs and display devices. It self-registers with a unique UUID (persisted in `localStorage`), generates a pairing code, and waits to be claimed by an admin in the Dashboard. Once paired, it receives a playlist from Supabase, caches all media assets in the browser's Cache Storage API (offline-capable), and plays back images and videos in a looping, fullscreen carousel. It maintains a 30-second heartbeat ping and subscribes to Supabase Realtime for instant remote updates.

---

## Tech Stack

| Category      | Technology / Library                  | Version         |
|---------------|---------------------------------------|-----------------|
| Language      | JavaScript (JSX)                      | ES Module        |
| Framework     | React                                 | ^19.2.0         |
| Build Tool    | Vite + `@vitejs/plugin-legacy`        | ^7.3.1          |
| Backend/DB    | Supabase (`@supabase/supabase-js`)    | ^2.97.0         |
| Styling       | Tailwind CSS v3                       | ^3.4.17         |
| Animations    | Framer Motion                         | ^12.34.2        |
| Audio         | Howler.js                             | ^2.2.4          |
| Icons         | Lucide React                          | ^0.574.0        |
| Routing       | React Router DOM (installed, unused)  | ^7.13.0         |
| Bundler extras| Terser (minification), PostCSS        | ^5 / ^8         |
| Deployment    | Vercel / Any static hosting           | —               |

---

## Folder Structure

```text
Lumia_DigitalSinage_Player/
├── public/                     # Static assets
├── src/
│   ├── assets/                 # Images / static resources
│   ├── lib/
│   │   ├── supabase.js         # Supabase client init (env vars)
│   │   └── device.js           # getDeviceId() + generatePairingCode()
│   ├── services/
│   │   └── cacheManager.js     # Cache Storage API wrapper (cache, cleanup, revoke)
│   ├── views/
│   │   ├── PairingView.jsx     # Fullscreen pairing code display (waiting for admin)
│   │   └── PlayerView.jsx      # Fullscreen media player (images + videos, loop)
│   ├── App.jsx                 # Root orchestrator: state machine + all side effects
│   ├── main.jsx                # React DOM render entry point
│   ├── App.css / index.css     # Minimal global styles
├── .env / .env.production      # Supabase URL + Anon Key
├── tailwind.config.js
├── postcss.config.js
├── vite.config.js
└── package.json
```

---

## Application State Machine

`App.jsx` manages a `status` state with three values:

```
loading → pairing → active
    ↑                 |
    └── (unpair/delete) ←─────────────────────────────────┘
```

| Status    | Trigger                                          | UI Rendered     |
|-----------|--------------------------------------------------|-----------------|
| `loading` | App startup (before DB check completes)          | Fullscreen loader |
| `pairing` | No existing screen row, or `status = 'pending'`  | `PairingView`   |
| `active`  | Screen row has `status = 'online'` and no `pairing_code` | `PlayerView` |

---

## Core Modules

### `lib/device.js`
- `getDeviceId()` — reads UUID from `localStorage`; generates and stores one if absent (UUID v4 polyfill).
- `generatePairingCode()` — 6-character alphanumeric code (unambiguous charset, no `O`, `I`, `0`, `1`).

### `lib/supabase.js`
- Creates and exports the Supabase client using `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
- Returns `null` safely if env vars are missing (App renders a config error screen).

### `services/cacheManager.js`
Cache name: `lumia-media-v1` (browser Cache Storage API)

| Method            | Description                                                                   |
|-------------------|-------------------------------------------------------------------------------|
| `cachePlaylist()` | Downloads and stores all playlist media via `cache.add()`. Reports progress via callback. Skips existing cached items. |
| `cleanupCache()`  | Removes cached assets no longer in the active playlist (LRU-style cleanup).   |
| `revokeUrls()`    | No-op (legacy stub; Blob URLs no longer created to save SmartTV memory).      |

### `views/PairingView.jsx`
- Fullscreen dark glassmorphism design.
- Displays the 6-character pairing code in a large monospace font.
- Shows a pulsing "AGUARDANDO CONEXÃO" status indicator.
- Renders the device UUID in the footer for debug identification.

### `views/PlayerView.jsx`
- Renders `<video>` or `<img>` based on `item.type`.
- **Image items**: Advances after `item.duration` seconds (default 10s) using `setTimeout`.
- **Video items**: Auto-advances on `onEnded`; forces muted + `playsInline` for autoplay policy compliance.
- **Single-video loop**: Rewinds and replays instead of re-rendering.
- **Preloading**: Pre-fetches the next media asset (`<Image>` or `<video preload="metadata">`) to minimize black frames on SmartTVs.
- **Fullscreen**: Auto-requests fullscreen on mount; click-to-fullscreen fallback for TVs that block auto-request.
- Graceful error recovery: skips to next item after 1-second delay on media load error.

### `App.jsx` — Side Effects Summary

| Effect                      | Interval / Trigger                 | Purpose                                  |
|-----------------------------|-------------------------------------|------------------------------------------|
| Screen registration         | On mount (once)                     | Upsert screen row in Supabase            |
| Supabase Realtime (screens) | On mount (persistent subscription)  | Instant unassign / playlist change push  |
| Heartbeat ping              | Every 30 seconds                    | Updates `last_ping` column on screen row |
| Screen polling              | Every 60 seconds                    | Fallback for missed Realtime events      |
| Playlist polling            | Every 60 seconds (when active)      | Detects `updated_at` changes             |
| Playlist Realtime           | When `playlist.id` changes          | Instant re-fetch on playlist update      |
| Pairing code refresh        | Every 60 seconds (in pairing mode)  | Keeps code fresh if admin is slow        |

---

## Implemented Features

- [x] Device self-registration via UUID (`localStorage` persistent)
- [x] Pairing code generation and display (PairingView)
- [x] Supabase Realtime subscription for instant screen state changes
- [x] Supabase Realtime subscription for instant playlist content changes
- [x] Fallback polling (60s) for screens and playlists (Realtime redundancy)
- [x] Heartbeat ping (30s) to maintain `last_ping` on the screen row
- [x] Pairing code auto-refresh (60s failsafe while in pairing mode)
- [x] Re-entry into pairing mode on screen deletion (unpair event)
- [x] Cache Storage API integration: pre-downloads all media before playback starts
- [x] Progress bar during initial media caching
- [x] Smart cache cleanup: removes stale assets not in current playlist
- [x] Image playback with configurable duration per item
- [x] Video playback with muted autoplay, `playsInline`, loop support
- [x] Next-item preloading to minimize black frames on TV hardware
- [x] Fullscreen API integration with cross-browser webkit/ms fallbacks
- [x] Schema error detection (Supabase PGRST106/406) with user-facing recovery UI
- [x] Missing env var detection with user-facing config error screen
- [x] "Syncing" overlay indicator during background playlist refresh
- [x] Version label in `PairingView` footer (v1.2)
- [x] `@vitejs/plugin-legacy` included for older SmartTV browser compatibility

---

## Work In Progress / Known TODOs

- [ ] `howler.js` is installed as a dependency but **not used anywhere** in the current codebase — audio support is not yet implemented
- [ ] `react-router-dom` is installed but the app uses no routing (single-page state machine) — can be removed
- [ ] No visual indicator in `PlayerView` for which item is currently playing (no index display)
- [ ] `getMediaSrc()` helper has a dead code path checking for `blob:` URLs (no longer created by `cacheManager`)
- [ ] Cache version (`lumia-media-v1`) is hardcoded — cache busting requires manual string bump
- [ ] No retry logic if Supabase connection fails on startup — app stays on `loading` state until the 5-second implicit browser timeout
- [ ] Pairing code refresh also upserts the screen row to Supabase — this could conflict if admin is mid-pairing
- [ ] No offline fallback UI if network drops while in `active` state

---

## Environment Variables Required

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## Dev Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # Production build (Terser minification + legacy polyfills)
npm run preview  # Preview production build
npm run lint     # ESLint
```

---

## Deployment Notes
- Deploy to any static host (Vercel, Netlify, Cloudflare Pages, or self-hosted nginx).
- Designed to run full-browser on SmartTV displays — tested patterns include WebKit-based TV browsers.
- `@vitejs/plugin-legacy` generates an ES5 fallback bundle for older TV firmware browsers.
- Tailwind CSS v3 is used (not v4) for broader SmartTV compatibility.
