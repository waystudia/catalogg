import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type { RestaurantOrder, RestaurantOrderStatus } from '../../src/shared/api/restaurantOrdersApi';
import { StoreOrderQueue } from '../../src/features/store-orders/StoreOrderQueue';

const order = (overrides: Partial<RestaurantOrder> = {}): RestaurantOrder => ({
  id: 'order-1',
  orderNumber: 'F0231',
  catalogId: 'finik',
  clientName: 'Мадина',
  clientPhone: '+7 900 000-00-00',
  fulfillmentType: 'delivery',
  cabinLabel: '',
  deliveryAddress: 'ул. Мира, 12, кв. 45, 2 подъезд',
  deliveryLat: 43.238,
  deliveryLng: 46.001,
  clientAccuracyM: 12,
  deliveryCity: '',
  deliverySettlement: 'Цоци-Юрт',
  restaurantAddress: 'ул. Ленина, 45',
  restaurantCity: 'Цоци-Юрт',
  restaurantLat: 43.234,
  restaurantLng: 45.996,
  comment: 'Без звонка, оставить у двери',
  status: 'new',
  paymentStatus: 'unpaid',
  deliveryStatus: 'waiting_courier',
  deliveryId: null,
  deliveryUpdatedAt: null,
  driverName: null,
  driverPhone: null,
  driverVehicleInfo: null,
  driverCarNumber: null,
  driverPhotoUrl: null,
  driverLat: null,
  driverLng: null,
  driverLocationAt: null,
  restaurantPaymentConfirmedAt: null,
  pickupQrConfirmedAt: null,
  subtotal: 345,
  deliveryFee: 0,
  courierPayout: 0,
  total: 345,
  createdAt: '2026-08-15T08:42:00.000Z',
  acceptedAt: null,
  readyAt: null,
  completedAt: null,
  cancellationReason: '',
  qrToken: null,
  qrExpiresAt: null,
  verificationCode: null,
  items: [
    { id: 'item-1', title: 'Молоко 3,2%', quantity: 2, unitPrice: 110, lineTotal: 220 },
    { id: 'item-2', title: 'Хлеб', quantity: 1, unitPrice: 125, lineTotal: 125 }
  ],
  ...overrides
});

test('mobile store queue keeps order decisions on compact cards without exposing coordinates', async () => {
  await page.viewport(372, 576);
  const onSelectOrder = vi.fn();
  const onOpenChat = vi.fn();
  const onAcceptOrder = vi.fn(async () => undefined);
  const screen = await render(
    <StoreOrderQueue
      orders={[
        order(),
        order({ id: 'accepted', orderNumber: 'F0232', status: 'accepted' }),
        order({ id: 'done', orderNumber: 'F0233', status: 'completed' }),
        order({ id: 'cancelled', orderNumber: 'F0234', status: 'cancelled' })
      ]}
      query=""
      onQueryChange={vi.fn()}
      onRefresh={vi.fn()}
      onSelectOrder={onSelectOrder}
      onOpenChat={onOpenChat}
      onAcceptOrder={onAcceptOrder}
    />
  );

  await expect.element(screen.getByRole('heading', { name: 'Заказы' })).toBeVisible();
  await expect.element(screen.getByRole('tab', { name: 'Новые 1' })).toBeVisible();
  await expect.element(screen.getByRole('tab', { name: 'Принятые 1' })).toBeVisible();
  await expect.element(screen.getByText('ул. Мира, 12, кв. 45, 2 подъезд')).toBeVisible();
  await expect.element(screen.getByText('Без звонка, оставить у двери')).toBeVisible();
  await expect.element(screen.getByText(/43\.238|46\.001/u)).not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Подробнее о заказе F0231' }).click();
  expect(onSelectOrder).toHaveBeenCalledWith('order-1');

  await screen.getByRole('button', { name: 'Чат заказа F0231' }).click();
  expect(onOpenChat).toHaveBeenCalledWith('order-1');

  await screen.getByRole('button', { name: 'Принять заказ F0231' }).click();
  expect(onAcceptOrder).toHaveBeenCalledOnce();
});

test('accept action is locked until the server answers', async () => {
  let finishAcceptance: (() => void) | undefined;
  const onAcceptOrder = vi.fn(() => new Promise<void>((resolve) => {
    finishAcceptance = resolve;
  }));
  const screen = await render(
    <StoreOrderQueue
      orders={[order()]}
      query=""
      onQueryChange={vi.fn()}
      onRefresh={vi.fn()}
      onSelectOrder={vi.fn()}
      onAcceptOrder={onAcceptOrder}
    />
  );

  const accept = screen.getByRole('button', { name: 'Принять заказ F0231' });
  await accept.click();
  await expect.element(accept).toBeDisabled();
  await expect.element(accept).toHaveTextContent('Принимаем…');
  expect(onAcceptOrder).toHaveBeenCalledOnce();

  finishAcceptance?.();
  await expect.element(accept).not.toBeDisabled();
});

