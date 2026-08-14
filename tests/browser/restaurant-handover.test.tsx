import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { OrderDetailsPanel } from '../../src/features/restaurant-admin/OrderDetailsPanel';
import { defaultPaymentSettings } from '../../src/shared/paymentSettings';
import type { RestaurantOrder } from '../../src/shared/api/restaurantOrdersApi';

const cashDelivery = (deliveryStatus: RestaurantOrder['deliveryStatus']): RestaurantOrder => ({
  id: 'order-9584',
  orderNumber: 'M9584',
  catalogId: 'mangal',
  clientName: 'Клиент',
  clientPhone: '+7 928 000-00-00',
  fulfillmentType: 'delivery',
  cabinLabel: '',
  deliveryAddress: 'Курчалой',
  deliveryLat: 43.318123,
  deliveryLng: 45.698456,
  clientAccuracyM: 8,
  deliveryCity: 'Курчалой',
  deliverySettlement: 'Курчалой',
  restaurantAddress: 'Мангал',
  restaurantCity: 'Курчалой',
  restaurantLat: 43.322,
  restaurantLng: 45.705,
  comment: '[payment_method:cash]',
  status: 'waiting_driver',
  paymentStatus: 'unpaid',
  deliveryStatus,
  deliveryId: 'delivery-9584',
  deliveryUpdatedAt: '2026-08-06T10:43:00.000Z',
  driverName: 'Водитель',
  driverPhone: '+7 928 111-11-11',
  driverVehicleInfo: 'Автомобиль',
  driverCarNumber: 'А001АА95',
  driverPhotoUrl: null,
  driverLat: 43.319,
  driverLng: 45.699,
  driverLocationAt: '2026-08-06T10:43:00.000Z',
  restaurantPaymentConfirmedAt: null,
  pickupQrConfirmedAt: null,
  subtotal: 580,
  deliveryFee: 200,
  courierPayout: 200,
  total: 780,
  createdAt: '2026-08-06T10:40:00.000Z',
  acceptedAt: null,
  readyAt: '2026-08-06T10:41:00.000Z',
  completedAt: null,
  cancellationReason: '',
  qrToken: null,
  qrExpiresAt: null,
  verificationCode: null,
  items: [{ id: 'item-1', title: 'Блюдо', quantity: 1, unitPrice: 580, lineTotal: 580 }]
});

const renderOrder = (order: RestaurantOrder) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrderDetailsPanel
        order={order}
        catalogSlug="mangal"
        paymentSettings={defaultPaymentSettings}
        onClose={vi.fn()}
        onStatus={vi.fn(async () => undefined)}
        onRefreshOrders={vi.fn()}
        onDelete={vi.fn(async () => undefined)}
      />
    </QueryClientProvider>
  );
};

test('explains the restaurant cash gate until the driver confirms arrival', async () => {
  const screen = await renderOrder(cashDelivery('assigned'));
  await screen.getByRole('button', { name: /Оплата/u }).click();

  await expect.element(screen.getByText(/водитель должен нажать «Я в ресторане»/iu)).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Подтвердить получение наличных', exact: true })).toBeDisabled();
});

test('keeps restaurant confirmation disabled until the driver marks the order amount as handed over', async () => {
  const screen = await renderOrder(cashDelivery('arrived_to_restaurant'));
  await screen.getByRole('button', { name: /Оплата/u }).click();

  await expect.element(screen.getByText(/Ожидайте, пока водитель нажмёт/iu)).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Подтвердить получение наличных', exact: true })).toBeDisabled();
});

test('enables restaurant cash confirmation after the driver hands over the order amount', async () => {
  const screen = await renderOrder({
    ...cashDelivery('arrived_to_restaurant'),
    driverRestaurantOrderPaymentConfirmedAt: '2026-08-06T10:44:00.000Z',
    driverRestaurantOrderPaymentAmount: 580
  });
  await screen.getByRole('button', { name: /Оплата/u }).click();

  await expect.element(screen.getByRole('button', { name: 'Подтвердить получение наличных', exact: true })).toBeEnabled();
});

test('opens a separate order-scoped chat inside the compact restaurant order card', async () => {
  const screen = await renderOrder(cashDelivery('assigned'));

  await expect.element(screen.getByRole('button', { name: 'Открыть чат заказа' })).toBeVisible();
  await screen.getByRole('button', { name: 'Открыть чат заказа' }).click();

  await expect.element(screen.getByRole('region', { name: 'Чат заказа' })).toBeVisible();
  await expect.element(screen.getByText('Ответьте клиенту и курьеру, зафиксируйте договорённость.')).toBeVisible();
});
