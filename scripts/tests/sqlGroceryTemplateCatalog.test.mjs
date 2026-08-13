import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const seed = readFileSync(
  new URL('../../supabase/migrations/20260813010200_seed_grocery_template_catalog.sql', import.meta.url),
  'utf8'
);
const hydrator = readFileSync(
  new URL('../../supabase/migrations/20260813010300_hydrate_grocery_business_from_template.sql', import.meta.url),
  'utf8'
);
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

  it('runs hydration only for grocery onboarding with the seeded menu enabled', () => {
    assert.match(edgeFunction, /payload\.businessType === 'grocery' && payload\.seedDemoMenu === true/);
    assert.match(edgeFunction, /hydrate_grocery_business_from_template/);
    assert.match(edgeFunction, /auth\.admin\.deleteUser\(ownerUserId\)/);
  });
});
