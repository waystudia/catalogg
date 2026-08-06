import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const readText = (path) => readFile(new URL(path, root), 'utf8');

const [
  brandLogoSource,
  loadingScreenSource,
  indexSource,
  serviceWorkerSource,
  viteConfigSource,
  compiledViteConfigSource
] = await Promise.all([
  readText('src/shared/BrandLogo.tsx'),
  readText('src/shared/CatalogLoadingScreen.tsx'),
  readText('index.html'),
  readText('src/sw.ts'),
  readText('vite.config.ts'),
  readText('vite.config.js')
]);

const readPngDimensions = async (path) => {
  const image = await readFile(new URL(path, root));
  assert.equal(image.subarray(1, 4).toString('ascii'), 'PNG', `${path} must be a PNG image`);
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20)
  };
};

test('the default WayYaam brand uses the approved mark and wordmark without a slogan', () => {
  assert.match(brandLogoSource, /assets\/logo\/wayyaam-wordmark\.png/);
  assert.match(loadingScreenSource, /assets\/logo\/wayyaam-icon-192\.png/);
  assert.doesNotMatch(
    `${brandLogoSource}\n${loadingScreenSource}\n${indexSource}`,
    /Заказал\.\s*Уже едет!/i
  );
});

test('browser tabs and home-screen installation use the approved WayYaam icon', () => {
  assert.match(indexSource, /rel="icon"[^>]+wayyaam-favicon-32\.png/);
  assert.match(indexSource, /rel="apple-touch-icon"[^>]+wayyaam-icon-192\.png/);
  assert.doesNotMatch(indexSource, /waycatalog-icon\.svg/);

  for (const source of [viteConfigSource, compiledViteConfigSource]) {
    assert.match(source, /assets\/logo\/wayyaam-icon-192\.png/);
    assert.match(source, /assets\/logo\/wayyaam-icon-512\.png/);
  }

  assert.match(serviceWorkerSource, /assets\/logo\/wayyaam-icon-192\.png/);
});

test('installable WayYaam icons have exact platform sizes', async () => {
  assert.deepEqual(await readPngDimensions('public/assets/logo/wayyaam-favicon-32.png'), {
    width: 32,
    height: 32
  });
  assert.deepEqual(await readPngDimensions('public/assets/logo/wayyaam-icon-192.png'), {
    width: 192,
    height: 192
  });
  assert.deepEqual(await readPngDimensions('public/assets/logo/wayyaam-icon-512.png'), {
    width: 512,
    height: 512
  });
});
