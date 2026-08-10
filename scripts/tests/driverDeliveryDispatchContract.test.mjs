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
const cashHandoverSql = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260730180401_enforce_cash_driver_handover.sql'),
  'utf8'
);
const driverDashboardProfileSql = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260730205305_add_driver_dashboard_profile_rpc.sql'),
  'utf8'
);
const driverDashboardBundleSql = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260730213431_add_driver_dashboard_bundle_rpc.sql'),
  'utf8'
);
const restaurantQrFallbackSql = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260730223000_add_restaurant_qr_token_fallback.sql'),
  'utf8'
);

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
    assert.match(driverApi, /loadDriverDeliveryOffers/);
    assert.match(driverApi, /20_000/);
    assert.match(driverApi, /firstAttempt\.error[\s\S]{0,500}get_driver_delivery_offers/);
    assert.doesNotMatch(offersSql, /r\.map_url/);
    assert.doesNotMatch(driverOfferFixSql, /r\.map_url/);
    assert.match(driverOfferFixSql, /'map_url', coalesce\(c\.map_url, ''\)/);
    assert.match(driverApi, /if \(deliveriesResult\.error\) throw deliveriesResult\.error/);
    assert.match(driverApi, /rpc\('confirm_delivery_pickup_qr_by_token'/);
  });

  it('uses the database driver status as the single online source of truth', () => {
    assert.doesNotMatch(driverStore, /\bisOnline:/);
    assert.doesNotMatch(driverStore, /\bsetOnline:/);
    assert.match(driverStore, /bindDriver:/);
    assert.match(driverApp, /snapshot\.profile\.isOnline/);
    assert.doesNotMatch(driverApp, /useDriverStore\(\(state\) => state\.isOnline\)/);
    assert.match(driverApp, /setOptimisticOnline\(nextOnline\)[\s\S]{0,650}await setDriverAvailability[\s\S]{0,100}void onRefresh\(\)/);
    assert.doesNotMatch(driverApp, /await setDriverAvailability[\s\S]{0,200}await onRefresh\(\)/);
    assert.match(driverApp, /if \(!authChecked \|\| !hasDriverAccess \|\| selectedDriverId === demoDriverId\) return/);
    assert.match(driverApp, /window\.setInterval\(refreshDriverDashboard, 10_000\)/);
  });

  it('loads the driver profile without a recursive drivers RLS query and makes manual refresh observable', () => {
    assert.match(driverDashboardProfileSql, /create or replace function public\.get_current_driver_dashboard_profile\(\)/);
    assert.match(driverDashboardProfileSql, /returns jsonb/);
    assert.match(driverDashboardProfileSql, /security definer/);
    assert.match(driverDashboardProfileSql, /viewer_driver_id uuid := public\.current_driver_id\(\)/);
    assert.match(driverDashboardProfileSql, /jsonb_build_object\(/);
    assert.match(driverDashboardProfileSql, /grant execute on function public\.get_current_driver_dashboard_profile\(\) to authenticated/);
    assert.match(driverDashboardBundleSql, /create or replace function public\.get_current_driver_dashboard_data\(\)/);
    assert.match(driverDashboardBundleSql, /'profile',\s*public\.get_current_driver_dashboard_profile\(\)/);
    assert.match(driverDashboardBundleSql, /'deliveries',\s*public\.get_driver_delivery_offers\(\)/);
    assert.match(driverDashboardBundleSql, /grant execute on function public\.get_current_driver_dashboard_data\(\) to authenticated/);
    assert.match(driverApi, /rpc\('get_current_driver_dashboard_profile'\)/);
    assert.match(driverApi, /rpc\('get_current_driver_dashboard_data'\)/);
    assert.match(driverApi, /dashboardResult\.data\.profile/);
    assert.match(driverApi, /dashboardResult\.data\.deliveries/);
    assert.doesNotMatch(
      driverApi,
      /\.from\('drivers'\)[\s\S]{0,220}\.select\('id, name, phone, vehicle_info/
    );
    assert.match(driverApp, /const \[isRefreshing, setIsRefreshing\] = useState\(false\)/);
    assert.match(driverApp, /setRefreshMessage\(refreshed \? 'Заказы обновлены'/);
    assert.match(driverApp, /bindDriver\(nextSnapshot\.profile\.id\)/);
    assert.match(driverApp, /aria-busy=\{isRefreshing\}/);
    assert.match(driverApp, /disabled=\{isRefreshing\}/);
    assert.match(driverApp, /if \(!hasSession\)[\s\S]{0,180}setHasDriverAccess\(false\)/);
    assert.doesNotMatch(driverApp, /setHasDriverAccess\(hasSession\)/);
  });

  it('allows only the authenticated eligible driver to accept an offer', () => {
    const acceptSql = extractFunction('accept_available_delivery');
    assert.match(acceptSql, /target_driver_id is distinct from public\.current_driver_id\(\)/);
    assert.match(acceptSql, /public\.driver_serves_delivery_location/);
  });

  it('requires restaurant cash confirmation and restaurant QR verification before driver pickup', () => {
    assert.match(cashHandoverSql, /pickup_qr_confirmed_at timestamptz/);
    assert.match(cashHandoverSql, /create or replace function public\.confirm_restaurant_cash_payment/);
    assert.match(cashHandoverSql, /public\.is_catalog_member/);
    assert.match(cashHandoverSql, /restaurant_payment_confirmed_at/);
    assert.match(cashHandoverSql, /create or replace function public\.confirm_delivery_pickup_qr/);
    assert.match(cashHandoverSql, /pickup_qr_confirmed_at = now\(\)/);
    assert.doesNotMatch(
      cashHandoverSql.match(/create or replace function public\.confirm_delivery_pickup_qr[\s\S]*?(?=create or replace function public\.confirm_driver_pickup)/)?.[0] ?? '',
      /set status = 'handed_over'/
    );
    assert.match(cashHandoverSql, /create or replace function public\.confirm_driver_pickup/);
    assert.match(cashHandoverSql, /qr_confirmed_at is null/);
    assert.match(cashHandoverSql, /payment_method:cash/);
    assert.match(cashHandoverSql, /payment_confirmed_at is null/);
    assert.match(cashHandoverSql, /perform public\.update_current_driver_delivery_status\(target_delivery_id, 'handed_over'\)/);
    assert.match(driverApi, /rpc\('confirm_driver_pickup'/);
    assert.match(restaurantQrFallbackSql, /create or replace function public\.confirm_delivery_pickup_qr_by_token/);
    assert.match(restaurantQrFallbackSql, /lower\(c\.slug\) = lower\(trim\(target_catalog_slug\)\)/);
    assert.match(restaurantQrFallbackSql, /return public\.confirm_delivery_pickup_qr\(target_delivery_id, presented_token\)/);
    assert.match(restaurantQrFallbackSql, /pickup_qr_expires_at > now\(\)/);
    assert.match(restaurantQrFallbackSql, /create or replace function public\.refresh_current_driver_pickup_qr/);
    assert.match(restaurantQrFallbackSql, /viewer_driver_id uuid := public\.current_driver_id\(\)/);
    assert.match(restaurantQrFallbackSql, /pickup_qr_expires_at = now\(\) \+ interval '30 minutes'/);
    assert.match(driverApi, /rpc\('refresh_current_driver_pickup_qr'/);
    assert.match(driverApi, /rpc\('confirm_delivery_pickup_qr_by_token'/);
  });

  it('returns handover gates to the assigned driver and renders the status progress bar', () => {
    assert.match(cashHandoverSql, /'pickup_qr_confirmed_at'/);
    assert.match(cashHandoverSql, /'restaurant_payment_confirmed_at'/);
    assert.match(cashHandoverSql, /'payment_method'/);
    assert.match(driverApp, /driver-delivery-progress/);
    assert.match(driverApp, /getDriverDeliveryProgress/);
  });
});
