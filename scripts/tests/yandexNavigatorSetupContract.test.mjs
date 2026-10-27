import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20261025185146_restore_yandex_navigator_routes.sql', import.meta.url),
  'utf8'
);
const edgeFunction = readFileSync(
  new URL('../../supabase/functions/sign-yandex-navigator-route/index.ts', import.meta.url),
  'utf8'
);
const driverSource = readFileSync(
  new URL('../../src/pages/driver/DriverApp.tsx', import.meta.url),
  'utf8'
);

describe('Yandex Navigator server contract', () => {
  it('keeps signed routes and quota counters server-only', () => {
    assert.match(migration, /revoke all on table public\.yandex_navigator_route_sessions from public, anon, authenticated/i);
    assert.match(migration, /revoke all on table public\.yandex_navigator_transition_events from public, anon, authenticated/i);
    assert.match(migration, /pg_advisory_xact_lock/i);
    assert.match(migration, /yandex_navigator_daily_limit_reached/i);
  });

  it('reuses a delivery route unless a driver explicitly requests a rebuild', () => {
    assert.match(edgeFunction, /!rebuildReason && typeof existing\?\.signed_url === 'string'/);
    assert.match(edgeFunction, /YANDEX_NAVIGATOR_PRIVATE_KEY/);
    assert.match(edgeFunction, /sign\('RSA-SHA256'/);
    assert.match(edgeFunction, /reserve_yandex_navigator_transition/);
  });

  it('makes the signed Navigator route primary in the driver interface', () => {
    assert.match(driverSource, /Открыть маршрут в Навигаторе/);
    assert.match(driverSource, /getDriverNavigatorRouteUrl/);
    assert.match(driverSource, /buildYandexNavigatorReturnUrl/);
  });
});
