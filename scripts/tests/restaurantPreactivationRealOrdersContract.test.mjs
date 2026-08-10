import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationName = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
  .filter((name) => name.endsWith('_restaurant_preactivation_real_orders.sql'))
  .sort()
  .at(-1);

const migration = migrationName
  ? readFileSync(new URL(`../../supabase/migrations/${migrationName}`, import.meta.url), 'utf8')
  : '';
const ordersApi = readFileSync(
  new URL('../../src/shared/api/restaurantOrdersApi.ts', import.meta.url),
  'utf8'
);

test('ordinary restaurants accept production-scoped orders before legal activation', () => {
  assert.ok(migrationName, 'pre-activation real-order migration must exist');
  assert.match(migration, /function public\.can_catalog_accept_preactivation_orders\(target_catalog_id uuid\)/i);
  assert.match(
    migration,
    /legal_activation_status\s*=\s*any\s*\(array\[\s*'draft','configured','awaiting_acceptance','legacy_review_required','reacceptance_required'/i
  );
  assert.match(
    migration,
    /function public\.can_catalog_accept_real_orders\(target_catalog_id uuid\)[\s\S]*can_catalog_accept_preactivation_orders\(target_catalog_id\)/i
  );
  assert.match(
    migration,
    /function public\.enforce_order_test_scope\(\)[\s\S]*new\.is_test_order\s*:=\s*catalog_is_test/i
  );
  assert.doesNotMatch(
    migration,
    /new\.is_test_order\s*:=\s*(?:old\.is_test_order\s+or\s+)?catalog_is_test\s+or\s+catalog_accepts_test_orders/i
  );
});

test('existing pre-activation orders and delivery records leave test scope without touching explicit E2E catalogs', () => {
  assert.match(
    migration,
    /update public\.orders[\s\S]*set is_test_order = false[\s\S]*catalog\.is_test is false[\s\S]*client\.legal_activation_status\s*=\s*any/i
  );
  assert.match(
    migration,
    /update public\.deliveries[\s\S]*set is_test = false[\s\S]*order_row\.is_test_order is false/i
  );
  assert.match(
    migration,
    /update public\.billing_ledger_entries[\s\S]*set is_test = false[\s\S]*order_row\.is_test_order is false/i
  );
  assert.match(migration, /catalog\.is_test is false/i);
});

test('legacy restaurant courier links receive the existing independent default', () => {
  assert.match(
    migration,
    /update public\.restaurant_couriers[\s\S]*set courier_type = 'independent'[\s\S]*courier\.courier_type is null/i
  );
});

test('a restaurant can delete its own pre-activation order and all related financial rows', () => {
  assert.match(migration, /function public\.delete_restaurant_preactivation_order\(/i);
  assert.match(migration, /if target_legal_status = 'active'[\s\S]*preactivation_order_deletion_not_allowed/i);
  assert.match(migration, /delete from public\.billing_ledger_entries[\s\S]*order_id = target_order_id/i);
  assert.match(migration, /delete from public\.earnings[\s\S]*delivery_id = any/i);
  assert.match(migration, /delete from public\.orders[\s\S]*id = target_order_id/i);
  assert.match(migration, /debt_amount = balances\.debt_amount/i);
  assert.match(migration, /test_debt_amount = balances\.test_debt_amount/i);
  assert.match(migration, /debt_limit_reached_at = case[\s\S]*balances\.debt_amount < policy\.debt_limit_amount then null/i);
  assert.match(migration, /grant execute on function public\.delete_restaurant_preactivation_order\(uuid, uuid\) to authenticated/i);
  assert.match(ordersApi, /deleteRestaurantPreactivationOrder/);
  assert.match(ordersApi, /rpc\('delete_restaurant_preactivation_order'/);
});

test('activation no longer requires deleting production-scoped pre-activation orders', () => {
  assert.match(migration, /drop trigger if exists clients_require_no_test_orders_before_activation/i);
  assert.doesNotMatch(migration, /restaurant_test_orders_must_be_deleted/i);
});

test('the migration remains additive and scoped', () => {
  assert.doesNotMatch(migration, /drop table|truncate table/i);
});
