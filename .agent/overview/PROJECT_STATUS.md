# Project Overview

## Project Name
Lumia Digital Signage — Player (SmartTV Client)

## Description
Aplicação web leve otimizada para rodar em SmartTVs (Samsung Tizen, LG WebOS, e browsers genéricos). O Player se auto-registra no Supabase como tela pendente, gera um código de pareamento de 6 caracteres, exibe na tela, e aguarda o admin parear pelo Dashboard. Uma vez pareado, baixa a playlist atribuída, faz cache local dos assets (imagens/vídeos), e reproduz em loop fullscreen infinito. Possui heartbeat para manter status online, realtime subscription para atualizações imediatas, e fallback polling para SmartTVs que não suportam WebSocket.

## Tech Stack
- **Languages:** JavaScript (JSX)
- **Framework:** React 19.2 + React Router 7.13 (SPA)
- **Build Tool:** Vite 7.3.1 + @vitejs/plugin-legacy 7.2.1 (polyfills para SmartTV)
- **Styling:** Tailwind CSS 3.4.17 + PostCSS 8.5 + Autoprefixer 10.4
- **Animations:** CSS Keyframes puro (`@-webkit-keyframes` + `@keyframes`) — sem Framer Motion na runtime
- **Backend:** Supabase (auth: anon, realtime subscriptions)
- **Audio:** Howler.js 2.2.4 (potencial uso para notificação sonora)
- **Icons:** Lucide React 0.574
- **Minification:** Terser 5.46 (produção)
- **Deploy:** Vercel (sem vercel.json — usa defaults)
- **Env:** dotenv 17.3 (inject em build)

## Folder Structure
```text
Lumia_DigitalSinage_Player/
├── .agent/                          # Agent metadata
├── .env                             # Supabase keys (dev)
├── .env.production                  # Supabase keys (prod)
├── .gitignore
├── LICENSE
├── README.md
├── index.html                       # Entry point — meta viewport fullscreen
├── package.json
├── eslint.config.js
├── vite.config.js                   # Legacy plugin + terser minifier
├── postcss.config.js                # PostCSS + Autoprefixer + Tailwind
├── tailwind.config.js               # Tailwind 3 config
├── dist/                            # Build de produção
├── public/                          # Assets estáticos
│
└── src/
    ├── main.jsx                     # React entry com ErrorBoundary global
    ├── App.jsx                      # ★ Controlador principal — state machine completa
    ├── App.css                      # CSS mínimo do App
    ├── index.css                    # ★ Global CSS + Tailwind + animações SmartTV-safe
    ├── assets/                      # Assets importados
    │
    ├── lib/
    │   ├── supabase.js              # Supabase client singleton (anon key)
    │   └── device.js                # ★ getDeviceId() + generatePairingCode()
    │
    ├── services/
    │   └── cacheManager.js          # ★ Cache local de mídia (SW / IndexedDB fallback)
    │
    └── views/
        ├── PairingView.jsx          # ★ Tela de pareamento (exibe código de 6 chars)
        └── PlayerView.jsx           # ★ Reprodutor de playlist (imagens + vídeos em loop)
```

## Current Features Implemented
- ✅ **Auto-registro:** Player gera UUID persistente (localStorage) e registra no Supabase como tela `pending`
- ✅ **Pareamento por código:** Gera código alfanumérico de 6 chars exibido na TV para admin digitar no Dashboard
- ✅ **Realtime updates:** Assina canal Supabase Realtime (postgres_changes) para receber atualizações instantâneas quando admin pareia ou muda playlist
- ✅ **Fallback polling:** Polling a cada 60s para `screen` status + `playlist` data — SmartTVs que não suportam WebSocket
- ✅ **Heartbeat:** Atualiza `last_ping` a cada 30s para monitorar status online/offline no Dashboard
- ✅ **Cache de mídia:** CacheManager usa Cache API (Service Worker Storage) com fallback para re-download
- ✅ **Reprodução fullscreen:** Loop infinito de imagens (timer configurável) e vídeos (onEnded → next)
- ✅ **SmartTV patches:** `cursor: none`, `muted autoplay`, `playsInline`, vendor-prefixed CSS
- ✅ **Legacy build:** @vitejs/plugin-legacy gera polyfills para browsers antigos (Tizen 2.x, WebOS 3.x)
- ✅ **Tela de loading animada:** Spinner ring CSS, texto pulse, e 3 dots bounce (tudo CSS keyframes puro)
- ✅ **Error boundary:** React ErrorBoundary global no `main.jsx`
- ✅ **Schema mismatch detection:** Detecta RLS/schema errors e exibe tela de diagnóstico

