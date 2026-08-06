import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const url = required('SUPABASE_URL');
const anonKey = required('SUPABASE_ANON_KEY');
const credentials = {
  client: { email: required('E2E_CLIENT_EMAIL'), password: required('E2E_CLIENT_PASSWORD') },
  restaurant: { email: required('E2E_RESTAURANT_EMAIL'), password: required('E2E_RESTAURANT_PASSWORD') },
  driver: { email: required('E2E_DRIVER_EMAIL'), password: required('E2E_DRIVER_PASSWORD') }
};
const makeClient = () => createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});
const sessions = {
  client: makeClient(),
  restaurant: makeClient(),
  driver: makeClient(),
  anonymous: makeClient()
};

const unwrap = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};
const rpc = async (client, name, args = {}) => unwrap(await client.rpc(name, args), name);

for (const role of ['client', 'restaurant', 'driver']) {
  const result = await sessions[role].auth.signInWithPassword(credentials[role]);
  assert.ok(unwrap(result, `${role} sign-in`).session, `${role} session was not created`);
}

assert.equal(await rpc(sessions.client, 'resolve_current_login_redirect'), '/profile');
assert.equal(await rpc(sessions.restaurant, 'resolve_current_login_redirect'), '/wayyaam-test-restaurant/dashboard');
assert.equal(await rpc(sessions.driver, 'resolve_current_login_redirect'), '/driver');
await rpc(sessions.client, 'login_current_auth_client_account');

const anonymousCatalog = unwrap(await sessions.anonymous
  .from('catalogs').select('id').eq('slug', 'wayyaam-test-restaurant'), 'anonymous visibility');
assert.equal(anonymousCatalog.length, 0, 'ordinary visitors can see the test restaurant');

const catalog = unwrap(await sessions.client
  .from('catalogs').select('id, slug, name, is_test').eq('slug', 'wayyaam-test-restaurant').single(), 'test catalog');
assert.equal(catalog.is_test, true);
const [settings, modules, address] = await Promise.all([
  sessions.restaurant.from('restaurant_delivery_settings')
    .select('use_own_courier, use_platform_drivers, fallback_to_platform_drivers, qr_required, enable_delivery, enable_pickup, enable_hall_orders')
    .eq('catalog_id', catalog.id).single(),
  sessions.restaurant.from('restaurant_modules')
    .select('package_code, pos_enabled, warehouse_enabled, recipes_enabled, finance_enabled, promotions_enabled, loyalty_enabled')
    .eq('catalog_id', catalog.id).single(),
  sessions.client.from('client_addresses')
    .select('title, address_line, lat, lng, is_test').eq('title', 'Тестовый адрес').single()
]);
const deliverySettings = unwrap(settings, 'delivery settings');
for (const flag of ['use_own_courier', 'use_platform_drivers', 'fallback_to_platform_drivers', 'qr_required', 'enable_delivery', 'enable_pickup', 'enable_hall_orders']) {
  assert.equal(deliverySettings[flag], true, `${flag} is disabled`);
}
const moduleSettings = unwrap(modules, 'restaurant modules');
assert.equal(moduleSettings.package_code, 'full');
for (const flag of ['pos_enabled', 'warehouse_enabled', 'recipes_enabled', 'finance_enabled', 'promotions_enabled', 'loyalty_enabled']) {
  assert.equal(moduleSettings[flag], true, `${flag} is disabled`);
}
const testAddress = unwrap(address, 'test address');
assert.equal(testAddress.address_line, 'Тестовая доставка WayYaam');
assert.equal(testAddress.is_test, true);

const products = unwrap(await sessions.client.from('products')
  .select('id, title, price, status').eq('catalog_id', catalog.id), 'test menu');
const expectedMenu = new Map([
  ['Чизбургер', 350], ['Двойной бургер', 490], ['Пицца Пепперони', 590],
  ['Пицца Маргарита', 490], ['Coca-Cola', 150], ['Вода', 100],
  ['Сырный соус', 70], ['Картофель фри', 190]
]);
for (const [title, price] of expectedMenu) {
  const product = products.find((row) => row.title === title);
  assert.ok(product, `${title} is missing`);
  assert.equal(product.price, price);
  assert.equal(product.status, 'active');
}
const scenarioTitles = ['Чизбургер', 'Картофель фри', 'Coca-Cola', 'Сырный соус'];
const scenarioProducts = scenarioTitles.map((title) => products.find((row) => row.title === title));
assert.equal(scenarioProducts.reduce((sum, product) => sum + product.price, 0), 760);

const debtBefore = {
  restaurant: await rpc(sessions.restaurant, 'get_current_billing_debt_status'),
  driver: await rpc(sessions.driver, 'get_current_billing_debt_status')
};
const locationNote = 'Координаты клиента: 43.3200000, 45.7000000 (точность 10 м)';
const orderId = await rpc(sessions.client, 'create_public_restaurant_order', {
  target_catalog_id: catalog.id,
  customer_name: 'WayYaam Test Client',
  customer_phone: '+7 900 000-00-01',
  fulfillment_type: 'delivery',
  cabin_label: '',
  delivery_address: 'Тестовая доставка WayYaam',
  delivery_city: 'Грозный',
  delivery_settlement: 'Грозный',
  client_address_comment: locationNote,
  comment: locationNote,
  items: scenarioProducts.map((product) => ({ product_id: product.id, quantity: 1, options: [] })),
  idempotency_key: `manual-e2e-${crypto.randomUUID()}`
});
assert.match(orderId, /^[0-9a-f-]{36}$/i);

