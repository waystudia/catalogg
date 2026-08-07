import assert from 'node:assert/strict';
import { appUrl } from './config.mjs';
import { log } from './log.mjs';
import { screenshot } from './browser.mjs';
import { waitFor } from './backend.mjs';

const goto = async (page, url) => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'commit', timeout: 45_000 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await page.waitForTimeout(500 * attempt);
    }
  }
  throw lastError;
};

export const loginRole = async (role, config) => {
  const { page } = role;
  const credentials = config.credentials[role.role];
  await goto(page, appUrl(config, '/login'));
  await page.getByRole('heading', { name: 'Единый вход WayYaam' }).waitFor({ state: 'visible', timeout: 45_000 });
  await page.getByRole('button', { name: 'Почта' }).click();
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Пароль').fill(credentials.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.waitForURL((url) => !url.hash.startsWith('#/login'), { timeout: 30_000 });
  const cookies = page.getByRole('button', { name: 'Только необходимые', exact: true });
  if (await cookies.isVisible()) await cookies.click();
  log(role.role.toUpperCase(), '✅ LOGGED IN');
};

const setChecked = async (locator, checked) => {
  if ((await locator.isChecked()) !== checked) await locator.setChecked(checked);
};

export const prepareRestaurant = async (role, config, backend) => {
  const page = role.page;
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: /Доставка и заказы/ }).click();
  await page.getByRole('button', { name: /Курьеры и платформа/ }).click();
  const own = page.getByLabel(/Свой курьер/);
  const platform = page.getByLabel(/Водители платформы/);
  const fallback = page.getByLabel(/Передавать после таймера/);
  await setChecked(own, config.delivery !== 'platform');
  await setChecked(platform, config.delivery !== 'restaurant');
  await setChecked(fallback, config.delivery === 'fallback');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await waitFor('delivery mode persisted', async () => {
    const result = await backend.sessions.restaurant.from('restaurant_delivery_settings')
      .select('use_own_courier, use_platform_drivers, fallback_to_platform_drivers')
      .eq('catalog_id', backend.catalog.id).single();
    if (result.error) throw result.error;
    return result.data;
  }, (settings) => settings.use_own_courier === (config.delivery !== 'platform')
    && settings.use_platform_drivers === (config.delivery !== 'restaurant')
    && settings.fallback_to_platform_drivers === (config.delivery === 'fallback'));
  await page.getByRole('button', { name: 'Заказы', exact: true }).click();
  await page.getByRole('button', { name: 'Все', exact: true })
    .or(page.getByRole('region', { name: 'Доска заказов' }))
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
  log('RESTAURANT', `Delivery mode: ${config.delivery}`);
};

