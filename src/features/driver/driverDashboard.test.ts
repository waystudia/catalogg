import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getDriverDeliveryProgress,
  getDriverNextAction,
  splitDriverHomeOffers
} from './dashboardPresentation';

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
      label: 'Поехать в ресторан',
      to: '/driver/map'
    });
    assert.deepEqual(getDriverNextAction('assigned', true), {
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

  it('maps every active delivery state to the six-step driver progress bar', () => {
    const labels = [
      'Принял заказ',
      'Еду в ресторан',
      'Забрал заказ',
      'Еду к клиенту',
      'Я у клиента',
      'Доставлено'
    ];

    assert.deepEqual(getDriverDeliveryProgress('assigned'), { activeStep: 1, labels });
    assert.deepEqual(getDriverDeliveryProgress('assigned', true), { activeStep: 2, labels });
    assert.deepEqual(getDriverDeliveryProgress('arrived_to_restaurant'), { activeStep: 2, labels });
    assert.deepEqual(getDriverDeliveryProgress('handed_over'), { activeStep: 3, labels });
    assert.deepEqual(getDriverDeliveryProgress('on_the_way'), { activeStep: 4, labels });
    assert.deepEqual(getDriverDeliveryProgress('arrived_to_client'), { activeStep: 5, labels });
    assert.deepEqual(getDriverDeliveryProgress('delivered'), { activeStep: 6, labels });
  });

  it('uses coffee shop terminology for route and arrival actions', () => {
    assert.deepEqual(getDriverNextAction('assigned', false, 'coffee_shop'), {
      label: 'Поехать в кофейню',
      to: '/driver/map'
    });
    assert.deepEqual(getDriverNextAction('assigned', true, 'coffee_shop'), {
      label: 'Я в кофейне',
      status: 'arrived_to_restaurant'
    });
    assert.deepEqual(getDriverDeliveryProgress('assigned', true, 'coffee_shop'), {
      activeStep: 2,
      labels: [
        'Принял заказ',
        'Еду в кофейню',
        'Забрал заказ',
        'Еду к клиенту',
        'Я у клиента',
        'Доставлено'
      ]
    });
  });
});
