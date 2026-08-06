import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const edgeSource = readFileSync(
  new URL('../../supabase/functions/delete-platform-user/index.ts', import.meta.url),
  'utf8'
);
const browserApiSource = readFileSync(
  new URL('../../src/shared/api/platformUsersApi.ts', import.meta.url),
  'utf8'
);
const clientsApiSource = readFileSync(
  new URL('../../src/shared/api/clientsApi.ts', import.meta.url),
  'utf8'
);
const driversApiSource = readFileSync(
  new URL('../../src/shared/api/driversApi.ts', import.meta.url),
  'utf8'
);
const usersPageSource = readFileSync(
  new URL('../../src/features/platform-admin-users/PlatformUsersPage.tsx', import.meta.url),
  'utf8'
);

test('platform account deletion stays behind an authenticated superadmin Edge Function', () => {
  assert.match(browserApiSource, /functions\.invoke[^\n]*delete-platform-user/);
  assert.match(browserApiSource, /confirmed: true/);
  assert.doesNotMatch(browserApiSource, /SERVICE_ROLE|service_role/i);
  assert.match(edgeSource, /userClient\.auth\.getUser\(\)/);
  assert.match(edgeSource, /userClient\.rpc\('is_platform_admin'\)/);
  assert.match(edgeSource, /targetAuthUserId === userData\.user\.id/);
  assert.match(edgeSource, /!payload\.confirmed/);
  assert.match(edgeSource, /Нельзя удалить собственный аккаунт суперадмина/);
  assert.match(edgeSource, /Этот пользователь является водителем/);
});

test('deleted and non-client accounts do not leak back into the three visible groups', () => {
  assert.match(driversApiSource, /\.neq\('status', 'deleted'\)/);
  assert.equal([...driversApiSource.matchAll(/\.neq\('status', 'deleted'\)/g)].length, 2);
  assert.match(clientsApiSource, /excludedProfileIds/);
  assert.match(clientsApiSource, /role !== 'client'/);
  assert.match(clientsApiSource, /owner_user_id/);
  assert.match(usersPageSource, /const clientAccounts/);
  assert.match(usersPageSource, /filter\(\(user\) => !user\.id\.startsWith\('order-user-'\)\)/);
});

test('deletion removes account access while preserving restaurant catalogs and order history', () => {
  assert.match(edgeSource, /deleteUser\(targetAuthUserId, true\)/);
  assert.equal([...edgeSource.matchAll(/deleteUser\(targetAuthUserId, true\)/g)].length, 3);
  assert.match(edgeSource, /kind === 'restaurant'/);
  assert.match(edgeSource, /kind === 'driver'/);
  assert.match(edgeSource, /kind === 'client'/);
  assert.match(edgeSource, /\.from\('catalog_members'\)\.delete\(\)/);
  assert.match(edgeSource, /\.from\('clients'\)\.delete\(\)/);
  assert.match(edgeSource, /\.from\('users'\)\.delete\(\)/);
  assert.match(edgeSource, /\.from\('client_signups'\)\.delete\(\)/);
  assert.doesNotMatch(edgeSource, /\.from\('orders'\)\.delete\(\)/);
  assert.doesNotMatch(edgeSource, /\.from\('catalogs'\)\.delete\(\)/);
});
