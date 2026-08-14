import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL('../../supabase/migrations/20260814103000_separate_grocery_pos_sales_from_orders.sql', import.meta.url);

test('grocery POS migration completes counter sales and disables their workflow side effects', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /create or replace function public\.complete_grocery_pos_order/iu);
  assert.match(sql, /payment_status\s*=\s*'confirmed'/iu);
  assert.match(sql, /status\s*=\s*'completed'/iu);
  assert.match(sql, /drop trigger if exists route_new_grocery_order/iu);
  assert.match(sql, /drop trigger if exists order_status_chat_message/iu);
  assert.match(sql, /store_pos_order_conversation_not_available/iu);
  assert.match(sql, /delete from public\.order_messages/iu);
  assert.match(sql, /delete from public\.order_work_assignments/iu);
});
