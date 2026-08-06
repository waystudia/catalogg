import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const migrationSql = readdirSync(resolve(repoRoot, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => read(`supabase/migrations/${name}`))
  .join('\n');
const driversApi = read('src/shared/api/driversApi.ts');
const platformTypes = read('src/shared/api/platformTypes.ts');
const driversPage = read('src/features/platform-admin-drivers/PlatformDriversPage.tsx');
const restaurantApi = read('src/shared/api/restaurantOrdersApi.ts');
const restaurantPanel = read('src/features/restaurant-admin/OrderDetailsPanel.tsx');
const driverApi = read('src/shared/api/deliveryApi.ts');
const driverApp = read('src/pages/driver/DriverApp.tsx');
const mapSource = read('src/shared/DeliveryTrackingMap.tsx');
const pushSource = read('supabase/functions/send-web-push/index.ts');
const deliverySettings = read('src/features/restaurant-settings/DeliverySettingsCard.tsx');
const driverCss = read('src/pages/driver/driver.css');

describe('driver capacity and restaurant priority dispatch', () => {
  it('stores a bounded simultaneous-order capacity for every driver', () => {
    assert.match(migrationSql, /add column if not exists max_active_deliveries/);
    assert.match(migrationSql, /max_active_deliveries between 1 and 10/);
    assert.match(migrationSql, /active_delivery_count[\s\S]*max_active_deliveries/);
    assert.match(platformTypes, /maxActiveDeliveries: number/);
    assert.match(driversApi, /max_active_deliveries/);
    assert.match(driversPage, /Одновременно заказов/);
  });

  it('lets a platform admin link priority couriers to a restaurant', () => {
    assert.match(migrationSql, /restaurant_couriers[\s\S]*is_primary/);
    assert.match(migrationSql, /restaurant_couriers[\s\S]*priority/);
    assert.match(migrationSql, /platform admins manage restaurant couriers/);
    assert.match(driversApi, /getDriverRestaurantAssignments/);
    assert.match(driversApi, /saveDriverRestaurantAssignments/);
    assert.match(driversPage, /Привязка к ресторанам/);
    assert.match(driversPage, /Основной курьер/);
  });

  it('lets a restaurant owner manage own couriers by driver login email', () => {
    assert.match(migrationSql, /link_restaurant_courier_by_email/);
    assert.match(migrationSql, /lower\(coalesce\(d\.email/);
    assert.match(migrationSql, /public\.is_catalog_member\(target_catalog_id/);
    assert.match(
      migrationSql,
      /on conflict on constraint restaurant_couriers_restaurant_id_driver_id_key/
    );
    assert.match(migrationSql, /grant execute on function public\.link_restaurant_courier_by_email/);
    assert.match(restaurantApi, /linkRestaurantCourierByEmail/);
    assert.match(restaurantApi, /removeRestaurantCourier/);
    assert.match(deliverySettings, /E-mail водителя/);
    assert.match(deliverySettings, /Добавить курьера/);
    assert.match(deliverySettings, /Удалить курьера/);
  });

  it('shows linked couriers first and exposes the general pool only as fallback', () => {
    assert.match(restaurantApi, /isPrimary/);
    assert.match(restaurantApi, /activeDeliveries/);
    assert.match(restaurantApi, /maxActiveDeliveries/);
    assert.match(restaurantPanel, /Курьеры ресторана/);
    assert.match(restaurantPanel, /Вызвать таксистов/);
    assert.match(restaurantPanel, /Свободных курьеров ресторана нет/);
    assert.match(migrationSql, /delivery_provider = 'restaurant'/);
    assert.match(migrationSql, /delivery_provider in \('platform', 'hybrid'\)/);
    assert.match(pushSource, /restaurant_couriers/);
    assert.match(pushSource, /max_active_deliveries/);
  });

  it('enforces capacity in the database when an offer is accepted', () => {
    assert.match(migrationSql, /create or replace function public\.accept_available_delivery/);
    assert.match(migrationSql, /active_delivery_count >= driver_capacity/);
    assert.match(migrationSql, /Driver active delivery limit reached/);
    assert.match(migrationSql, /create or replace function public\.assign_restaurant_delivery_driver/);
    assert.match(restaurantApi, /assign_restaurant_delivery_driver/);
    assert.match(driverApi, /accept_available_delivery/);
  });

  it('keeps driver debt synchronized from real commissions', () => {
    assert.match(migrationSql, /refresh_driver_debt_amount/);
    assert.match(migrationSql, /after insert or update or delete on public\.earnings/);
    assert.match(migrationSql, /sum\(coalesce\(e\.commission, 0\)\)/);
  });

  it('opens navigation on a separate full-screen route and restores close follow mode', () => {
    const activeScreen = driverApp.slice(
      driverApp.indexOf('function DriverActiveScreen'),
      driverApp.indexOf('function DriverQrScreen')
    );
    assert.doesNotMatch(activeScreen, /<DeliveryTrackingMap/);
    assert.match(driverApp, /Открыть карту маршрута/);
    assert.match(driverApp, /driver-phone--map/);
    assert.match(mapSource, /const driverFollowMapZoom = 17\.5/);
    assert.match(mapSource, /animateMapZoom\(driverFollowMapZoom\)/);
    assert.match(mapSource, /requestAnimationFrame/);
    assert.match(mapSource, /aria-label="Определить местоположение"/);
  });

  it('keeps restaurant order intake enabled while allowing fulfillment modes to be configured', () => {
    assert.doesNotMatch(deliverySettings, /Принимать заказы/);
    assert.match(deliverySettings, /Заказы в зале/);
    assert.match(deliverySettings, /Самовывоз/);
    assert.match(deliverySettings, /Доставка/);
  });

  it('keeps the full-screen driver map focused on navigation and compact contact actions', () => {
    const mapScreen = driverApp.slice(
      driverApp.indexOf('function DriverMapScreen'),
      driverApp.indexOf('function DriverEarningsScreen')
    );
    assert.match(mapScreen, /getDriverDeliveryProgress/);
    assert.match(mapScreen, /driver-map-sheet/);
    assert.match(mapScreen, /Яндекс Карты/);
    assert.match(mapScreen, /К ресторану и клиенту/);
    assert.match(mapScreen, /Позвонить клиенту/);
    assert.match(mapScreen, /Написать клиенту/);
    assert.doesNotMatch(mapScreen, /getDriverNextAction/);
    assert.match(mapScreen, /updateDeliveryProgress\(delivery\.deliveryId, 'arrived_to_restaurant'\)/);
    assert.match(mapScreen, /refreshDriverPickupQr\(delivery\.deliveryId\)/);
    assert.match(mapScreen, /driver-map-sheet__arrival/);
    assert.match(mapScreen, /target="_blank"/);
    assert.match(mapScreen, /activeLeg === 'restaurant'/);
    assert.match(mapScreen, /activeLeg === 'client'/);
    assert.match(driverCss, /\.driver-phone--map\s*\{[\s\S]*height:\s*100dvh/);
    assert.match(driverCss, /\.driver-map-sheet/);
    assert.match(driverCss, /height:\s*28dvh/);
  });
});
