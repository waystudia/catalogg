import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationsDir = resolve(repoRoot, 'supabase/migrations');
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith('_allow_platform_admins_read_orders.sql')
);

describe('platform admin order visibility', () => {
  it('allows authenticated platform admins to read all orders without opening access to other users', () => {
    assert.ok(migrationName, 'platform-admin order visibility migration is missing');

    const sql = readFileSync(resolve(migrationsDir, migrationName), 'utf8');

    assert.match(sql, /drop policy if exists "orders admin read" on public\.orders/);
    assert.match(sql, /create policy "orders admin read"\s+on public\.orders/s);
    assert.match(sql, /for select\s+to authenticated/s);
    assert.match(sql, /public\.is_platform_admin\(\)\s+or\s+public\.is_catalog_member/s);
    assert.match(sql, /array\['owner',\s*'admin',\s*'viewer'\]::public\.catalog_role\[\]/s);
    assert.doesNotMatch(sql, /to anon|using \(true\)/);
  });
});
