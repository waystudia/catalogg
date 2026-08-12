import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const migrationsDir = resolve(repoRoot, 'supabase/migrations');
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith('_add_premium_driver_dispatch.sql')
);
const platformTypes = read('src/shared/api/platformTypes.ts');
const driversApi = read('src/shared/api/driversApi.ts');
const driversPage = read('src/features/platform-admin-drivers/PlatformDriversPage.tsx');
const pushSource = read('supabase/functions/send-web-push/index.ts');

describe('premium driver dispatch', () => {
  it('stores and exposes premium status in the super admin driver directory', () => {
    assert.ok(migrationName, 'premium driver dispatch migration is missing');
    const sql = read(`supabase/migrations/${migrationName}`);

    assert.match(sql, /alter table public\.drivers[\s\S]*add column if not exists is_premium boolean not null default false/);
    assert.match(platformTypes, /isPremium: boolean/);
    assert.match(driversApi, /is_premium/);
    assert.match(driversPage, /Премиум-водитель/);
    assert.match(driversPage, /Премиум получает новые заказы первым/);
  });

  it('allows only a platform admin to change premium status', () => {
    assert.ok(migrationName, 'premium driver dispatch migration is missing');
    const sql = read(`supabase/migrations/${migrationName}`);

    assert.match(sql, /create or replace function public\.set_driver_premium/);
    assert.match(sql, /if not public\.is_platform_admin\(\)/);
    assert.match(sql, /raise exception 'Platform admin access is required'/);
    assert.match(sql, /old\.is_premium is distinct from new\.is_premium/);
    assert.match(driversApi, /set_driver_premium/);
  });

  it('treats only online, active, available and location-compatible premium drivers as priority', () => {
    assert.ok(migrationName, 'premium driver dispatch migration is missing');
    const sql = read(`supabase/migrations/${migrationName}`);

    assert.match(sql, /create or replace function public\.has_available_premium_driver/);
    assert.match(sql, /premium_driver\.is_premium/);
    assert.match(sql, /premium_driver\.is_active/);
    assert.match(sql, /premium_driver\.is_online/);
    assert.match(sql, /public\.driver_serves_delivery_location\(\s*premium_driver\.id/);
    assert.match(sql, /premium_active_delivery[\s\S]*max_active_deliveries/);
    assert.match(sql, /target_delivery_provider in \('platform', 'hybrid'\)/);
    assert.match(sql, /target_delivery_provider = 'restaurant'[\s\S]*restaurant_couriers/);
  });

  it('hides premium-priority offers from regular drivers and rejects direct acceptance', () => {
    assert.ok(migrationName, 'premium driver dispatch migration is missing');
    const sql = read(`supabase/migrations/${migrationName}`);

    assert.match(sql, /create or replace function public\.get_driver_delivery_offers\(\)/);
    assert.match(sql, /viewer_driver\.is_premium[\s\S]*not public\.has_available_premium_driver/);
    assert.match(sql, /create or replace function public\.accept_available_delivery\([\s\S]*target_driver_id uuid/);
    assert.match(sql, /not viewer_is_premium[\s\S]*public\.has_available_premium_driver/);
    assert.match(sql, /Delivery is reserved for premium drivers/);
  });

  it('sends a new-delivery push only to eligible premium drivers when any are available', () => {
    assert.match(pushSource, /is_premium/);
    assert.match(pushSource, /selectPriorityDriverSubscriptions\(\s*eligibleDrivers/);
    assert.match(pushSource, /select\('id, driver_id, endpoint, p256dh, auth'\)/);
  });
});
