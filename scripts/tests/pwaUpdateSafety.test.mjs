import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const mainSource = await readFile(new URL('../../src/main.tsx', import.meta.url), 'utf8');
const serviceWorkerSource = await readFile(new URL('../../src/sw.ts', import.meta.url), 'utf8');
const viteConfigSource = await readFile(new URL('../../vite.config.ts', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const retirementScript = indexSource.match(/<script>([\s\S]*?)<\/script>/)?.[1];

assert.ok(retirementScript, 'index.html must contain the PWA retirement script');

const getRetirementScenario = (overrides = {}) => ({
  marker: null,
  registrations: [],
  cacheNames: [],
  failUnregister: false,
  failCacheDelete: false,
  failMarkerRead: false,
  failMarkerWrite: false,
  href: 'https://wayyaam.ru/#/mangal',
  ...overrides
});

const runRetirementScenario = async (overrides = {}) => {
  const scenario = getRetirementScenario(overrides);
  const events = [];
  const window = {
    localStorage: {
      getItem() {
        events.push({ type: 'readMarker' });
        if (scenario.failMarkerRead) throw new Error('marker read failed');
        return scenario.marker;
      },
      setItem(key, value) {
        events.push({ type: 'setMarker', key, value });
        if (scenario.failMarkerWrite) throw new Error('marker write failed');
      }
    },
    caches: {
      async keys() {
        events.push({ type: 'getCacheNames' });
        return scenario.cacheNames;
      },
      async delete(cacheName) {
        events.push({ type: 'deleteCache', cacheName });
        if (scenario.failCacheDelete) throw new Error('cache delete failed');
        return true;
      }
    },
    location: {
      href: scenario.href,
      replace(url) {
        events.push({ type: 'replace', url });
      }
    }
  };
  const navigator = {
    serviceWorker: {
      async getRegistrations() {
        events.push({ type: 'getRegistrations' });
        return scenario.registrations.map((registrationId) => ({
          async unregister() {
            events.push({ type: 'unregister', registrationId });
            if (scenario.failUnregister) throw new Error('unregister failed');
            return true;
          }
        }));
      }
    }
  };

  runInNewContext(retirementScript, { navigator, Promise, URL, window });
  await new Promise((resolve) => setImmediate(resolve));
  return events;
};

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

test('a clean first PWA launch never forces a second network navigation', async () => {
  const events = await runRetirementScenario();

  assert.deepEqual(events.map(({ type }) => type), [
    'readMarker',
    'getRegistrations',
    'getCacheNames',
    'setMarker'
  ]);
});

test('legacy PWA state is removed before the one required clean reload', async () => {
  const events = await runRetirementScenario({
    registrations: ['legacy-worker'],
    cacheNames: ['legacy-cache']
  });

  assert.deepEqual(events.map(({ type }) => type), [
    'readMarker',
    'getRegistrations',
    'getCacheNames',
    'unregister',
    'deleteCache',
    'setMarker',
    'replace'
  ]);
  assert.equal(events.at(-1)?.url, 'https://wayyaam.ru/?pwa-reset=20260803-network-only-v2#/mangal');
});

test('failed legacy cleanup is retried on the next launch without reloading', async () => {
  const events = await runRetirementScenario({
    registrations: ['legacy-worker'],
    failUnregister: true
  });

  assert.deepEqual(events.map(({ type }) => type), [
    'readMarker',
    'getRegistrations',
    'getCacheNames',
    'unregister'
  ]);
});

test('a completed retirement marker avoids all later PWA cleanup work', async () => {
  const events = await runRetirementScenario({ marker: 'done' });

  assert.deepEqual(events.map(({ type }) => type), ['readMarker']);
});

test('strict storage modes still inspect PWA state without forcing a clean launch reload', async () => {
  const events = await runRetirementScenario({
    failMarkerRead: true,
    failMarkerWrite: true
  });

  assert.deepEqual(events.map(({ type }) => type), [
    'readMarker',
    'getRegistrations',
    'getCacheNames',
    'setMarker'
  ]);
});
