import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('PWA startup restores the saved role auth scope before creating the Supabase client', async () => {
  const supabase = await read('src/shared/supabase.ts');

  assert.match(supabase, /getSupabaseStartupAuthScope/);
  assert.match(supabase, /readPwaResumePath\(\)/);
  assert.match(supabase, /persistSession:\s*true/);
  assert.match(supabase, /autoRefreshToken:\s*true/);
});

test('temporary wake-up failures retry instead of navigating to the unified login page', async () => {
  const [homeRoute, driverApp, deliveryApi, restaurantApp, supabase, platformAdmin] = await Promise.all([
    read('src/PwaHomeRoute.tsx'),
    read('src/pages/driver/DriverApp.tsx'),
    read('src/shared/api/deliveryApi.ts'),
    read('src/app/App.tsx'),
    read('src/shared/supabase.ts'),
    read('src/pages/platform-admin/PlatformAdminApp.tsx')
  ]);

  assert.match(homeRoute, /setTimeout\(restoreSession/);
  assert.doesNotMatch(homeRoute, /catch\(\(\)\s*=>\s*\{\s*if \(isMounted\) setIsSessionChecked\(true\)/);
  assert.match(driverApp, /setTimeout\(restoreDriverSession/);
  assert.doesNotMatch(deliveryApi, /hasDriverAuthSession[\s\S]*catch\s*\{\s*return false/);
  assert.match(restaurantApp, /setTimeout\(restoreAdminSession/);
  assert.doesNotMatch(supabase, /hasAdminSession\(catalogSlug, session\)\.then\(callback\)\.catch\(\(\) => callback\(false\)\)/);
  assert.match(platformAdmin, /platformAdminQuery\.isError/);
});

test('client account restoration keeps its token and cached profile on transient API errors', async () => {
  const [clientAccountApi, persistentSessionMigration] = await Promise.all([
    read('src/shared/api/clientAccountApi.ts'),
    read('supabase/migrations/20260810114500_persist_client_sessions_until_logout.sql')
  ]);

  assert.match(clientAccountApi, /clientSessionSnapshotStorageKey/);
  assert.match(clientAccountApi, /if \(snapshot\) return snapshot/);
  assert.match(clientAccountApi, /throw new ClientSessionRestorationUnavailableError\(\)/);
  assert.match(clientAccountApi, /if \(!data\) \{[\s\S]*clearClientSession/);
  assert.match(clientAccountApi, /logoutClientAccount[\s\S]*clearClientSession\(\)/);
  assert.match(persistentSessionMigration, /before insert or update of expires_at/i);
  assert.match(persistentSessionMigration, /new\.expires_at := 'infinity'/i);
  assert.match(persistentSessionMigration, /where expires_at > now\(\)/i);
  assert.doesNotMatch(persistentSessionMigration, /where expires_at <= now\(\)/i);
});
