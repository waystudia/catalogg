import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDriverNextAction, splitDriverHomeOffers } from './dashboardPresentation';

describe('driver dashboard presentation', () => {
  it('separates one urgent offer, two compact offers, and the hidden remainder', () => {
    const result = splitDriverHomeOffers([
      { deliveryId: 'urgent' },
      { deliveryId: 'second' },
      { deliveryId: 'third' },
      { deliveryId: 'hidden-1' },
      { deliveryId: 'hidden-2' }
    ]);

    assert.deepEqual(result, {
      urgentOffer: { deliveryId: 'urgent' },
      otherOffers: [{ deliveryId: 'second' }, { deliveryId: 'third' }],
      hiddenOffersCount: 2
    });
  });

  it('keeps empty offer lists empty', () => {
    assert.deepEqual(splitDriverHomeOffers([]), {
      urgentOffer: null,
      otherOffers: [],
      hiddenOffersCount: 0
    });
  });

  it('returns the next operational action for every active delivery stage', () => {
    assert.deepEqual(getDriverNextAction('assigned'), {
      label: 'Я в ресторане',
      status: 'arrived_to_restaurant'
    });
    assert.deepEqual(getDriverNextAction('arrived_to_restaurant'), {
      label: 'Забрал заказ',
      status: 'handed_over'
    });
    assert.deepEqual(getDriverNextAction('handed_over'), {
      label: 'Выехал к клиенту',
      status: 'on_the_way'
    });
    assert.deepEqual(getDriverNextAction('on_the_way'), {
      label: 'Я у клиента',
      status: 'arrived_to_client'
    });
    assert.deepEqual(getDriverNextAction('arrived_to_client'), {
      label: 'Доставлено',
      status: 'delivered'
    });
    assert.equal(getDriverNextAction('waiting_courier'), null);
    assert.equal(getDriverNextAction('delivered'), null);
  });
});
