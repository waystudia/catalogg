import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('E2E identities and operational data are explicitly marked as test data', async () => {
  const migration = await read('supabase/migrations/20260807120000_wayyaam_e2e_accounts.sql');

  for (const table of ['profiles', 'users', 'client_accounts', 'clients', 'catalogs', 'restaurants', 'drivers']) {
    assert.match(migration, new RegExp(`alter table public\\.${table}[\\s\\S]*add column if not exists is_test boolean not null default false`, 'i'));
  }
  assert.match(migration, /alter table public\.client_addresses[\s\S]*add column if not exists is_test boolean not null default false/i);
  assert.match(migration, /alter table public\.billing_ledger_entries[\s\S]*add column if not exists is_test boolean not null default false/i);
  assert.match(migration, /alter table public\.earnings[\s\S]*add column if not exists is_test boolean not null default false/i);
  assert.match(migration, /alter table public\.clients[\s\S]*add column if not exists test_debt_amount numeric\(12,2\) not null default 0/i);
  assert.match(migration, /alter table public\.drivers[\s\S]*add column if not exists test_debt_amount numeric\(12,2\) not null default 0/i);
});

test('test order scope is derived server-side and cannot cross client or catalog scope', async () => {
  const migration = await read('supabase/migrations/20260807120000_wayyaam_e2e_accounts.sql');

  assert.match(migration, /create or replace function public\.enforce_order_test_scope\(\)/i);
  assert.match(migration, /new\.is_test_order\s*:=\s*catalog_is_test/i);
  assert.match(migration, /catalog_is_test is distinct from actor_is_test[\s\S]*raise exception 'order_test_scope_mismatch'/i);
  assert.match(migration, /before insert or update of catalog_id, is_test_order on public\.orders/i);
});

test('test restaurant visibility is limited to the test client or restaurant staff', async () => {
  const migration = await read('supabase/migrations/20260807120000_wayyaam_e2e_accounts.sql');

  assert.match(migration, /create policy "catalogs public read published"[\s\S]*not catalogs\.is_test[\s\S]*public\.current_actor_is_test\(\)/i);
  assert.match(migration, /create policy "restaurants public read active"[\s\S]*not restaurants\.is_test[\s\S]*public\.current_actor_is_test\(\)/i);
});

test('driver dispatch and push delivery never cross production and E2E scopes', async () => {
  const [migration, push] = await Promise.all([
    read('supabase/migrations/20260807120000_wayyaam_e2e_accounts.sql'),
    read('supabase/functions/send-web-push/index.ts')
  ]);

  assert.match(migration, /create or replace function public\.enforce_delivery_test_scope\(\)/i);
  assert.match(migration, /driver_is_test is distinct from order_is_test[\s\S]*raise exception 'delivery_test_scope_mismatch'/i);
  assert.match(migration, /jsonb_array_elements\(public\.get_driver_delivery_offers_unscoped\(\)\)/i);
  assert.match(migration, /coalesce\(offer_order\.is_test_order, false\)\s*=\s*coalesce\(viewer_driver\.is_test, false\)/i);
  assert.match(push, /select\('id, city_name, service_settlements, max_active_deliveries, is_premium, is_test'\)/);
  assert.match(push, /Boolean\(driver\.is_test\) === Boolean\(order\?\.is_test_order\)/);
});

test('the real QR validator binds the token to one delivery and consumes it once', async () => {
  const migration = await read('supabase/migrations/20260807120000_wayyaam_e2e_accounts.sql');

  assert.match(migration, /create or replace function public\.confirm_delivery_pickup_qr\(/i);
  assert.match(migration, /delivery\.id = target_delivery_id[\s\S]*delivery\.pickup_qr_token = trim\(presented_token\)/i);
  assert.match(migration, /delivery\.pickup_qr_confirmed_at is null/i);
  assert.match(migration, /where id = target_delivery_id and pickup_qr_confirmed_at is null/i);
});

test('test commissions use the real 30-ruble tariff but only test debt balances', async () => {
  const migration = await read('supabase/migrations/20260807120000_wayyaam_e2e_accounts.sql');

  assert.match(migration, /record_restaurant_order_commission[\s\S]*is_test[\s\S]*new\.is_test_order/i);
  assert.match(migration, /record_completed_delivery_billing[\s\S]*target_is_test/i);
  assert.match(migration, /where ledger_scope = 'platform_debt'[\s\S]*is_test = new\.is_test/i);
  assert.match(migration, /test_debt_amount\s*=\s*case when new\.is_test then resolved_amount else test_debt_amount end/i);
  assert.match(migration, /debt_amount\s*=\s*case when new\.is_test then debt_amount else resolved_amount end/i);
  assert.match(migration, /on conflict \(event_key\) do nothing/i);
});

test('production analytics defensively exclude test orders', async () => {
  const [clientsApi, platformStats] = await Promise.all([
    read('src/shared/api/clientsApi.ts'),
    read('src/shared/api/platformStats.ts')
  ]);

  assert.ok((clientsApi.match(/\.eq\('is_test_order', false\)/g) ?? []).length >= 5);
  assert.match(platformStats, /orders\.filter\(\(order\) => order\.is_test_order !== true\)/);
});

test('idempotent seed provisions a full-featured permanent restaurant without committed passwords', async () => {
  const seed = await read('supabase/e2e_accounts_seed.sql');

  for (const email of ['e2e.client@wayyaam.ru', 'e2e.restaurant@wayyaam.ru', 'e2e.driver@wayyaam.ru']) {
    assert.match(seed, new RegExp(email.replace('.', '\\.'), 'i'));
  }
  for (const category of ['Бургеры', 'Пицца', 'Напитки', 'Дополнительно']) assert.match(seed, new RegExp(category));
  for (const product of ['Чизбургер', 'Двойной бургер', 'Пицца Пепперони', 'Пицца Маргарита', 'Coca-Cola', 'Вода', 'Сырный соус', 'Картофель фри']) {
    assert.match(seed, new RegExp(product.replace('-', '\\-')));
  }
  assert.match(seed, /package_code[\s\S]*'full'/i);
  for (const moduleFlag of ['pos_enabled', 'warehouse_enabled', 'recipes_enabled', 'finance_enabled', 'promotions_enabled', 'loyalty_enabled']) {
    assert.match(seed, new RegExp(`${moduleFlag}[\\s\\S]*true`, 'i'));
  }
  assert.match(seed, /use_own_courier[\s\S]*use_platform_drivers[\s\S]*fallback_to_platform_drivers/i);
  assert.match(seed, /'Тестовый адрес'[\s\S]*'Тестовая доставка WayYaam'/i);
  assert.doesNotMatch(seed, /WayYaam-E2E-(?:Client|Restaurant|Driver)-2026!/);
});
