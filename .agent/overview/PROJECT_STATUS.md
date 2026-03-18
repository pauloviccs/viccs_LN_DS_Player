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
├── public/                   # Assets públicos (2 itens)
├── src/
│   ├── App.jsx               # Raiz + roteamento (14KB — lógica principal)
│   ├── main.jsx              # Entry point com setup de device ID
│   ├── index.css / App.css   # Estilos globais
│   ├── assets/               # Assets estáticos
│   ├── lib/
│   │   ├── supabase.js       # Inicialização do client Supabase
│   │   └── device.js         # Geração/leitura de device ID persistente
│   ├── services/
│   │   └── cacheManager.js   # Cache local de mídias (3.4KB)
│   └── views/
│       ├── PairingView.jsx   # Tela de pareamento com PIN
│       └── PlayerView.jsx    # Player principal de mídia
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
- **Suporte Legacy** — build com `@vitejs/plugin-legacy` para rodar em smart TVs e hardware mais antigo
- **Áudio** — suporte a trilha sonora via Howler.js
- **Build otimizada** — Terser para minificação agressiva, Tailwind v3 purge para CSS mínimo

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

2026-03-18
