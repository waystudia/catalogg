import assert from 'node:assert/strict';
import { buildConfig } from './config.mjs';
import { createBackend, waitFor } from './backend.mjs';
import { closeRoles, launchRole, screenshot } from './browser.mjs';
import { log, printStatus } from './log.mjs';
import {
  acceptDriverOrder, advanceRestaurant, arriveAtRestaurant, confirmCashAndQr, createClientOrder,
  finishDriverDelivery, loginRole, prepareClient, prepareDriver, prepareRestaurant
} from './roles.mjs';

const config = buildConfig();
const roles = [];
let backend;
let failed = false;

const holdOpen = async () => new Promise((resolve) => {
  const done = () => resolve();
  process.once('SIGINT', done);
  process.once('SIGTERM', done);
});

try {
  log('E2E', `Starting ${config.mode.toUpperCase()} visual E2E (${config.delivery}) at ${config.baseUrl}`);
  backend = await createBackend(config, { requireProductionSnapshot: config.mode === 'auto' });
  log('E2E', 'Health-check passed: accounts, address, catalog, menu, isolation, driver, QR');

  for (const roleName of ['client', 'restaurant', 'driver']) {
    const role = await launchRole(config, roleName);
    roles.push(role);
    await loginRole(role, config);
  }
  const [client, restaurant, driver] = roles;
  await Promise.all([
    prepareClient(client, config),
    prepareRestaurant(restaurant, config, backend),
    prepareDriver(driver, config)
  ]);
  printStatus({ client: '✅ LOGGED IN', restaurant: '✅ LOGGED IN', driver: '✅ ONLINE' });

  if (config.mode === 'manual') {
    log('E2E', 'MANUAL ready: CLIENT | RESTAURANT | DRIVER. Press Ctrl+C to close.');
    await holdOpen();
    for (const role of roles) log('E2E', `${role.role.toUpperCase()} browser errors: ${role.errors.length}`);
  } else {
    const startedAt = new Date(Date.now() - 2_000).toISOString();
    const order = await createClientOrder(client, config, backend, startedAt);
    await advanceRestaurant(restaurant, config, backend, order.id);
    const delivery = await acceptDriverOrder(driver, config, backend, order.id);
    await arriveAtRestaurant(driver, backend, delivery.id);
    await confirmCashAndQr(restaurant, driver, config, backend, order.id, delivery.id);
    await finishDriverDelivery(driver, config, backend, order.id);

    await waitFor('client Realtime completed', async () => client.page.getByRole('heading', { name: /Доставлен|Завершён/ }).count(), (count) => count > 0, { timeout: 12_000 });
    await screenshot(client, config, '09-client-completed.png');
    const final = await backend.assertFinal({ orderId: order.id, deliveryId: delivery.id });

    const repeated = await backend.sessions.driver.rpc('complete_driver_delivery', { target_delivery_id: delivery.id });
    assert.ok(repeated.error, 'Repeated completion unexpectedly succeeded');
    for (const role of roles) {
      assert.equal(role.errors.length, 0, `${role.role} browser errors:\n${role.errors.join('\n')}`);
      log('E2E', `${role.role.toUpperCase()} browser errors: 0`);
    }
    printStatus({
      client: '✅ COMPLETED', restaurant: '✅ +30 ₽', driver: '✅ +30 ₽', orderId: order.id,
      status: '✅ COMPLETED', restaurantDelta: final.restaurantDelta, driverDelta: final.driverDelta,
      qr: '✅ VERIFIED', realtime: '✅ CONNECTED'
    });
    log('FINANCE', 'Restaurant test debt +30 ₽; Driver test debt +30 ₽');
    log('E2E', '✅ PRODUCTION DATA UNCHANGED');
    log('E2E', `✅ PASS order_id=${order.id}`);
    if (config.keepOpen) {
      log('E2E', 'E2E_KEEP_OPEN=true; press Ctrl+C to close.');
      await holdOpen();
    }
  }
} catch (error) {
  failed = true;
  log('ERROR', error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
} finally {
  await closeRoles(roles, config, failed);
  await backend?.close().catch(() => undefined);
}
