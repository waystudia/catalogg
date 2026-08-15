import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();
const migrationPath = resolve(root, 'supabase/migrations/20260815142343_client_order_chat_read_state.sql');
const chatCssPath = resolve(root, 'src/features/client-orders/client-order-chat-page.css');

describe('client order chat read-state contract', () => {
  it('counts and marks unread messages only after verifying the order customer', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    assert.match(sql, /add column if not exists client_read_at timestamptz/i);
    assert.match(sql, /get_client_order_chat_unread_counts/i);
    assert.match(sql, /mark_client_order_chat_read/i);
    assert.match(sql, /is_current_order_client/i);
    assert.match(sql, /is_client_session_order_client/i);
    assert.match(sql, /sender_kind in \('staff', 'driver'\)/i);
    assert.match(sql, /revoke all on function public\.get_client_order_chat_unread_counts[\s\S]*from public, anon, authenticated/i);
    assert.match(sql, /grant execute on function public\.mark_client_order_chat_read[\s\S]*to anon, authenticated, service_role/i);
  });

  it('preserves order isolation and excludes store counter sales', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    assert.match(sql, /message\.order_id = order_record\.id/i);
    assert.match(sql, /message\.catalog_id = order_record\.catalog_id/i);
    assert.match(sql, /is_grocery_store_pos_order/i);
    assert.match(sql, /requested_count > 200/i);
  });

  it('keeps the dedicated chat route truly full-screen', async () => {
    const css = await readFile(chatCssPath, 'utf8');
    assert.match(css, /\.client-order-chat-page \+ \.legal-footer\s*\{[\s\S]*display:\s*none/i);
  });
});
