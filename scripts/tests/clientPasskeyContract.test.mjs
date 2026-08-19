import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('client passkey bootstrap validates the custom session before privileged Auth operations', async () => {
  const source = await read('supabase/functions/bootstrap-client-passkey/index.ts');

  assert.match(source, /CLIENT_PASSKEY_ALLOWED_ORIGINS/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin['"]:\s*['"]\*['"]/);
  assert.match(source, /get_client_account_session/);
  assert.match(source, /link_client_account_auth_user/);
  assert.match(source, /CATALOGG_SERVICE_ROLE_KEY/);
  assert.match(source, /hashed_token/);
  assert.ok(
    source.indexOf("get_client_account_session") < source.indexOf('admin.auth.admin.createUser'),
    'client session must be checked before an Auth user can be created'
  );
});

test('only the service role can atomically attach an Auth identity to a client account', async () => {
  const migration = await read('supabase/migrations/20260810211952_link_client_passkey_auth.sql');

  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /client_account_sessions/);
  assert.match(migration, /session\.expires_at > now\(\)/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to anon/i);
});

test('the browser opts into Supabase passkeys and converts Face ID to the existing client session', async () => {
  const [supabaseSource, passkeyApi] = await Promise.all([
    read('src/shared/supabase.ts'),
    read('src/shared/api/clientPasskeyApi.ts')
  ]);

  assert.match(supabaseSource, /experimental:\s*\{ passkey: true \}/);
  assert.match(passkeyApi, /auth\.registerPasskey\(\)/);
  assert.match(passkeyApi, /auth\.signInWithPasskey\(\)/);
  assert.match(passkeyApi, /loginCurrentAuthClientAccount\(\)/);
  assert.match(passkeyApi, /type:\s*'magiclink'/);
});

test('an existing Passkey Auth session restores an expired custom client session', async () => {
  const clientAccountApi = await read('src/shared/api/clientAccountApi.ts');

  assert.match(clientAccountApi, /restoreClientAccountFromAuthSession/);
  assert.match(clientAccountApi, /supabase\.auth\.getSession\(\)/);
  assert.match(clientAccountApi, /if \(!token\) return restoreClientAccountFromAuthSession\(\)/);
  assert.match(clientAccountApi, /clearClientSession\(\);[\s\S]*return restoreClientAccountFromAuthSession\(\)/);
});

test('first checkout pauses once for an optional Passkey and then resumes the same order', async () => {
  const [checkout, presentation] = await Promise.all([
    read('src/features/checkout/CheckoutScreen.tsx'),
    read('src/features/client-pairing/ClientPairing.tsx')
  ]);

  assert.match(checkout, /const shouldOfferPasskeyAfterAuth = !hasClientSession && clientPasskeyIsSupported\(\)/);
  assert.match(checkout, /pendingOrderContinuationRef\.current = submitRestaurantOrder/);
  assert.match(checkout, /setIsPasskeyCheckoutPromptOpen\(true\);\s*return;/);
  assert.match(checkout, /<ClientPasskeyRegistrationDialog[\s\S]*onContinue=\{continuePendingOrder\}/);
  assert.match(presentation, /Сохранить вход и оформить/);
  assert.match(presentation, /Только оформить заказ/);

  assert.ok(
    checkout.indexOf('pendingOrderContinuationRef.current = submitRestaurantOrder')
      < checkout.lastIndexOf('submitRestaurantOrder();'),
    'the exact pending order must be stored before checkout waits for the biometric choice'
  );
});
