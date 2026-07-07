import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const sqlFiles = [
  'catalog_supabase_schema.sql',
  'supabase/restaurant_orders.sql',
  'supabase/delivery_settlements.sql',
  'supabase/fix_legacy_public_restaurant_order.sql',
  'supabase/waycatalog_delivery.sql'
];

const extractFunctionBlocks = (sql) => {
  const blocks = [];
  const marker = 'create or replace function public.';
  let offset = 0;

  while (offset < sql.length) {
    const start = sql.indexOf(marker, offset);
    if (start === -1) break;

    const afterStart = sql.slice(start);
    const end = afterStart.indexOf('\n$$;');
    assert.notEqual(end, -1, 'function body is missing its closing delimiter');

    blocks.push(afterStart.slice(0, end + '\n$$;'.length));
    offset = start + end + '\n$$;'.length;
  }

  return blocks;
};

const functionName = (functionSql) =>
  functionSql.match(/create or replace function public\.([a-z0-9_]+)/i)?.[1] ?? 'unknown_function';

describe('Supabase SQL function search paths', () => {
  it('keeps pgcrypto byte generation available inside security-definer functions', () => {
    const offenders = sqlFiles.flatMap((path) => {
      const sql = readFileSync(resolve(repoRoot, path), 'utf8');

      return extractFunctionBlocks(sql)
        .filter((functionSql) => functionSql.includes('gen_random_bytes'))
        .filter(
          (functionSql) =>
            !/set\s+search_path\s*=\s*public\s*,\s*extensions\b/i.test(functionSql) &&
            !/extensions\.gen_random_bytes\b/i.test(functionSql)
        )
        .map((functionSql) => `${path}:${functionName(functionSql)}`);
    });

    assert.deepEqual(offenders, []);
  });
});
