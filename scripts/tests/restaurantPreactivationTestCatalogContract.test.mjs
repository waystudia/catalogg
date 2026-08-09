import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationName = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
  .filter((name) => name.endsWith('_restaurant_preactivation_test_catalogs.sql'))
  .sort()
  .at(-1);

const migration = migrationName
  ? readFileSync(new URL(`../../supabase/migrations/${migrationName}`, import.meta.url), 'utf8')
  : '';
const ordersApi = readFileSync(
  new URL('../../src/shared/api/restaurantOrdersApi.ts', import.meta.url),
  'utf8'
);
const restaurantWorkspace = readFileSync(
  new URL('../../src/features/restaurant-admin/RestaurantAdminWorkspace.tsx', import.meta.url),
  'utf8'
);
const orderDetails = readFileSync(
  new URL('../../src/features/restaurant-admin/OrderDetailsPanel.tsx', import.meta.url),
  'utf8'
);
const legacyRestaurantShell = readFileSync(
  new URL('../../src/pages/catalog-admin/RestaurantAdminShell.tsx', import.meta.url),
  'utf8'
);

test('pre-activation restaurants are public test catalogs without enabling real orders', () => {
  assert.ok(migrationName, 'pre-activation test catalog migration must exist');
  assert.match(migration, /function public\.can_catalog_accept_test_orders\(target_catalog_id uuid\)/i);
  assert.match(
    migration,
    /legal_activation_status\s*=\s*any\s*\(array\[\s*'draft','configured','awaiting_acceptance','legacy_review_required','reacceptance_required'/i
  );
  assert.match(migration, /function public\.can_catalog_be_public\(target_catalog_id uuid\)/i);
  assert.match(migration, /can_catalog_accept_real_orders\(target_catalog_id\)[\s\S]*can_catalog_accept_test_orders\(target_catalog_id\)/i);
  assert.match(migration, /function public\.is_catalog_published\(target_catalog_id uuid\)[\s\S]*can_catalog_be_public\(catalog\.id\)/i);
  assert.match(migration, /create policy "catalogs public read published"[\s\S]*can_catalog_be_public\(catalogs\.id\)/i);
  assert.match(migration, /create policy "restaurants public read active"[\s\S]*can_catalog_be_public\(restaurants\.catalog_id\)/i);
  assert.match(migration, /not catalogs\.is_test or public\.current_actor_is_test\(\)/i);
  assert.match(migration, /not restaurants\.is_test or public\.current_actor_is_test\(\)/i);
});

test('new and existing eligible restaurant catalogs are published before legal activation', () => {
  assert.match(migration, /function public\.sync_restaurant_catalog_publication\(\)/i);
  assert.match(migration, /after insert or update of status, legal_activation_status, catalog_id on public\.clients/i);
  assert.match(migration, /update public\.catalogs[\s\S]*when should_publish then 'published'::public\.catalog_status/i);
  assert.match(migration, /client\.status\s*=\s*'active'[\s\S]*client\.legal_activation_status\s*=\s*any/i);
  assert.doesNotMatch(migration, /if\s+public\.can_catalog_accept_real_orders\(new\.catalog_id\)[\s\S]{0,300}update public\.catalogs/i);
});

test('orders created before activation are forced into test scope and remain test orders', () => {
  assert.match(migration, /function public\.enforce_order_test_scope\(\)/i);
  assert.match(migration, /catalog_accepts_test_orders\s*:=\s*public\.can_catalog_accept_test_orders\(new\.catalog_id\)/i);
  assert.match(migration, /new\.is_test_order\s*:=\s*catalog_is_test\s+or\s+catalog_accepts_test_orders/i);
  assert.match(migration, /new\.is_test_order\s*:=\s*old\.is_test_order\s+or\s+catalog_is_test\s+or\s+catalog_accepts_test_orders/i);
  assert.match(migration, /function public\.enforce_restaurant_order_activation_gate\(\)[\s\S]*can_catalog_accept_test_orders\(new\.catalog_id\)/i);
});

test('activation is blocked until all test orders are deleted and real orders cannot be deleted by the test-order RPC', () => {
  assert.match(migration, /function public\.require_no_test_orders_before_restaurant_activation\(\)/i);
  assert.match(migration, /before update of legal_activation_status on public\.clients/i);
  assert.match(migration, /legal_activation_status\s*=\s*'active'/i);
  assert.match(migration, /order_row\.is_test_order/i);
  assert.match(migration, /restaurant_test_orders_must_be_deleted/i);
  assert.match(
    migration,
    /function public\.delete_restaurant_test_order\([\s\S]*delete from public\.orders[\s\S]*and is_test_order is true/i
  );
});

test('the migration changes no tables destructively', () => {
  assert.doesNotMatch(migration, /drop table|truncate table/i);
});

test('the restaurant cabinet offers deletion only for orders confirmed as test orders', () => {
  assert.match(ordersApi, /is_test_order/);
  assert.match(ordersApi, /isTestOrder:\s*row\.is_test_order\s*===\s*true/);
  assert.match(restaurantWorkspace, /order\.isTestOrder\s*&&\s*\([\s\S]{0,600}Удалить заказ/i);
  assert.match(orderDetails, /order\.isTestOrder\s*&&\s*\([\s\S]{0,600}Удалить заказ/i);
  assert.match(legacyRestaurantShell, /order\.isTestOrder\s*&&\s*\([\s\S]{0,600}Удалить заказ/i);
});
