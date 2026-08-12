import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260812211500_add_catalog_sale_units.sql'),
  'utf8'
);
const compatibilityMigration = readFileSync(
  resolve(
    repoRoot,
    'supabase/migrations/20260813000600_weighted_order_variant_pricing_compatibility.sql'
  ),
  'utf8'
);

describe('catalog sale unit migration', () => {
  it('normalizes SKU, weighted quantity and substitution fields on products', () => {
    for (const column of [
      'barcode',
      'sale_unit',
      'quantity_unit',
      'price_basis_quantity',
      'minimum_quantity',
      'quantity_step',
      'stock_quantity',
      'allow_substitution'
    ]) {
      assert.match(migration, new RegExp(`add column if not exists ${column}\\b`));
    }
    assert.match(migration, /products_sale_quantity_shape_check/);
    assert.match(migration, /products_catalog_sku_unique_idx/);
    assert.match(migration, /products_catalog_barcode_unique_idx/);
  });

  it('creates inventory-bearing variants with catalog-scoped integrity and RLS', () => {
    assert.match(migration, /create table if not exists public\.product_variants/);
    assert.match(migration, /foreign key \(catalog_id, product_id\)/);
    assert.match(migration, /alter table public\.product_variants enable row level security/);
    assert.match(migration, /product variants public read active/);
    assert.match(migration, /product variants editor write/);
  });

  it('adds immutable sale snapshots without changing the legacy integer quantity column', () => {
    for (const column of [
      'variant_id',
      'sku_snapshot',
      'sale_unit_snapshot',
      'quantity_unit_snapshot',
      'requested_quantity',
      'fulfilled_quantity',
      'price_basis_quantity_snapshot',
      'product_snapshot'
    ]) {
      assert.match(migration, new RegExp(`add column if not exists ${column}\\b`));
    }
    assert.doesNotMatch(migration, /alter column quantity type/i);
    assert.match(migration, /new\.requested_quantity := greatest\(new\.quantity, 1\)/);
  });

  it('keeps weighted totals compatible with the established order pricing trigger', () => {
    assert.match(
      compatibilityMigration,
      /product_sale_unit = 'weight'[\s\S]*new\.requested_quantity[\s\S]*product_price_basis_quantity/
    );
    assert.match(
      compatibilityMigration,
      /new\.product_id is null or not found[\s\S]*new\.sale_unit_snapshot[\s\S]*new\.price_basis_quantity_snapshot/
    );
    assert.match(compatibilityMigration, /weighted_requested_quantity_invalid/);
    assert.match(compatibilityMigration, /Product stock is not enough/);
  });

  it('removes inherited anonymous access from private workflow storage', () => {
    assert.match(
      compatibilityMigration,
      /revoke all on table[\s\S]*public\.catalog_staff_memberships[\s\S]*public\.order_messages[\s\S]*from public, anon/
    );
    assert.match(
      compatibilityMigration,
      /revoke all on sequence[\s\S]*from public, anon, authenticated/
    );
  });
});
