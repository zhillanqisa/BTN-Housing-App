import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' supaya hasil build bisa di-host di subfolder mana pun
// (GitHub Pages, Netlify, Vercel, atau dibuka lewat `vite preview`).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  // Worker MapLibre v6 adalah modul ES.
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
})
