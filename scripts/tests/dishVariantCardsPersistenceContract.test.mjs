import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260816020000_add_legacy_dish_variant_cards.sql', import.meta.url),
  'utf8'
);
const editorFieldsMigration = readFileSync(
  new URL('../../supabase/migrations/20260816105133_expand_legacy_product_editor_fields.sql', import.meta.url),
  'utf8'
);
const catalogAdapter = readFileSync(new URL('../../src/shared/supabase.ts', import.meta.url), 'utf8');
const legacyProductAdapter = readFileSync(
  new URL('../../src/shared/legacyProductPersistence.ts', import.meta.url),
  'utf8'
);
const baselineSchema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');

test('dish variant card metadata persists in legacy and universal catalogs', () => {
  assert.match(migration, /add column if not exists publish_choice_cards boolean not null default false/);
  assert.match(migration, /add column if not exists generated_from_choice text/);
  assert.match(migration, /foreign key \(generated_from_choice\)[\s\S]*on delete cascade/);
  assert.match(migration, /unique index if not exists product_generated_choice_unique_idx/);
  assert.match(catalogAdapter, /'publish_choice_cards'/);
  assert.match(catalogAdapter, /'generated_from_choice'/);
  assert.match(catalogAdapter, /'generated_choice_index'/);
  assert.match(
    catalogAdapter,
    /if \(activeCatalogIsLegacy\)[\s\S]*from\('product'\)\.upsert\(toLegacyProductRow\(product\), \{ onConflict: 'id' \}\)/
  );
  assert.match(
    catalogAdapter,
    /from\('products'\)[\s\S]*\.eq\('catalog_id', activePlatformCatalogId\)[\s\S]*\.eq\('slug', row\.slug\)[\s\S]*\.maybeSingle\(\)/
  );
  assert.match(
    catalogAdapter,
    /if \(existing\?\.id\)[\s\S]*from\('products'\)\.update\(row\)/
  );
  assert.match(
    catalogAdapter,
    /deleteProductFromSupabase[\s\S]*if \(activeCatalogIsLegacy\)[\s\S]*from\('product'\)\.delete\(\)\.eq\('id', productId\)/
  );
  assert.match(catalogAdapter, /'spicy_level',[\s\S]*'category_ids',[\s\S]*'pair_ids'/);
  assert.match(
    catalogAdapter,
    /resolvePlatformProductCategoryId[\s\S]*from\('category'\)[\s\S]*from\('categories'\)[\s\S]*\.eq\('slug', createSlug\(legacyCategory\.name\)\)/
  );
  for (const column of [
    'modifier_groups',
    'allergens',
    'badges',
    'sale_unit',
    'quantity_unit',
    'stock_quantity',
    'allow_substitution'
  ]) {
    assert.match(editorFieldsMigration, new RegExp(`add column if not exists ${column}`));
    assert.match(legacyProductAdapter, new RegExp(`'${column}'`));
    assert.match(baselineSchema, new RegExp(`add column if not exists ${column}`));
  }
  assert.match(editorFieldsMigration, /notify pgrst, 'reload schema'/);
  assert.match(legacyProductAdapter, /product\[column\] === undefined \? \[\] : \[\[column, product\[column\]\]\]/);
});
