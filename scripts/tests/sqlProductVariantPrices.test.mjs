import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../supabase/migrations/20260731181609_use_catalog_variant_prices_in_orders.sql', import.meta.url);

test('variant prices are resolved from restaurant settings instead of trusting the public cart payload', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /section\.key = 'product-choices'/);
  assert.match(sql, /trim\(choice\.value ->> 'name'\) = selected_name/);
  assert.match(sql, /new\.unit_price := resolved_price/);
  assert.match(sql, /new\.line_total := resolved_price \* new\.quantity/);
  assert.doesNotMatch(sql, /new\.options #>> '\{0,price\}'/);
  assert.match(sql, /revoke execute on function public\.apply_catalog_variant_price_to_order_item\(\) from public, anon, authenticated/);
});

test('the final order total is recomputed after the existing order RPC finishes', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create constraint trigger recalculate_order_total_after_variant_price/);
  assert.match(sql, /deferrable initially deferred/);
  assert.match(sql, /sum\(item\.line_total\)/);
  assert.match(sql, /total = computed_subtotal \+ coalesce\(delivery_fee, 0\)/);
});
