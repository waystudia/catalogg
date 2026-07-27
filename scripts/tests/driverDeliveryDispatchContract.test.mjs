import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sql = readFileSync(resolve(repoRoot, 'supabase/waycatalog_delivery.sql'), 'utf8');
const driverOfferFixSql = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260727113000_fix_driver_offer_restaurant_map_url.sql'),
  'utf8'
);
const restaurantApi = readFileSync(resolve(repoRoot, 'src/shared/api/restaurantOrdersApi.ts'), 'utf8');
const driverApi = readFileSync(resolve(repoRoot, 'src/shared/api/deliveryApi.ts'), 'utf8');
const driverApp = readFileSync(resolve(repoRoot, 'src/pages/driver/DriverApp.tsx'), 'utf8');
const driverStore = readFileSync(resolve(repoRoot, 'src/features/driver/store.ts'), 'utf8');

const extractFunction = (name) => {
  const marker = `create or replace function public.${name}`;
  const start = sql.indexOf(marker);
  assert.notEqual(start, -1, `${name} RPC is missing`);
  const afterStart = sql.slice(start);
  const end = afterStart.indexOf('\n$$;');
  assert.notEqual(end, -1, `${name} RPC body is incomplete`);
  return afterStart.slice(0, end + 4);
};

describe('restaurant to driver delivery contract', () => {
  it('dispatches the delivery and order status in one authorized database transaction', () => {
    const functionSql = extractFunction('dispatch_restaurant_order_to_delivery');

    assert.match(functionSql, /security definer/);
    assert.match(functionSql, /public\.is_catalog_member/);
    assert.match(functionSql, /insert into public\.deliveries/);
    assert.match(functionSql, /insert into public\.delivery_tasks/);
    assert.match(functionSql, /update public\.orders[\s\S]*status = 'waiting_driver'/);
    assert.ok(
      functionSql.indexOf('insert into public.deliveries') < functionSql.indexOf("status = 'waiting_driver'"),
      'delivery must be created before the order is exposed as waiting_driver'
    );
    assert.match(restaurantApi, /rpc\('dispatch_restaurant_order_to_delivery'/);
  });

  it('returns only eligible online offers and masks client PII until assignment', () => {
    const eligibilitySql = extractFunction('driver_serves_delivery_location');
    const offersSql = extractFunction('get_driver_delivery_offers');

    assert.match(eligibilitySql, /is_active/);
    assert.match(eligibilitySql, /is_online/);
    assert.match(eligibilitySql, /service_settlements/);
    assert.match(eligibilitySql, /translate\(coalesce\(target_city/);
    assert.match(eligibilitySql, /position\(served_place\.place in normalized_target\)/);
    assert.match(offersSql, /public\.driver_serves_delivery_location/);
    assert.doesNotMatch(offersSql, /d\.created_at >= now\(\) - interval '2 days'/);
    assert.match(offersSql, /case when d\.driver_id = viewer_driver_id then o\.customer_name else '' end/);
    assert.match(offersSql, /case when d\.driver_id = viewer_driver_id then o\.customer_phone else '' end/);
    assert.match(offersSql, /case when d\.driver_id = viewer_driver_id then o\.delivery_comment else null end/);
    assert.match(driverApi, /rpc\('get_driver_delivery_offers'\)/);
    assert.doesNotMatch(offersSql, /r\.map_url/);
    assert.doesNotMatch(driverOfferFixSql, /r\.map_url/);
    assert.match(driverOfferFixSql, /'map_url', coalesce\(c\.map_url, ''\)/);
    assert.match(driverApi, /if \(deliveriesResult\.error\) throw deliveriesResult\.error/);
    assert.doesNotMatch(driverApi, /\.from\('deliveries'\)[\s\S]{0,500}\.select\(/);
  });

  it('uses the database driver status as the single online source of truth', () => {
    assert.doesNotMatch(driverStore, /\bisOnline:/);
    assert.doesNotMatch(driverStore, /\bsetOnline:/);
    assert.match(driverStore, /bindDriver:/);
    assert.match(driverApp, /snapshot\.profile\.isOnline/);
    assert.doesNotMatch(driverApp, /useDriverStore\(\(state\) => state\.isOnline\)/);
    assert.match(driverApp, /setOptimisticOnline\(nextOnline\)[\s\S]{0,200}await setDriverAvailability[\s\S]{0,100}void onRefresh\(\)/);
    assert.doesNotMatch(driverApp, /await setDriverAvailability[\s\S]{0,200}await onRefresh\(\)/);
    assert.match(driverApp, /if \(!authChecked \|\| !hasDriverAccess \|\| selectedDriverId === demoDriverId\) return/);
    assert.match(driverApp, /window\.setInterval\(refreshWhenVisible, 30_000\)/);
  });

  it('allows only the authenticated eligible driver to accept an offer', () => {
    const acceptSql = extractFunction('accept_available_delivery');
    assert.match(acceptSql, /target_driver_id is distinct from public\.current_driver_id\(\)/);
    assert.match(acceptSql, /public\.driver_serves_delivery_location/);
  });

  it('lets only the assigned driver confirm pickup without QR and advances the order atomically', () => {
    const pickupSql = extractFunction('confirm_driver_pickup');

    assert.match(pickupSql, /public\.current_driver_id\(\)/);
    assert.match(pickupSql, /update public\.deliveries[\s\S]*status = 'handed_over'/);
    assert.match(pickupSql, /where id = target_delivery_id[\s\S]*driver_id = viewer_driver_id[\s\S]*status = 'arrived_to_restaurant'/);
    assert.match(pickupSql, /returning order_id into target_order_id/);
    assert.match(pickupSql, /update public\.orders[\s\S]*status = 'picked_up'/);
    assert.match(driverApi, /rpc\('confirm_driver_pickup'/);
  });
});
