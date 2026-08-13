import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260813195108_add_shared_product_master.sql'),
  'utf8'
);
const catalogAdapter = readFileSync(resolve(repoRoot, 'src/shared/supabase.ts'), 'utf8');

describe('shared product master migration', () => {
  it('separates platform product identity from catalog offers', () => {
    for (const table of [
      'master_categories',
      'master_products',
      'master_product_identifiers',
      'master_product_media',
      'product_contributions'
    ]) {
      assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`, 'i'));
    }

    assert.match(migration, /alter table public\.products[\s\S]*add column if not exists master_product_id/i);
    assert.match(migration, /alter table public\.categories[\s\S]*add column if not exists master_category_id/i);
    assert.match(migration, /alter table public\.product_images[\s\S]*add column if not exists master_media_id/i);
    assert.match(migration, /products_catalog_master_product_unique_idx/i);
  });

  it('normalizes and validates global GTIN identifiers', () => {
    assert.match(migration, /function public\.normalize_global_barcode\(input_value text\)/i);
    assert.match(migration, /function public\.is_valid_global_barcode\(input_value text\)/i);
    assert.match(migration, /master_product_identifiers_normalized_unique_idx/i);
    assert.match(migration, /normalized_value ~ '\^\[0-9\]\{14\}\$'/i);
  });

  it('keeps master writes moderated and catalog contributions tenant scoped', () => {
    for (const table of [
      'master_categories',
      'master_products',
      'master_product_identifiers',
      'master_product_media',
      'product_contributions'
    ]) {
      assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    }

    assert.match(migration, /create policy "contributors read own catalog proposals"/i);
    assert.match(migration, /public\.is_catalog_member\([\s\S]*'owner'[\s\S]*'admin'[\s\S]*'editor'/i);
    assert.match(migration, /create policy "platform admins manage master products"/i);
    assert.match(migration, /revoke all on table public\.master_products from public, anon, authenticated/i);
    assert.match(migration, /grant select on table public\.master_products to anon, authenticated/i);
  });

  it('exposes guarded lookup, submission and idempotent bulk-add RPCs', () => {
    assert.match(migration, /function public\.lookup_shared_product_by_barcode\(target_barcode text\)/i);
    assert.match(migration, /function private\.submit_shared_product/i);
    assert.match(migration, /function public\.submit_shared_product/i);
    assert.match(migration, /function public\.bulk_add_shared_products_to_catalog/i);
    assert.match(migration, /pg_advisory_xact_lock/i);
    assert.match(migration, /on conflict do nothing/i);
    assert.match(migration, /'draft'::public\.product_status/i);
    assert.match(migration, /revoke all on function public\.submit_shared_product/i);
    assert.match(migration, /grant execute on function public\.submit_shared_product[\s\S]*to authenticated/i);
    assert.match(migration, /function public\.bulk_add_shared_products_to_catalog[\s\S]*security definer[\s\S]*set search_path = ''/i);
  });

  it('rejects a second product card for an already registered barcode', () => {
    assert.match(migration, /if selected_master_product_id is not null then[\s\S]*raise exception 'shared_barcode_already_exists'/i);
    assert.doesNotMatch(migration, /contribution_kind := 'correction'/i);
  });

  it('lets authorized merchants add a globally reusable category without cross-tenant authority', () => {
    assert.match(migration, /function private\.create_shared_product_category\(/i);
    assert.match(migration, /function public\.create_shared_product_category\(/i);
    assert.match(migration, /target_catalog_id is null[\s\S]*public\.is_catalog_member\([\s\S]*'owner'[\s\S]*'admin'[\s\S]*'editor'/i);
    assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(lower\(normalized_name\), 1\)\)/i);
    assert.match(migration, /where lower\(category\.name\) = lower\(normalized_name\)/i);
    assert.match(migration, /master_categories_active_name_unique_idx/i);
    assert.match(migration, /'shared_category_created'/i);
    assert.match(migration, /grant execute on function public\.create_shared_product_category[\s\S]*to authenticated/i);
  });

  it('prevents linked catalog products from being published with a zero price', () => {
    assert.match(migration, /function private\.enforce_shared_listing_publishable/i);
    assert.match(migration, /new\.master_product_id is not null/i);
    assert.match(migration, /new\.price <= 0/i);
    assert.match(migration, /shared_product_price_required/i);
  });

  it('preserves master links through the existing catalog persistence adapter', () => {
    assert.match(catalogAdapter, /select\('id, category_id, master_product_id, master_content_version, content_source,/i);
    assert.match(catalogAdapter, /master_product_id: value\.master_product_id \?\? undefined/i);
    assert.match(catalogAdapter, /master_product_id: product\.master_product_id/i);
    assert.match(catalogAdapter, /master_content_version: product\.master_product_id/i);
  });
});
