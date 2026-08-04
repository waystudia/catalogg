import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

test('offline module demo uses WayYaam restaurants instead of unrelated sample businesses', async () => {
  const source = await readFile(new URL('src/shared/api/clientsApi.ts', root), 'utf8');

  assert.doesNotMatch(source, /Grill House|Coffee Time|FitLife Gym/);
  assert.match(source, /companyName: 'Мангал'/);
  assert.match(source, /companyName: 'Rizih'/);
});

test('offline admin and super-admin address the same catalog id', async () => {
  const source = await readFile(new URL('src/shared/api/catalogAdminApi.ts', root), 'utf8');

  assert.doesNotMatch(source, /id: 'local-catalog'/);
  assert.match(source, /id: `catalog-\$\{slug\}`/);
  assert.match(source, /if \(!supabase\)[\s\S]*?firstLogin: false,[\s\S]*?consentGiven: true,/);
});

test('the existing restaurant shell loads module access for its own catalog', async () => {
  const source = await readFile(new URL('src/pages/catalog-admin/RestaurantAdminShell.tsx', root), 'utf8');

  assert.match(source, /getRestaurantModuleEntitlementByCatalog\(access\.catalog\.id\)/);
  assert.match(source, /section === 'pos'/);
  assert.match(source, /section === 'warehouse'/);
});

test('super admin can enable POS from the existing client editor', async () => {
  const source = await readFile(new URL('src/pages/platform-admin/PlatformAdminApp.tsx', root), 'utf8');

  assert.match(source, /queryKey:\s*\['restaurant-module-entitlement',\s*client\.catalogId\]/);
  assert.match(source, /getRestaurantModuleEntitlementByCatalog\(client\.catalogId\)/);
  assert.match(source, /Включить POS-кассу/);
  assert.match(source, /saveRestaurantModuleEntitlement\(moduleDraft\)/);
});
