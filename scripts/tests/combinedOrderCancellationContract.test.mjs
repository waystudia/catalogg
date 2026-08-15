import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationName = readdirSync(resolve(repoRoot, 'supabase/migrations'))
  .find((name) => name.endsWith('_combined_order_cancellation.sql'));
const migration = migrationName
  ? readFileSync(resolve(repoRoot, 'supabase/migrations', migrationName), 'utf8')
  : '';

describe('combined-order cancellation contract', () => {
  it('restores addon stock once and blocks the legacy client cancellation path', () => {
    assert.ok(migrationName, 'combined-order cancellation migration must exist');
    assert.match(migration, /cancel_client_catalog_order_uncombined/i);
    assert.match(migration, /combined_addon_cancellation_requires_group_flow/i);
    assert.match(migration, /create or replace function public\.restore_combined_addon_stock/i);
    assert.match(migration, /'ADDON_STOCK_RESTORED'/i);
    assert.match(migration, /stock_quantity = product\.stock_quantity \+ restored_quantity/i);
  });

  it('cancels only the addon stop and removes the addon delivery fee', () => {
    assert.match(migration, /new\.is_addon/i);
    assert.match(migration, /status = 'cancelled'[\s\S]*?merchant_order_id = new\.id/i);
    assert.match(migration, /addon_delivery_fee_amount = 0/i);
    assert.match(migration, /offered_fee = greatest/i);
    assert.match(migration, /row_number\(\) over \(order by delivery_stop\.sequence\)/i);
    assert.match(migration, /POST_ORDER_ADDON_CANCELLED/i);
  });

  it('cancels the group and addon when the primary order is cancelled before pickup', () => {
    assert.match(migration, /new\.id = target_group\.primary_order_id/i);
    assert.match(migration, /picked_up_at is not null/i);
    assert.match(migration, /update public\.orders addon_order[\s\S]*?addon_order\.is_addon/i);
    assert.match(migration, /update public\.order_groups[\s\S]*?status = 'cancelled'/i);
    assert.match(migration, /update public\.deliveries[\s\S]*?status = 'canceled'/i);
    assert.match(migration, /'PRIMARY_ORDER_CANCELLED'/i);
  });

  it('runs after a real status transition and leaves ordinary orders untouched', () => {
    assert.match(migration, /after update of status on public\.orders/i);
    assert.match(migration, /old\.status::text not in \('cancelled', 'canceled'\)/i);
    assert.match(migration, /new\.order_group_id is null/i);
  });
});
