import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          maximumFileSizeToCacheInBytes:
            4 * 1024 * 1024,

          navigateFallbackDenylist: [
            /^\/games\//,
          ],
        },
        devOptions: {
          enabled: true
        },
        includeAssets: ['images/InventoryIcon.png'],
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
              src: '/images/InventoryIcon.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: '/images/InventoryIcon.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
