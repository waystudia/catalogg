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
const bannerMediaPolicyRepairMigrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith('_restore_platform_banner_media_policies.sql')
);

describe('platform content Supabase security', () => {
  it('keeps banner files public by URL without allowing public bucket listing', () => {
    assert.ok(migrationName, 'platform-content access hardening migration is missing');

    const sql = readFileSync(resolve(migrationsDir, migrationName), 'utf8');

    assert.match(sql, /drop policy if exists "public reads platform banner media" on storage\.objects/);
    assert.doesNotMatch(sql, /create policy "public reads platform banner media"/);
  });

  it('restores authenticated platform-admin writes to banner media storage', () => {
    assert.ok(bannerMediaPolicyRepairMigrationName, 'banner-media policy repair migration is missing');

    const sql = readFileSync(resolve(migrationsDir, bannerMediaPolicyRepairMigrationName), 'utf8');

    assert.match(sql, /create policy "platform admins read banner media"[\s\S]*for select[\s\S]*to authenticated[\s\S]*bucket_id = 'platform-banner-media'[\s\S]*public\.is_platform_admin\(\)/);
    assert.match(sql, /create policy "platform admins upload banner media"[\s\S]*for insert[\s\S]*to authenticated[\s\S]*bucket_id = 'platform-banner-media'[\s\S]*public\.is_platform_admin\(\)/);
    assert.match(sql, /create policy "platform admins update banner media"[\s\S]*for update[\s\S]*using \([\s\S]*public\.is_platform_admin\(\)[\s\S]*with check \([\s\S]*public\.is_platform_admin\(\)/);
    assert.match(sql, /create policy "platform admins delete banner media"[\s\S]*for delete[\s\S]*using \([\s\S]*public\.is_platform_admin\(\)/);
    assert.doesNotMatch(sql, /to public|to anon/);
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
