import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../supabase/migrations/20260802170000_add_confectionery_template.sql', import.meta.url);
const assetRoot = new URL('../../public/assets/templates/confectionery/', import.meta.url);

test('confectionery is registered additively in the universal catalog model', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /business_type in \('restaurant', 'coffee_shop', 'confectionery'\)/);
  assert.match(sql, /template_type in \('restaurant', 'coffee_shop', 'confectionery'\)/);
  assert.match(sql, /create_restaurant_from_template/);
  assert.match(sql, /template_name = 'confectionery'/);
  assert.doesNotMatch(sql, /create\s+(?:table|type)\s+(?:public\.)?confectionery/i);
  assert.doesNotMatch(sql, /confectionery_products|create\s+type[\s\S]*enum/i);
});

test('migration seeds ten categories and forty-two editable products without duplicating popular items', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /'Популярное'[\s\S]*'Торты'[\s\S]*'Торты на заказ'[\s\S]*'Пироги'[\s\S]*'Порционные десерты'[\s\S]*'Капкейки и эклеры'[\s\S]*'Фрукты в шоколаде'[\s\S]*'Выпечка и печенье'[\s\S]*'Подарочные наборы'[\s\S]*'Напитки'/);
  const productSeed = sql.match(/from \(values([\s\S]*?)\) as seed\(category_slug, slug, title, price/);
  assert.ok(productSeed, 'product seed block must exist');
  assert.equal((productSeed[1].match(/^    \('/gm) ?? []).length, 42);
  assert.match(sql, /category\.slug = 'custom-cakes'[\s\S]*Начинка[\s\S]*Декор/);
  assert.doesNotMatch(sql, /insert into public\.products[\s\S]*\('popular',/);
});

test('generated confectionery collection is local, WebP and within page-weight budgets', async () => {
  const products = await readdir(new URL('products/', assetRoot));
  assert.equal(products.filter((name) => name.endsWith('.webp')).length, 35);
  assert.ok(products.includes('birthday-custom-cake.webp'));

  for (const name of products.filter((item) => item.endsWith('.webp'))) {
    const bytes = await readFile(new URL(`products/${name}`, assetRoot));
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    assert.ok(bytes.byteLength <= 250_000, `${name} exceeds 250 KB`);
  }

  assert.ok((await stat(new URL('hero.webp', assetRoot))).size <= 350_000);
  assert.ok((await stat(new URL('preview.webp', assetRoot))).size <= 250_000);

  const [config, migration] = await Promise.all([
    readFile(new URL('../../src/templates/confectionery/index.ts', import.meta.url), 'utf8'),
    readFile(migrationUrl, 'utf8')
  ]);
  assert.doesNotMatch(`${config}\n${migration}`, /https?:\/\//i);
  assert.doesNotMatch(`${config}\n${migration}`, /\/catalogg\/assets\/templates\/confectionery/i);
  assert.match(`${config}\n${migration}`, /\/assets\/templates\/confectionery/);
});

test('product photos stay outside service-worker storage', async () => {
  const [viteConfig, serviceWorker] = await Promise.all([
    readFile(new URL('../../vite.config.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/sw.ts', import.meta.url), 'utf8')
  ]);
  assert.match(viteConfig, /globPatterns:\s*\[\]/);
  assert.doesNotMatch(serviceWorker, /precacheAndRoute|registerRoute|catalog-images/);
});

test('server pricing validates weight steps and resolves variants and modifiers', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /pricing_type' = 'per_kg'/);
  assert.match(sql, /selected_weight < minimum_weight/);
  assert.match(sql, /Unsupported product weight/);
  assert.match(sql, /sum\(option_row\.price_delta\)/);
  assert.match(sql, /resolved_variant_price/);
  assert.match(sql, /new\.line_total := new\.unit_price \* new\.quantity/);
});
