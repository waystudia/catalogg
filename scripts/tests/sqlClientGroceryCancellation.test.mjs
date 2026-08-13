import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260813010100_add_client_grocery_order_cancellation.sql', import.meta.url),
  'utf8'
);

describe('client grocery cancellation migration', () => {
  it('requires the same authenticated or client-session ownership used by chat', () => {
    assert.match(migration, /is_current_order_client/);
    assert.match(migration, /is_client_session_order_client/);
  });

  it('blocks automatic cancellation after picking or substitution starts', () => {
    assert.match(migration, /fulfillment_state <> 'pending'/);
    assert.match(migration, /order_substitution_requests/);
    assert.match(migration, /catalog_order_cancellation_picking_started/);
  });

  it('restores authoritative stock and records the cancellation in the order chat', () => {
    assert.match(migration, /stock_quantity = product\.stock_quantity \+ restored_quantity/);
    assert.match(migration, /status = 'canceled'::public\.order_status/);
    assert.match(migration, /insert into public\.order_messages/);
  });
});
