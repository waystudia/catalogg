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
const demoEntryMigrationName = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
  .filter((name) => name.endsWith('_restaurant_demo_before_activation.sql'))
  .sort()
  .at(-1);
const demoEntryMigration = demoEntryMigrationName
  ? readFileSync(new URL(`../../supabase/migrations/${demoEntryMigrationName}`, import.meta.url), 'utf8')
  : '';
const adminSetupMigrationName = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
  .filter((name) => name.endsWith('_admin_restaurant_activation_setup.sql'))
  .sort()
  .at(-1);
const adminSetupMigration = adminSetupMigrationName
  ? readFileSync(new URL(`../../supabase/migrations/${adminSetupMigrationName}`, import.meta.url), 'utf8')
  : '';
const dualRoleOwnerMigrationName = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
  .filter((name) => name.endsWith('_allow_dual_role_restaurant_owner_activation.sql'))
  .sort()
  .at(-1);
const dualRoleOwnerMigration = dualRoleOwnerMigrationName
  ? readFileSync(new URL(`../../supabase/migrations/${dualRoleOwnerMigrationName}`, import.meta.url), 'utf8')
  : '';
const createClientFunction = readFileSync(
  new URL('../../supabase/functions/create-client/index.ts', import.meta.url),
  'utf8'
);
const multiBusinessMigration = readFileSync(
  new URL('../../supabase/migrations/20260812172641_add_multi_business_foundation.sql', import.meta.url),
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
const settingsHubSource = readFileSync(
  new URL('../../src/features/restaurant-settings/SettingsHub.tsx', import.meta.url),
  'utf8'
);
const restaurantWorkspaceSource = readFileSync(
  new URL('../../src/features/restaurant-admin/RestaurantAdminWorkspace.tsx', import.meta.url),
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

test('new restaurants remain inactive until they complete the activation workflow', () => {
  assert.match(createClientFunction, /create_platform_business_from_template/i);
  assert.match(multiBusinessMigration, /set status = 'draft'/i);
  assert.match(multiBusinessMigration, /legal_activation_status,[\s\S]*?'draft'/i);
  assert.match(mainSource, /path="\/restaurant\/activation"/i);
  assert.match(platformAdminSource, /Договоры и активации/i);
  assert.match(catalogAdminApiSource, /legalActivationStatus/i);
  assert.match(catalogAdminApiSource, /legal_activation_status/i);
});

test('restaurant owner enters the demo cabinet first and starts legal activation from settings', () => {
  assert.ok(demoEntryMigrationName, 'demo-before-activation migration must exist');
  const redirectFunction = demoEntryMigration.match(
    /function public\.resolve_current_login_redirect\(\)[\s\S]*?revoke all on function public\.resolve_current_login_redirect/i
  )?.[0] ?? '';

  assert.match(redirectFunction, /return '\/' \|\| target_slug \|\| '\/dashboard'/i);
  assert.doesNotMatch(redirectFunction, /restaurant\/activation/i);
  assert.doesNotMatch(
    catalogAdminSource,
    /if\s*\(access\.legalActivationStatus\s*!==\s*'active'\)[\s\S]{0,200}<Navigate[^>]+restaurant\/activation/i
  );
  assert.match(settingsHubSource, /Активировать ресторан/i);
  assert.match(restaurantWorkspaceSource, /getCatalogAdminAccess\(catalogSlug\)/i);
  assert.match(restaurantWorkspaceSource, /navigate\('\/restaurant\/activation'\)/i);
});

test('super administrator edits restaurant-specific activation data before owner acceptance', () => {
  assert.ok(adminSetupMigrationName, 'admin restaurant activation setup migration must exist');
  for (const functionName of [
    'get_admin_restaurant_activation_setup',
    'save_admin_restaurant_activation_setup',
    'get_current_restaurant_activation_profile_details'
  ]) {
    assert.match(adminSetupMigration, new RegExp(`function public\\.${functionName}\\(`, 'i'));
  }
  assert.match(adminSetupMigration, /public\.is_platform_admin\(\)/i);
  assert.match(
    adminSetupMigration,
    /function public\.save_admin_restaurant_activation_setup\([\s\S]*?if auth\.uid\(\) is null or not public\.is_platform_admin\(\)/i
  );
  assert.match(adminSetupMigration, /insert into public\.restaurant_legal_profiles/i);
  assert.match(adminSetupMigration, /insert into public\.restaurant_tariffs/i);
  assert.match(adminSetupMigration, /update public\.catalogs[\s\S]*logo_url/i);
  assert.match(adminSetupMigration, /restaurant\.activation\.setup_updated/i);
  assert.match(adminSetupMigration, /current_restaurant_client_id\(\)/i);
  assert.doesNotMatch(adminSetupMigration, /service_role|supabase_service_role_key/i);
});

test('a dual-role platform administrator may activate only a restaurant they actually own', () => {
  assert.ok(dualRoleOwnerMigrationName, 'dual-role restaurant owner activation migration must exist');
  for (const functionName of [
    'get_current_restaurant_activation',
    'get_current_restaurant_activation_profile_details',
    'request_restaurant_activation_code',
    'confirm_restaurant_activation'
  ]) {
    assert.match(dualRoleOwnerMigration, new RegExp(`function public\\.${functionName}\\(`, 'i'));
  }

  assert.match(dualRoleOwnerMigration, /owner_user_id\s*=\s*viewer_user_id/i);
  assert.match(
    dualRoleOwnerMigration,
    /public\.is_platform_admin\(\)[\s\S]{0,180}owner_user_id\s*(?:<>|is distinct from)\s*viewer_user_id/i
  );
  assert.match(dualRoleOwnerMigration, /legal_acceptance_permission_required/i);
  assert.match(dualRoleOwnerMigration, /where id = target_request_id and user_id = viewer_user_id/i);
  assert.doesNotMatch(dualRoleOwnerMigration, /service_role|supabase_service_role_key/i);

  for (const signature of [
    'get_current_restaurant_activation\\(\\)',
    'get_current_restaurant_activation_profile_details\\(\\)',
    'request_restaurant_activation_code\\(uuid, jsonb, uuid\\[\\], jsonb, uuid\\)',
    'confirm_restaurant_activation\\(uuid, text\\)'
  ]) {
    assert.match(dualRoleOwnerMigration, new RegExp(`revoke all on function public\\.${signature} from public, anon`, 'i'));
    assert.match(dualRoleOwnerMigration, new RegExp(`grant execute on function public\\.${signature} to authenticated`, 'i'));
  }
});
