import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The app must work with no network connection. Gym wifi is unreliable and a rally
// must never wait on a network round trip.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Never serve a stale shell mid-match; the log lives in IndexedDB regardless.
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'VolleyScore',
        short_name: 'VolleyScore',
        description: 'Volleyball scoring and OHSAA scoresheet',
        theme_color: '#0B0F14',
        background_color: '#0B0F14',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
