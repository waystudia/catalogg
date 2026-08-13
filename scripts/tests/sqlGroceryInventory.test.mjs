import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260813193106_grocery_inventory_receiving.sql'),
  'utf8'
);

describe('grocery inventory database contract', () => {
  it('keeps costs private behind tenant RLS and explicit Data API grants', () => {
    assert.match(migration, /alter table public\.catalog_inventory_items enable row level security/i);
    assert.match(migration, /create policy "inventory items members read"[\s\S]*to authenticated[\s\S]*is_catalog_member/i);
    assert.match(migration, /grant select on table[\s\S]*catalog_inventory_items[\s\S]*to authenticated, service_role/i);
    assert.doesNotMatch(migration, /grant select[\s\S]*to anon/i);
  });

  it('uses catalog-scoped foreign keys for documents and products', () => {
    assert.match(migration, /foreign key \(catalog_id, product_id\)[\s\S]*references public\.products\(catalog_id, id\)/i);
    assert.match(migration, /foreign key \(catalog_id, document_id\)[\s\S]*references public\.catalog_inventory_documents\(catalog_id, id\)/i);
  });

  it('posts receiving atomically through a restricted authenticated RPC', () => {
    assert.match(migration, /create or replace function public\.post_catalog_receiving/i);
    assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
    assert.match(migration, /(?:select\s+)?auth\.uid\(\)\)?\s+is null[\s\S]*is_catalog_member/i);
    assert.match(migration, /for update/i);
    assert.match(migration, /revoke all on function public\.post_catalog_receiving[\s\S]*from public, anon/i);
    assert.match(migration, /grant execute on function public\.post_catalog_receiving[\s\S]*to authenticated, service_role/i);
  });
});
