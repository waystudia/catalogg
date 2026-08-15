import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../supabase/migrations/20260815123000_add_incremental_grocery_item_scanning.sql',
  import.meta.url
);
const apiUrl = new URL('../../src/shared/api/orderConversationApi.ts', import.meta.url);

test('piece scanning increments one unit under a row lock and resolves only at the requested quantity', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create or replace function public\.scan_catalog_order_item/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /public\.can_work_catalog_order/i);
  assert.match(sql, /sale_unit_snapshot\s*<>\s*'piece'/i);
  assert.match(sql, /least\(requested_quantity, current_quantity \+ 1\)/i);
  assert.match(sql, /when next_quantity = requested_quantity then 'picked'/i);
  assert.match(sql, /jsonb_build_object[\s\S]*'fulfilled_quantity'[\s\S]*'requested_quantity'[\s\S]*'state'/i);
  assert.match(sql, /revoke all on function public\.scan_catalog_order_item\(uuid\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.scan_catalog_order_item\(uuid\) to authenticated, service_role/i);
});

test('store scanner calls the incremental RPC instead of resolving a multi-piece line at once', async () => {
  const api = await readFile(apiUrl, 'utf8');

  assert.match(api, /export async function scanCatalogOrderItem/i);
  assert.match(api, /rpc\('scan_catalog_order_item'/i);
  assert.match(api, /fulfilledQuantity:\s*number\(/i);
  assert.match(api, /requestedQuantity:\s*number\(/i);
});
