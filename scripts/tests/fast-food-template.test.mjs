import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const workspace = new URL('../../', import.meta.url);
const assetNames = [
  'hero.jpg',
  'classic-cheeseburger.jpg',
  'spicy-chicken-burger.jpg',
  'chicken-shawarma.jpg',
  'classic-hot-dog.jpg',
  'french-fries.jpg',
  'chicken-nuggets.jpg',
  'cola.jpg',
  'berry-lemonade.jpg'
];

test('ships an optimized and complete fast-food template asset set', async () => {
  for (const assetName of assetNames) {
    const asset = new URL(`public/assets/template-fast-food/${assetName}`, workspace);
    const details = await stat(asset);
    assert.ok(details.size > 20_000, `${assetName} should contain a real generated photograph`);
    assert.ok(details.size < 300_000, `${assetName} should stay lightweight for mobile catalogs`);
  }
});

test('seeds reusable products with priced size and spice choices', async () => {
  const migration = await readFile(
    new URL('supabase/migrations/20260731184750_seed_fast_food_restaurant_template.sql', workspace),
    'utf8'
  );

  for (const productSlug of [
    'classic-cheeseburger',
    'spicy-chicken-burger',
    'chicken-shawarma',
    'classic-hot-dog',
    'french-fries',
    'chicken-nuggets',
    'cola',
    'berry-lemonade'
  ]) {
    assert.match(migration, new RegExp(`'${productSlug}'`));
  }

  assert.match(migration, /'Большой, острый', 'price', 520/);
  assert.match(migration, /'Большая, не острая', 'price', 450/);
  assert.match(migration, /'0,5 л', 'price', 230/);
  assert.doesNotMatch(migration, /catalog_id\s*=\s*'[0-9a-f-]{36}'/i);
});
