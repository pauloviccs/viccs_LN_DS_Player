# Project Overview

## Project Name

Lumia Digital Signage — **Player (Client-side Display)**

## Description

Aplicação React leve e otimizada que roda nas telas físicas de digital signage. Responsável por parear com o CMS, receber playlists em tempo real via Supabase Realtime e renderizar conteúdo de mídia (imagens, vídeos, áudio) em loop contínuo. Projetada para estabilidade máxima em hardware de baixo custo.

## Tech Stack

- **Languages:** JavaScript (JSX), CSS
- **Frameworks:** React 19, React Router DOM 7
- **Animations:** Framer Motion v12
- **Audio:** Howler.js v2
- **Icons:** Lucide React
- **Backend/BaaS:** Supabase (PostgreSQL, Realtime, Storage)
- **Build:** Vite 7 + @vitejs/plugin-legacy (suporte a browsers legados)
- **CSS:** Tailwind CSS v3 + PostCSS + Autoprefixer
- **Minification:** Terser
- **Linting:** ESLint 9

## Folder Structure

```text
Lumia_DigitalSinage_Player/
├── .agent/                   # Arquivos de contexto do agente
├── public/                   # Assets públicos e Service Worker (sw.js)
├── src/
│   ├── App.jsx               # Raiz + roteamento (14KB — lógica principal)
│   ├── main.jsx              # Entry point com setup de device ID
│   ├── index.css / App.css   # Estilos globais (inclui patches Smart TV)
│   ├── assets/               # Assets estáticos
│   ├── lib/
│   │   ├── supabase.js       # Inicialização do client Supabase
│   │   ├── device.js         # Geração/leitura de device ID persistente
│   │   └── platform.js       # Detecção de Smart TVs e parâmetros específicos
│   ├── services/
│   │   └── cacheManager.js   # Cache local de mídias (timeout otimizado)
│   └── views/
│       ├── PairingView.jsx   # Tela de pareamento com PIN
│       └── PlayerView.jsx    # Player principal de mídia (Persistent Video Pattern)
├── .env / .env.production    # Variáveis de ambiente
├── vite.config.js            # Build config com legacy + terser
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

## Key Features Implemented

- **Device ID** — geração e persistência de um ID único de dispositivo (`lib/device.js`)
- **Pareamento** — tela de pareamento com PIN para associar o player a uma tela no CMS (`PairingView.jsx`)
- **Player de Mídia** — renderização de playlists: imagens, vídeos e áudio em loop (`PlayerView.jsx`)
- **Supabase Realtime** — subscriptions para receber atualizações de playlist/comandos em tempo real
- **Cache de Mídias** — `cacheManager.js` gerencia cache local de arquivos para reduzir latência e dependência de rede
- **Smart TV Cross-Platform** — Suporte a LG WebOS, Samsung Tizen, TCL Android TV e Philips via `platform.js`.
- **Reprodução Otimizada** — Padrão de vídeo persistente e tratamento seguro de chamadas `play()` (race condition guards) garantem transições limpas.
- **Service Worker Avançado** — Cache-first e fatiamento otimizado de Range Requests via `Blob.slice()` para não exceder a RAM de TVs limitadas (`sw.js`).
- **CSS Anti-Flicker** — Camadas de composição de GPU implementadas em `index.css` para rodar liso em WebOS e Android TV.
- **Build otimizada** — Terser para minificação agressiva, Tailwind v3 purge para CSS mínimo.

## Architecture Notes

- `App.jsx` concentra a maior parte da lógica de estado do player (14KB). Gerencia ciclo de vida da playlist, transições e comandos do servidor.
- `main.jsx` inicializa o device ID antes de montar a aplicação React.
- Sem estado global externo (sem Zustand) — estado local via React hooks.
- Deploy independente do CMS — pode ser hospedado em qualquer servidor estático ou localmente via `npm run preview`.

## Known TODOs / WIP

- `App.jsx` potencialmente acúmulo de lógica — candidato a extração de hooks customizados
- Build legacy pode ser revisada conforme hardware de target é estabilizado
- Cache manager pode ser expandido para suportar pré-download proativo da próxima mídia

## Last Synced

2026-03-19
