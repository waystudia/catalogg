import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ClientOrder, ClientPlatformSnapshot } from '../client-platform/types';
import { prepareClientRepeatOrder } from './repeatOrder';

const order = {
  restaurantSlug: 'finik',
  items: [
    { dishId: 'available', name: 'Финики', price: 100, quantity: 1 },
    { dishId: 'missing', name: 'Сок', price: 90, quantity: 1 }
  ]
} as ClientOrder;

const snapshot = {
  restaurants: [{ slug: 'finik' }],
  dishes: [{
    id: 'available',
    restaurantSlug: 'finik',
    name: 'Финики Тунис',
    price: 120,
    isAvailable: true,
    isUnlimited: true,
    stockCount: 0,
    stockQuantity: 0
  }]
} as ClientPlatformSnapshot;

describe('repeat client order', () => {
  it('uses current products and prices and reports unavailable lines', () => {
    const result = prepareClientRepeatOrder(snapshot, order);
    assert.deepEqual(result.unavailableNames, ['Сок']);
    assert.deepEqual(result.changedPriceNames, ['Финики']);
    assert.equal(result.order?.items[0]?.name, 'Финики Тунис');
    assert.equal(result.order?.items[0]?.price, 120);
    assert.match(result.reason, /Не добавлены: Сок/);
    assert.match(result.reason, /Цена обновилась: Финики/);
  });

  it('does not create a cart when the business is unavailable', () => {
    const result = prepareClientRepeatOrder({ ...snapshot, restaurants: [] }, order);
    assert.equal(result.order, null);
    assert.match(result.reason, /Заведение сейчас недоступно/);
  });
});
