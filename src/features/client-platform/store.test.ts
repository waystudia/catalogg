import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ClientCheckoutDraft, ClientOrder } from './types';

const installMemoryStorage = () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    }
  });
};

installMemoryStorage();
const { isLegacyDemoClientOrder, selectRestaurantCart, useClientPlatformStore } = await import('./store');

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

describe('repeat order checkout restoration', () => {
  it('restores the ordered cart and customer checkout information together', async () => {
    const previousDraft: ClientCheckoutDraft = {
      orderType: 'pickup',
      clientName: 'Старое имя',
      clientPhone: '+70000000000',
      boothName: 'Кабинка №1',
      addressId: 'address-home',
      deliverySettlement: 'Цоци-Юрт',
      deliveryAddress: 'Старый адрес',
      deliveryLat: 43.2,
      deliveryLng: 45.9,
      deliveryAccuracyM: 12,
      deliveryEntrance: '2',
      deliveryFloor: '3',
      deliveryApartment: '14',
      deliveryIntercomCode: '14',
      deliveryLandmark: 'Школа',
      deliveryComment: 'Позвонить',
      paymentMethod: 'cash'
    };
    const repeatedOrder: ClientOrder = {
      ...demoOrder,
      id: '11111111-1111-4111-8111-111111111111',
      restaurantSlug: 'mangal',
      restaurantName: 'Мангал',
      orderType: 'delivery',
      paymentMethod: 'qr',
      addressLine: 'Цоци-Юрт, ул. Центральная, 12',
      deliveryLat: 43.240696,
      deliveryLng: 45.997684,
      clientName: 'Адам',
      clientPhone: '+79280000000',
      items: [{ dishId: 'dish-tea', name: 'Чеченский чай', price: 200, quantity: 2 }]
    };
    useClientPlatformStore.setState({ carts: {}, checkoutDrafts: { mangal: previousDraft } });

    useClientPlatformStore.getState().repeatOrder(repeatedOrder);

    assert.deepEqual(useClientPlatformStore.getState().carts.mangal, [
      { dishId: 'dish-tea', quantity: 2 }
    ]);
    assert.deepEqual(useClientPlatformStore.getState().checkoutDrafts.mangal, {
      ...previousDraft,
      orderType: 'delivery',
      clientName: 'Адам',
      clientPhone: '+79280000000',
      deliveryAddress: 'Цоци-Юрт, ул. Центральная, 12',
      deliveryLat: 43.240696,
      deliveryLng: 45.997684,
      paymentMethod: 'qr'
    });
  });
});


describe('client platform cart selector', () => {
  it('keeps the empty cart snapshot referentially stable for Zustand subscriptions', () => {
    const carts = {};

    assert.equal(selectRestaurantCart(carts, 'finik'), selectRestaurantCart(carts, 'finik'));
  });
});
