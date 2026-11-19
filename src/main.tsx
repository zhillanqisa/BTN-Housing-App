// Titik masuk aplikasi.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/geist-mono'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles/app.css'
import App from './App'
import { layarPenuhOtomatis } from './lib/pasang'

// aplikasi terpasang di Android: penuh sampai area kamera sejak sentuhan pertama
layarPenuhOtomatis()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker (public/sw.js): syarat aplikasi bisa dipasang, dan tetap terbuka tanpa sinyal.
// Hanya di build produksi supaya server pengembangan tidak tersimpan di cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* tanpa service worker aplikasi tetap jalan, hanya tidak bisa luring */
    })
  })
}
