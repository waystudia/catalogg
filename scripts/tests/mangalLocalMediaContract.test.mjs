import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../../', import.meta.url);
const productAssetNames = [
  'lamb-skewer.webp',
  'zhizhig-galnash.webp',
  'four-seasons.webp',
  'shawarma-combo.webp',
  'bone-steak.webp',
  'grilled-vegetables.webp',
  'coca-cola.webp',
  'pepsi.webp',
  'fanta.webp',
  'sprite.webp',
  'ayran.webp',
  'chechen-tea.webp',
  'strawberry-lemonade.webp',
  'blue-lagoon.webp',
  'tarhun.webp',
  'signature-sauce.webp',
  'lipton-lemon.webp',
  'lipton-peach.webp',
  'orange-juice.webp',
  'apple-juice.webp',
  'cherry-juice.webp',
  'still-water.webp',
  'mineral-water.webp'
];

test('Mangal fallback catalog and database seeds use only local media', async () => {
  const [catalog, schema, seed] = await Promise.all([
    readFile(new URL('src/data/catalog.ts', root), 'utf8'),
    readFile(new URL('supabase/schema.sql', root), 'utf8'),
    readFile(new URL('supabase/seed_restaurant_catalog.sql', root), 'utf8')
  ]);

  for (const source of [catalog, schema, seed]) {
    assert.doesNotMatch(source, /images\.unsplash\.com/);
  }
  assert.match(catalog, /Lipton Лимон[\s\S]*Lipton Персик/);
  assert.match(catalog, /Сок апельсиновый[\s\S]*Сок яблочный[\s\S]*Сок вишнёвый/);
  assert.match(catalog, /Вода без газа[\s\S]*Вода газированная/);
});

test('Mangal media migration is additive and replaces every remote demo image', async () => {
  const names = await readdir(new URL('supabase/migrations/', root));
  const migrationName = names.find((name) => name.endsWith('_localize_mangal_demo_media.sql'));
  assert.ok(migrationName, 'local Mangal media migration is required');
  const sql = await readFile(new URL(`supabase/migrations/${migrationName}`, root), 'utf8');

  assert.doesNotMatch(sql, /images\.unsplash\.com/);
  assert.doesNotMatch(sql, /\b(delete|truncate|drop)\b/i);
  assert.match(sql, /update public\.catalogs[\s\S]*banner_url/);
  assert.match(sql, /update public\.restaurant[\s\S]*banner_url/);
  assert.match(sql, /update public\.product[\s\S]*image_urls/);
  assert.match(sql, /Lipton Лимон[\s\S]*Lipton Персик/);
  assert.match(sql, /Сок апельсиновый[\s\S]*Сок яблочный[\s\S]*Сок вишнёвый/);
  assert.match(sql, /Вода без газа[\s\S]*Вода газированная/);
});

test('Mangal restaurant gallery retires external cover URLs without removing uploaded covers', async () => {
  const names = await readdir(new URL('supabase/migrations/', root));
  const migrationName = names.find((name) => name.endsWith('_localize_mangal_restaurant_gallery.sql'));
  assert.ok(migrationName, 'Mangal restaurant gallery migration is required');
  const sql = await readFile(new URL(`supabase/migrations/${migrationName}`, root), 'utf8');

  assert.doesNotMatch(sql, /\b(delete|truncate|drop)\b/i);
  assert.match(sql, /update public\.catalog_sections/);
  assert.match(sql, /jsonb_array_elements_text/);
  assert.match(sql, /\/assets\/mangal-demo\/cover\.webp/);
  assert.match(sql, /when image ~ '\^https\?:\/\/'/);
});

test('Mangal local WebP files stay within the lightweight mobile budget', async () => {
  const productsUrl = new URL('public/assets/mangal-demo/products/', root);
  const cabinsUrl = new URL('public/assets/mangal-demo/cabins/', root);
  assert.deepEqual((await readdir(productsUrl)).sort(), [...productAssetNames].sort());

  for (const name of productAssetNames) {
    const url = new URL(name, productsUrl);
    const [metadata, file] = await Promise.all([sharp(fileURLToPath(url)).metadata(), stat(url)]);
    assert.equal(metadata.width, 640, `${name} width`);
    assert.equal(metadata.height, 426, `${name} height`);
    assert.ok(file.size <= 45_000, `${name} must be no larger than 45 KB`);
  }

  for (const name of ['cabin-1.webp', 'cabin-2.webp', 'big-cabin.webp', 'main-hall.webp']) {
    const url = new URL(name, cabinsUrl);
    const [metadata, file] = await Promise.all([sharp(fileURLToPath(url)).metadata(), stat(url)]);
    assert.equal(metadata.width, 640, `${name} width`);
    assert.equal(metadata.height, 426, `${name} height`);
    assert.ok(file.size <= 45_000, `${name} must be no larger than 45 KB`);
  }

  const coverUrl = new URL('public/assets/mangal-demo/cover.webp', root);
  const [coverMetadata, coverFile] = await Promise.all([sharp(fileURLToPath(coverUrl)).metadata(), stat(coverUrl)]);
  assert.equal(coverMetadata.width, 960);
  assert.equal(coverMetadata.height, 540);
  assert.ok(coverFile.size <= 75_000, 'cover.webp must be no larger than 75 KB');
});
