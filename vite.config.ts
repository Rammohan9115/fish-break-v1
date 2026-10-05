/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The player decides when to switch to a new version (see src/ui/UpdatePrompt.tsx).
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icons/apple-touch-icon-180.png'],
      manifest: {
        name: 'Fishbowl Break',
        short_name: 'Fishbowl',
        description: 'A cozy aquarium for your 5-minute breaks.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0b3d74',
        theme_color: '#0b3d74',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // The app shell and every sprite are precached, so the game starts offline. Only the latin font subsets
        // are cached (the browser fetches another subset on demand when it's online).
        globPatterns: ['**/*.{js,css,html,webp,png,svg,woff2}'],
        globIgnores: ['**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese,latin-ext}-*.woff2', '**/DevPanel-*.js'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/privacy\.html/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
