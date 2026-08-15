import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Product } from '../../src/entities/models';
import type { RestaurantOrder } from '../../src/shared/api/restaurantOrdersApi';
import { StoreOrderPickingPage } from '../../src/features/store-orders/StoreOrderPickingPage';

const products: Product[] = [
  {
    id: 'milk', title: 'Молоко 3,2%', price: 110, description: '', image_url: '/milk.png', ingredients: '', weight: '1 л', spicy_level: 0,
    serving: '', is_popular: false, is_new: false, is_hit: false, is_unlimited: true, stock_count: 10, category_id: 'dairy', pair_ids: [],
    barcode: '4601234567893', sale_unit: 'piece', quantity_unit: 'piece', price_basis_quantity: 1, minimum_quantity: 1, quantity_step: 1, allow_substitution: true
  }
];

const order = (overrides: Partial<RestaurantOrder> = {}): RestaurantOrder => ({
  id: 'order-1', orderNumber: 'F0231', catalogId: 'finik', clientName: 'Мадина', clientPhone: '+7 900 000-00-00', fulfillmentType: 'delivery',
  cabinLabel: '', deliveryAddress: 'ул. Мира, 12, кв. 45, 2 подъезд', deliveryLat: 43.238, deliveryLng: 46.001, clientAccuracyM: 12,
  deliveryCity: '', deliverySettlement: 'Цоци-Юрт', restaurantAddress: 'ул. Ленина, 45', restaurantCity: 'Цоци-Юрт', restaurantLat: 43.234,
  restaurantLng: 45.996, comment: 'Без звонка, оставить у двери', status: 'accepted', paymentStatus: 'confirmed', deliveryStatus: 'waiting_courier',
  deliveryId: null, deliveryUpdatedAt: null, driverName: null, driverPhone: null, driverVehicleInfo: null, driverCarNumber: null, driverPhotoUrl: null,
  driverLat: null, driverLng: null, driverLocationAt: null, restaurantPaymentConfirmedAt: null, pickupQrConfirmedAt: null, subtotal: 220, deliveryFee: 0,
  courierPayout: 0, total: 220, createdAt: '2026-08-15T08:42:00.000Z', acceptedAt: '2026-08-15T08:43:00.000Z',
  estimatedReadyAt: '2099-08-15T09:00:00.000Z', readyAt: null, completedAt: null, cancellationReason: '', qrToken: null, qrExpiresAt: null,
  verificationCode: null,
  items: [{
    id: 'item-1', productId: 'milk', title: 'Молоко 3,2%', quantity: 2, unitPrice: 110, lineTotal: 220, saleUnit: 'piece', quantityUnit: 'piece',
    requestedQuantity: 2, fulfilledQuantity: 0, fulfillmentState: 'pending'
  }],
  ...overrides
});

const renderPage = (currentOrder = order()) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const callbacks = {
    onBack: vi.fn(),
    onStatusChange: vi.fn(async () => undefined),
    onPickingChanged: vi.fn(),
    onOpenChat: vi.fn()
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <StoreOrderPickingPage
        order={currentOrder}
        products={products}
        storeName="Финик"
        canPick
        {...callbacks}
      />
    </QueryClientProvider>
  ).then((screen) => ({ screen, callbacks }));
};

