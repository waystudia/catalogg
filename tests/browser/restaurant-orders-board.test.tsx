import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import type { RestaurantOrder, RestaurantOrderStatus } from '../../src/shared/api/restaurantOrdersApi';
import { RestaurantOrdersBoard } from '../../src/features/restaurant-admin/RestaurantOrdersBoard';

const order = (id: string, status: RestaurantOrderStatus): RestaurantOrder => ({
  id,
  orderNumber: id,
  catalogId: 'mangal',
  clientName: 'Гость',
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
  status,
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
  subtotal: 1180,
  deliveryFee: 0,
  courierPayout: 0,
  total: 1180,
  createdAt: '2026-08-04T09:21:00.000Z',
  acceptedAt: null,
  readyAt: null,
  completedAt: null,
  cancellationReason: '',
  qrToken: null,
  qrExpiresAt: null,
  verificationCode: null,
  items: [{ id: `${id}-item`, title: 'Жижиг-галнаш', quantity: 3, unitPrice: 380, lineTotal: 1140 }]
});

test('orders are arranged in a horizontal grey Trello board', async () => {
  await page.viewport(995, 700);
  const onSelect = vi.fn();
  const screen = await render(
    <RestaurantOrdersBoard
      orders={[
        order('1024', 'new'),
        order('1023', 'preparing'),
        order('1022', 'ready'),
        order('1021', 'on_the_way'),
        order('1020', 'completed'),
        order('1019', 'cancelled')
      ]}
      selectedOrderId="1024"
      recentOrderIds={new Set()}
      onSelectOrder={onSelect}
    />
  );

  const columns = [
    screen.getByRole('region', { name: 'Колонка Новые' }).element(),
    screen.getByRole('region', { name: 'Колонка Готовятся' }).element(),
    screen.getByRole('region', { name: 'Колонка Готовы' }).element(),
    screen.getByRole('region', { name: 'Колонка Доставка' }).element()
  ];
  const columnBounds = columns.map((column) => column.getBoundingClientRect());

  expect(columnBounds.every((bounds) => bounds.top === columnBounds[0].top)).toBe(true);
  expect(columnBounds[1].left).toBeGreaterThan(columnBounds[0].left);
  expect(getComputedStyle(screen.getByRole('region', { name: 'Доска заказов' }).element()).overflowX).toBe('auto');

  await screen.getByRole('button', { name: /Заказ №1023/u }).click();
  expect(onSelect).toHaveBeenCalledWith('1023');
});

test('store POS sales are separated from delivery and takeaway orders', async () => {
  const storeSale = { ...order('store-sale', 'new'), fulfillmentType: 'takeaway' as const, comment: 'Касса магазина · Наличные' };
  const takeaway = { ...order('takeaway', 'new'), fulfillmentType: 'takeaway' as const, comment: 'Заберу сам' };
  const delivery = { ...order('delivery', 'new'), fulfillmentType: 'delivery' as const, comment: '' };
  const screen = await render(
    <RestaurantOrdersBoard
      orders={[storeSale, takeaway, delivery]}
      selectedOrderId={null}
      recentOrderIds={new Set()}
      businessType="grocery"
      onSelectOrder={vi.fn()}
    />
  );

  const completedColumn = screen.getByRole('region', { name: 'Колонка Завершённые' });
  await expect.element(completedColumn.getByRole('button', { name: /Заказ №store-sale/u })).toBeVisible();
  await expect.element(completedColumn.getByText('Продажа завершена')).toBeVisible();
  expect(screen.getByRole('button', { name: /Заказ №store-sale/u }).element().dataset.channel).toBe('store');
  expect(screen.getByRole('button', { name: /Заказ №takeaway/u }).element().dataset.channel).toBe('takeaway');
  expect(screen.getByRole('button', { name: /Заказ №delivery/u }).element().dataset.channel).toBe('delivery');
});
