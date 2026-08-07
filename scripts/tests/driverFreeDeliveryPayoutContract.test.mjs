import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const repoRoot = resolve(import.meta.dirname, '../..');
const migrationName = readdirSync(resolve(repoRoot, 'supabase/migrations'))
  .find((name) => name.endsWith('_fix_platform_driver_free_delivery_earnings.sql'));
const migration = migrationName
  ? readFileSync(resolve(repoRoot, 'supabase/migrations', migrationName), 'utf8')
  : '';

test('platform drivers receive the configured payout when delivery is free for the client', () => {
  assert.ok(migrationName, 'Create the payout repair through `supabase migration new`');
  assert.match(migration, /resolved_courier_type\s*:=\s*coalesce\(resolved_courier_type,\s*'independent'\)/i);
  assert.match(migration, /elsif resolved_courier_type = 'independent' then[\s\S]*if threshold_reached then[\s\S]*new\.amount := configured_payout/i);
  assert.match(migration, /new\.commission := configured_commission/i);
});

test('historical repair is limited to completed isolated E2E earnings', () => {
  assert.match(migration, /update public\.earnings[\s\S]*set amount = policy\.free_delivery_driver_payout/i);
  assert.match(migration, /earning\.is_test is true/i);
  assert.match(migration, /delivery\.is_test is true/i);
  assert.match(migration, /order_row\.is_test_order is true/i);
  assert.match(migration, /delivery\.status = 'delivered'/i);
  assert.match(migration, /earning\.amount = 0/i);
  assert.doesNotMatch(migration, /where[\s\S]*is_test is false/i);
  assert.match(migration, /free_delivery_driver_payout[\s\S]*on conflict \(event_key\) do nothing/i);
});

test('E2E finance assertion verifies payout, commission, isolation, and exact-once ledger rows', () => {
  assert.match(migration, /get_wayyaam_e2e_order_finance\(target_order_id uuid\)/i);
  assert.match(migration, /restaurant_charge_count/i);
  assert.match(migration, /driver_charge_count/i);
  assert.match(migration, /driver_payout_count/i);
  assert.match(migration, /expected_earning_amount/i);
  assert.match(migration, /earning_amount/i);
  assert.match(migration, /earning_commission/i);
  assert.match(migration, /earning_net_amount/i);
  assert.match(migration, /revoke all on function public\.get_wayyaam_e2e_order_finance\(uuid\) from public, anon/i);
});
