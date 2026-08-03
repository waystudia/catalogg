import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../../src/main.tsx', import.meta.url), 'utf8');
const serviceWorkerSource = await readFile(new URL('../../src/sw.ts', import.meta.url), 'utf8');
const viteConfigSource = await readFile(new URL('../../vite.config.ts', import.meta.url), 'utf8');

test('a service worker update never force-reloads an open iOS PWA window', () => {
  assert.match(mainSource, /navigator\.serviceWorker\.register\(`\$\{import\.meta\.env\.BASE_URL\}sw\.js`\)/);
  assert.doesNotMatch(mainSource, /virtual:pwa-register/);
  assert.doesNotMatch(mainSource, /registerSW\(/);
  assert.doesNotMatch(mainSource, /controllerchange/);
  assert.doesNotMatch(mainSource, /window\.location\.reload\(\)/);
  assert.doesNotMatch(mainSource, /updateSW\(true\)/);
});

test('the next normal launch can activate the update while old clients keep running', () => {
  assert.match(serviceWorkerSource, /skipWaiting\(\);/);
  assert.match(serviceWorkerSource, /clientsClaim\(\);/);
});

test('the replacement worker deletes every PWA cache and never serves pages or images', () => {
  assert.match(serviceWorkerSource, /addEventListener\('activate'/);
  assert.match(serviceWorkerSource, /caches\.keys\(\)/);
  assert.match(serviceWorkerSource, /cacheNames\.map\(\(cacheName\) => caches\.delete\(cacheName\)\)/);
  assert.doesNotMatch(serviceWorkerSource, /precacheAndRoute|registerRoute|NetworkFirst|CacheFirst/);
  assert.doesNotMatch(serviceWorkerSource, /catalog-pages|catalog-images|catalog-map-tiles/);
  assert.match(viteConfigSource, /globPatterns:\s*\[\]/);
});
