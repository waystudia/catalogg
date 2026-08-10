import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const driverApp = readFileSync(
  new URL('../../src/pages/driver/DriverApp.tsx', import.meta.url),
  'utf8'
);

test('going online requests push permission during the original driver tap', () => {
  const toggleStart = driverApp.indexOf('const toggleOnline = async () =>');
  const toggleEnd = driverApp.indexOf('const enableNotifications = () =>', toggleStart);
  const toggleSource = driverApp.slice(toggleStart, toggleEnd);
  const permissionCall = toggleSource.indexOf('requestRestaurantOrderNotificationPermission');
  const firstAwait = toggleSource.indexOf('await ');

  assert.ok(toggleStart >= 0 && toggleEnd > toggleStart, 'driver online handler must exist');
  assert.ok(permissionCall >= 0, 'driver online handler must request push permission');
  assert.ok(firstAwait >= 0, 'driver online handler must persist availability');
  assert.ok(permissionCall < firstAwait, 'push permission must be requested before user activation expires');
});
