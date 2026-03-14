# Relatório de Diagnóstico: Supabase Cached Egress Excessivo

> **Projeto:** Lumia Digital Signage — Player App  
> **Data:** 14 Mar 2026  
> **Alerta:** 172 GB de Cached Egress consumidos (limit: 5 GB no Free Plan)  
> **Overage:** ~167 GB acima do limite gratuito

---

## 1. O que é "Cached Egress" no Supabase?

O Supabase mede dois tipos de tráfego de saída:

| Tipo | O que é | Como é cobrado |
|------|---------|----------------|
| **Egress** | Tráfego sem cache (primeira vez que o arquivo sai do servidor) | Incluso no plano |
| **Cached Egress** | Tráfego servido pela CDN/cache (hits de cache do Supabase Storage) | **Cobrado separadamente, mesmo no Free Plan** |

> Ou seja: **toda vez que um arquivo de mídia (imagem/vídeo) é servido pela CDN do Supabase Storage — mesmo que já esteja cacheado no CDN — conta como Cached Egress.**

---

## 2. Dados do Dashboard (13 Mar 2026)

```
Storage Egress: 85.4% do total de egress no dia
Cached Egress no dia 12 Mar: 30.13 GB  ← pico máximo
Cached Egress total no período: 172.37 GB  ← 167 GB de overage
```

O problema é **quase que totalmente Storage Egress** — arquivos de mídia sendo baixados repetidamente da CDN do Supabase Storage.

---

## 3. Causas-Raiz Identificadas (por ordem de impacto)

---

### 🔴 CRÍTICO — Causa #1: Cache Storage nunca reutilizado corretamente no Player

**Arquivo:** `src/views/PlayerView.jsx` (linhas 8–10) + `src/services/cacheManager.js`

**Problema:**  
O `cacheManager.js` usa a Cache Storage API do browser para baixar e guardar os arquivos localmente. Porém, o `PlayerView.jsx` usa `item.url` diretamente como `src` do `<img>` e `<video>` — **a URL pública do Supabase Storage**.

```js
// PlayerView.jsx - getMediaSrc()
if (item.src && item.src.startsWith('blob:')) return item.src;  // ← nunca é blob:
if (item.url) return item.url;  // ← usa a URL pública direto!
```

**Por que isso é catastrófico:**  
O browser, ao encontrar um `<img src="https://supabase.co/storage/...">`, faz uma requisição HTTP. Dependendo do browser e da configuração da TV, essa requisição pode ou não bater na Cache Storage. Em muitos casos — especialmente em **browsers de SmartTV, Chromium embarcado, ou Android WebView** — o **cache HTTP normal e a Cache Storage API são pools separados**. O browser não usa automaticamente o arquivo salvo via `cache.add()` para servir uma tag `<img>` / `<video>`.

**Resultado:** O arquivo é baixado na Cache Storage via `cacheManager`, mas o `<img>/<video>` **baixa novamente do servidor** via HTTP. Cada vez que a playlist toca, a mídia é baixada da CDN do Supabase → **Cached Egress**.

**Com N telas rodando 24/7 e playlist com múltiplos arquivos grandes (vídeos), isso escala de forma linear e rápida.**

---

### 🔴 CRÍTICO — Causa #2: Preload invisível recria requisições para o Supabase

**Arquivo:** `src/views/PlayerView.jsx` (linhas 60–82)

**Problema:**
```js
// PlayerView.jsx
if (nextItem.type === 'image') {
    const img = new Image();
    img.src = nextSrc; // ← nova requisição HTTP para a URL do Supabase
} else if (nextItem.type === 'video') {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = nextSrc; // ← nova requisição HTTP para a URL do Supabase
}
```

Este bloco de preload roda toda vez que `currentIndex` muda — ou seja, **a cada troca de mídia na playlist**. Cada call cria um novo elemento DOM invisível que dispara uma requisição HTTP para buscar a próxima mídia.

Em uma playlist de 3 itens, para cada exibição de 1 item, o browser faz 1 requisição de preload para o item seguinte → **2 downloads por ciclo de exibição** (o atual + o preload). Isso dobra efetivamente o Cached Egress.

---

### 🟠 ALTO — Causa #3: Polling duplo de playlist (60s) redundante com Realtime

**Arquivo:** `src/App.jsx` (linhas 339–378)

