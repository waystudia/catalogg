import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainSource = await readFile(new URL('../../src/main.tsx', import.meta.url), 'utf8');
const serviceWorkerSource = await readFile(new URL('../../src/sw.ts', import.meta.url), 'utf8');
const viteConfigSource = await readFile(new URL('../../vite.config.ts', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../../index.html', import.meta.url), 'utf8');

test('the application no longer installs a service worker', () => {
  assert.doesNotMatch(mainSource, /navigator\.serviceWorker\.register/);
  assert.doesNotMatch(mainSource, /virtual:pwa-register/);
  assert.doesNotMatch(mainSource, /registerSW\(/);
  assert.doesNotMatch(mainSource, /controllerchange/);
  assert.doesNotMatch(mainSource, /window\.location\.reload\(\)/);
  assert.doesNotMatch(mainSource, /updateSW\(true\)/);
});

test('the final worker activates immediately and unregisters itself', () => {
  assert.match(serviceWorkerSource, /skipWaiting\(\);/);
  assert.match(serviceWorkerSource, /self\.registration\.unregister\(\)/);
  assert.doesNotMatch(serviceWorkerSource, /clientsClaim\(\);/);
});

test('the replacement worker deletes every PWA cache and never serves pages or images', () => {
  assert.match(serviceWorkerSource, /addEventListener\('activate'/);
  assert.match(serviceWorkerSource, /caches\.keys\(\)/);
  assert.match(serviceWorkerSource, /cacheNames\.map\(\(cacheName\) => caches\.delete\(cacheName\)\)/);
  assert.doesNotMatch(serviceWorkerSource, /precacheAndRoute|registerRoute|NetworkFirst|CacheFirst/);
  assert.doesNotMatch(serviceWorkerSource, /catalog-pages|catalog-images|catalog-map-tiles/);
  assert.match(viteConfigSource, /globPatterns:\s*\[\]/);
});

test('the application shell retires stale workers and caches before a clean network reload', () => {
  assert.match(indexSource, /navigator\.serviceWorker\.getRegistrations\(\)/);
  assert.match(indexSource, /registration\.unregister\(\)/);
  assert.match(indexSource, /window\.caches\.keys\(\)/);
  assert.match(indexSource, /window\.caches\.delete\(cacheName\)/);
  assert.match(indexSource, /window\.location\.replace\(nextUrl\.toString\(\)\)/);
  assert.match(indexSource, /window\.localStorage\.setItem\(retirementKey, 'done'\)/);
});
