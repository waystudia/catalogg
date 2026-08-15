import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const addon = read('src/features/combined-order/CombinedOrderAddonPanel.tsx');
const summary = read('src/features/combined-order/CombinedOrderSummaryPanel.tsx');
const publicStatus = read('src/features/order/PublicOrderStatusScreen.tsx');
const platformStatus = read('src/pages/client-platform/ClientPlatformApp.tsx');
const api = read('src/shared/api/combinedOrderApi.ts');
const migration = read('supabase/migrations/20260815004500_combined_order_addon_backend.sql');

describe('combined-order client contract', () => {
  it('offers the same isolated addon flow from both customer order surfaces', () => {
    assert.match(publicStatus, /<CombinedOrderAddonPanel/);
    assert.match(platformStatus, /<CombinedOrderAddonPanel/);
    assert.match(addon, /type AddonStep = [^;]*"merchants"[^;]*"catalog"[^;]*"quote"[^;]*"success"/);
    assert.match(addon, /Адрес и курьера повторно выбирать не нужно/);
    assert.match(addon, /Добавить к заказу/);
    assert.doesNotMatch(addon, /Оформить новую доставку/);
  });

  it('uses server totals, expiring offers, persistent confirm idempotency and one secure grouped read model', () => {
    assert.match(addon, /offerExpired/);
    assert.match(addon, /sessionStorage\.setItem\(storageKey, created\)/);
    assert.match(addon, /quote\.itemsSubtotal/);
    assert.match(addon, /quote\.addonDeliveryFee/);
    assert.match(api, /get_client_combined_order_summary/);
    assert.match(migration, /create or replace function public\.get_client_combined_order_summary/);
    assert.match(migration, /public\.is_order_group_client/);
  });

  it('shows merchant statuses, one generic stop sequence and separated financial totals', () => {
    assert.match(summary, /summary\.merchantOrders\.map/);
    assert.match(summary, /summary\.delivery\.stops\.map/);
    assert.match(summary, /Доп\. остановка/);
    assert.match(summary, /summary\.grandTotal/);
    assert.match(api, /subscribeCombinedOrderSummary/);
  });
});
