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
});
