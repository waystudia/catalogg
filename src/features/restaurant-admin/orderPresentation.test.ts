import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatOrderPaymentMethodMarker,
  groupAdminOrdersByMonth,
  getOrderPaymentMethod,
  getVisibleAdminOrderComment
} from './orderPresentation';
import type { RestaurantOrder } from '../../shared/api/restaurantOrdersApi';

describe('order payment presentation', () => {
  it('stores and reads a bank transfer marker', () => {
    const marker = formatOrderPaymentMethodMarker('bank_transfer');

    assert.equal(marker, '[payment_method:bank_transfer]');
    assert.equal(getOrderPaymentMethod(marker), 'bank_transfer');
  });

  it('defaults legacy orders to cash', () => {
    assert.equal(getOrderPaymentMethod('Позвонить заранее'), 'cash');
  });

  it('hides the technical payment marker from the visible comment', () => {
    const comment = [
      '[payment_method:cash]',
      'Без лука'
    ].join('\n');

    assert.equal(getVisibleAdminOrderComment(comment), 'Без лука');
  });

  it('raises active deliveries above month history using the latest delivery update', () => {
    const order = (
      id: string,
      status: RestaurantOrder['status'],
      deliveryStatus: RestaurantOrder['deliveryStatus'],
      createdAt: string,
      deliveryUpdatedAt: string | null
    ) => ({
      id,
      status,
      deliveryStatus,
      createdAt,
      deliveryUpdatedAt,
      fulfillmentType: 'delivery'
    }) as RestaurantOrder;
    const groups = groupAdminOrdersByMonth([
      order('newer-order', 'new', 'waiting_courier', '2026-07-30T10:00:00Z', '2026-07-30T10:00:00Z'),
      order('current-driver-order', 'on_the_way', 'arrived_to_client', '2026-07-20T10:00:00Z', '2026-07-31T00:39:00Z'),
      order('finished-order', 'completed', 'delivered', '2026-07-29T10:00:00Z', '2026-07-29T11:00:00Z')
    ]);

    assert.equal(groups[0]?.label, 'Активные доставки');
    assert.deepEqual(groups[0]?.orders.map((item) => item.id), ['current-driver-order', 'newer-order']);
    assert.equal(groups.flatMap((group) => group.orders).filter((item) => item.id === 'current-driver-order').length, 1);
  });
});
