import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync('src/pages/client-platform/ClientPlatformApp.tsx', 'utf8');
const legacyCheckoutSource = fs.readFileSync('src/features/checkout/CheckoutScreen.tsx', 'utf8');
const restaurantAppSource = fs.readFileSync('src/app/App.tsx', 'utf8');
const apiSource = fs.readFileSync('src/shared/api/clientAccountApi.ts', 'utf8');
const loginRedirectSource = fs.readFileSync('src/shared/api/loginRedirectApi.ts', 'utf8');
const migrationFiles = fs
  .readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('_add_client_password_accounts.sql'));

test('client checkout can create a real account session without leaving checkout', () => {
  assert.match(appSource, /buildClientAuthPath\(`\/r\/\$\{restaurant\.slug\}\/checkout`\)/);
  assert.match(appSource, /Войти или зарегистрироваться/);
  assert.match(appSource, /restoreClientAccountSession\(\)/);
  assert.match(legacyCheckoutSource, /restoreClientAccountSession\(\)/);
  assert.doesNotMatch(legacyCheckoutSource, /buildClientAuthPath\(`\/\$\{catalogSlug\}\/checkout`\)/);
  assert.match(legacyCheckoutSource, /registerClientAccount/);
  assert.match(legacyCheckoutSource, /loginClientAccount/);
  assert.match(restaurantAppSource, /routeSection === 'checkout'/);
});

test('client profile keeps registration and embeds the unified login panel', () => {
  assert.match(appSource, /registerClientAccount/);
  assert.match(appSource, /type=\{isPasswordVisible \? 'text' : 'password'\}/);
  assert.match(appSource, /Зарегистрироваться/);
  assert.match(appSource, /resolveUnifiedLogin\([\s\S]*identifier,[\s\S]*clientPassword,[\s\S]*expectedLoginRole,[\s\S]*clientReturnTo[\s\S]*\)/);
  assert.match(appSource, /expectedLoginRole \? '' : profile\.phone/);
  assert.match(appSource, /if \(!expectedLoginRole\) \{[\s\S]*setAccountIdentifier\(session\.phone\)/);
  assert.match(appSource, /Вход в WayYaam/);
  assert.match(appSource, /Для клиентов, ресторанов и водителей/);
  assert.match(appSource, /Телефон или почта/);
  assert.match(appSource, /Показать пароль/);
  assert.doesNotMatch(appSource, /profile-login-methods/);
  assert.doesNotMatch(appSource, /loginMethod/);
  assert.doesNotMatch(appSource, /Открыть единый вход/);
  assert.match(loginRedirectSource, /loginClientAccount/);
  assert.match(appSource, /Аккаунт защищён паролем/);
  assert.match(appSource, /Гостевой профиль/);
});

test('client account session is restored from the server', () => {
  assert.match(apiSource, /get_client_account_session/);
  assert.match(apiSource, /waycatalog-client-session/);
});

test('registration and checkout persist separate legal evidence before creating the order', () => {
  assert.match(apiSource, /export const recordClientRegistrationLegalChoices/);
  assert.match(apiSource, /register_client_account_with_legal/);
  assert.doesNotMatch(apiSource, /Аккаунт создан, но юридическое подтверждение не записано/);
  assert.match(legacyCheckoutSource, /await recordClientRegistrationLegalChoices\(sessionToken, \{/);
  assert.match(legacyCheckoutSource, /acceptedAgreement,/);
  assert.match(legacyCheckoutSource, /acceptedPersonalData,/);
  assert.match(legacyCheckoutSource, /generalConsentConfirmed: clientLegalState !== null/);
  assert.match(legacyCheckoutSource, /orderTransferConfirmed: clientLegalState !== null/);

  const loginIndex = legacyCheckoutSource.indexOf('session = await loginClientAccount');
  const legalIndex = legacyCheckoutSource.indexOf('await recordClientRegistrationLegalChoices(sessionToken');
  const orderIndex = legacyCheckoutSource.indexOf('void createRestaurantOrderFromCart');

  assert.ok(loginIndex > 0 && legalIndex > loginIndex, 'existing accounts must record legal choices after login');
  assert.ok(orderIndex > legalIndex, 'the order must be created only after login-time legal choices are persisted');
});

test('password account migration hashes passwords and isolates private tables', () => {
  assert.equal(migrationFiles.length, 1);
  const sql = fs.readFileSync(`supabase/migrations/${migrationFiles[0]}`, 'utf8');
  assert.match(sql, /extensions\.crypt\(.*extensions\.gen_salt\('bf'/s);
  assert.doesNotMatch(sql, /\n\s+password\s+text\s+not null/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.client_accounts from public, anon, authenticated/i);
  assert.match(sql, /revoke all on table public\.client_account_sessions from public, anon, authenticated/i);
});