export const prepareClient = async (role, config) => {
  await goto(role.page, appUrl(config, '/r/wayyaam-test-restaurant'));
  await role.page.getByText('WayYaam Test Restaurant', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
  await screenshot(role, config, '01-client-restaurant.png');
};

export const prepareDriver = async (role, config) => {
  await goto(role.page, appUrl(config, '/driver/orders'));
  await role.page.getByText(/Заказы|Доступные заказы/).first().waitFor({ state: 'visible', timeout: 30_000 });
};

export const createClientOrder = async (role, config, backend, startedAt) => {
  const page = role.page;
  for (const title of ['Чизбургер', 'Картофель фри', 'Coca-Cola', 'Сырный соус']) {
    log('CLIENT', `Adding ${title}`);
    await page.getByRole('button', { name: `Добавить ${title}` }).first().click();
  }
  await page.getByRole('button', { name: /В корзине/i }).click();
  const cart = page.getByRole('dialog', { name: 'Корзина' });
  await cart.getByText('760 ₽', { exact: true }).last().waitFor({ state: 'visible' });
  await screenshot(role, config, '02-client-cart.png');
  await cart.getByRole('button', { name: /Оформить заказ/ }).click();
  await page.getByRole('button', { name: 'Доставка', exact: true }).click();
  await page.getByRole('button', { name: 'Определить моё местоположение' }).click();
  await page.getByText(/43\.3200000.*45\.7000000/).waitFor({ state: 'visible', timeout: 15_000 });
  const city = page.getByLabel('Село или город');
  if (await city.evaluate((element) => element instanceof HTMLSelectElement)) {
    await city.selectOption({ label: 'Грозный' });
  } else {
    await city.fill('Грозный');
  }
  await page.locator('label.checkout-field--wide').filter({ hasText: 'Адрес' }).locator('textarea').fill('Тестовая доставка WayYaam');
  await page.getByRole('button', { name: /Наличными/ }).click();
  const consents = page.locator('section[aria-label="Согласия для заказа"] input[type="checkbox"]');
  for (let index = 0; index < await consents.count(); index += 1) await consents.nth(index).check();
  page.on('popup', (popup) => popup.close().catch(() => undefined));
  await page.getByRole('button', { name: 'Отправить заказ' }).click();
  const rows = await waitFor('order created', () => backend.findCurrentOrder(startedAt), (items) => items.length === 1);
  const order = rows[0];
  assert.equal(Number(order.subtotal), 760);
  assert.equal(order.is_test_order, true);
  await goto(page, appUrl(config, `/wayyaam-test-restaurant/order/${order.id}`));
  await page.getByText(/Статус заказа/).first().waitFor({ state: 'visible', timeout: 20_000 });
  log('CLIENT', `Order created: ${order.id}`);
  return order;
};

const clickAndWaitOrder = async (page, backend, orderId, label, status) => {
  await page.getByRole('button', { name: label, exact: true }).click();
  await waitFor(`order ${status}`, () => backend.getOrder(orderId), (order) => order.status === status);
  log('RESTAURANT', label);
};

export const advanceRestaurant = async (role, config, backend, orderId) => {
  const page = role.page;
  const acceptOrder = page.getByRole('button', { name: 'Принять заказ', exact: true });
  try {
    await acceptOrder.waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    const refresh = page.getByRole('button', { name: 'Обновить', exact: true });
    await refresh.click();
    await acceptOrder.waitFor({ state: 'visible', timeout: 30_000 });
    log('RESTAURANT', 'Realtime did not deliver the order; refreshed through the UI');
  }
  await screenshot(role, config, '03-restaurant-new-order.png');
  await clickAndWaitOrder(page, backend, orderId, 'Принять заказ', 'accepted');
  await screenshot(role, config, '04-restaurant-accepted.png');
  await clickAndWaitOrder(page, backend, orderId, 'Начать готовить', 'preparing');
  await clickAndWaitOrder(page, backend, orderId, 'Заказ готов', 'ready');
  await clickAndWaitOrder(page, backend, orderId, 'Вызвать доставку', 'waiting_driver');

  if (config.delivery === 'platform') {
    await page.getByRole('button', { name: 'Вызвать таксистов' }).click();
    await page.getByText('Заказ отправлен всем доступным водителям').waitFor({ state: 'visible', timeout: 15_000 });
  } else if (config.delivery === 'restaurant') {
    await page.getByRole('button', { name: /WayYaam Test Driver.*Отправить/ }).click();
  } else {
    log('RESTAURANT', 'Fallback timer is running; own courier does not accept');
  }
};

export const acceptDriverOrder = async (role, config, backend, orderId) => {
  const page = role.page;
  const offeredDelivery = await waitFor('driver offer created', () => backend.getDelivery(orderId), (row) => Boolean(row?.id));
  const offerCard = page.locator(`a[href="#/driver/orders/${offeredDelivery.id}"]`);
  const acceptOrder = page.getByRole('button', { name: 'Принять заказ', exact: true }).first();
  try {
    await offerCard.waitFor({ state: 'visible', timeout: config.delivery === 'fallback' ? 120_000 : 30_000 });
  } catch {
    await page.getByRole('button', { name: 'Обновить', exact: true }).click();
    await offerCard.waitFor({ state: 'visible', timeout: 30_000 });
    log('DRIVER', 'Realtime did not deliver the offer; refreshed through the UI');
  }
  await offerCard.click();
  await acceptOrder.waitFor({ state: 'visible', timeout: 30_000 });
  await screenshot(role, config, '05-driver-order.png');
  await page.getByRole('button', { name: 'Принять заказ', exact: true }).first().click();
  const delivery = await waitFor('driver assigned', () => backend.getDelivery(orderId), (row) => row?.driver_id === backend.driver.id && row.status === 'assigned');
  log('DRIVER', `Accepted delivery ${delivery.id}`);
  await goto(page, appUrl(config, '/driver/active'));
  return delivery;
};

export const arriveAtRestaurant = async (role, backend, deliveryId) => {
  const page = role.page;
  const routeButton = page.getByRole('button', { name: /Поехать в ресторан|Построить маршрут/ }).first();
  if (await routeButton.isVisible()) await routeButton.click();
  const arrive = page.getByRole('button', { name: 'Я в ресторане', exact: true });
  await arrive.waitFor({ state: 'visible', timeout: 15_000 });
  await arrive.click();
  await waitFor('driver arrived', async () => {
    const rows = await backend.rpc('driver', 'get_driver_delivery_offers');
    return rows.find((row) => row.id === deliveryId);
  }, (row) => row?.status === 'arrived_to_restaurant');
  log('DRIVER', 'Arrived at restaurant');
};

export const confirmCashAndQr = async (restaurantRole, driverRole, config, backend, orderId, deliveryId) => {
  const restaurantPage = restaurantRole.page;
  const order = await backend.getOrder(orderId);
  if (!order.restaurant_payment_confirmed_at) {
    await restaurantPage.getByRole('button', { name: /Оплата/ }).click();
    await restaurantPage.getByRole('button', { name: 'Подтвердить получение наличных', exact: true }).click();
    await waitFor('cash confirmed', () => backend.getOrder(orderId), (row) => Boolean(row.restaurant_payment_confirmed_at));
  }
  log('RESTAURANT', 'Cash receipt confirmed');

  await goto(driverRole.page, appUrl(config, '/driver/qr'));
  await driverRole.page.getByAltText('QR выдачи заказа').waitFor({ state: 'visible', timeout: 20_000 });
  await screenshot(driverRole, config, '06-driver-pickup.png');
  const delivery = await waitFor('QR token generated', () => backend.getDelivery(orderId), (row) => Boolean(row?.pickup_qr_token));
  const wrong = await backend.sessions.restaurant.rpc('confirm_delivery_pickup_qr', {
    target_delivery_id: crypto.randomUUID(), presented_token: delivery.pickup_qr_token
  });
  assert.equal(wrong.error, null);
  assert.equal(wrong.data, false, 'QR accepted for another order');
  assert.equal(await backend.rpc('restaurant', 'confirm_delivery_pickup_qr', {
    target_delivery_id: deliveryId, presented_token: delivery.pickup_qr_token
  }), true, 'valid QR rejected');
  assert.equal(await backend.rpc('restaurant', 'confirm_delivery_pickup_qr', {
    target_delivery_id: deliveryId, presented_token: delivery.pickup_qr_token
  }), false, 'QR replay accepted');
  await waitFor('QR confirmed', () => backend.getDelivery(orderId), (row) => Boolean(row?.pickup_qr_confirmed_at));
  await screenshot(restaurantRole, config, '07-qr-confirmed.png');
  log('QR', 'Token valid, wrong-order rejected, replay rejected');
};

export const finishDriverDelivery = async (role, config, backend, orderId) => {
  const page = role.page;
  await goto(page, appUrl(config, '/driver/active'));
  for (const [label, status] of [
    ['Забрал заказ', 'handed_over'], ['Выехал к клиенту', 'on_the_way'],
    ['Я у клиента', 'arrived_to_client'], ['Доставлено', 'delivered']
  ]) {
    await page.getByRole('button', { name: label, exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByRole('button', { name: label, exact: true }).click();
    await waitFor(`delivery ${status}`, () => backend.getDelivery(orderId), (row) => row?.status === status);
    log('DRIVER', label);
  }
  await screenshot(role, config, '08-driver-delivered.png');
};
