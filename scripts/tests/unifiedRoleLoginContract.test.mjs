import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('all role entry points use the embedded phone-or-email profile login', async () => {
  const [main, profile, app, catalogAdmin, platformAdmin, driver, loginRedirect] = await Promise.all([
    read('src/main.tsx'),
    read('src/pages/client-platform/ClientPlatformApp.tsx'),
    read('src/app/App.tsx'),
    read('src/pages/catalog-admin/CatalogAdminApp.tsx'),
    read('src/pages/platform-admin/PlatformAdminApp.tsx'),
    read('src/pages/driver/DriverApp.tsx'),
    read('src/shared/api/loginRedirectApi.ts')
  ]);

  assert.doesNotMatch(main, /pages\/login\/LoginPage/);
  assert.match(profile, /resolveUnifiedLogin\([\s\S]*identifier,[\s\S]*clientPassword,[\s\S]*expectedLoginRole,[\s\S]*clientReturnTo[\s\S]*\)/);
  assert.match(profile, /if \(!expectedLoginRole\)\s*\{[\s\S]*setClientMessage\('Вы вошли в аккаунт'\)/);
  assert.match(profile, /expectedLoginRole \? '' : profile\.phone/);
  assert.match(loginRedirect, /has_catalog_admin_access/);
  assert.match(loginRedirect, /getProductionAuthConfigurationError/);
  assert.match(loginRedirect, /Сервис входа временно не настроен/);
  assert.match(loginRedirect, /preserveSupabaseSessionForRedirect\(redirect, data\.session\)/);
  assert.match(loginRedirect, /usesEmail \|\| expectedRole \|\| !isCredentialError\(error\)/);
  assert.match(profile, /redirectToRoleApp\(targetPath\)/);
  assert.match(profile, /Для клиентов, ресторанов и водителей/);
  assert.doesNotMatch(app, /<LoginModal/);
  assert.match(catalogAdmin, /buildProfileLoginPath/);
  assert.match(platformAdmin, /buildProfileLoginPath/);
  assert.match(driver, /телефон или email и пароль/);
  assert.doesNotMatch(driver, /to="\/login"/);
});

test('staff password auth sends either an email or an E.164 phone to Supabase', async () => {
  const supabaseSource = await read('src/shared/supabase.ts');
  const identifierSource = await read('src/shared/loginIdentifier.ts');

  assert.match(supabaseSource, /buildPasswordCredentials\(identifier, password\)/);
  assert.match(identifierSource, /return \{ email: normalized\.toLowerCase\(\), password \}/);
  assert.match(identifierSource, /return \{ phone: normalizeLoginPhone\(normalized\), password \}/);
});

test('restaurant and driver provisioning attaches a confirmed auth phone', async () => {
  const sources = await Promise.all([
    read('supabase/functions/create-client/index.ts'),
    read('supabase/functions/update-client/index.ts'),
    read('supabase/functions/create-driver/index.ts'),
    read('supabase/functions/update-driver/index.ts')
  ]);

  for (const source of sources) {
    assert.match(source, /normalizeAuthPhone/);
    assert.match(source, /phone_confirm/);
  }
});

test('a confirmed Auth client is bridged into the existing client account session', async () => {
  const [loginRedirect, clientAccountApi, migration] = await Promise.all([
    read('src/shared/api/loginRedirectApi.ts'),
    read('src/shared/api/clientAccountApi.ts'),
    read('supabase/migrations/20260807120000_wayyaam_e2e_accounts.sql')
  ]);

  assert.match(loginRedirect, /loginCurrentAuthClientAccount\(\)/);
  assert.match(clientAccountApi, /rpc\('login_current_auth_client_account'\)/);
  assert.match(migration, /create or replace function public\.login_current_auth_client_account\(\)/i);
  assert.match(migration, /where client_account\.auth_user_id = auth\.uid\(\)/i);
  assert.match(migration, /role = 'client'[\s\S]*return '\/profile'/i);
});

test('every authenticated client route hydrates server-side saved addresses into the existing checkout store', async () => {
  const [clientAccountApi, clientPlatformApp, store] = await Promise.all([
    read('src/shared/api/clientAccountApi.ts'),
    read('src/pages/client-platform/ClientPlatformApp.tsx'),
    read('src/features/client-platform/store.ts')
  ]);

  assert.match(clientAccountApi, /from\('client_addresses'\)/);
  assert.match(clientAccountApi, /addressLine:\s*row\.address_line/);
  assert.match(clientPlatformApp, /function ClientPlatformContent\(\)[\s\S]*hasStoredClientSession\(\)/);
  assert.match(clientPlatformApp, /persist\.onFinishHydration\(hydrateAddresses\)/);
  assert.match(clientPlatformApp, /getCurrentClientAddresses\(\)/);
  assert.match(clientPlatformApp, /replaceAddresses\(addresses\)/);
  assert.match(store, /replaceAddresses:\s*\(addresses\)\s*=>\s*set\(\{ addresses \}\)/);
});
