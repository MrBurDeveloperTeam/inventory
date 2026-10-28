import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// @ts-ignore Shared package's JavaScript Vite integration.
import { sharedGamesPlugin } from './node_modules/@mrburdeveloperteam/pet-function/scripts/vite-games.mjs';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: [
        'semistiffly-largando-alane.ngrok-free.dev'
      ]
    },
    plugins: [
      react(),
      sharedGamesPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          // Game loaders are rewritten after this precache manifest is generated.
          globIgnores: ['**/games/**'],
          maximumFileSizeToCacheInBytes:
            4 * 1024 * 1024,

          navigateFallbackDenylist: [
            /^\/games\//,
          ],
        },
        devOptions: {
          enabled: true
        },
        includeAssets: ['images/InventoryIcon.webp'],
        manifest: {
          name: 'DentaStock Pro',
          short_name: 'DentaStock',
          description: 'Professional Dental Inventory Management',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: '/images/InventoryIcon.webp',
              sizes: '192x192',
              type: 'image/webp',
              purpose: 'any maskable'
            },
            {
              src: '/images/InventoryIcon.webp',
              sizes: '512x512',
              type: 'image/webp',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
