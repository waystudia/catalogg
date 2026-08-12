import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';

const migrationName = readdirSync('supabase/migrations')
  .find((name) => name.endsWith('_add_multi_business_foundation.sql'));
const migration = migrationName
  ? readFileSync(`supabase/migrations/${migrationName}`, 'utf8')
  : '';
const createClientFunction = readFileSync('supabase/functions/create-client/index.ts', 'utf8');
const updateClientFunction = readFileSync('supabase/functions/update-client/index.ts', 'utf8');
const catalogPolicyMigration = readFileSync(
  'supabase/migrations/20260809090226_restaurant_preactivation_test_catalogs.sql',
  'utf8'
);
const loginRedirectMigration = readFileSync(
  'supabase/migrations/20260807120000_wayyaam_e2e_accounts.sql',
  'utf8'
);

describe('multi-business onboarding contract', () => {
  it('registers active and future business types in trusted storage', () => {
    assert.ok(migrationName, 'multi-business foundation migration must exist');
    assert.match(migration, /create table(?: if not exists)? public\.business_types/i);
    assert.match(migration, /'grocery'[\s\S]*?'active'/i);
    assert.match(migration, /'flowers'[\s\S]*?'disabled'/i);
    assert.match(migration, /'pharmacy'[\s\S]*?'compliance_blocked'/i);
    assert.match(migration, /alter table public\.business_types enable row level security/i);
  });

  it('creates every database-owned onboarding record in one restricted transaction', () => {
    assert.match(migration, /create or replace function public\.create_platform_business_from_template/i);
    assert.match(migration, /security definer\s+set search_path = ''/i);
    assert.match(migration, /business_type\.availability <> 'active'/i);
    assert.match(migration, /template_catalog\.business_type <> requested_business_type/i);
    assert.match(migration, /status = 'draft'/i);
    assert.match(migration, /insert into public\.catalog_members/i);
    assert.match(migration, /insert into public\.clients/i);
    assert.match(migration, /insert into public\.client_subscriptions/i);
    assert.match(migration, /insert into public\.audit_logs/i);
    assert.match(migration, /revoke all on function public\.create_platform_business_from_template[\s\S]*from public, anon, authenticated/i);
    assert.match(migration, /grant execute on function public\.create_platform_business_from_template[\s\S]*to service_role/i);
  });

  it('keeps Auth server-only and compensates the owner account when the database transaction fails', () => {
    assert.match(createClientFunction, /auth\.admin\.createUser/);
    assert.match(createClientFunction, /from\('business_types'\)[\s\S]*\.eq\('code', payload\.businessType\)/);
    assert.match(createClientFunction, /businessTypeRecord\.availability !== 'active'/);
    assert.match(createClientFunction, /rpc\(\s*'create_platform_business_from_template'/);
    assert.doesNotMatch(createClientFunction, /from\('clients'\)\.insert/);
    assert.doesNotMatch(createClientFunction, /from\('catalog_members'\)\.insert/);
    assert.match(createClientFunction, /auth\.admin\.deleteUser\(ownerUserId\)/);
  });

  it('uses the same trusted registry when an existing business type is edited', () => {
    assert.match(updateClientFunction, /from\('business_types'\)[\s\S]*\.eq\('code', payload\.businessType\)/);
    assert.match(updateClientFunction, /businessTypeRecord\.availability !== 'active'/);
    assert.doesNotMatch(updateClientFunction, /\['restaurant', 'coffee_shop', 'confectionery'\]\.includes\(payload\.businessType\)/);
    assert.match(updateClientFunction, /payload\.businessType === 'grocery'[\s\S]*?'draft'/);
  });

  it('keeps draft catalogs private and member access scoped to the current catalog', () => {
    assert.match(catalogPolicyMigration, /catalogs\.status = 'published'/i);
    assert.match(catalogPolicyMigration, /public\.is_catalog_member\(catalogs\.id/i);
    assert.match(loginRedirectMigration, /member\.user_id = viewer_user_id/i);
  });
});
