import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('post-order offer opens after five seconds and uses dynamic merchant copy', () => {
  const source = read('src/features/combined-order/CombinedOrderAddonPanel.tsx');

  assert.match(source, /POST_ORDER_ADDON_AUTO_OPEN_DELAY_MS/);
  assert.match(source, /window\.setTimeout/);
  assert.match(source, /Хотите что-нибудь заказать из магазина\?/);
  assert.match(source, /Доплата к доставке/);
  assert.match(source, /Открыть магазин/);
});

test('combined customer summary exposes a separate chat for addon merchants', () => {
  const source = read('src/features/combined-order/CombinedOrderSummaryPanel.tsx');

  assert.match(source, /OrderConversationPanel/);
  assert.match(source, /order\.isAddon/);
  assert.match(source, /Чат с/);
});

test('merchant delivery dispatch is protected by server readiness', () => {
  const api = read('src/shared/api/restaurantOrdersApi.ts');
  const migration = read('supabase/migrations/20260815085206_combined_order_status_offer_and_dispatch_guard.sql');

  assert.match(api, /get_combined_order_dispatch_readiness/);
  assert.match(api, /combined_delivery_merchants_not_ready/);
  assert.match(api, /if \(order\.orderGroupId\) \{/);
  assert.match(migration, /create or replace function public\.get_combined_order_dispatch_readiness/);
  assert.match(migration, /combined_delivery_merchants_not_ready/);
  assert.doesNotMatch(migration, /public\.delivery_status/);
  assert.match(migration, /order_group_id/);
  assert.match(migration, /status = 'waiting_driver'/);
});
