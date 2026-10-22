import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const APP_NAME = 'မိုနိုပိုလီ';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Show an "Update available" toast instead of reloading under the player (spec 13).
      registerType: 'prompt',
      manifest: {
        id: '/',
        name: APP_NAME,
        short_name: APP_NAME,
        description: 'Property trading board game - Myanmar and Dubai maps',
        lang: 'my',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'landscape', // honored on Android; iOS shows the rotate overlay instead
        background_color: '#7A1F2B',
        theme_color: '#7A1F2B',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the whole app shell; maps are bundled into the JS, so solo play is fully offline.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    // One ~590 kB bundle (~185 kB gzipped) that the service worker caches for offline play.
    chunkSizeWarningLimit: 800,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
