import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../../supabase/migrations/20261020130000_order_conversation_chat.sql', import.meta.url), 'utf8');

test('order conversation is restricted to verified participants', () => {
  for (const participant of ['client', 'restaurant', 'driver']) {
    assert.match(migration, new RegExp(`order_conversation_for_${participant}`));
    assert.match(migration, new RegExp(`get_${participant}_order_conversation`));
    assert.match(migration, new RegExp(`send_${participant}_order_conversation`));
  }
  assert.match(migration, /client_account_sessions/);
  assert.match(migration, /current_restaurant_client_id\(\)/);
  assert.match(migration, /current_driver_id\(\)/);
  assert.match(migration, /d\.order_id = target_order_id and d\.driver_id = public\.current_driver_id\(\)/);
});

test('order conversation avoids direct table access and preserves function hardening', () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.order_conversation_messages from public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant select on table public\.order_conversation_messages/i);
  assert.match(migration, /security definer set search_path = ''/);
  assert.match(migration, /check \(char_length\(trim\(body\)\) between 1 and 1000\)/);
});