**Problema:**
```js
// App.jsx - Fallback polling de playlist
pollPlaylist();
const intervalId = setInterval(pollPlaylist, 60000); // 60s
```

Existe um polling que a cada 60 segundos:
1. Faz um SELECT na tabela `playlists` → PostgREST Egress
2. Se `updated_at` mudou, chama `fetchPlaylist()` → que baixa TODOS os arquivos de mídia novamente do Supabase Storage

O app JÁ tem um canal Realtime subscrito que escuta UPDATE na playlist. O polling de 60s é **redundante e desnecessário** quando o Realtime está funcionando.

Mais grave: `pollPlaylist()` chama `pollPlaylist()` na linha 371 imediatamente ao montar (além do intervalo). Com 7 MAUs simultâneos (conforme o dashboard), isso são **7 requisições/min ao banco + potencial re-download de todos os arquivos a cada 60s** se `updated_at` mudar.

---

### 🟠 ALTO — Causa #4: fetchPlaylist re-baixa todos os arquivos a cada chamada

**Arquivo:** `src/App.jsx` (linhas 242–270) + `src/services/cacheManager.js` (linhas 31–49)

**Problema:**  
O `cacheManager.cachePlaylist()` verifica `cache.match(request)` antes de baixar. **ISsso é correto.** Mas o problema é que a URL do Supabase Storage pode conter **query strings de token** ou variar por versão, fazendo com que `cache.match()` falhe e force re-download.

Além disso, toda vez que `fetchPlaylist()` é chamada (pelo Realtime, pelo polling, ou na inicialização), ela:
1. Baixa os metadados da playlist do banco
2. Chama `cachePlaylist()` que tenta fazer `cache.match()` para cada item
3. Se não der match → `cache.add()` → requisição para o Storage

O `cache.match()` usa a URL exata como chave. **Se a URL mudar minimamente (ex: expirou um signed URL, ou parâmetros de query diferentes), o cache é ignorado e tudo é baixado novamente.**

---

### 🟡 MÉDIO — Causa #5: Heartbeat de 30s com UPDATE completo

**Arquivo:** `src/App.jsx` (linhas 176–185)

**Problema:**
```js
setInterval(async () => {
  await supabase.from('screens').update({ last_ping: new Date() }).eq('id', deviceId);
}, 30000); // a cada 30 segundos
```

Com 7 telas ativas:
- 7 telas × 2 pings/min = **14 requisições/min → 840/hora → 20.160/dia**
- Cada UPDATE PostgREST gera resposta + overhead

Isso contribui para o PostgREST Egress (14.3% do total) e consome conexões do Supabase.

---

### 🟡 MÉDIO — Causa #6: Pairing code refresh faz upsert de TODAS as colunas

**Arquivo:** `src/App.jsx` (linhas 384–402)

**Problema:**
```js
await supabase.from('screens').upsert({
  id: deviceId,
  name: screenData?.name || `TV-${code}`,
  status: 'pending',
  pairing_code: code,
  assigned_to: null,     // ← zera a associação
  playlist_id: null,     // ← zera a playlist
  last_ping: new Date()
});
```

Este upsert roda a cada 60s enquanto a tela está em modo pairing. O problema: o upsert sobrescreve `playlist_id` e `assigned_to` com `null`. Se o admin acabou de parear a tela e o upsert rodar **antes** do REALTIME atualizar o estado local, a tela volta ao estado pending. **Race condition que pode re-entrar no pairing loop.**

---

### 🟢 BAIXO — Causa #7: select('*') nas consultas de polling

**Arquivo:** `src/App.jsx` (linhas 303–307 e 347–351)

**Problema:**
```js
.select('*') // ← traz todas as colunas, incluindo dados desnecessários
```

Cada polling traz o registro completo da tela/playlist incluindo potencialmente dados grandes no campo `items` (JSONB que pode ser grande com muitos itens). Isso aumenta o PostgREST Egress por resposta.

---

## 4. Mapa de Impacto

