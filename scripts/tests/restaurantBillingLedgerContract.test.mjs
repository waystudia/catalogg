import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '../..');
const migrationName = readdirSync(resolve(repoRoot, 'supabase/migrations'))
  .find((name) => name.endsWith('_restaurant_financial_ledger_and_courier_types.sql'));

test('financial migration exists', () => {
  assert.ok(migrationName, 'Create the migration through `supabase migration new restaurant_financial_ledger_and_courier_types`');
});

const migrationSql = migrationName
  ? readFileSync(resolve(repoRoot, 'supabase/migrations', migrationName), 'utf8')
  : '';

test('courier type is relationship-specific and existing links remain unclassified', () => {
  assert.match(migrationSql, /restaurant_couriers[\s\S]*courier_type text/);
  assert.match(migrationSql, /courier_type in \('staff_salaried', 'independent'\)/);
  assert.match(migrationSql, /link_restaurant_courier_by_email\([\s\S]*target_courier_type text/);
  assert.match(migrationSql, /courier_type is null[\s\S]*courier_type_required/);
});

test('ledger is append-only, RLS-protected and idempotent per business event', () => {
  assert.match(migrationSql, /create table if not exists public\.billing_ledger_entries/);
  assert.match(migrationSql, /event_key text not null unique/);
  assert.match(migrationSql, /ledger_scope in \('platform_debt', 'courier_payable'\)/);
  assert.match(migrationSql, /alter table public\.billing_ledger_entries enable row level security/);
  assert.match(migrationSql, /revoke all on public\.billing_ledger_entries from public, anon, authenticated/);
  assert.match(migrationSql, /on conflict \(event_key\) do nothing/);
});

test('accepted real order charges the restaurant once using the active tariff', () => {
  assert.match(migrationSql, /record_restaurant_order_commission/);
  assert.match(migrationSql, /restaurant_order_commission/);
  assert.match(migrationSql, /new\.accepted_at is not null[\s\S]*old\.accepted_at is null/);
  assert.match(migrationSql, /can_catalog_accept_real_orders/);
  assert.match(migrationSql, /coalesce\(new\.is_test_order, false\) = false/);
});

test('completed delivery charges the payer selected by courier type and records the free-delivery payout separately', () => {
  assert.match(migrationSql, /when resolved_courier_type = 'staff_salaried'[\s\S]*restaurant_delivery_commission/);
  assert.match(migrationSql, /when resolved_courier_type = 'independent'[\s\S]*driver_delivery_commission/);
  assert.match(migrationSql, /free_delivery_threshold_reached[\s\S]*free_delivery_driver_payout/);
  assert.match(migrationSql, /'courier_payable'/);
  assert.match(migrationSql, /drop trigger if exists earnings_refresh_driver_debt on public\.earnings/);
  assert.match(migrationSql, /ledger_scope = 'platform_debt'/);
});

test('privileged finance functions are not executable by public or anonymous users', () => {
  assert.match(migrationSql, /revoke all on function public\.record_restaurant_order_commission/);
  assert.match(migrationSql, /revoke all on function public\.refresh_billing_account_debt/);
  assert.match(migrationSql, /revoke all on function public\.complete_driver_delivery\(uuid\) from public, anon/);
});
