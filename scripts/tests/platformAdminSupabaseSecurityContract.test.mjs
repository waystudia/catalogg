import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationsDir = resolve(repoRoot, 'supabase/migrations');
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith('_harden_platform_content_access.sql')
);

describe('platform content Supabase security', () => {
  it('keeps banner files public by URL without allowing public bucket listing', () => {
    assert.ok(migrationName, 'platform-content access hardening migration is missing');

    const sql = readFileSync(resolve(migrationsDir, migrationName), 'utf8');

    assert.match(sql, /drop policy if exists "public reads platform banner media" on storage\.objects/);
    assert.doesNotMatch(sql, /create policy "public reads platform banner media"/);
  });

  it('uses non-overlapping page policies for public reads and admin mutations', () => {
    assert.ok(migrationName, 'platform-content access hardening migration is missing');

    const sql = readFileSync(resolve(migrationsDir, migrationName), 'utf8');

    assert.match(sql, /for select\s+to anon\s+using \(status = 'published'\)/s);
    assert.match(sql, /for select\s+to authenticated\s+using \(status = 'published' or public\.is_platform_admin\(\)\)/s);
    assert.match(sql, /for insert\s+to authenticated\s+with check \(public\.is_platform_admin\(\)\)/s);
    assert.match(sql, /for update\s+to authenticated\s+using \(public\.is_platform_admin\(\)\)\s+with check \(public\.is_platform_admin\(\)\)/s);
    assert.match(sql, /for delete\s+to authenticated\s+using \(public\.is_platform_admin\(\)\)/s);
    assert.doesNotMatch(sql, /for all/);
  });
});
