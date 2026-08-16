import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectUrl = new URL('../../', import.meta.url);

test('assigned drivers can delete only a non-combined test order and retain ledger cleanup', async () => {
  const migration = await readFile(new URL(
    'supabase/migrations/20260816110756_allow_assigned_driver_delete_test_order.sql',
    projectUrl
  ), 'utf8');
  const offerScopeMigration = await readFile(new URL(
    'supabase/migrations/20260816112541_expose_driver_order_scope.sql',
    projectUrl
  ), 'utf8');
  const api = await readFile(new URL('src/shared/api/deliveryApi.ts', projectUrl), 'utf8');
  const driverApp = await readFile(new URL('src/pages/driver/DriverApp.tsx', projectUrl), 'utf8');

  assert.match(migration, /delivery\.driver_id = viewer_driver_id/);
  assert.match(migration, /delivery\.order_group_id is null/);
  assert.match(migration, /order_row\.is_test_order is true/);
  assert.match(migration, /delete from public\.billing_ledger_entries[\s\S]*ledger\.is_test is true/i);
  assert.match(migration, /delete from public\.orders[\s\S]*is_test_order is true/i);
  assert.match(migration, /revoke all on function public\.delete_restaurant_test_order\(uuid, uuid\) from public, anon, service_role/);
  assert.match(offerScopeMigration, /'catalog_id',[\s\S]*order_row\.catalog_id/);
  assert.match(offerScopeMigration, /'is_test_order',[\s\S]*order_row\.is_test_order/);
  assert.match(offerScopeMigration, /delivery\.driver_id = viewer_driver\.id/);
  assert.match(api, /order\.isTestOrder !== true/);
  assert.match(api, /catalogId: order\.catalog_id \?\? row\.catalog_id \?\? ''/);
  assert.match(api, /isTestOrder: row\.is_test_order === true/);
  assert.match(api, /if \(order\.isCombined\)/);
  assert.match(driverApp, /offer\.isTestOrder && !offer\.isCombined/);
  assert.match(driverApp, /Удалить тестовый заказ/);
});
