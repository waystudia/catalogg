import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260813010000_add_weighted_client_catalog_order.sql', import.meta.url),
  'utf8'
);

describe('weighted client catalog order migration', () => {
  it('adds an isolated RPC and leaves the established restaurant RPC untouched', () => {
    assert.match(migration, /create or replace function public\.create_client_platform_catalog_order\(/);
    assert.doesNotMatch(migration, /create or replace function public\.create_client_platform_restaurant_order\(/);
  });

  it('validates gram minimum, step and authoritative stock before inserting', () => {
    assert.match(migration, /catalog\.business_type = 'grocery'/);
    assert.match(migration, /catalog\.status = 'published'/);
    assert.match(migration, /catalog\.is_template = false/);
    assert.match(migration, /requested_quantity < product_record\.minimum_quantity/);
    assert.match(migration, /mod\(requested_quantity - product_record\.minimum_quantity, product_record\.quantity_step\)/);
    assert.match(migration, /product_record\.stock_quantity < requested_quantity/);
    assert.match(migration, /requested_quantity,/);
  });

  it('retains idempotency and delegates final payment normalization', () => {
    assert.match(migration, /idempotency_key = normalized_idempotency_key/);
    assert.match(migration, /finalize_created_client_platform_order\(created_order_id, payment_method\)/);
    assert.match(migration, /set search_path = ''/);
  });
});
