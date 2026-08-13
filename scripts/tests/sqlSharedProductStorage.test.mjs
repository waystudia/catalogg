import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260813205800_restore_catalog_asset_upload_policies.sql'),
  'utf8'
);

describe('shared product image storage contract', () => {
  it('allows only authenticated catalog editors or platform admins to write catalog assets', () => {
    assert.match(migration, /create policy "catalog assets authenticated writers"[\s\S]*for all[\s\S]*to authenticated/i);
    assert.match(migration, /bucket_id = 'catalog-assets'[\s\S]*is_platform_admin\(\)[\s\S]*is_catalog_member/i);
    assert.match(migration, /array\['owner', 'admin', 'editor'\]::public\.catalog_role\[\]/i);
    assert.doesNotMatch(migration, /to anon/i);
  });

  it('validates the first path segment before casting it to a catalog UUID', () => {
    assert.match(migration, /case[\s\S]*storage\.foldername\(name\)\)\[1\] ~\*[\s\S]*::uuid[\s\S]*else false[\s\S]*end/i);
  });
});
