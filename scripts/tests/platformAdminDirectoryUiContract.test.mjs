import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const adminSource = readFileSync(
  new URL('../../src/pages/platform-admin/PlatformAdminApp.tsx', import.meta.url),
  'utf8'
);
const usersSource = readFileSync(
  new URL('../../src/features/platform-admin-users/PlatformUsersPage.tsx', import.meta.url),
  'utf8'
);
const geographySource = readFileSync(
  new URL('../../src/features/platform-admin-geography/PlatformGeographyPage.tsx', import.meta.url),
  'utf8'
);
const clientsApiSource = readFileSync(
  new URL('../../src/shared/api/clientsApi.ts', import.meta.url),
  'utf8'
);

test('platform user and geography pages are feature modules instead of monolithic admin functions', () => {
  assert.match(adminSource, /PlatformUsersPage/);
  assert.match(adminSource, /PlatformGeographyPage/);
  assert.doesNotMatch(adminSource, /function ClientSignupsPage/);
  assert.doesNotMatch(adminSource, /function SettlementsPage/);
  assert.match(adminSource, /route === 'client-signups' \? 'clients' : route/);
});

test('platform user directory keeps real order aggregation, filters, exports and details', () => {
  assert.match(clientsApiSource, /export async function getPlatformUserDirectory/);
  assert.match(clientsApiSource, /export async function createClientSignup/);
  assert.match(clientsApiSource, /\.from\('orders'\)/);
  assert.match(usersSource, /downloadCsv/);
  assert.match(usersSource, /downloadXlsx/);
  assert.match(usersSource, /orderState === 'with-orders'/);
  assert.match(usersSource, /PlatformUserDetails/);
  assert.match(usersSource, /Добавить пользователя/);
  assert.match(usersSource, /История заказов/);
});

test('geography page reuses settlement, driver, client and pricing APIs', () => {
  assert.match(geographySource, /getDeliverySettlements/);
  assert.match(geographySource, /getSettlementRequests/);
  assert.match(geographySource, /getDrivers/);
  assert.match(geographySource, /getClients/);
  assert.match(geographySource, /getDeliveryPricingRules/);
  assert.match(geographySource, /saveDeliveryPricingRule/);
  assert.match(geographySource, /reviewDeliveryPriceRequest/);
  assert.match(geographySource, /downloadCsv/);
  assert.match(geographySource, /downloadXlsx/);
});
