import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const extractLegacyOrderFunction = (sql) => {
  const marker = 'create or replace function public.create_legacy_public_restaurant_order';
  const start = sql.indexOf(marker);

  assert.notEqual(start, -1, 'legacy restaurant order RPC is missing');

  const afterStart = sql.slice(start);
  const end = afterStart.indexOf('\n$$;');

  assert.notEqual(end, -1, 'legacy restaurant order RPC body is missing its closing delimiter');

  return afterStart.slice(0, end + '\n$$;'.length);
};

const readLegacyOrderFunction = (path) => extractLegacyOrderFunction(readFileSync(resolve(repoRoot, path), 'utf8'));

describe('legacy public restaurant order SQL', () => {
  it('keeps catalog schema legacy orders on the legacy product table', () => {
    const functionSql = readLegacyOrderFunction('catalog_supabase_schema.sql');

    assert.match(functionSql, /from public\.product\b/);
    assert.match(functionSql, /where id = item->>'product_id'/);
    assert.match(functionSql, /product_id,\s*title,\s*quantity,\s*unit_price/s);
    assert.match(functionSql, /created_order_id,\s*null,\s*legacy_product\.title/s);
    assert.doesNotMatch(functionSql, /create_public_restaurant_order\(/);
  });

  it('keeps the deployable restaurant order patch aligned with legacy products', () => {
    const functionSql = readLegacyOrderFunction('supabase/restaurant_orders.sql');

    assert.match(functionSql, /from public\.product\b/);
    assert.match(functionSql, /where id = item->>'product_id'/);
    assert.match(functionSql, /current_stock = greatest\(0, current_stock - item_quantity\)/);
    assert.doesNotMatch(functionSql, /create_public_restaurant_order\(/);
  });

  it('keeps the live hotfix patch aligned with legacy products', () => {
    const functionSql = readLegacyOrderFunction('supabase/fix_legacy_public_restaurant_order.sql');

    assert.match(functionSql, /from public\.product\b/);
    assert.match(functionSql, /where id = item->>'product_id'/);
    assert.match(functionSql, /created_order_id,\s*null,\s*legacy_product\.title/s);
    assert.doesNotMatch(functionSql, /create_public_restaurant_order\(/);
  });
});
