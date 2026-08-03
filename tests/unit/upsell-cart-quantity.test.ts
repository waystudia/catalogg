import { describe, expect, it } from 'vitest';

import type { CartItem, Product } from '../../src/entities/models';
import { getProductCartQuantity } from '../../src/features/stores';

const product = (id: string): Product => ({
  id,
  title: id,
  price: 100,
  description: '',
  image_url: '',
  ingredients: '',
  weight: '',
  spicy_level: 0,
  serving: '',
  is_popular: false,
  is_new: false,
  is_hit: false,
  stock_count: 0,
  category_id: 'drinks',
  pair_ids: []
});

describe('upsell cart quantity', () => {
  it('sums matching lines and ignores unrelated products', () => {
    const cola = product('cola');
    const items: CartItem[] = [
      { product: cola, quantity: 2 },
      { product: cola, quantity: 3, line_id: 'cola-large' },
      { product: product('pepsi'), quantity: 7 }
    ];

    expect(getProductCartQuantity(items, 'cola')).toBe(5);
    expect(getProductCartQuantity(items, 'pepsi')).toBe(7);
    expect(getProductCartQuantity(items, 'fanta')).toBe(0);
  });
});