test('accepted delivery order keeps the map collapsed until the picker asks to open it', async () => {
  await page.viewport(372, 576);
  const { screen, callbacks } = await renderPage();

  await expect.element(screen.getByRole('heading', { name: 'Сборка заказа', level: 1 })).toBeVisible();
  await expect.element(screen.getByText('Заказ #F0231')).toBeVisible();
  await expect.element(screen.getByRole('region', { name: 'Карта доставки' })).not.toBeInTheDocument();

  const mapToggle = screen.getByRole('button', { name: 'Показать карту доставки' });
  await expect.element(mapToggle).toHaveAttribute('aria-expanded', 'false');
  await expect.element(mapToggle.getByText('ул. Мира, 12, кв. 45, 2 подъезд')).toBeVisible();
  await expect.element(screen.getByText(/43\.238|46\.001/u)).not.toBeInTheDocument();
  await mapToggle.click();
  await expect.element(screen.getByRole('region', { name: 'Карта доставки' })).toBeVisible();
  await expect.element(screen.getByText('ул. Ленина, 45')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Скрыть карту доставки' })).toHaveAttribute('aria-expanded', 'true');

  await screen.getByRole('button', { name: 'Приступить к сборке' }).click();
  expect(callbacks.onStatusChange).toHaveBeenCalledWith('preparing');
  await expect.element(screen.getByRole('button', { name: 'Сканировать товар' })).toBeDisabled();
});

test('new order details require acceptance before picking can start', async () => {
  const { screen, callbacks } = await renderPage(order({ status: 'new', acceptedAt: null }));
  const accept = screen.getByRole('button', { name: 'Принять заказ' });
  await expect.element(accept).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Приступить к сборке' })).not.toBeInTheDocument();
  await accept.click();
  expect(callbacks.onStatusChange).toHaveBeenCalledWith('accepted');
});

test('active picking shows real progress and keeps completion unavailable while a line is pending', async () => {
  const pending = await renderPage(order({ status: 'preparing' }));
  await expect.element(pending.screen.getByText('Собрано 0 / 1')).toBeVisible();
  await expect.element(pending.screen.getByRole('button', { name: 'Завершить сборку' })).toBeDisabled();
  await expect.element(pending.screen.getByRole('button', { name: 'Сканировать товар' })).not.toBeDisabled();
});

test('active picking can finish after every line is resolved', async () => {
  const completed = await renderPage(order({
    status: 'preparing',
    items: [{
      ...order().items[0],
      fulfilledQuantity: 2,
      fulfillmentState: 'picked'
    }]
  }));
  const finish = completed.screen.getByRole('button', { name: 'Завершить сборку' });
  await expect.element(finish).not.toBeDisabled();
  await finish.click();
  expect(completed.callbacks.onStatusChange).toHaveBeenCalledWith('ready');
});

test('completed delivery picking has no countdown and exposes delivery only as the next action', async () => {
  const completed = await renderPage(order({
    status: 'ready',
    estimatedReadyAt: '2020-08-15T09:00:00.000Z',
    items: [{
      ...order().items[0],
      fulfilledQuantity: 2,
      fulfillmentState: 'picked'
    }]
  }));

  await expect.element(completed.screen.getByText('Сборка завершена')).toBeVisible();
  await expect.element(completed.screen.getByText(/Осталось|Время вышло/u)).not.toBeInTheDocument();
  await expect.element(completed.screen.getByText('Сначала примите назначенный заказ в работу.')).not.toBeInTheDocument();
  const dispatch = completed.screen.getByRole('button', { name: 'Вызвать доставку' });
  await expect.element(dispatch).not.toBeDisabled();
  await dispatch.click();
  expect(completed.callbacks.onStatusChange).toHaveBeenCalledWith('waiting_driver');
});

test('waiting driver remains a status without any expired timer', async () => {
  const waiting = await renderPage(order({
    status: 'waiting_driver',
    estimatedReadyAt: '2020-08-15T09:00:00.000Z'
  }));

  await expect.element(waiting.screen.getByText('Ждёт водителя')).toBeVisible();
  await expect.element(waiting.screen.getByText(/Осталось|Время вышло/u)).not.toBeInTheDocument();
});

test('pickup order replaces the route map with pickup information', async () => {
  const { screen } = await renderPage(order({
    fulfillmentType: 'takeaway',
    deliveryAddress: '',
    deliveryLat: null,
    deliveryLng: null,
    comment: 'Заберу через 10 минут'
  }));

  await expect.element(screen.getByText('Самовывоз')).toBeVisible();
  await expect.element(screen.getByText('Заберу через 10 минут')).toBeVisible();
  await expect.element(screen.getByRole('region', { name: 'Карта доставки' })).not.toBeInTheDocument();
  await expect.element(screen.getByRole('button', { name: 'Показать карту доставки' })).not.toBeInTheDocument();
});

test('overflow menu keeps contact, chat and problem actions reachable', async () => {
  const { screen, callbacks } = await renderPage();
  await screen.getByRole('button', { name: 'Действия с заказом' }).click();
  await expect.element(screen.getByRole('link', { name: 'Позвонить клиенту' })).toHaveAttribute('href', 'tel:+79000000000');
  await expect.element(screen.getByRole('button', { name: 'Отменить или сообщить о проблеме' })).toBeVisible();
  await screen.getByRole('button', { name: 'Открыть чат заказа' }).click();
  expect(callbacks.onOpenChat).toHaveBeenCalledOnce();
});

test('order chat opens inside the picking screen when the host has no separate chat route', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <StoreOrderPickingPage
        order={order()}
        products={products}
        storeName="Финик"
        canPick
        onBack={vi.fn()}
        onStatusChange={vi.fn(async () => undefined)}
        onPickingChanged={vi.fn()}
      />
    </QueryClientProvider>
  );

  await screen.getByRole('button', { name: 'Действия с заказом' }).click();
  await screen.getByRole('button', { name: 'Открыть чат заказа' }).click();
  await expect.element(screen.getByRole('region', { name: 'Чат заказа' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Закрыть чат заказа' })).toBeVisible();
});
