import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260813231200_business_type_login_redirect.sql'),
  'utf8'
);

describe('business type login redirect database contract', () => {
  it('routes groceries to their business workspace and keeps restaurant dashboards', () => {
    assert.match(migration, /catalog\.business_type::text/i);
    assert.match(migration, /target_business_type\s*=\s*'grocery'[\s\S]*'\/business\/'\s*\|\|\s*target_slug/i);
    assert.match(migration, /else '\/'\s*\|\|\s*target_slug\s*\|\|\s*'\/dashboard'/i);
  });

  it('keeps the redirect resolver restricted and search-path safe', () => {
    assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
    assert.match(migration, /revoke all on function public\.resolve_current_login_redirect\(\) from public, anon/i);
    assert.match(migration, /grant execute on function public\.resolve_current_login_redirect\(\) to authenticated/i);
  });
});
