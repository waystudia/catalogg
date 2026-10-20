import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { OrderDetailsPanel } from '../../src/features/restaurant-admin/OrderDetailsPanel';
import { defaultPaymentSettings } from '../../src/shared/paymentSettings';
import type { RestaurantOrder } from '../../src/shared/api/restaurantOrdersApi';
import '../../src/app/styles.css';

const order: RestaurantOrder = {
  id: 'order-1',
  orderNumber: 'M9686',
  catalogId: 'mangal',
  clientName: 'Дуквах',
  clientPhone: '',
  fulfillmentType: 'hall',
  cabinLabel: 'Стол 3',
  deliveryAddress: '',
  deliveryLat: null,
  deliveryLng: null,
  clientAccuracyM: null,
  deliveryCity: '',
  deliverySettlement: '',
  restaurantAddress: '',
  restaurantCity: '',
  restaurantLat: null,
  restaurantLng: null,
  comment: '',
  status: 'preparing',
  paymentStatus: 'unpaid',
  deliveryStatus: 'not_required',
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
  subtotal: 1140,
  deliveryFee: 0,
  courierPayout: 0,
  total: 1140,
  createdAt: '2026-08-15T08:13:00.000Z',
  acceptedAt: null,
  readyAt: null,
  completedAt: null,
  cancellationReason: '',
  qrToken: null,
  qrExpiresAt: null,
  verificationCode: null,
  items: [{ id: 'item-1', title: 'Стейк на косточке', quantity: 3, unitPrice: 380, lineTotal: 1140 }]
};

test('shows selected item quantity multiplied by its unit price', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <OrderDetailsPanel
        order={order}
        catalogSlug="mangal"
        businessType="restaurant"
        paymentSettings={defaultPaymentSettings}
        onClose={vi.fn()}
        onStatus={vi.fn(async () => undefined)}
        onRefreshOrders={vi.fn()}
        onDelete={vi.fn(async () => undefined)}
      />
    </QueryClientProvider>
  );

  await expect.element(screen.getByText('Стейк на косточке')).toBeVisible();
  await expect.element(screen.getByText('3 × 380 ₽')).toBeVisible();
});

test('shows a universal business delivery summary without an embedded map', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await page.viewport(520, 960);
  const screen = await render(
    <main style={{ width: 430, margin: '0 auto', padding: 16, background: '#f4f6fb' }}>
      <QueryClientProvider client={queryClient}>
        <OrderDetailsPanel
          order={{
            ...order,
            fulfillmentType: 'delivery',
            deliveryAddress: 'ул. Садовая, 8, кв. 25',
            deliveryLat: 43.318123,
            deliveryLng: 45.698456,
            restaurantAddress: 'ул. Лесная, 12',
            restaurantLat: 43.322,
            restaurantLng: 45.705
          }}
          catalogSlug="sweet-house"
          businessType="confectionery"
          paymentSettings={defaultPaymentSettings}
          onClose={vi.fn()}
          onStatus={vi.fn(async () => undefined)}
          onRefreshOrders={vi.fn()}
          onDelete={vi.fn(async () => undefined)}
        />
      </QueryClientProvider>
    </main>
  );

  await expect.element(screen.getByText('Кондитерская → клиент')).toBeVisible();
  await expect.element(screen.getByText('Карта доставки')).not.toBeInTheDocument();
  await page.screenshot({ path: '../../output/wayyaam-universal-business-order.png' });
});
