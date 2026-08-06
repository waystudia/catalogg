import { describe, expect, it } from 'vitest';
import {
  getDriverDeliveryProgress,
  getDriverGrossEarning,
  getDriverNextAction,
  preferFreshDriverLocation,
  splitDriverHomeOffers
} from '../../src/features/driver/dashboardPresentation';

describe('driver dashboard presentation', () => {
  it('shows the full driver earning while commission remains a separate debt', () => {
    expect(getDriverGrossEarning({ amount: 200, netAmount: 190 })).toBe(200);
    expect(getDriverGrossEarning({ amount: 0, netAmount: 0 })).toBe(0);
  });

  it('shows one urgent offer, two compact offers, and counts the hidden remainder', () => {
    expect(splitDriverHomeOffers(['urgent', 'second', 'third', 'hidden-1', 'hidden-2'])).toEqual({
      urgentOffer: 'urgent',
      otherOffers: ['second', 'third'],
      hiddenOffersCount: 2
    });
    expect(splitDriverHomeOffers([])).toEqual({
      urgentOffer: null,
      otherOffers: [],
      hiddenOffersCount: 0
    });
  });

  it.each([
    ['assigned', { label: 'Поехать в ресторан', to: '/driver/map' }],
    ['arrived_to_restaurant', { label: 'Забрал заказ', status: 'handed_over' }],
    ['handed_over', { label: 'Выехал к клиенту', status: 'on_the_way' }],
    ['on_the_way', { label: 'Я у клиента', status: 'arrived_to_client' }],
    ['arrived_to_client', { label: 'Доставлено', status: 'delivered' }]
  ] as const)('maps %s to its next operational action', (status, action) => {
    expect(getDriverNextAction(status)).toEqual(action);
  });

  it('offers restaurant arrival only after the restaurant route was opened', () => {
    expect(getDriverNextAction('assigned', true)).toEqual({
      label: 'Я в ресторане',
      status: 'arrived_to_restaurant'
    });
  });

  it('keeps an accepted order at stage one until its restaurant route is opened', () => {
    expect(getDriverDeliveryProgress('assigned').activeStep).toBe(1);
    expect(getDriverDeliveryProgress('assigned', true).activeStep).toBe(2);
    expect(getDriverDeliveryProgress('arrived_to_restaurant').activeStep).toBe(2);
    expect(getDriverDeliveryProgress('handed_over').activeStep).toBe(3);
    expect(getDriverDeliveryProgress('handed_over', true).activeStep).toBe(3);
    expect(getDriverDeliveryProgress('on_the_way').activeStep).toBe(4);
    expect(getDriverDeliveryProgress('arrived_to_client').activeStep).toBe(5);
    expect(getDriverDeliveryProgress('delivered').activeStep).toBe(6);
    expect(getDriverDeliveryProgress('assigned').labels).toEqual([
      'Принял заказ',
      'Еду в ресторан',
      'Забрал заказ',
      'Еду к клиенту',
      'Я у клиента',
      'Доставлено'
    ]);
  });

  it.each(['waiting_courier', 'delivered', 'failed'] as const)('does not advance %s', (status) => {
    expect(getDriverNextAction(status)).toBeNull();
  });

  it('keeps the freshest phone position when a dashboard refresh returns stale coordinates', () => {
    const serverLocation = {
      lastLat: 43.31,
      lastLng: 45.68,
      lastLocationAt: '2026-08-06T10:40:00.000Z'
    };
    const currentPhoneLocation = {
      lastLat: 43.318123,
      lastLng: 45.698456,
      lastLocationAt: '2026-08-06T10:43:00.000Z'
    };

    expect(preferFreshDriverLocation(serverLocation, currentPhoneLocation)).toEqual(currentPhoneLocation);
    expect(preferFreshDriverLocation(currentPhoneLocation, serverLocation)).toEqual(currentPhoneLocation);
    expect(preferFreshDriverLocation(serverLocation, null)).toEqual(serverLocation);
    expect(preferFreshDriverLocation(serverLocation, {
      ...currentPhoneLocation,
      lastLocationAt: serverLocation.lastLocationAt
    })).toEqual({
      ...currentPhoneLocation,
      lastLocationAt: serverLocation.lastLocationAt
    });
    expect(preferFreshDriverLocation(
      { ...serverLocation, lastLocationAt: null },
      currentPhoneLocation
    )).toEqual(currentPhoneLocation);
    expect(preferFreshDriverLocation(
      currentPhoneLocation,
      { ...serverLocation, lastLocationAt: null }
    )).toEqual(currentPhoneLocation);
  });
});
