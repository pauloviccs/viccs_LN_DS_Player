import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode removed intentionally — for a 24/7 digital signage player,
// the double-mount behavior creates duplicate timers and race conditions
// that break playlist sequencing on SmartTVs.
createRoot(document.getElementById('root')).render(
  <App />,
)

// Register Service Worker for media cache-first strategy
// This intercepts <img> and <video> requests to Supabase Storage,
// serving from local Cache Storage instead of hitting the CDN on every loop.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('[SW] Registered:', reg.scope))
      .catch((err) => console.error('[SW] Registration failed:', err));
  });
}