## App.jsx — State Machine
O `App.jsx` é o controlador principal com a seguinte máquina de estados:

```
INIT → select screen by deviceId
  ├── !screen (não existe) → INSERT nova tela pending → PAIRING
  ├── screen.status === 'pending' → PAIRING
  ├── screen.status === 'active' + playlist → PLAYING
  └── screen.status === 'active' + !playlist → WAITING (aguardando conteúdo)
```

**Eventos que mudam estado:**
- Realtime UPDATE em `screens` → handleScreenState()
- Admin deleta tela → `enterPairingMode('deleted')`
- Screen perde `assigned_to` → `enterPairingMode('unassigned')`

## Recent Changes (Current Session — 2025-03-15)

### Fix 1 — enterPairingMode: `upsert` → `update` (Bug de Pareamento)
**Problema:** O `upsert` tentava gravar `assigned_to: null` e `playlist_id: null`, porém o GRANT de coluna para `anon` só permite UPDATE em `last_ping, status, pairing_code`. O Postgres rejeitava **silenciosamente**, então o código aparecia na TV mas **nunca era salvo no banco**.

**Fix:** Trocar por `.update({ status, pairing_code, last_ping }).eq('id', deviceId)` — apenas colunas que `anon` pode tocar.

### Fix 2 — initializePlayer: `upsert` → `insert` (Semântica correta)
**Problema:** O `upsert` era desnecessário — esse bloco só roda quando `!screen` (tela não existe no banco). O `insert` é semanticamente correto e evita conflitos de GRANT.

**Fix:** Trocar `.upsert({...})` por `.insert({...})`.

### Fix 3 — Tela "Aguardando conteúdo" com animações visuais
**Problema:** Tela completamente estática com texto "Aguardando conteúdo..." sem estímulo visual.

**Fix:** Adicionados 3 elementos animados via CSS keyframes puro (compatível com SmartTV):
1. **Spinner ring** — círculo com `border-top-color` girando via `@keyframes lumia-spin`
2. **Texto pulse** — "Aguardando conteúdo" com fade in/out via `@keyframes lumia-pulse`
3. **3 dots bounce** — substitui o `...` estático por 3 pontos que saltam sequencialmente via `@keyframes lumia-dot-bounce` com `animation-delay` escalonado

Todas as animações usam `-webkit-` prefix duplo para garantir suporte a WebKit legado (Tizen, WebOS).

## Known TODOs / Missing Parts
- [ ] Otimizar egress: verificar cache ANTES de iniciar fetch (evitar re-download)
- [ ] Reduzir heartbeat de 30s → 120s (reduz egress no banco)
- [ ] Adicionar etag/hash check antes de re-cachear playlist inteira
- [ ] Implementar preload com `<link rel="prefetch">` ao invés de criar elementos DOM invisíveis
- [ ] Revisar `pollPlaylist` (60s) — potencialmente redundante com Realtime
- [ ] Considerar Service Worker para cache + offline-first
- [ ] Adicionar tela de "Sem conexão" quando Supabase está inacessível

## Compatibility Matrix
| Plataforma         | Browser Engine   | Status    | Notas                          |
|--------------------|------------------|-----------|--------------------------------|
| Chrome Desktop     | Blink            | ✅ OK     | Dev/test                       |
| Samsung Tizen 2.x+ | WebKit (Chromium)| ✅ Target | Legacy plugin + webkit prefixes|
| LG WebOS 3.x+     | WebKit (Chromium)| ✅ Target | Legacy plugin + webkit prefixes|
| Firefox            | Gecko            | ✅ OK     | Apenas dev                     |
| Safari iOS         | WebKit           | ✅ OK     | Webkit prefixes                |

## Security Model
- **Role:** `anon` (sem login) — TV não faz autenticação
- **Pode:** SELECT em `screens` (todas colunas), SELECT em `playlists`, UPDATE em `screens` (apenas `last_ping, status, pairing_code`)
- **Não pode:** INSERT em `screens` (exceto na primeira vez via RLS allow-insert), UPDATE em `assigned_to, playlist_id, name` (bloqueado via GRANT de coluna)
- **RLS:** Políticas permitem anon ler/atualizar apenas a própria tela via `id = deviceId`
