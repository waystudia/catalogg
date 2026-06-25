import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: env.VITE_BASE_PATH || './',
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.svg', 'robots.txt', 'icons/*.svg', 'placeholders/*.svg'],
        manifest: {
          name: 'Restaurant Catalog Template',
          short_name: 'Restaurant Catalog',
          description: 'Universal restaurant digital catalog template',
          theme_color: '#2563EB',
          background_color: '#F5F6F8',
          display: 'standalone',
          icons: [
            {
              src: 'icons/pwa-192x192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any'
            },
            {
              src: 'icons/pwa-512x512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any'
            }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallbackDenylist: [/^\/api\//],
          globPatterns: ['**/*.{js,css,html,svg,ico,png,webp}'],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'catalog-images',
                networkTimeoutSeconds: 4,
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 86400
                }
              }
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    }
  };
});
