import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('driver and promotion admin pages are isolated feature modules', async () => {
  const [app, drivers, contests] = await Promise.all([
    read('src/pages/platform-admin/PlatformAdminApp.tsx'),
    read('src/features/platform-admin-drivers/PlatformDriversPage.tsx'),
    read('src/features/platform-admin-contests/PlatformContestsPage.tsx')
  ]);

  assert.match(app, /<PlatformDriversPage \/>/);
  assert.match(app, /<PlatformContestsPage \/>/);
  assert.match(drivers, /getPlatformDriverActivity/);
  assert.match(drivers, /downloadCsv\('waycatalog-drivers'/);
  assert.match(drivers, /type: 'create'/);
  assert.match(contests, /getPlatformContestTickets/);
  assert.match(contests, /Каждый заказ = один билет/);
});

test('driver list keeps real account mutations behind compact controls', async () => {
  const drivers = await read('src/features/platform-admin-drivers/PlatformDriversPage.tsx');

  assert.match(drivers, /createDriver\(/);
  assert.match(drivers, /updateDriverProfile\(/);
  assert.match(drivers, /updateDriverServiceSettlements\(/);
  assert.match(drivers, /Заблокировать/);
  assert.match(drivers, /Сбросить пароль/);
});
