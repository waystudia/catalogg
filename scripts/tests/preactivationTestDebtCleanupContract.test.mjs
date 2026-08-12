import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migrationsUrl = new URL('../../supabase/migrations/', import.meta.url);

test('deleting a preactivation test order removes only its test ledger rows and refreshes test balances', async () => {
  const migrationName = (await readdir(migrationsUrl))
    .find((name) => name.endsWith('_preactivation_test_debt_cleanup.sql'));

  assert.ok(migrationName, 'preactivation test debt cleanup migration is required');
  const migration = await readFile(new URL(migrationName, migrationsUrl), 'utf8');

  assert.match(migration, /create or replace function public\.delete_restaurant_test_order/i);
  assert.match(migration, /where order_row\.id = target_order_id[\s\S]*order_row\.is_test_order is true/i);
  assert.match(migration, /delete from public\.billing_ledger_entries[\s\S]*order_id = target_order_id[\s\S]*is_test is true/i);
  assert.match(migration, /update public\.clients[\s\S]*set test_debt_amount =/i);
  assert.match(migration, /update public\.drivers[\s\S]*set test_debt_amount =/i);
  assert.match(migration, /delete from public\.orders[\s\S]*is_test_order is true/i);
  assert.match(migration, /revoke all on function public\.delete_restaurant_test_order\(uuid, uuid\)/i);
  assert.match(migration, /grant execute on function public\.delete_restaurant_test_order\(uuid, uuid\) to authenticated/i);
});
