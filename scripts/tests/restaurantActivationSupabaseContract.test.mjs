import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationName = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
  .filter((name) => name.endsWith('_restaurant_legal_activation_mvp.sql'))
  .sort()
  .at(-1);

const migration = migrationName
  ? readFileSync(new URL(`../../supabase/migrations/${migrationName}`, import.meta.url), 'utf8')
  : '';
const createClientFunction = readFileSync(
  new URL('../../supabase/functions/create-client/index.ts', import.meta.url),
  'utf8'
);
const mainSource = readFileSync(new URL('../../src/main.tsx', import.meta.url), 'utf8');
const platformAdminSource = readFileSync(
  new URL('../../src/pages/platform-admin/PlatformAdminApp.tsx', import.meta.url),
  'utf8'
);
const catalogAdminSource = readFileSync(
  new URL('../../src/pages/catalog-admin/CatalogAdminApp.tsx', import.meta.url),
  'utf8'
);
const catalogAdminApiSource = readFileSync(
  new URL('../../src/shared/api/catalogAdminApi.ts', import.meta.url),
  'utf8'
);

test('restaurant activation migration is additive and puts every existing restaurant under review', () => {
  assert.ok(migrationName, 'restaurant activation migration must exist');
  assert.match(migration, /add column if not exists legal_activation_status/i);
  assert.match(migration, /legacy_review_required/i);
  assert.match(migration, /update public\.clients[\s\S]*legal_activation_status\s*=\s*'legacy_review_required'/i);
  assert.match(migration, /update public\.catalogs[\s\S]*status\s*=\s*'draft'/i);
  assert.doesNotMatch(migration, /legacy_(order|activation)_bypass\s*(boolean|=|:)|grandfathered_status/i);
  assert.doesNotMatch(migration, /drop table|truncate table/i);
});

test('legal versions, bundles, OTP challenges, acceptances and audits are protected server-side', () => {
  for (const table of [
    'restaurant_legal_profiles',
    'restaurant_tariffs',
    'legal_documents',
    'legal_document_bundles',
    'restaurant_activation_requests',
    'confirmation_codes',
    'legal_acceptances',
    'legal_acceptance_documents'
  ]) {
    assert.match(migration, new RegExp(`create table(?: if not exists)? public\\.${table}`, 'i'));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }

  assert.match(migration, /crypt\([\s\S]*gen_salt\('bf'/i);
  assert.match(migration, /interval '10 minutes'/i);
  assert.match(migration, /max_attempts[^\n]*default 5/i);
  assert.match(migration, /interval '60 seconds'/i);
  assert.match(migration, /prevent_legal_acceptance_mutation/i);
  assert.match(migration, /before update or delete on public\.legal_acceptances/i);
  assert.doesNotMatch(migration, /code[^\n]*(payload|metadata|audit_logs)/i);
});

test('owner activation RPCs derive the restaurant from auth and keep admin issuance separate', () => {
  for (const functionName of [
    'get_current_restaurant_activation',
    'mark_restaurant_activation_document_opened',
    'request_restaurant_activation_code',
    'confirm_restaurant_activation'
  ]) {
    assert.match(migration, new RegExp(`function public\\.${functionName}\\(`, 'i'));
  }

  assert.match(migration, /auth\.uid\(\)/i);
  assert.match(migration, /can_accept_legal_documents/i);
  assert.match(migration, /function public\.admin_issue_restaurant_activation_code\(/i);
  assert.match(migration, /public\.is_platform_admin\(\)/i);
  assert.match(migration, /unique[\s\S]*idempotency_key/i);
  assert.match(migration, /acceptance_hash/i);
  assert.match(
    migration.match(/function public\.request_restaurant_activation_code\([\s\S]*?revoke all on function public\.request_restaurant_activation_code/i)?.[0] ?? '',
    /from public\.restaurant_document_open_events/i
  );
  assert.doesNotMatch(
    migration.match(/function public\.confirm_restaurant_activation\([\s\S]*?returns jsonb/i)?.[0] ?? '',
    /target_(restaurant|catalog|client)_id/i
  );
});

test('every public order insertion and public catalog read require active legal status', () => {
  assert.match(migration, /function public\.can_catalog_accept_real_orders\(/i);
  assert.match(migration, /legal_activation_status\s*=\s*'active'/i);
  assert.match(migration, /before insert on public\.orders/i);
  assert.match(migration, /restaurant_activation_required/i);
  assert.match(migration, /create or replace function public\.is_catalog_published/i);
  assert.match(migration, /create policy "catalogs public read published"[\s\S]*can_catalog_accept_real_orders/i);
});

test('new restaurants and both application shells enter the activation workflow', () => {
  assert.match(createClientFunction, /legal_activation_status:\s*'draft'/i);
  assert.match(createClientFunction, /nextCatalogStatus\s*=\s*'draft'/i);
  assert.match(migration, /function public\.resolve_current_login_redirect\([\s\S]*\/restaurant\/activation/i);
  assert.match(mainSource, /path="\/restaurant\/activation"/i);
  assert.match(platformAdminSource, /Договоры и активации/i);
  assert.match(catalogAdminApiSource, /legalActivationStatus/i);
  assert.match(catalogAdminApiSource, /legal_activation_status/i);
  assert.match(catalogAdminSource, /legalActivationStatus[\s\S]*restaurant\/activation/i);
});
