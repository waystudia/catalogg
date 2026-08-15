import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationName = readdirSync(resolve(repoRoot, 'supabase/migrations'))
  .find((name) => name.endsWith('_combined_order_courier_stops.sql'));
const migration = migrationName
  ? readFileSync(resolve(repoRoot, 'supabase/migrations', migrationName), 'utf8')
  : '';
const api = readFileSync(resolve(repoRoot, 'src/shared/api/deliveryApi.ts'), 'utf8');
const driver = readFileSync(resolve(repoRoot, 'src/pages/driver/DriverApp.tsx'), 'utf8');

describe('combined-order courier stops contract', () => {
  it('returns every assigned delivery with its ordered generic stops', () => {
    assert.ok(migrationName, 'combined-order courier migration must exist');
    assert.match(migration, /create or replace function public\.get_driver_delivery_offers\(\)/i);
    assert.match(migration, /'delivery_stops'/i);
    assert.match(migration, /order by delivery_stop\.sequence/i);
    assert.match(migration, /delivery\.driver_id = viewer_driver\.id/i);
  });

  it('lets only the assigned courier advance the first unfinished stop in order', () => {
    assert.match(migration, /create or replace function public\.update_current_driver_delivery_stop\(/i);
    assert.match(migration, /public\.current_driver_id\(\)/i);
    assert.match(migration, /delivery\.driver_id = viewer_driver_id/i);
    assert.match(migration, /order by candidate_stop\.sequence[\s\S]*?limit 1/i);
    assert.match(migration, /active_stop_id <> target_stop_id/i);
    assert.match(migration, /next_status not in \('arrived', 'completed'\)/i);
    assert.match(migration, /current_stop\.status <> 'arrived'/i);
  });

  it('protects the primary pickup, completes one delivery, and writes audit events', () => {
    assert.match(migration, /pickup_qr_confirmed_at is null/i);
    assert.match(migration, /restaurant_payment_confirmed_at is null/i);
    assert.match(migration, /perform public\.complete_driver_delivery\(target_delivery_id\)/i);
    assert.match(migration, /update public\.order_groups/i);
    assert.match(migration, /'COURIER_PICKED_UP'|'DELIVERY_COMPLETED'/i);
    assert.match(
      migration,
      /grant execute on function public\.update_current_driver_delivery_stop\(uuid, uuid, text\)\s+to authenticated/i
    );
  });

  it('maps stops into the existing multi-active delivery model and reuses the current map', () => {
    assert.match(api, /readonly stops: readonly DriverDeliveryStop\[\]/);
    assert.match(api, /updateCurrentDriverDeliveryStop/);
    assert.match(driver, /CombinedDeliveryStopsPanel/);
    assert.match(driver, /getCombinedDeliveryRoutePoints/);
    assert.match(driver, /editorPoints=/);
  });
});
