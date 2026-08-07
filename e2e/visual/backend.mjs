import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const makeClient = (config) => createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});
const unwrap = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const waitFor = async (label, read, predicate, { timeout = 30_000, interval = 350 } = {}) => {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await read();
    if (predicate(last)) return last;
    await delay(interval);
  }
  throw new Error(`${label}: состояние не наступило за ${timeout} мс. Последнее значение: ${JSON.stringify(last)}`);
};

export const createBackend = async (config, { requireProductionSnapshot = true } = {}) => {
  const sessions = {
    client: makeClient(config), restaurant: makeClient(config), driver: makeClient(config), anonymous: makeClient(config)
  };
  for (const role of ['client', 'restaurant', 'driver']) {
    const data = unwrap(await sessions[role].auth.signInWithPassword(config.credentials[role]), `${role} auth`);
    assert.ok(data.session, `${role}: Supabase session missing`);
  }
  unwrap(await sessions.client.rpc('login_current_auth_client_account'), 'client account login');

  const rpc = (role, name, args = {}) => sessions[role].rpc(name, args).then((result) => unwrap(result, name));
  const catalog = unwrap(await sessions.client.from('catalogs')
    .select('id, slug, name, is_test').eq('slug', 'wayyaam-test-restaurant').single(), 'test restaurant');
  assert.equal(catalog.is_test, true);

  const address = unwrap(await sessions.client.from('client_addresses')
    .select('title, address_line, lat, lng, is_test').eq('title', 'Тестовый адрес').single(), 'test address');
  assert.equal(address.address_line, 'Тестовая доставка WayYaam');
  assert.equal(address.is_test, true);

  const products = unwrap(await sessions.client.from('products')
    .select('id, title, price, status').eq('catalog_id', catalog.id), 'test menu');
  const scenario = ['Чизбургер', 'Картофель фри', 'Coca-Cola', 'Сырный соус'];
  for (const title of scenario) assert.equal(products.find((row) => row.title === title)?.status, 'active', `${title} unavailable`);
  assert.equal(scenario.reduce((sum, title) => sum + Number(products.find((row) => row.title === title)?.price || 0), 0), 760);

  const anonymousCatalog = unwrap(await sessions.anonymous.from('catalogs')
    .select('id').eq('slug', catalog.slug), 'anonymous isolation');
  assert.equal(anonymousCatalog.length, 0, 'Обычный посетитель видит тестовый ресторан');

  const driver = unwrap(await sessions.driver.from('drivers')
    .select('id, name, is_test, is_active, is_online, status, test_debt_amount, debt_amount')
    .eq('email', config.credentials.driver.email).single(), 'test driver');
  assert.equal(driver.is_test, true);
  assert.equal(driver.is_active, true);
  assert.equal(driver.is_online, true);

  const settings = unwrap(await sessions.restaurant.from('restaurant_delivery_settings')
    .select('*').eq('catalog_id', catalog.id).single(), 'delivery settings');
  assert.equal(settings.enable_delivery, true);
  assert.equal(settings.qr_required, true);

  const productionBefore = requireProductionSnapshot
    ? await rpc('client', 'get_wayyaam_e2e_production_snapshot')
    : null;
  const debtBefore = {
    restaurant: await rpc('restaurant', 'get_current_billing_debt_status'),
    driver: await rpc('driver', 'get_current_billing_debt_status')
  };

  const findCurrentOrder = async (startedAt) => {
    const rows = unwrap(await sessions.restaurant.from('orders')
      .select('id, catalog_id, status, subtotal, total, delivery_fee, is_test_order, created_at, accepted_at, ready_at, completed_at')
      .eq('catalog_id', catalog.id).eq('is_test_order', true).gte('created_at', startedAt)
      .order('created_at', { ascending: false }).limit(5), 'current order');
    return rows;
  };
  const getOrder = async (orderId) => unwrap(await sessions.restaurant.from('orders')
    .select('id, status, subtotal, total, delivery_fee, is_test_order, accepted_at, ready_at, completed_at')
    .eq('id', orderId).single(), 'order');
  const getDelivery = async (orderId) => unwrap(await sessions.restaurant.from('deliveries')
    .select('id, order_id, driver_id, status, is_test, pickup_qr_token, pickup_qr_confirmed_at, accepted_at, completed_at')
    .eq('order_id', orderId).maybeSingle(), 'delivery');

  const assertFinal = async ({ orderId, deliveryId, productionBefore: snapshot = productionBefore }) => {
    const order = await getOrder(orderId);
    const delivery = await getDelivery(orderId);
    assert.equal(order.status, 'completed');
    assert.equal(delivery.status, 'delivered');
    assert.equal(order.is_test_order, true);
    assert.equal(delivery.is_test, true);
    assert.equal(Number(order.subtotal), 760);
    for (const field of ['accepted_at', 'ready_at', 'completed_at']) assert.ok(order[field], `order.${field} missing`);
    assert.ok(delivery.pickup_qr_confirmed_at, 'QR confirmation missing');
    assert.ok(delivery.completed_at, 'delivery.completed_at missing');
    assert.equal(delivery.id, deliveryId);

    const debtAfter = {
      restaurant: await rpc('restaurant', 'get_current_billing_debt_status'),
      driver: await rpc('driver', 'get_current_billing_debt_status')
    };
    const restaurantDelta = Number(debtAfter.restaurant.debt_amount) - Number(debtBefore.restaurant.debt_amount);
    const driverDelta = Number(debtAfter.driver.debt_amount) - Number(debtBefore.driver.debt_amount);
    assert.equal(restaurantDelta, 30, 'restaurant test debt delta');
    assert.equal(driverDelta, 30, 'driver test debt delta');

    const restaurantLedger = unwrap(await sessions.restaurant.from('billing_ledger_entries')
      .select('event_key, entry_type, reason_code, amount, is_test').like('event_key', `%${orderId}%`), 'restaurant test ledger');
    const driverLedger = unwrap(await sessions.driver.from('billing_ledger_entries')
      .select('event_key, entry_type, reason_code, amount, is_test').like('event_key', `%${deliveryId}%`), 'driver test ledger');
    const restaurantCharge = restaurantLedger.filter((row) => row.entry_type === 'charge' && row.reason_code === 'restaurant_order_commission');
    const driverCharge = driverLedger.filter((row) => row.entry_type === 'charge' && row.reason_code === 'driver_delivery_commission');
    assert.equal(restaurantCharge.length, 1, 'restaurant commission must be charged once');
    assert.equal(driverCharge.length, 1, 'driver commission must be charged once');
    assert.equal(Number(restaurantCharge[0].amount), 30);
    assert.equal(Number(driverCharge[0].amount), 30);
    const ledger = [...new Map([...restaurantLedger, ...driverLedger].map((row) => [row.event_key, row])).values()];
    assert.ok(ledger.every((row) => row.is_test === true), 'non-test ledger row created');
    assert.equal(new Set(restaurantLedger.map((row) => row.event_key)).size, restaurantLedger.length, 'duplicate restaurant ledger event');
    assert.equal(new Set(driverLedger.map((row) => row.event_key)).size, driverLedger.length, 'duplicate driver ledger event');

    const productionAfter = await rpc('client', 'get_wayyaam_e2e_production_snapshot');
    assert.ok(snapshot, 'production snapshot was not captured before the run');
    assert.deepEqual(productionAfter, snapshot, 'production aggregates changed');
    return { order, delivery, restaurantDelta, driverDelta, productionAfter };
  };

  return {
    sessions, rpc, catalog, driver, settings, address, products, productionBefore, debtBefore,
    findCurrentOrder, getOrder, getDelivery, assertFinal,
    close: () => Promise.all(Object.values(sessions).map((client) => client.auth.signOut({ scope: 'local' })))
  };
};
