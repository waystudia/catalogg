import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { appUrl } from '../../e2e/visual/config.mjs';
import { waitFor } from '../../e2e/visual/backend.mjs';

test('visual E2E keeps one configurable base URL for every real UI route', () => {
  assert.equal(appUrl({ baseUrl: 'https://wayyaam.ru' }, '/driver/orders'), 'https://wayyaam.ru/#/driver/orders');
  assert.equal(
    appUrl({ baseUrl: 'http://localhost:5173' }, 'r/wayyaam-test-restaurant'),
    'http://localhost:5173/#/r/wayyaam-test-restaurant'
  );
});

test('backend polling completes only after the observed state is true', async () => {
  let reads = 0;
  const state = await waitFor('observable state', async () => ({ completed: ++reads === 3 }), (value) => value.completed, {
    timeout: 1_000,
    interval: 1
  });
  assert.deepEqual(state, { completed: true });
  assert.equal(reads, 3);
});

test('backend polling rejects instead of printing a false PASS', async () => {
  await assert.rejects(
    waitFor('never completed', async () => ({ completed: false }), (value) => value.completed, { timeout: 5, interval: 1 }),
    /состояние не наступило/
  );
});

test('visual control plane is restricted to E2E actors and production aggregates are read-only', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/20260807130000_visual_e2e_control_plane.sql', import.meta.url), 'utf8');
  assert.match(sql, /if not public\.is_wayyaam_e2e_actor\(\) then raise exception 'e2e_actor_required'/i);
  assert.match(sql, /where not coalesce\(is_test_order, false\)/i);
  assert.match(sql, /where not coalesce\(is_test, false\)/i);
  assert.match(sql, /revoke all on function public\.reset_wayyaam_e2e_state\(\) from public, anon/i);
  assert.doesNotMatch(sql, /delete\s+from/i);
});

test('visual E2E checks delivery timestamps that exist in the production schema', async () => {
  const backend = await readFile(new URL('../../e2e/visual/backend.mjs', import.meta.url), 'utf8');
  assert.match(backend, /pickup_qr_confirmed_at, assigned_at, delivered_at/);
  assert.doesNotMatch(backend, /pickup_qr_confirmed_at, accepted_at, completed_at/);
  assert.match(backend, /delivery\.delivered_at/);
});

test('visual E2E cannot pass when the driver earned zero or finance rows were duplicated', async () => {
  const backend = await readFile(new URL('../../e2e/visual/backend.mjs', import.meta.url), 'utf8');
  const runner = await readFile(new URL('../../e2e/visual/visual-runner.mjs', import.meta.url), 'utf8');
  assert.match(backend, /get_wayyaam_e2e_order_finance/);
  assert.match(backend, /finance\.restaurant_charge_count,\s*1/);
  assert.match(backend, /finance\.driver_charge_count,\s*1/);
  assert.match(backend, /expectedPayoutLedgerCount/);
  assert.match(backend, /finance\.driver_payout_count,\s*expectedPayoutLedgerCount/);
  assert.match(backend, /Number\(finance\.earning_amount\)\s*>\s*0/);
  assert.match(backend, /Number\(finance\.earning_commission\),\s*30/);
  assert.match(backend, /finance\.expected_earning_amount/);
  assert.match(backend, /Number\(finance\.earning_net_amount\)/);
  assert.match(runner, /Driver earned.*earning_amount/);
  assert.match(runner, /Realtime defect: final status was not delivered/);
  assert.match(runner, /client\.page\.reload/);
});

test('restaurant visual flow follows an accepted order into the preparing filter', async () => {
  const roles = await readFile(new URL('../../e2e/visual/roles.mjs', import.meta.url), 'utf8');
  const accepted = roles.indexOf("'Принять заказ', 'accepted'");
  const preparingFilter = roles.indexOf("name: 'Готовятся', exact: true", accepted);
  const startPreparing = roles.indexOf("'Начать готовить', 'preparing'", accepted);

  assert.ok(accepted >= 0);
  assert.ok(preparingFilter > accepted);
  assert.ok(startPreparing > preparingFilter);
});

test('Mangal visual checkout passes real configured upsell steps before delivery', async () => {
  const roles = await readFile(new URL('../../e2e/visual/roles.mjs', import.meta.url), 'utf8');
  const checkout = roles.indexOf('name: /Оформить заказ/');
  const upsell = roles.indexOf("name: 'Продолжить без выбора'", checkout);
  const delivery = roles.indexOf("name: 'Доставка', exact: true", checkout);

  assert.ok(checkout >= 0);
  assert.ok(upsell > checkout);
  assert.ok(delivery > upsell);
});

test('restaurant visual flow follows a waiting-driver order into the on-the-way filter', async () => {
  const roles = await readFile(new URL('../../e2e/visual/roles.mjs', import.meta.url), 'utf8');
  const waitingDriver = roles.indexOf("'Вызвать доставку', 'waiting_driver'");
  const onTheWayFilter = roles.indexOf("name: 'В пути', exact: true", waitingDriver);
  const dispatch = roles.indexOf("name: 'Вызвать таксистов'", waitingDriver);

  assert.ok(waitingDriver >= 0);
  assert.ok(onTheWayFilter > waitingDriver);
  assert.ok(dispatch > onTheWayFilter);
});

test('visual fixture clones Mangal without copying production identities or losing isolation', async () => {
  const migration = await readFile(
    new URL('../../supabase/migrations/20260807160000_clone_mangal_into_e2e_fixture.sql', import.meta.url),
    'utf8'
  );
  const backend = await readFile(new URL('../../e2e/visual/backend.mjs', import.meta.url), 'utf8');

  assert.match(migration, /where slug = 'mangal' and is_test is not true/i);
  assert.match(migration, /name = 'Мангал тест'/);
  assert.match(migration, /name = 'Дукат тест'/);
  assert.match(migration, /is_test = true/);
  assert.match(migration, /whatsapp = '\+79000000002'/);
  assert.match(migration, /instagram_url = ''/);
  assert.doesNotMatch(migration, /payout_details\s*=/i);
  assert.doesNotMatch(migration, /target\.email\s*=/i);
  assert.match(backend, /Жижиг-галнаш/);
  assert.match(backend, /expectedSubtotal, 980/);
  assert.match(backend, /stock_count, is_unlimited/);
});
