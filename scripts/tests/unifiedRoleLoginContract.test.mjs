import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('all role entry points use the shared phone-or-email login page', async () => {
  const [loginPage, app, catalogAdmin, platformAdmin, driver] = await Promise.all([
    read('src/pages/login/LoginPage.tsx'),
    read('src/app/App.tsx'),
    read('src/pages/catalog-admin/CatalogAdminApp.tsx'),
    read('src/pages/platform-admin/PlatformAdminApp.tsx'),
    read('src/pages/driver/DriverApp.tsx')
  ]);

  assert.match(loginPage, /resolveUnifiedLogin\(identifier, password\)/);
  assert.match(loginPage, /'phone' \| 'email'/);
  assert.match(loginPage, /Клиенты · рестораны · водители/);
  assert.doesNotMatch(loginPage, /Клиенты · рестораны · водители · суперадмин/);
  assert.doesNotMatch(app, /<LoginModal/);
  assert.match(catalogAdmin, /function CatalogLogin\(\)[\s\S]*<Navigate to="\/login" replace \/>/);
  assert.match(platformAdmin, /function PlatformLoginState\(\)[\s\S]*<Navigate to="\/login" replace \/>/);
  assert.match(driver, /телефон или email и пароль/);
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
