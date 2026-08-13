import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const seed = readFileSync(
  new URL('../../supabase/migrations/20260813010200_seed_grocery_template_catalog.sql', import.meta.url),
  'utf8'
);
const hydrator = readFileSync(
  new URL('../../supabase/migrations/20260813010300_hydrate_grocery_business_from_template.sql', import.meta.url),
  'utf8'
);
const assortment = readFileSync(
  new URL('../../supabase/migrations/20260813100846_refresh_finik_grocery_assortment.sql', import.meta.url),
  'utf8'
);
const productAssetDirectory = new URL('../../public/assets/template-grocery/products/', import.meta.url);
const edgeFunction = readFileSync(
  new URL('../../supabase/functions/create-client/index.ts', import.meta.url),
  'utf8'
);

describe('grocery template vertical slice', () => {
  it('seeds a broad catalog with weighted and piece products and safe substitution flags', () => {
    const productRows = [...seed.matchAll(/\('(?:dates-nuts|fruits|vegetables|dairy|bakery|pantry|halal-meat|drinks|snacks|frozen|household|personal-care)'/g)];
    assert.ok(productRows.length >= 50, `expected at least 50 products, received ${productRows.length}`);
    assert.match(seed, /'weight',250,50/);
    assert.match(seed, /'piece',1,1/);
    assert.match(seed, /allow_substitution/);
    assert.match(seed, /on conflict \(catalog_id, slug\) do update/);
  });

  it('hydrates universal sale fields and the shared delivery-compatible store profile', () => {
    assert.match(hydrator, /sale_unit = source_product\.sale_unit/);
    assert.match(hydrator, /stock_quantity = source_product\.stock_quantity/);
    assert.match(hydrator, /insert into public\.restaurants/);
    assert.match(hydrator, /use_platform_drivers/);
    assert.match(hydrator, /status = case when target_client\.status = 'active'/);
  });

  it('gives Finik at least 50 distinct product photos and recognizable essentials', () => {
    const assetRows = [...assortment.matchAll(/\('([^']+)', '(\/assets\/template-grocery\/products\/[^']+\.webp)'\)/g)];
    const imageUrls = assetRows.map((match) => match[2]);
    const imageFiles = readdirSync(productAssetDirectory).filter((name) => name.endsWith('.webp'));

    assert.ok(assetRows.length >= 50, `expected at least 50 mapped product photos, received ${assetRows.length}`);
    assert.equal(new Set(imageUrls).size, assetRows.length, 'every product must have its own photo path');
    assert.equal(imageFiles.length, assetRows.length);
    imageUrls.forEach((url) => assert.equal(
      existsSync(resolve(new URL('../../public/', import.meta.url).pathname, url.replace('/assets/', 'assets/'))),
      true,
      `${url} is missing`
    ));
    assert.match(assortment, /'Pepsi 1,5 л'/);
    assert.match(assortment, /'Coca-Cola Original 1,5 л'/);
    assert.match(assortment, /'Чипсы Lay’s с солью 140 г'/);
    assert.match(assortment, /'Картофель российский отборный'/);
    assert.match(assortment, /'Хлеб местный домашний'/);
    assert.match(assortment, /catalog\.slug = 'finik'[\s\S]*client\.status = 'active'/);
  });

  it('runs hydration only for grocery onboarding with the seeded menu enabled', () => {
    assert.match(edgeFunction, /payload\.businessType === 'grocery' && payload\.seedDemoMenu === true/);
    assert.match(edgeFunction, /hydrate_grocery_business_from_template/);
    assert.match(edgeFunction, /auth\.admin\.deleteUser\(ownerUserId\)/);
  });
});
