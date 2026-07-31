import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20260731201707_add_business_type_support.sql', import.meta.url),
  'utf8'
);
const createClient = await readFile(new URL('../../supabase/functions/create-client/index.ts', import.meta.url), 'utf8');
const updateClient = await readFile(new URL('../../supabase/functions/update-client/index.ts', import.meta.url), 'utf8');
const platformAdmin = await readFile(new URL('../../src/pages/platform-admin/PlatformAdminApp.tsx', import.meta.url), 'utf8');

test('business type is backward compatible and constrained to supported values', () => {
  assert.match(migration, /clients[\s\S]*business_type text not null default 'restaurant'/);
  assert.match(migration, /business_type in \('restaurant', 'coffee_shop'\)/);
  assert.match(migration, /update public\.catalogs[\s\S]*client\.business_type/);
});

test('create and update flows persist the canonical type and its public catalog projection', () => {
  assert.match(createClient, /business_type: payload\.businessType/);
  assert.match(createClient, /business_type: payload\.businessType/);
  assert.match(updateClient, /clientUpdates\.business_type = payload\.businessType/);
  assert.match(updateClient, /catalogUpdates\.business_type = payload\.businessType/);
});

test('super admin can select the type on both create and edit forms', () => {
  assert.ok((platformAdmin.match(/value="coffee_shop"/g) ?? []).length >= 2);
  assert.match(platformAdmin, /Тип заведения/);
  assert.match(platformAdmin, /businessType,/);
});
