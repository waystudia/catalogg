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
});
