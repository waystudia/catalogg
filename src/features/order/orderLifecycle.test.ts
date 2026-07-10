import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDriverDeliveryView,
  buildDeliveryDestinationAddress,
  buildYandexMapsRouteAppUrl,
  buildYandexMapsRouteUrl,
  findDeliveryPrice,
  canSendOrderToDelivery,
  createPickupQrToken,
  rotatePickupQr,
  verifyPickupQr
} from './orderLifecycle';
import type { DeliveryAssignment, DriverDeliveryView, OrderLifecycleSnapshot } from './orderLifecycle';

const order = (overrides: Partial<OrderLifecycleSnapshot> = {}): OrderLifecycleSnapshot => ({
  id: 'order-1',
  orderType: 'delivery',
  status: 'ready',
  paymentStatus: 'confirmed',
  clientName: 'Адам М.',
  clientPhone: '+7 928 123-45-67',
  deliveryAddress: 'ул. Ленина, 123',
  deliveryComment: 'Подъезд 2',
  restaurantName: 'Rizih',
  restaurantAddress: 'пр-т Путина, 20',
  restaurantLat: 43.322,
  restaurantLng: 45.705,
  deliveryLat: 43.318123,
  deliveryLng: 45.698456,
  deliveryFee: 470,
  distanceKm: 1.8,
  ...overrides
});

const assignment = (overrides: Partial<DeliveryAssignment> = {}): DeliveryAssignment => ({
  orderId: 'order-1',
  driverId: 'driver-1',
  status: 'assigned',
  pickupQrToken: createPickupQrToken({ orderId: 'order-1', driverId: 'driver-1', nonce: 'nonce-a' }),
  pickupQrExpiresAt: '2026-07-04T12:10:00.000Z',
  assignedAt: '2026-07-04T12:00:00.000Z',
  ...overrides
});

