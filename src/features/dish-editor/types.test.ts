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

  it('round-trips grocery SKU and weighted inventory in whole grams', () => {
    const groceryProduct: Product = {
      ...product,
      sku: 'DATES-MEDJOUL',
      barcode: '4601234567890',
      pricing_type: 'per_kg',
      sale_unit: 'weight',
      quantity_unit: 'gram',
      price_basis_quantity: 1000,
      minimum_quantity: 250,
      quantity_step: 50,
      stock_quantity: 12_500,
      allow_substitution: true,
      is_unlimited: false
    };

    const dish = productToDish(groceryProduct, 'food');

    assert.equal(dish.sku, 'DATES-MEDJOUL');
    assert.equal(dish.barcode, '4601234567890');
    assert.equal(dish.saleUnit, 'weight');
    assert.equal(dish.minimumWeight, 0.25);
    assert.equal(dish.weightStep, 0.05);
    assert.equal(dish.dailyQuantity, 12.5);
    assert.equal(dish.allowSubstitution, true);

    const next = dishToProduct(dish, groceryProduct);
    assert.equal(next.sale_unit, 'weight');
    assert.equal(next.quantity_unit, 'gram');
    assert.equal(next.price_basis_quantity, 1000);
    assert.equal(next.minimum_quantity, 250);
    assert.equal(next.quantity_step, 50);
    assert.equal(next.stock_quantity, 12_500);
    assert.equal(next.sku, 'DATES-MEDJOUL');
    assert.equal(next.barcode, '4601234567890');
    assert.equal(next.allow_substitution, true);
  });

  it('keeps a shared master link while the merchant edits local price and stock', () => {
    const sharedProduct: Product = {
      ...product,
      master_product_id: '751ab4fb-9f19-4db7-8ca7-d10c6b776a08',
      master_content_version: 3,
      content_source: 'master',
      barcode: '5449000054227'
    };

    const dish = productToDish(sharedProduct, 'food');
    assert.equal(dish.masterProductId, sharedProduct.master_product_id);
    assert.equal(dish.masterContentVersion, 3);

    const next = dishToProduct({ ...dish, price: 129, dailyQuantity: 20 }, sharedProduct);
    assert.equal(next.master_product_id, sharedProduct.master_product_id);
    assert.equal(next.master_content_version, 3);
    assert.equal(next.content_source, 'master');
    assert.equal(next.price, 129);
    assert.equal(next.stock_quantity, 20);
  });
});
