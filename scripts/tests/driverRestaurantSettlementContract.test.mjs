import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../../supabase/migrations/20260810134000_driver_restaurant_delivery_settlement.sql',
  import.meta.url
);
const driverApiPath = new URL('../../src/shared/api/deliveryApi.ts', import.meta.url);
const driverAppPath = new URL('../../src/pages/driver/DriverApp.tsx', import.meta.url);
const restaurantPanelPath = new URL(
  '../../src/features/restaurant-admin/OrderDetailsPanel.tsx',
  import.meta.url
);

test('free delivery settlement persists both driver confirmations and protects pickup', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /driver_restaurant_order_payment_confirmed_at timestamptz/);
  assert.match(sql, /driver_restaurant_delivery_payout_received_at timestamptz/);
  assert.match(sql, /when client_delivery_fee = 0 and courier_payout > 0 then client_total/);
  assert.match(sql, /confirm_current_driver_restaurant_order_payment/);
  assert.match(sql, /confirm_current_driver_restaurant_delivery_payout/);
  assert.match(sql, /free_delivery_driver_payout_received/);
  assert.match(
    sql,
    /client_delivery_fee = 0 and courier_payout > 0 and payout_received_at is null then[\s\S]*Сначала водитель должен подтвердить получение оплаты доставки/
  );
  assert.match(
    sql,
    /revoke all on function public\.confirm_current_driver_restaurant_order_payment\(uuid\)[\s\S]*from public, anon;/
  );
  assert.match(
    sql,
    /grant execute on function public\.confirm_current_driver_restaurant_delivery_payout\(uuid\)[\s\S]*to authenticated;/
  );
});

test('driver UI separates order handover from restaurant-funded delivery payout', async () => {
  const [api, driverApp, restaurantPanel] = await Promise.all([
    readFile(driverApiPath, 'utf8'),
    readFile(driverAppPath, 'utf8'),
    readFile(restaurantPanelPath, 'utf8')
  ]);

  assert.match(api, /confirm_current_driver_restaurant_order_payment/);
  assert.match(api, /confirm_current_driver_restaurant_delivery_payout/);
  assert.match(driverApp, /Я передал \$\{formatPrice\(settlement\.restaurantOrderAmount\)\} за заказ/);
  assert.match(driverApp, /Я получил \$\{formatPrice\(restaurantDeliveryPayout\)\} за доставку/);
  assert.match(driverApp, /Оплачивает ресторан/);
  assert.match(driverApp, /QR после расчёта/);
  assert.match(driverApp, /Сначала завершите расчёт с рестораном/);
  assert.match(restaurantPanel, /Оплата доставки рестораном/);
  assert.match(restaurantPanel, /До этого QR выдачи заказа будет заблокирован/);
});
