import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CartItem, Product } from '../../entities/models';
import { getProductCartQuantity } from '../stores';

const makeProduct = (id: string): Product => ({
  id,
  title: id,
  description: '',
  price: 120,
  weight: '',
  ingredients: '',
  image_url: '',
  category_id: 'drinks',
  category_ids: ['drinks'],
  spicy_level: 0,
  serving: '',
  is_popular: false,
  is_new: false,
  is_hit: false,
  is_hidden: false,
  stock_count: 0,
  pair_ids: [],
  drink_type: 'cold'
});

describe('restaurant upsell quantities', () => {
  it('sums every configured cart line for one product without including another drink', () => {
    const cola = makeProduct('cola');
    const pepsi = makeProduct('pepsi');
    const items: CartItem[] = [
      { product: cola, quantity: 2, line_id: 'cola-small' },
      { product: cola, quantity: 1, line_id: 'cola-large' },
      { product: pepsi, quantity: 4 }
    ];

    assert.equal(getProductCartQuantity(items, 'cola'), 3);
    assert.equal(getProductCartQuantity(items, 'pepsi'), 4);
    assert.equal(getProductCartQuantity(items, 'fanta'), 0);
  });
});
