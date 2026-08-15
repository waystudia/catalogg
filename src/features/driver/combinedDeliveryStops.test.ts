import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getActiveDeliveryStop,
  getCombinedDeliveryRoutePoints,
  getDeliveryStopAction,
  getVisibleDeliveryStops,
  type DriverDeliveryStop
} from './combinedDeliveryStops';

const stop = (overrides: Partial<DriverDeliveryStop>): DriverDeliveryStop => ({
  id: 'stop-1',
  deliveryId: 'delivery-1',
  merchantOrderId: 'order-1',
  stopType: 'pickup',
  sequence: 1,
  status: 'pending',
  latitude: 43.31,
  longitude: 45.69,
  address: 'ул. Центральная, 1',
  merchantName: 'Финик',
  merchantType: 'grocery',
  merchantOrderStatus: 'ready',
  estimatedReadyAt: null,
  estimatedArrivalAt: null,
  isPrimary: false,
  ...overrides
});

describe('combined delivery stops', () => {
  it('sorts all visible stops and keeps completed stops in the courier timeline', () => {
    const result = getVisibleDeliveryStops([
      stop({ id: 'customer', stopType: 'dropoff', merchantOrderId: null, sequence: 3 }),
      stop({ id: 'store', sequence: 1, status: 'completed' }),
      stop({ id: 'restaurant', sequence: 2, merchantName: 'Мангал', isPrimary: true })
    ]);

    assert.deepEqual(result.map(({ id }) => id), ['store', 'restaurant', 'customer']);
  });

  it('selects only the first unfinished stop as active', () => {
    const stops = [
      stop({ id: 'store', sequence: 1, status: 'completed' }),
      stop({ id: 'restaurant', sequence: 2, status: 'arrived', isPrimary: true }),
      stop({ id: 'customer', stopType: 'dropoff', merchantOrderId: null, sequence: 3 })
    ];

    assert.equal(getActiveDeliveryStop(stops)?.id, 'restaurant');
  });

  it('builds one remaining route from the current driver through every unfinished stop', () => {
    const points = getCombinedDeliveryRoutePoints(
      [
        stop({ id: 'done', sequence: 1, status: 'completed', latitude: 40, longitude: 40 }),
        stop({ id: 'restaurant', sequence: 2, latitude: 41, longitude: 41 }),
        stop({ id: 'customer', stopType: 'dropoff', merchantOrderId: null, sequence: 3, latitude: 42, longitude: 42 })
      ],
      { lat: 39, lng: 39 }
    );

    assert.deepEqual(points, [
      { lat: 39, lng: 39 },
      { lat: 41, lng: 41 },
      { lat: 42, lng: 42 }
    ]);
  });

  it('requires arrival before pickup and uses a delivery-specific final action', () => {
    const pendingPickup = stop({ id: 'pickup', status: 'pending' });
    const arrivedPickup = stop({ id: 'pickup', status: 'arrived' });
    const arrivedDropoff = stop({ id: 'customer', stopType: 'dropoff', merchantOrderId: null, status: 'arrived' });

    assert.deepEqual(getDeliveryStopAction(pendingPickup, 'pickup'), {
      nextStatus: 'arrived',
      label: 'Я на месте'
    });
    assert.deepEqual(getDeliveryStopAction(arrivedPickup, 'pickup'), {
      nextStatus: 'completed',
      label: 'Забрал заказ'
    });
    assert.deepEqual(getDeliveryStopAction(arrivedDropoff, 'customer'), {
      nextStatus: 'completed',
      label: 'Доставлено'
    });
    assert.equal(getDeliveryStopAction(pendingPickup, 'another-stop'), null);
  });

  it('does not route to cancelled stops or expose an action after completion', () => {
    const cancelled = stop({ id: 'cancelled', status: 'cancelled' });
    const completed = stop({ id: 'completed', status: 'completed' });

    assert.deepEqual(getCombinedDeliveryRoutePoints([cancelled, completed], null), []);
    assert.equal(getActiveDeliveryStop([cancelled, completed]), null);
    assert.equal(getDeliveryStopAction(completed, 'completed'), null);
  });
});
