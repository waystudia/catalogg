import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260913180312_add_delivery_handoff_confirmation.sql', import.meta.url),
  'utf8'
);
const edgeFunction = readFileSync(
  new URL('../../supabase/functions/sign-yandex-navigator-route/index.ts', import.meta.url),
  'utf8'
);

describe('Yandex Navigator server contract', () => {
  it('keeps signed routes and quota counters server-only', () => {
    assert.match(migration, /revoke all on table public\.yandex_navigator_route_sessions from public, anon, authenticated/i);
    assert.match(migration, /revoke all on table public\.yandex_navigator_transition_events from public, anon, authenticated/i);
    assert.match(migration, /pg_advisory_xact_lock/i);
    assert.match(migration, /yandex_navigator_daily_limit_reached/i);
  });

  it('reuses the delivery route unless the driver explicitly requests a rebuild', () => {
    assert.match(edgeFunction, /!rebuildReason && typeof existing\?\.signed_url === 'string'/);
    assert.match(edgeFunction, /YANDEX_NAVIGATOR_PRIVATE_KEY/);
    assert.match(edgeFunction, /sign\('RSA-SHA256'/);
    assert.match(edgeFunction, /reserve_yandex_navigator_transition/);
  });

  it('allows final completion only after driver and client confirmations', () => {
    assert.match(migration, /create or replace function public\.confirm_driver_delivery_handoff/i);
    assert.match(migration, /create or replace function public\.confirm_client_order_receipt/i);
    assert.match(migration, /d\.driver_handed_to_client_at is not null\s+and d\.client_received_at is not null/i);
  });
});
