import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const driverAppSource = read('src/pages/driver/DriverApp.tsx');
const driverActivationApiSource = read('src/shared/api/driverActivationApi.ts');
const platformDriversSource = read('src/features/platform-admin-drivers/PlatformDriversPage.tsx');
const legacyPlatformDriversSource = read('src/pages/platform-admin/PlatformAdminApp.tsx');
const migrationSource = read('supabase/migrations/20260813210000_driver_legal_activation_at_role_activation.sql');

test('driver confirmations exist only in the authenticated activation screen', () => {
  assert.match(driverAppSource, /function DriverActivationScreen/);
  assert.match(driverAppSource, /Активация водителя/);
  assert.match(driverAppSource, /Я прочитал и принимаю оферту для водителя/);
  assert.match(driverAppSource, /Даю согласие на обработку персональных данных/);
  assert.match(driverAppSource, /Разрешаю использовать геолокацию во время доставки/);
  assert.match(driverAppSource, /navigate\('\/driver\/activation', \{ replace: true \}\)/);
  assert.doesNotMatch(platformDriversSource, /consentConfirmed|Подтверждаю, что водитель/);
  assert.doesNotMatch(legacyPlatformDriversSource, /driverConsentConfirmed|Подтверждаю, что водитель/);
  assert.match(platformDriversSource, /Активация водителя:/);
  assert.match(legacyPlatformDriversSource, /Активация водителя:/);
});

test('driver activation is recorded by the authenticated server RPC with canonical documents', () => {
  assert.match(driverActivationApiSource, /rpc\('get_current_driver_legal_activation'\)/);
  assert.match(driverActivationApiSource, /rpc\('activate_current_driver'/);
  assert.match(driverActivationApiSource, /offer: true[\s\S]*personal_data: true[\s\S]*location: true/);

  assert.match(migrationSource, /set legal_activation_status = 'legacy_active'[\s\S]*where legal_activation_status is null/);
  assert.match(migrationSource, /alter column legal_activation_status set default 'awaiting_acceptance'/);
  assert.match(migrationSource, /current_driver_id\(\)/);
  assert.match(migrationSource, /target_confirmations ->> 'offer'/);
  assert.match(migrationSource, /target_confirmations ->> 'personal_data'/);
  assert.match(migrationSource, /target_confirmations ->> 'location'/);
  assert.match(migrationSource, /'driver_offer', '2\.0'[\s\S]*0c0f5c662c5d4b72b09776a380c9f59dca73c9a53a79252d07cc6d2fcaab223f/);
  assert.match(migrationSource, /'driver_consent', '1\.0'[\s\S]*d69209f4c9829694f512d4da6c0947d6a5bbaf0d5c15b84068d42360d9bdbb39/);
  assert.match(migrationSource, /set legal_activation_status = 'active'/);
  assert.match(migrationSource, /grant execute on function public\.activate_current_driver\(jsonb\) to authenticated/);
});

test('legacy drivers are not assigned fabricated legal-consent rows during migration', () => {
  const backfillEnd = migrationSource.indexOf('create or replace function public.get_current_driver_legal_activation');
  const backfill = migrationSource.slice(0, backfillEnd);
  assert.doesNotMatch(backfill, /insert into public\.legal_consent_records/);
  assert.match(backfill, /legacy_active/);
});