```
┌─────────────────────────────────────────────────────────────┐
│                    172 GB CACHED EGRESS                     │
├─────────────────────┬───────────────────────────────────────┤
│ CAUSA               │ IMPACTO ESTIMADO                      │
├─────────────────────┼───────────────────────────────────────┤
│ #1 Cache Storage    │ ████████████████████ ~70% do total    │
│    não interceptado │ (mídia baixada 2x por tela)           │
├─────────────────────┼───────────────────────────────────────┤
│ #2 Preload HTTP     │ ███████████ ~20% do total             │
│    double-fetch     │ (requis. extra por troca de item)     │
├─────────────────────┼───────────────────────────────────────┤
│ #3 Polling duplo    │ ████ ~7% do total                     │
│    playlist 60s     │ (re-downloads ao detectar mudança)    │
├─────────────────────┼───────────────────────────────────────┤
│ #4 Cache miss por   │ ██ ~2% do total                       │
│    URL variável     │ (depends da config de Storage URLs)   │
├─────────────────────┼───────────────────────────────────────┤
│ #5 Heartbeat 30s    │ (PostgREST, não Storage)              │
│ #6 Upsert pairing   │ (DB, não Storage)                     │
│ #7 select(*)        │ (DB, não Storage)                     │
└─────────────────────┴───────────────────────────────────────┘
```

---

## 5. Plano de Fix Completo

### Fix #1 — CRÍTICO: Usar Service Worker para interceptar requisições de mídia

**O fix definitivo:** Registrar um Service Worker que intercepta todas as requisições para URLs do Supabase Storage e as redireciona para a Cache Storage local.

**Como funciona:**
```
<img src="https://xxx.supabase.co/storage/...">
    → Service Worker intercepts fetch event
    → cache.match(request) → HIT → serve local
    → No Supabase request made ✓
```

**Arquivo a criar:** `public/sw.js`

---

### Fix #2 — CRÍTICO: Remover preload via criação de elementos DOM

**Remover** o bloco de preload invisível em `PlayerView.jsx` (linhas 60–82).  
O Service Worker já garante que a segunda requisição seja servida do cache local. O preload invisível só gera tráfego extra.

---

### Fix #3 — ALTO: Remover polling de playlist (já coberto por Realtime)

**Remover** o `useEffect` de `pollPlaylist` em `App.jsx` (linhas 339–378).  
O canal Realtime na tabela `playlists` já dispara `fetchPlaylist()` quando há UPDATE.  
Manter apenas o polling de **screen** como fallback.

---

### Fix #4 — ALTO: Reduzir heartbeat de 30s → 90s

Reduzir de 30s para 90s. Para uma tela de digital signage, 90s de `last_ping` é mais do que suficiente para detectar que a tela está online. Isso reduz as requisições de heartbeat em 66%.

---

### Fix #5 — MÉDIO: Corrigir upsert de pairing code

Substituir o `upsert` completo por um `update` parcial que só altera `pairing_code` e `last_ping`, **sem zerar** `playlist_id` e `assigned_to`.

---

### Fix #6 — MÉDIO: select() com colunas específicas nos pollings

Substituir `select('*')` por `select('id,status,pairing_code,playlist_id,assigned_to,updated_at')` nos pollings de screen e playlist.

---

## 6. Estimativa de Redução de Egress Após Fix

| Fix | Redução Estimada |
|-----|-----------------|
| #1 Service Worker | ~70% do Storage Cached Egress |
| #2 Remove preload | ~20% do Storage Cached Egress |
| #3 Remove poll playlist | ~5-7% (evita re-downloads desnecessários) |
| #4 Heartbeat 90s | ~66% menos requisições de heartbeat |
| **TOTAL ESTIMADO** | **~90-95% de redução no Cached Egress** |

---

## 7. Arquivos Afetados pelos Fixes

| Arquivo | Tipo de Mudança |
|---------|----------------|
| `public/sw.js` | **NOVO** — Service Worker de cache de mídia |
| `src/main.jsx` | Registrar o Service Worker |
| `src/views/PlayerView.jsx` | Remover bloco de preload invisível |
| `src/App.jsx` | Remover pollPlaylist, reduzir heartbeat, corrigir upsert pairing |

---

## 8. Importante: Configuração do Supabase Storage

Para que as URLs funcionem com Cache Storage e Service Worker, as URLs dos arquivos de mídia devem ser **URLs públicas permanentes** (não Signed URLs com expiração).

Se o bucket `media` tiver política de **public** (leitura pública), as URLs são estáveis e o cache funciona perfeitamente.

Se usar Signed URLs (com expiração), o cache vai expirar junto com a URL — o que força re-download. **Recomendação: manter o bucket como público para URLs estáveis.**