describe('order delivery lifecycle', () => {
  it('keeps the full settlement and street address in the driver route target', () => {
    assert.equal(
      buildDeliveryDestinationAddress({ address: 'ул. Ленина, 123', settlement: 'Цоци-Юрт', city: 'Цоци-Юрт' }),
      'ул. Ленина, 123, Цоци-Юрт'
    );
    assert.equal(
      buildYandexMapsRouteUrl({
        to: {
          lat: null,
          lng: null,
          address: 'ул. Ленина, 123, Цоци-Юрт'
        }
      }),
      'https://yandex.ru/maps/?text=%D1%83%D0%BB.+%D0%9B%D0%B5%D0%BD%D0%B8%D0%BD%D0%B0%2C+123%2C+%D0%A6%D0%BE%D1%86%D0%B8-%D0%AE%D1%80%D1%82'
    );
  });

  it('provides a Yandex Maps app link using the same exact route coordinates', () => {
    assert.equal(
      buildYandexMapsRouteAppUrl({
        from: { lat: 43.322, lng: 45.705, address: 'Ресторан' },
        to: { lat: 43.318123, lng: 45.698456, address: 'Клиент' }
      }),
      'yandexmaps://maps.yandex.ru/?rtext=43.322%2C45.705~43.318123%2C45.698456&rtt=auto'
    );
  });

  it('selects a configured tariff for a same-settlement or inter-settlement route', () => {
    const prices = [
      { fromSettlement: 'Цоци-Юрт', toSettlement: 'Шали', amount: 700 },
      { fromSettlement: 'Цоци-Юрт', toSettlement: 'Цоци-Юрт', amount: 250 }
    ];

    assert.equal(findDeliveryPrice(prices, 'Цоци-Юрт', 'Шали'), 700);
    assert.equal(findDeliveryPrice(prices, 'Цоци-Юрт', 'Цоци-Юрт'), 250);
    assert.equal(findDeliveryPrice(prices, ' цоци-юрт ', ' шали '), 700);
    assert.equal(findDeliveryPrice(prices, 'Шали', 'Грозный'), null);
    assert.equal(findDeliveryPrice([{ fromSettlement: 'Шали', toSettlement: 'Грозный', amount: -1 }], 'Шали', 'Грозный'), null);
    assert.equal(findDeliveryPrice(prices, '', 'Шали'), null);
  });

  it('does not send delivery orders to drivers before the restaurant confirms payment', () => {
    assert.equal(
      canSendOrderToDelivery(order({ paymentStatus: 'waiting_confirmation' })),
      false
    );

    assert.equal(canSendOrderToDelivery(order()), true);
    assert.equal(canSendOrderToDelivery(order({ paymentStatus: 'unpaid' })), true);
  });

  it('does not request a driver for dine-in and pickup orders even when payment is confirmed', () => {
    assert.equal(canSendOrderToDelivery(order({ orderType: 'dine_in' })), false);
    assert.equal(canSendOrderToDelivery(order({ orderType: 'pickup' })), false);
  });

  it('rotates pickup QR when a delivery is reassigned and rejects the old token', () => {
    const firstAssignment = assignment();
    const nextAssignment = rotatePickupQr({
      assignment: firstAssignment,
      driverId: 'driver-2',
      nonce: 'nonce-b',
      assignedAt: '2026-07-04T12:05:00.000Z',
      expiresAt: '2026-07-04T12:15:00.000Z'
    });

    assert.notEqual(nextAssignment.pickupQrToken, firstAssignment.pickupQrToken);
    assert.equal(
      verifyPickupQr({
        assignment: nextAssignment,
        token: firstAssignment.pickupQrToken,
        now: '2026-07-04T12:06:00.000Z'
      }).ok,
      false
    );
    assert.deepEqual(
      verifyPickupQr({
        assignment: nextAssignment,
        token: nextAssignment.pickupQrToken,
        now: '2026-07-04T12:06:00.000Z'
      }),
      { ok: true }
    );
  });

  it('rejects expired pickup QR tokens', () => {
    assert.deepEqual(
      verifyPickupQr({
        assignment: assignment(),
        token: assignment().pickupQrToken,
        now: '2026-07-04T12:11:00.000Z'
      }),
      { ok: false, reason: 'expired' }
    );
  });

  it('hides customer contacts from drivers before they accept the delivery', () => {
    const availableView: DriverDeliveryView = buildDriverDeliveryView({
      order: order(),
      assignment: null,
      viewerDriverId: 'driver-1'
    });

    assert.equal(availableView.clientName, undefined);
    assert.equal(availableView.clientPhone, undefined);
    assert.equal(availableView.deliveryComment, undefined);
    assert.equal(availableView.itemsVisible, false);
  });

  it('shows customer contacts only to the assigned driver after acceptance', () => {
    const assignedView = buildDriverDeliveryView({
      order: order(),
      assignment: assignment(),
      viewerDriverId: 'driver-1'
    });
    const otherDriverView = buildDriverDeliveryView({
      order: order(),
      assignment: assignment(),
      viewerDriverId: 'driver-2'
    });

    assert.equal(assignedView.clientName, 'Адам М.');
    assert.equal(assignedView.clientPhone, '+7 928 123-45-67');
    assert.equal(assignedView.deliveryComment, 'Подъезд 2');
    assert.equal(otherDriverView.clientName, undefined);
  });

  it('builds Yandex route links from coordinates and falls back to text search', () => {
    assert.equal(
      buildYandexMapsRouteUrl({
        from: { lat: 43.322, lng: 45.705, address: 'Rizih' },
        to: { lat: 43.318123, lng: 45.698456, address: 'ул. Ленина, 123' }
      }),
      'https://yandex.ru/maps/?rtext=43.322%2C45.705~43.318123%2C45.698456&rtt=auto'
    );

    assert.equal(
      buildYandexMapsRouteUrl({ to: { lat: null, lng: null, address: 'ул. Ленина, 123' } }),
      'https://yandex.ru/maps/?text=%D1%83%D0%BB.+%D0%9B%D0%B5%D0%BD%D0%B8%D0%BD%D0%B0%2C+123'
    );

    assert.equal(
      buildYandexMapsRouteUrl({ to: { lat: null, lng: null, address: 'Цоци-Юрт, 43.23131, 46.0033982' } }),
      'https://yandex.ru/maps/?text=43.23131%2C46.0033982'
    );
  });

  it('gives drivers restaurant route first and client route only after assignment', () => {
    const availableView = buildDriverDeliveryView({
      order: order(),
      assignment: null,
      viewerDriverId: 'driver-1'
    });
    const assignedView = buildDriverDeliveryView({
      order: order(),
      assignment: assignment(),
      viewerDriverId: 'driver-1'
    });

    assert.equal(
      availableView.routeToRestaurantUrl,
      'https://yandex.ru/maps/?text=43.322%2C45.705'
    );
    assert.equal(availableView.routeToClientUrl, undefined);
    assert.equal(
      assignedView.routeToClientUrl,
      'https://yandex.ru/maps/?rtext=43.322%2C45.705~43.318123%2C45.698456&rtt=auto'
    );
  });
});
