import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('restaurant order action contract', () => {
  it('uses the canonical canceled enum value and waits for persistence before closing the new state', async () => {
    const api = await read('src/shared/api/restaurantOrdersApi.ts');
    const panel = await read('src/features/restaurant-admin/OrderDetailsPanel.tsx');
    const migration = await read('supabase/migrations/20260730183205_secure_restaurant_order_status_actions.sql');

    assert.match(api, /status === 'cancelled' \? 'canceled' : status/);
    assert.match(api, /rpc\('update_restaurant_order_status'/);
    assert.match(migration, /create or replace function public\.update_restaurant_order_status/);
    assert.match(migration, /client\.owner_user_id = auth\.uid\(\)/);
    assert.match(migration, /insert into public\.order_status_history/);
    assert.match(panel, /onStatus: .*Promise<void>/);
    assert.match(panel, /await onStatus\('canceled', 'restaurant_rejected'\)/);
    assert.match(panel, /isRejecting/);
  });

  it('shows the restaurant cash-payment gate before allowing QR verification', async () => {
    const panel = await read('src/features/restaurant-admin/OrderDetailsPanel.tsx');
    const api = await read('src/shared/api/restaurantOrdersApi.ts');

    assert.match(api, /confirmRestaurantCashPayment/);
    assert.match(api, /rpc\('confirm_restaurant_cash_payment'/);
    assert.match(panel, /Подтверждаю оплату/);
    assert.match(panel, /Оплата подтверждена — отсканируйте QR водителя/);
  });

  it('keeps the assigned driver card visible throughout the restaurant order lifecycle', async () => {
    const panel = await read('src/features/restaurant-admin/OrderDetailsPanel.tsx');
    const api = await read('src/shared/api/restaurantOrdersApi.ts');
    const styles = await read('src/app/styles.css');

    assert.match(panel, /order\.driverName && \(/);
    assert.match(panel, /admin-order-person-cards/);
    assert.match(panel, /admin-order-person-card/);
    assert.match(panel, /Данные клиента/);
    assert.match(panel, /Данные водителя/);
    assert.match(panel, /Заказ принял водитель/);
    assert.match(panel, /order\.driverPhone/);
    assert.match(panel, /order\.driverVehicleInfo/);
    assert.match(panel, /order\.driverCarNumber/);
    assert.match(panel, /order\.driverPhotoUrl/);
    assert.match(api, /drivers\(name, phone, vehicle_info, car_number, photo_url,/);
    assert.match(api, /selectRelevantDelivery/);
    assert.match(api, /rpc\('get_restaurant_assigned_drivers'/);
    assert.match(api, /from\('drivers'\)/);
    assert.match(api, /if \(!driverId \|\| order\.driverName\) return order/);
    assert.match(api, /formatPublicOrderNumber\(row\.id, restaurantNameOrSlug\)/);
    assert.match(styles, /\.admin-order-person-cards/);
    assert.match(styles, /\.admin-order-person-card/);
  });

  it('makes the primary status action visibly await persistence', async () => {
    const panel = await read('src/features/restaurant-admin/OrderDetailsPanel.tsx');

    assert.match(panel, /isChangingStatus/);
    assert.match(panel, /await onStatus\(nextStatusAction\.status\)/);
    assert.match(panel, /Сохраняем\.\.\./);
    assert.match(panel, /toast\.success\(`Статус: \$\{nextStatusAction\.label\}`\)/);
    assert.match(panel, /toast\.error\(error instanceof Error \? error\.message : 'Не удалось изменить статус заказа'\)/);
  });
});
