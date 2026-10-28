/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages liefert das Projekt unter /<repo-name>/ aus.
const base = process.env.GITHUB_PAGES === 'true' ? '/Casio-fx-991DEX-Emulator/' : '/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'ClassCalc',
        short_name: 'ClassCalc',
        description: 'Wissenschaftlicher Schulrechner zum Üben – läuft komplett offline.',
        lang: 'de',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1d1e21',
        theme_color: '#1d1e21',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
