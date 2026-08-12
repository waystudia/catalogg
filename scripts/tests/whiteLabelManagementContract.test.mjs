import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('super admin manages a storefront through protected RPCs and an existing client sheet', async () => {
  const [migration, api, admin, component] = await Promise.all([
    read('supabase/migrations/20260813000500_manage_white_label_storefronts.sql'),
    read('src/shared/api/storefrontAdminApi.ts'),
    read('src/pages/platform-admin/PlatformAdminApp.tsx'),
    read('src/features/platform-admin-storefronts/StorefrontSettingsCard.tsx')
  ]);

  assert.match(migration, /save_catalog_storefront_domain/i);
  assert.match(migration, /set_catalog_storefront_domain_status/i);
  assert.match(migration, /public\.is_platform_admin\(\)/i);
  assert.match(migration, /catalog_storefront_reserved_hostname/i);
  assert.match(migration, /catalog\.is_template is false/i);
  assert.match(migration, /catalog\.status = 'published'/i);
  assert.match(migration, /target_verification_token/i);
  assert.match(api, /getCatalogStorefrontDomain/);
  assert.match(api, /saveCatalogStorefrontDomain/);
  assert.match(api, /setCatalogStorefrontDomainStatus/);
  assert.match(admin, /StorefrontSettingsCard/);
  assert.match(component, /Брендированный домен и PWA/);
  assert.match(component, /DNS проверен/);
});
