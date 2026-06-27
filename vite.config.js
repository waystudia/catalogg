import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
var __dirname = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var base = env.VITE_BASE_PATH || '/catalogg/';
    return {
        base: base,
        plugins: [
            react(),
            VitePWA({
                registerType: 'autoUpdate',
                injectRegister: false,
                includeAssets: ['assets/logo/*.png', 'robots.txt', 'placeholders/*.svg'],
                manifest: {
                    name: 'WayCatalog',
                    short_name: 'WayCatalog',
                    description: 'WayCatalog — весь ассортимент в одном месте',
                    theme_color: '#6C5CE7',
                    background_color: '#F5F6F8',
                    id: base,
                    start_url: base,
                    scope: base,
                    display: 'standalone',
                    icons: [
                        {
                            src: 'assets/logo/waycatalog-logo.png',
                            sizes: '1774x887',
                            type: 'image/png',
                            purpose: 'any'
                        },
                        {
                            src: 'assets/logo/waycatalog-logo.png',
                            sizes: '1774x887',
                            type: 'image/png',
                            purpose: 'any'
                        }
                    ]
                },
                workbox: {
                    skipWaiting: true,
                    clientsClaim: true,
                    cleanupOutdatedCaches: true,
                    navigateFallback: null,
                    navigateFallbackDenylist: [/^\/api\//],
                    globPatterns: ['**/*.{js,css,svg,ico,png,webp}'],
                    runtimeCaching: [
                        {
                            urlPattern: function (_a) {
                                var request = _a.request;
                                return request.destination === 'image';
                            },
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
