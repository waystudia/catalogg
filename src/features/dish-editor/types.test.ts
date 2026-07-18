import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Product } from '../../entities/models';
import { dishToProduct, productToDish } from './types';

const product: Product = {
  id: 'dish-1',
  title: 'Блюдо',
  price: 500,
  description: '',
  image_url: 'first.jpg',
  image_urls: ['first.jpg', 'second.jpg', 'third.jpg'],
  ingredients: '',
  weight: '250 г',
  spicy_level: 0,
  serving: '',
  is_popular: true,
  is_new: false,
  is_hit: false,
  stock_count: 10,
  category_id: 'food',
  pair_ids: []
};

describe('dish photo conversion', () => {
  it('keeps every uploaded product photo in editor order', () => {
    assert.deepEqual(productToDish(product, 'food').images, ['first.jpg', 'second.jpg', 'third.jpg']);
  });

  it('writes the first cover and the complete swipe gallery', () => {
    const next = dishToProduct({
      ...productToDish(product, 'food'),
      images: ['cover.jpg', 'side.jpg']
    }, product);

    assert.equal(next.image_url, 'cover.jpg');
    assert.deepEqual(next.image_urls, ['cover.jpg', 'side.jpg']);
  });
});
