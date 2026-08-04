import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = readFileSync(resolve(repoRoot, 'src/shared/supabase.ts'), 'utf8');
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260804133941_bookable_resource_pos_price.sql'),
  'utf8'
);

describe('restaurant seating persistence', () => {
  it('keeps the legacy Mangal hall in the legacy cabin table', () => {
    assert.match(source, /activePlatformCatalogId\s*&&\s*!activeCatalogIsLegacy/);
    assert.match(source, /from\('cabin'\)\.upsert/);
  });

  it('preserves platform place kind, capacity text and nonnegative cabin price', () => {
    assert.match(source, /resource_type:\s*parseCabinMeta\(value\.feature\)\.kind/);
    assert.match(source, /capacity_text:\s*value\.capacity/);
    assert.match(source, /price:\s*parseCabinMeta\(value\.feature\)\.price/);
    assert.match(migration, /add column if not exists price integer not null default 0/i);
    assert.match(migration, /check \(price >= 0\)/i);
    assert.doesNotMatch(migration, /drop table|truncate|delete from/i);
  });
});
