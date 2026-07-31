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

  it('keeps named prices for variants and upgrades legacy choices', () => {
    const choices = [
      { name: 'Средняя', price: 550 },
      { name: 'Большая', price: 750 }
    ];
    const dish = productToDish({ ...product, choice_options: choices }, 'food');

    assert.deepEqual(dish.choiceOptions, choices);
    assert.deepEqual(dishToProduct(dish, product).choice_options, choices);
    assert.deepEqual(productToDish({ ...product, choice_options: ['Старая'] }, 'food').choiceOptions, [
      { name: 'Старая', price: 500 }
    ]);
  });

  it('keeps daily stock separate and makes new dishes unlimited by default', () => {
    const existing = {
      ...product,
      daily_stock: 12,
      current_stock: 7,
      is_unlimited: false
    };
    const dish = productToDish(existing, 'food');

    assert.equal(dish.dailyQuantity, 12);
    assert.equal(dish.unlimitedQuantity, false);
    assert.equal(productToDish(null, 'food').unlimitedQuantity, true);

    const next = dishToProduct({ ...dish, dailyQuantity: 9 }, existing);
    assert.equal(next.daily_stock, 9);
    assert.equal(next.current_stock, 9);
    assert.equal(next.is_unlimited, false);
  });
});
