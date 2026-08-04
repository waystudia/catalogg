import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sql = readFileSync(resolve(repoRoot, 'supabase/order_idempotency.sql'), 'utf8');

const extractFunction = (name) => {
  const marker = `create or replace function public.${name}`;
  const start = sql.indexOf(marker);

  assert.notEqual(start, -1, `${name} RPC is missing`);

  const afterStart = sql.slice(start);
  const end = afterStart.indexOf('\n$$;');

  assert.notEqual(end, -1, `${name} RPC body is missing its closing delimiter`);

  return afterStart.slice(0, end + '\n$$;'.length);
};

describe('public order idempotency SQL', () => {
  it('keeps one idempotency key unique per catalog', () => {
    assert.match(sql, /alter table public\.orders add column if not exists idempotency_key text/);
    assert.match(sql, /create unique index if not exists orders_catalog_idempotency_key_idx/s);
    assert.match(sql, /on public\.orders\(catalog_id, idempotency_key\)/);
    assert.match(sql, /where idempotency_key is not null/);
  });

  it('returns an existing platform order before inserting duplicate items', () => {
    const functionSql = extractFunction('create_public_restaurant_order');

    assert.match(functionSql, /idempotency_key text/);
    assert.match(functionSql, /select o\.id\s+into created_order_id\s+from public\.orders o/s);
    assert.match(functionSql, /and o\.idempotency_key = normalized_idempotency_key/);
    assert.doesNotMatch(functionSql, /and idempotency_key = normalized_idempotency_key/);
    assert.match(functionSql, /return created_order_id/);
    assert.match(functionSql, /exception when unique_violation/);
    assert.match(functionSql, /idempotency_key\s*\)/);
  });

  it('returns an existing legacy order before decrementing legacy stock twice', () => {
    const functionSql = extractFunction('create_legacy_public_restaurant_order');

    assert.match(functionSql, /idempotency_key text/);
    assert.match(functionSql, /select o\.id\s+into created_order_id\s+from public\.orders o/s);
    assert.match(functionSql, /and o\.idempotency_key = normalized_idempotency_key/);
    assert.doesNotMatch(functionSql, /and idempotency_key = normalized_idempotency_key/);
    assert.match(functionSql, /from public\.product\b/);
    assert.match(functionSql, /return created_order_id/);
    assert.match(functionSql, /exception when unique_violation/);
    assert.match(functionSql, /current_stock = greatest\(0, current_stock - item_quantity\)/);
  });

  it('exposes a read-only public status RPC for WhatsApp order links', () => {
    const functionSql = extractFunction('get_public_restaurant_order_status');

    assert.match(functionSql, /returns jsonb/);
    assert.match(functionSql, /where o\.id = target_order_id/);
    assert.match(functionSql, /left join public\.deliveries/);
    assert.match(functionSql, /'delivery_status', d\.status/);
    assert.doesNotMatch(
      functionSql,
      /'delivery_status', coalesce\(d\.status, case when o\.fulfillment_type = 'delivery' then 'waiting_courier'/
    );
    assert.match(sql, /grant execute on function public\.get_public_restaurant_order_status\(uuid\) to anon, authenticated/);
  });

  it('stores captured delivery coordinates inside both idempotent order transactions', () => {
    for (const name of ['create_public_restaurant_order', 'create_legacy_public_restaurant_order']) {
      const functionSql = extractFunction(name);

      assert.match(functionSql, /public\.delivery_location_from_note\(comment\)/);
      assert.match(functionSql, /delivery_lat,\s*delivery_lng,\s*client_lat,\s*client_lng,\s*client_accuracy_m/s);
      assert.match(functionSql, /location->>'lat'/);
      assert.match(functionSql, /location->>'lng'/);
      assert.match(functionSql, /location->>'accuracy_m'/);
    }
  });
});
