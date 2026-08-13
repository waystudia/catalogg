import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('white-label storefronts resolve through a verified domain without exposing all tenants', async () => {
  const [migration, reservedHostMigration, clientApi, runtime, manifest, boundary, publicOrder, app] = await Promise.all([
    read('supabase/migrations/20260812235900_add_white_label_storefronts.sql'),
    read('supabase/migrations/20260813004827_reserve_wayyaam_github_pages_hostname.sql'),
    read('src/shared/api/storefrontApi.ts'),
    read('src/shared/storefrontRuntime.ts'),
    read('supabase/functions/storefront-manifest/index.ts'),
    read('src/features/storefront/StorefrontBoundary.tsx'),
    read('src/features/order/PublicOrderStatusScreen.tsx'),
    read('src/app/App.tsx')
  ]);

  assert.match(migration, /create table if not exists public\.catalog_storefront_domains/i);
  assert.match(migration, /unique \(hostname\)/i);
  assert.match(migration, /status = 'active'/i);
  assert.match(migration, /catalog\.status = 'published'/i);
  assert.match(migration, /create or replace function public\.get_public_storefront_by_hostname/i);
  assert.match(migration, /revoke all on table public\.catalog_storefront_domains from public, anon/i);
  assert.match(reservedHostMigration, /waystudia\.github\.io/);
  assert.match(reservedHostMigration, /catalog_storefront_reserved_hostname/);
  assert.match(reservedHostMigration, /revoke all on function public\.reject_catalog_storefront_reserved_hostname/i);
  assert.match(clientApi, /get_public_storefront_by_hostname/);
  assert.match(runtime, /manifest\.webmanifest/);
  assert.match(runtime, /apple-touch-icon/);
  assert.match(manifest, /application\/manifest\+json/);
  assert.match(manifest, /get_public_storefront_by_hostname/);
  assert.match(manifest, /powered_by_wayyaam/);
  assert.match(boundary, /storefrontMode === 'exclusive'/);
  assert.match(boundary, /getExclusiveStorefrontHomePath\(storefront\)/);
  assert.match(publicOrder, /OrderConversationPanel/);
  assert.match(publicOrder, /businessType === 'grocery'/);
  assert.match(app, /businessType={catalog\.restaurant\.business_type}/);
});
