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
                strategies: 'injectManifest',
                srcDir: 'src',
                filename: 'sw.ts',
                registerType: 'autoUpdate',
                injectRegister: false,
                includeAssets: ['assets/logo/*.{png,svg}', 'robots.txt', 'placeholders/*.svg'],
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
                            src: 'assets/logo/icon-192.png',
                            sizes: '192x192',
                            type: 'image/png',
                            purpose: 'any'
                        },
                        {
                            src: 'assets/logo/icon-512.png',
                            sizes: '512x512',
                            type: 'image/png',
                            purpose: 'any'
                        }
                    ]
                },
                injectManifest: {
                    globPatterns: ['**/*.{js,css,svg,ico,png,webp}'],
                    globIgnores: ['index.html']
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