let order = unwrap(await sessions.restaurant.from('orders')
  .select('id, catalog_id, status, subtotal, total, is_test_order, delivery_fee')
  .eq('id', orderId).single(), 'created order');
assert.equal(order.subtotal, 760);
assert.equal(order.is_test_order, true);

for (const status of ['accepted', 'preparing', 'ready']) {
  await rpc(sessions.restaurant, 'update_restaurant_order_status', {
    target_order_id: orderId, target_catalog_id: catalog.id, next_status: status, status_reason: ''
  });
}
const pricingRows = unwrap(await sessions.restaurant.from('delivery_pricing_rules')
  .select('amount').eq('from_settlement', 'Грозный').eq('to_settlement', 'Грозный').eq('is_active', true).limit(1), 'delivery pricing');
const configuredDeliveryFee = pricingRows.length ? Number(pricingRows[0].amount) : Number(order.delivery_fee ?? 0);
await rpc(sessions.restaurant, 'dispatch_restaurant_order_to_delivery', {
  target_order_id: orderId,
  target_catalog_id: catalog.id,
  route_to_restaurant_url_input: 'https://yandex.ru/maps/?rtext=43.3200000,45.7000000',
  route_to_client_url_input: 'https://yandex.ru/maps/?rtext=43.3179000,45.6945000~43.3200000,45.7000000',
  offered_fee_input: configuredDeliveryFee,
  pricing_status_input: pricingRows.length ? 'offered' : 'pending'
});

let offers = await rpc(sessions.driver, 'get_driver_delivery_offers');
let offer = offers.find((candidate) => candidate.order_id === orderId);
assert.ok(offer, 'test driver did not receive the test delivery');
const scopedDeliveries = unwrap(await sessions.driver.from('deliveries')
  .select('id, is_test').in('id', offers.map((candidate) => candidate.id)), 'driver scope');
assert.ok(scopedDeliveries.every((delivery) => delivery.is_test), 'test driver received a production delivery');

await rpc(sessions.driver, 'accept_available_delivery', { target_delivery_id: offer.id });
offers = await rpc(sessions.driver, 'get_driver_delivery_offers');
offer = offers.find((candidate) => candidate.id === offer.id);
assert.ok(offer?.pickup_qr_token, 'pickup QR token was not generated');
await rpc(sessions.driver, 'update_current_driver_delivery_status', {
  target_delivery_id: offer.id, next_status: 'arrived_to_restaurant'
});
assert.equal(await rpc(sessions.restaurant, 'confirm_delivery_pickup_qr', {
  target_delivery_id: crypto.randomUUID(), presented_token: offer.pickup_qr_token
}), false, 'QR token was accepted for another delivery');
assert.equal(await rpc(sessions.restaurant, 'confirm_delivery_pickup_qr', {
  target_delivery_id: offer.id, presented_token: offer.pickup_qr_token
}), true, 'valid QR token was rejected');
assert.equal(await rpc(sessions.restaurant, 'confirm_delivery_pickup_qr', {
  target_delivery_id: offer.id, presented_token: offer.pickup_qr_token
}), false, 'QR token was accepted twice');
assert.equal(await rpc(sessions.driver, 'confirm_driver_pickup', { target_delivery_id: offer.id }), true);
await rpc(sessions.driver, 'update_current_driver_delivery_status', {
  target_delivery_id: offer.id, next_status: 'on_the_way'
});
await rpc(sessions.driver, 'update_current_driver_delivery_status', {
  target_delivery_id: offer.id, next_status: 'arrived_to_client'
});
await rpc(sessions.driver, 'complete_driver_delivery', { target_delivery_id: offer.id });
const repeatedCompletion = await sessions.driver.rpc('complete_driver_delivery', { target_delivery_id: offer.id });
assert.ok(repeatedCompletion.error, 'delivery was completed twice');

const finalStatus = await rpc(sessions.client, 'get_public_restaurant_order_status', { target_order_id: orderId });
assert.equal(finalStatus.status, 'completed');
assert.equal(finalStatus.delivery_status, 'delivered');
for (const timestamp of ['accepted_at', 'ready_at', 'completed_at']) assert.ok(finalStatus[timestamp], `${timestamp} is missing`);
const debtAfter = {
  restaurant: await rpc(sessions.restaurant, 'get_current_billing_debt_status'),
  driver: await rpc(sessions.driver, 'get_current_billing_debt_status')
};
assert.equal(Number(debtAfter.restaurant.debt_amount) - Number(debtBefore.restaurant.debt_amount), 30);
assert.equal(Number(debtAfter.driver.debt_amount) - Number(debtBefore.driver.debt_amount), 30);

order = unwrap(await sessions.restaurant.from('orders')
  .select('status, completed_at, is_test_order').eq('id', orderId).single(), 'final order');
assert.equal(order.status, 'completed');
assert.equal(order.is_test_order, true);
process.stdout.write(JSON.stringify({
  outcome: 'verified', orderId, subtotal: 760, configuredDeliveryFee,
  restaurantTestDebtDelta: 30, driverTestDebtDelta: 30
}) + '\n');

await Promise.all(Object.values(sessions).map((client) => client.auth.signOut({ scope: 'local' })));
