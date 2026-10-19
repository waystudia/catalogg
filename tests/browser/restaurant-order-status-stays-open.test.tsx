import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { MemoryRouter } from 'react-router-dom';
import { cabins, categories, products, restaurant } from '../../src/data/catalog';
import { RestaurantAdminWorkspace } from '../../src/features/restaurant-admin/RestaurantAdminWorkspace';
import { defaultRestaurantDeliverySettings } from '../../src/features/restaurant-settings';
import { defaultPaymentSettings } from '../../src/shared/paymentSettings';
import type { RestaurantOrder, RestaurantOrderStatus } from '../../src/shared/api/restaurantOrdersApi';
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
  status: 'new',
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


test('status changes keep the same order open and offer the next action', async () => {
  await page.viewport(390, 844);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const update = vi.fn();
  function Example() {
    const [orders, setOrders] = useState([order]);
    return <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/mangal/orders']}><RestaurantAdminWorkspace
      catalogSlug="mangal" restaurant={restaurant} categories={categories} cabins={cabins} products={products} orders={orders} routeSection="orders"
      paymentSettings={defaultPaymentSettings} deliverySettings={defaultRestaurantDeliverySettings} moduleAccess={{pos:'active',warehouse:'disabled'}}
      onOpenScreen={() => undefined} onOpenSeating={() => undefined} onOpenCatalog={() => undefined} onAddDish={() => undefined}
      onOrderStatus={async (selected: RestaurantOrder, status: RestaurantOrderStatus) => { update(selected.id, status); setOrders(current => current.map(item => item.id === selected.id ? {...item, status} : item)); }}
      onRefreshOrders={() => undefined} onSaveDeliverySettings={() => undefined}
    /></MemoryRouter></QueryClientProvider>;
  }
  const screen = await render(<Example/>);
  await screen.getByRole('button', {name: /^#M9686/}).click();
  await screen.getByRole('button', {name: 'Принять заказ'}).click();
  await expect.element(screen.getByRole('button', {name: 'Начать готовить'})).toBeVisible();
  await screen.getByRole('button', {name: 'Начать готовить'}).click();
  await expect.element(screen.getByRole('button', {name: 'Заказ готов'})).toBeVisible();
  expect(update.mock.calls).toEqual([['order-1', 'accepted'], ['order-1', 'preparing']]);
});
