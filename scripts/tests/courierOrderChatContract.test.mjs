import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260814093000_add_courier_order_chat_status_messages.sql'),
  'utf8'
);
const pushSource = readFileSync(resolve(repoRoot, 'supabase/functions/send-web-push/index.ts'), 'utf8');

describe('courier order chat database contract', () => {
  it('authorizes only the assigned driver and records driver messages through dedicated RPCs', () => {
    assert.match(migration, /create or replace function public\.is_current_order_driver/i);
    assert.match(migration, /delivery\.driver_id = public\.current_driver_id\(\)/i);
    assert.match(migration, /create or replace function public\.get_driver_order_conversation/i);
    assert.match(migration, /create or replace function public\.send_driver_order_message/i);
    assert.match(migration, /'driver',[\s\S]*'text'/i);
    assert.match(migration, /sender_kind in \('client', 'staff', 'driver', 'system'\)/i);
  });

  it('stores idempotent order and delivery status events with real configured estimates', () => {
    assert.match(migration, /order_messages_order_event_key_idx/i);
    assert.match(migration, /message_type in \('text', 'substitution_offer', 'substitution_decision', 'picking_event', 'status_event'\)/i);
    assert.match(migration, /default_preparation_minutes/i);
    assert.match(migration, /estimated_time_min/i);
    assert.match(migration, /record_order_status_chat_message/i);
    assert.match(migration, /record_delivery_status_chat_message/i);
    assert.match(migration, /on conflict do nothing/i);
  });

  it('routes courier and status-event push notifications to order participants', () => {
    assert.match(pushSource, /senderKind === 'driver'/);
    assert.match(pushSource, /messageType === 'status_event'/);
    assert.match(pushSource, /role', 'client'/);
    assert.match(pushSource, /role', 'restaurant'/);
    assert.match(pushSource, /role', 'driver'/);
  });
});
