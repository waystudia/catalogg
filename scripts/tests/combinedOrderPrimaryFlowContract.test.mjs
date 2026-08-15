import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationName = readdirSync(resolve(repoRoot, 'supabase/migrations'))
  .find((name) => name.endsWith('_initialize_post_order_addons.sql'));
const migration = migrationName
  ? readFileSync(resolve(repoRoot, 'supabase/migrations', migrationName), 'utf8')
  : '';
const combinedOrderApi = readFileSync(resolve(repoRoot, 'src/shared/api/combinedOrderApi.ts'), 'utf8');
const legacyCheckout = readFileSync(resolve(repoRoot, 'src/features/checkout/CheckoutScreen.tsx'), 'utf8');
const platformCheckout = readFileSync(resolve(repoRoot, 'src/pages/client-platform/ClientPlatformApp.tsx'), 'utf8');

describe('secure primary combined-order initialization', () => {
  it('creates the group only through a token-owned server transaction', () => {
    assert.ok(migrationName, 'combined-order initializer migration must exist');
    assert.match(migration, /create or replace function public\.initialize_post_order_addon\(/i);
    assert.match(migration, /security definer[\s\S]*?set search_path = ''/i);
    assert.match(migration, /for update/i);
    assert.match(migration, /extensions\.digest\(coalesce\(client_session_token, ''\), 'sha256'\)/i);
    assert.match(migration, /public\.normalize_client_phone\(primary_order\.customer_phone\)/i);
    assert.match(migration, /client_account\.phone_normalized =/i);
    assert.match(migration, /insert into public\.order_groups/i);
    assert.match(migration, /on conflict \(primary_order_id\) do nothing/i);
    assert.match(migration, /update public\.orders[\s\S]*?order_group_id = target_group_id/i);
  });

  it('enforces the disabled-by-default pilot scope and delivery prerequisites', () => {
    assert.match(migration, /if addon_config\.id is null or not addon_config\.enabled/i);
    assert.match(migration, /addon_config\.test_only and not primary_order\.is_test_order/i);
    assert.match(migration, /primary_catalog\.business_type = any \(addon_config\.eligible_primary_business_types\)/i);
    assert.match(migration, /primary_order\.delivery_provider not in \('platform', 'hybrid'\)/i);
    assert.match(migration, /primary_restaurant\.lat is null or primary_restaurant\.lng is null/i);
    assert.match(migration, /primary_order\.delivery_lat is null or primary_order\.delivery_lng is null/i);
    assert.match(migration, /cardinality\(addon_config\.allowed_primary_merchant_ids\)/i);
    assert.match(migration, /cardinality\(addon_config\.allowed_client_account_ids\)/i);
    assert.match(migration, /public\.delivery_settlements/i);
  });

  it('creates one expiring offer and auditable events without blocking checkout on route work', () => {
    assert.match(migration, /insert into public\.addon_offers/i);
    assert.match(migration, /primary_order\.created_at\s*\+ make_interval\(mins => addon_config\.offer_window_minutes\)/i);
    assert.match(migration, /on conflict \(order_group_id\) do nothing/i);
    assert.match(migration, /'ORDER_CREATED'/i);
    assert.match(migration, /'ADDON_OFFER_CREATED'/i);
    assert.doesNotMatch(migration, /http_get|http_post|net\.http|routes\/v1|table\/v1/i);
    assert.match(migration, /grant execute on function public\.initialize_post_order_addon\(uuid, text\) to anon, authenticated/i);
  });

  it('starts initialization after both existing checkout paths save a real order id', () => {
    assert.match(combinedOrderApi, /getStoredClientSessionToken\(\)/);
    assert.match(combinedOrderApi, /rpc\('initialize_post_order_addon'/);
    assert.match(combinedOrderApi, /client_session_token: sessionToken/);
    assert.match(legacyCheckout, /void initializePostOrderAddon\(orderId\)\.catch/);
    assert.match(platformCheckout, /void initializePostOrderAddon\(orderId\)\.catch/);
    assert.ok(
      legacyCheckout.indexOf('createRestaurantOrderFromCart') < legacyCheckout.indexOf('initializePostOrderAddon(orderId)'),
      'legacy checkout must save the order before addon initialization'
    );
    assert.ok(
      platformCheckout.indexOf('createClientPlatformOrder') < platformCheckout.indexOf('initializePostOrderAddon(orderId)'),
      'platform checkout must save the order before addon initialization'
    );
  });

  it('uses WhatsApp only for a minimal authenticated-panel notification', () => {
    assert.match(legacyCheckout, /buildWhatsappOrderNotificationText/);
    assert.match(legacyCheckout, /buildMerchantOrderPanelUrl/);
    assert.doesNotMatch(legacyCheckout, /buildWhatsappOrderText/);
    assert.doesNotMatch(legacyCheckout, /buildOrderStatusShareUrl/);
  });
});
