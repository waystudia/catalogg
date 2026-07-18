import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isLegacyDemoClientOrder } from './store';
import type { ClientOrder } from './types';

const demoOrder: ClientOrder = {
  id: 'WC-12345',
  restaurantSlug: 'rizih',
  restaurantName: 'Rizih',
  orderType: 'delivery',
  deliveryProvider: 'restaurant',
  paymentMethod: 'qr',
  status: 'on_the_way',
  paymentStatus: 'confirmed',
  totalAmount: 1470,
  addressLine: 'ул. Ленина, 123, кв. 45',
  deliveryLat: 43.318123,
  deliveryLng: 45.698456,
  clientName: 'Адам М.',
  clientPhone: '+7 928 123-45-67',
  createdAt: '2026-07-18T08:00:00.000Z',
  estimatedTimeMin: 30,
  estimatedTimeMax: 40,
  driverName: 'Алан М.',
  driverPhone: '+7 928 555-12-12',
  items: [
    { dishId: 'rizih-philadelphia', name: 'Филадельфия', price: 500, quantity: 1 },
    { dishId: 'rizih-four-seasons', name: 'Четыре сезона', price: 550, quantity: 1 },
    { dishId: 'rizih-pepperoni', name: 'Пицца Пепперони', price: 420, quantity: 1 }
  ]
};

describe('client platform store migration helpers', () => {
  it('recognizes the old seeded Rizih order by id', () => {
    assert.equal(isLegacyDemoClientOrder(demoOrder), true);
  });

  it('recognizes old seeded Rizih orders that already lost the original id', () => {
    assert.equal(isLegacyDemoClientOrder({ ...demoOrder, id: 'persisted-demo-from-old-build' }), true);
  });

  it('keeps real client orders even when they are also from Rizih', () => {
    assert.equal(
      isLegacyDemoClientOrder({
        ...demoOrder,
        id: 'real-order',
        clientName: 'дука тест1',
        clientPhone: '89288865470',
        items: [{ dishId: 'rizih-philadelphia', name: 'Филадельфия', price: 500, quantity: 2 }]
      }),
      false
    );
  });
});