test('pickup card stays useful without rendering an empty delivery map', async () => {
  const screen = await render(
    <StoreOrderQueue
      orders={[order({
        fulfillmentType: 'takeaway',
        deliveryAddress: '',
        deliveryLat: null,
        deliveryLng: null,
        comment: 'Заберу через 10 минут'
      })]}
      query=""
      onQueryChange={vi.fn()}
      onRefresh={vi.fn()}
      onSelectOrder={vi.fn()}
      onAcceptOrder={vi.fn(async () => undefined)}
    />
  );

  await expect.element(screen.getByText('Самовывоз').first()).toBeVisible();
  await expect.element(screen.getByText('Заберу через 10 минут')).toBeVisible();
  await expect.element(screen.getByRole('img', { name: 'Маршрут доставки' })).not.toBeInTheDocument();
});

test.each<[RestaurantOrderStatus, string]>([
  ['new', 'Новые 1'],
  ['accepted', 'Принятые 1'],
  ['ready', 'Принятые 1'],
  ['completed', 'Выполненные 1'],
  ['cancelled', 'Отменённые 1']
])('maps %s orders into the expected store tab', async (status, expectedTab) => {
  const screen = await render(
    <StoreOrderQueue
      orders={[order({ status })]}
      query=""
      onQueryChange={vi.fn()}
      onRefresh={vi.fn()}
      onSelectOrder={vi.fn()}
      onAcceptOrder={vi.fn(async () => undefined)}
    />
  );

  await expect.element(screen.getByRole('tab', { name: expectedTab })).toBeVisible();
});

test('queue uses compact skeletons and a retryable network error instead of a blocking spinner', async () => {
  const loading = await render(
    <StoreOrderQueue
      orders={[]}
      query=""
      loading
      onQueryChange={vi.fn()}
      onRefresh={vi.fn()}
      onSelectOrder={vi.fn()}
      onAcceptOrder={vi.fn(async () => undefined)}
    />
  );
  await expect.element(loading.getByRole('status', { name: 'Загрузка заказов' })).toBeVisible();
});

test('queue network error keeps retry reachable', async () => {
  const retry = vi.fn();
  const screen = await render(
    <StoreOrderQueue
      orders={[]}
      query=""
      error="Нет соединения"
      onQueryChange={vi.fn()}
      onRefresh={retry}
      onSelectOrder={vi.fn()}
      onAcceptOrder={vi.fn(async () => undefined)}
    />
  );
  await expect.element(screen.getByText('Не удалось загрузить заказы')).toBeVisible();
  await expect.element(screen.getByText('Нет соединения')).toBeVisible();
  await screen.getByRole('button', { name: 'Повторить' }).click();
  expect(retry).toHaveBeenCalledOnce();
});

test('queue search and fulfillment filter narrow the current status tab', async () => {
  const onQueryChange = vi.fn();
  const screen = await render(
    <StoreOrderQueue
      orders={[
        order(),
        order({ id: 'pickup', orderNumber: 'F0999', clientName: 'Аминат', fulfillmentType: 'takeaway' })
      ]}
      query="аминат"
      onQueryChange={onQueryChange}
      onRefresh={vi.fn()}
      onSelectOrder={vi.fn()}
      onAcceptOrder={vi.fn(async () => undefined)}
    />
  );

  await expect.element(screen.getByText('#F0999')).toBeVisible();
  await expect.element(screen.getByText('#F0231')).not.toBeInTheDocument();
  await screen.getByRole('button', { name: 'Фильтры заказов' }).click();
  await screen.getByRole('button', { name: 'Доставка' }).click();
  await expect.element(screen.getByText('Здесь пока нет заказов')).toBeVisible();
});

test('queue opens the first non-empty tab after returning from an accepted order', async () => {
  const screen = await render(
    <StoreOrderQueue
      orders={[order({ status: 'accepted' })]}
      query=""
      onQueryChange={vi.fn()}
      onRefresh={vi.fn()}
      onSelectOrder={vi.fn()}
      onAcceptOrder={vi.fn(async () => undefined)}
    />
  );

  await expect.element(screen.getByRole('tab', { name: 'Принятые 1' })).toHaveAttribute('aria-selected', 'true');
  await expect.element(screen.getByText('#F0231')).toBeVisible();
});
