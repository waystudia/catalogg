import { describe, expect, it } from 'vitest';
import {
  getDriverGrossEarning,
  getDriverNextAction,
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
    ['assigned', { label: 'Я в ресторане', status: 'arrived_to_restaurant' }],
    ['arrived_to_restaurant', { label: 'Забрал заказ', status: 'handed_over' }],
    ['handed_over', { label: 'Выехал к клиенту', status: 'on_the_way' }],
    ['on_the_way', { label: 'Я у клиента', status: 'arrived_to_client' }],
    ['arrived_to_client', { label: 'Доставлено', status: 'delivered' }]
  ] as const)('maps %s to its next operational action', (status, action) => {
    expect(getDriverNextAction(status)).toEqual(action);
  });

  it.each(['waiting_courier', 'delivered', 'failed'] as const)('does not advance %s', (status) => {
    expect(getDriverNextAction(status)).toBeNull();
  });
});
