import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../supabase/migrations/20260812235500_add_grocery_picking_substitutions.sql',
  import.meta.url
);

test('grocery substitution workflow is auditable, tenant scoped, and client controlled', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create table if not exists public\.order_substitution_requests/i);
  assert.match(sql, /create table if not exists public\.order_messages/i);
  assert.match(sql, /create table if not exists public\.order_payment_adjustments/i);
  assert.match(sql, /foreign key \(catalog_id, order_id, original_order_item_id\)/i);
  assert.match(sql, /create or replace function public\.propose_catalog_order_substitution/i);
  assert.match(sql, /create or replace function public\.resolve_order_substitution/i);
  assert.match(sql, /create or replace function public\.is_client_session_order_client/i);
  assert.match(sql, /client_account_sessions/i);
  assert.match(sql, /alternative_requested/i);
  assert.match(sql, /create or replace function public\.send_order_message/i);
  assert.match(sql, /protect_client_order_push_subscription/i);
  assert.match(sql, /platform_user\.auth_user_id = new\.user_id/i);
  assert.match(sql, /account\.phone_normalized = public\.normalize_client_phone/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on function public\.resolve_order_substitution/i);
});
