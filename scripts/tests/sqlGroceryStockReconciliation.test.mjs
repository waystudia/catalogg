import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260813010400_reconcile_grocery_picking_stock.sql', import.meta.url),
  'utf8'
);

describe('grocery picking stock reconciliation migration', () => {
  it('reconciles only the delta between reserved and actually weighed quantity', () => {
    assert.match(migration, /fulfilled_quantity - reserved_quantity/);
    assert.match(migration, /fulfilled_quantity_stock_insufficient/);
    assert.match(migration, /after update of fulfillment_state, fulfilled_quantity/);
  });

  it('reserves accepted replacement stock atomically for product or variant', () => {
    assert.match(migration, /reserve_accepted_catalog_substitution_stock/);
    assert.match(migration, /product_record\.stock_quantity - new\.proposed_quantity/);
    assert.match(migration, /variant_record\.stock_quantity - new\.proposed_quantity/);
    assert.match(migration, /after update of state on public\.order_substitution_requests/);
  });

  it('marks the original unavailable SKU sold out when an offer is created', () => {
    assert.match(migration, /mark_unavailable_catalog_substitution_stock/);
    assert.match(migration, /stock_quantity = 0/);
    assert.match(migration, /after insert on public\.order_substitution_requests/);
  });

  it('does not expose internal trigger functions to browser roles', () => {
    assert.match(migration, /revoke all on function public\.reconcile_picked_catalog_order_item_stock\(\)[\s\S]*from public, anon, authenticated/i);
    assert.match(migration, /revoke all on function public\.reserve_accepted_catalog_substitution_stock\(\)[\s\S]*from public, anon, authenticated/i);
    assert.match(migration, /revoke all on function public\.mark_unavailable_catalog_substitution_stock\(\)[\s\S]*from public, anon, authenticated/i);
  });
});
