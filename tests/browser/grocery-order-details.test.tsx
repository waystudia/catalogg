import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import type { Product } from '../../src/entities/models';
import { OrderDetails } from '../../src/pages/catalog-admin/RestaurantAdminShell';
import type { RestaurantOrder } from '../../src/shared/api/restaurantOrdersApi';
import '../../src/pages/catalog-admin/catalog-admin.css';
import '../../src/app/styles.css';

const itemProduct: Product = {
  id: 'product-1', title: 'Финики Тунис', price: 470, description: '', image_url: '', ingredients: '', weight: '', spicy_level: 0,
  serving: '', is_popular: false, is_new: false, is_hit: false, is_unlimited: true, stock_count: 10, category_id: 'category-1', pair_ids: [],
  sale_unit: 'weight', quantity_unit: 'gram', price_basis_quantity: 1000, minimum_quantity: 100, quantity_step: 50, allow_substitution: true
};

const baseOrder = (comment: string): RestaurantOrder => ({
  id: 'order-1', orderNumber: 'F2794', catalogId: 'catalog-1', clientName: 'Покупатель на кассе', clientPhone: '', fulfillmentType: 'takeaway',
  cabinLabel: '', deliveryAddress: '', deliveryLat: null, deliveryLng: null, clientAccuracyM: null, deliveryCity: '', deliverySettlement: '',
  restaurantAddress: '', restaurantCity: '', restaurantLat: null, restaurantLng: null, comment, status: 'new', paymentStatus: 'unpaid',
  deliveryStatus: 'not_required', deliveryId: null, deliveryUpdatedAt: null, driverName: null, driverPhone: null, driverVehicleInfo: null,
  driverCarNumber: null, driverPhotoUrl: null, driverLat: null, driverLng: null, driverLocationAt: null, restaurantPaymentConfirmedAt: null,
  pickupQrConfirmedAt: null, subtotal: 470, deliveryFee: 0, courierPayout: 0, total: 470, createdAt: '2026-08-14T00:00:00Z',
  acceptedAt: null, readyAt: null, completedAt: null, cancellationReason: '', qrToken: null, qrExpiresAt: null, verificationCode: null,
  items: [{ id: 'line-1', productId: itemProduct.id, title: itemProduct.title, quantity: 1, unitPrice: 470, lineTotal: 470, saleUnit: 'weight', quantityUnit: 'gram', requestedQuantity: 1000, fulfilledQuantity: 0, fulfillmentState: 'pending' }]
});

const callbacks = {
  onStatusChange: vi.fn(), onPaymentStatusChange: vi.fn(), onDelete: vi.fn(), onAcceptAssignment: vi.fn(), onPickingChanged: vi.fn(), onOpenChat: vi.fn()
};

const paymentSettings = {
  transferEnabled: true, enabled: true, requisiteType: 'phone' as const, transferNumber: '+7 999 000-00-00', bankName: 'Банк', lastName: 'Исаев',
  firstName: 'Магомед', middleName: '', displayName: 'Исаев Магомед', comment: '', qrUrl: '', allowCash: true, allowTransfer: true,
  requireConfirmation: true, clientHint: ''
};

test('store POS detail is a finished receipt without chat, picking, assignment, or lifecycle actions', async () => {
  const screen = await render(<OrderDetails order={baseOrder('Касса магазина · Наличные')} products={[itemProduct]} businessType="grocery" assignment={null} paymentSettings={paymentSettings} paymentStatus="confirmed" canDeleteOrders workerMode={false} {...callbacks} />);

  await expect.element(screen.getByText('Продажа оформлена в магазине и не требует сборки или переписки.')).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Состав заказа' })).toBeVisible();
  await expect.element(screen.getByText('Финики Тунис')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Открыть чат заказа' })).not.toBeInTheDocument();
  await expect.element(screen.getByRole('region', { name: 'Сборка продуктового заказа' })).not.toBeInTheDocument();
  await expect.element(screen.getByRole('button', { name: 'Принять' })).not.toBeInTheDocument();
});

test('remote takeaway uses the compact order card with picking, chat and actions below the order', async () => {
  await page.viewport(1040, 576);
  const screen = await render(<OrderDetails order={baseOrder('Самовывоз')} products={[itemProduct]} businessType="grocery" assignment={null} paymentSettings={paymentSettings} paymentStatus="awaiting_transfer" canDeleteOrders workerMode={false} {...callbacks} />);

  const accept = screen.getByRole('button', { name: 'Принять' }).element();
  const composition = screen.getByRole('heading', { name: 'Состав заказа' }).element();
  await expect.element(screen.getByRole('button', { name: 'Открыть чат заказа' })).toBeVisible();
  await expect.element(screen.getByRole('region', { name: 'Сборка продуктового заказа' })).toBeVisible();
  expect(accept.getBoundingClientRect().top).toBeGreaterThan(composition.getBoundingClientRect().top);
  await screen.getByRole('button', { name: 'Открыть чат заказа' }).click();
  await expect.element(screen.getByRole('region', { name: 'Чат заказа' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Сборка продуктового заказа' }).element().querySelector('article')!.getBoundingClientRect().height).toBeLessThan(120);
});

test('mobile composition keeps a long weight price on one readable line below the product title', async () => {
  await page.viewport(372, 576);
  const order = baseOrder('Самовывоз');
  order.items[0] = {
    ...order.items[0],
    title: 'Финики королевские Меджул',
    requestedQuantity: 750,
    unitPrice: 1190,
    lineTotal: 893
  };
  order.total = 893;

  const screen = await render(<OrderDetails order={order} products={[itemProduct]} businessType="grocery" assignment={null} paymentSettings={paymentSettings} paymentStatus="awaiting_transfer" canDeleteOrders workerMode={false} {...callbacks} />);
  const composition = screen.getByRole('heading', { name: 'Состав заказа' }).element().parentElement!;
  const row = composition.querySelector('.admin-order-items > div')!;
  const title = row.querySelector('span')!;
  const quantity = row.querySelector('small')!;
  const price = row.querySelector('strong')!;
  const titleBox = title.getBoundingClientRect();
  const quantityBox = quantity.getBoundingClientRect();
  const priceBox = price.getBoundingClientRect();

  expect(quantity.textContent).toBe('750 г × 1\u00a0190 ₽/кг');
  expect(quantityBox.top).toBeGreaterThanOrEqual(titleBox.bottom);
  expect(Math.abs(quantityBox.top - priceBox.top)).toBeLessThan(2);
  expect(quantity.scrollWidth).toBeLessThanOrEqual(quantity.clientWidth);
  expect(priceBox.right).toBeLessThanOrEqual(row.getBoundingClientRect().right);
});
