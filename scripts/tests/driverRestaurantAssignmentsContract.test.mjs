import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const migration = read('supabase/migrations/20260809200719_save_driver_restaurant_assignments.sql');
const driversApi = read('src/shared/api/driversApi.ts');

describe('platform driver restaurant assignment contract', () => {
  it('allows only an authenticated platform admin to save the relationship set', () => {
    assert.match(migration, /auth\.uid\(\) is null or not public\.is_platform_admin\(\)/);
    assert.match(migration, /revoke all on function public\.save_driver_restaurant_assignments\(uuid, jsonb\) from public, anon/);
    assert.match(migration, /grant execute on function public\.save_driver_restaurant_assignments\(uuid, jsonb\) to authenticated/);
  });

  it('rejects invalid courier types, duplicate restaurants and unknown restaurants', () => {
    assert.match(migration, /courier_type not in \('staff_salaried', 'independent'\)/);
    assert.match(migration, /having count\(\*\) > 1[\s\S]*duplicate_restaurant_assignment/);
    assert.match(migration, /left join public\.restaurants[\s\S]*restaurant_not_found/);
  });

  it('preserves relationship history and replaces the active set atomically', () => {
    assert.doesNotMatch(migration, /delete from public\.restaurant_couriers/i);
    assert.match(migration, /set is_active = false,[\s\S]*is_primary = false/);
    assert.match(migration, /on conflict on constraint restaurant_couriers_restaurant_id_driver_id_key/);
    assert.match(migration, /courier_type = excluded\.courier_type/);
  });

  it('keeps one primary courier per restaurant and sends all shared fields from the client', () => {
    assert.match(migration, /where coalesce\(assignment\.is_primary, false\)[\s\S]*courier\.restaurant_id = assignment\.restaurant_id/);
    assert.match(driversApi, /save_driver_restaurant_assignments/);
    assert.match(driversApi, /restaurant_id: assignment\.restaurantId/);
    assert.match(driversApi, /is_primary: assignment\.isPrimary/);
    assert.match(driversApi, /courier_type: assignment\.courierType/);
  });
});
