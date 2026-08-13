import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CartItem, Product } from '../entities/models';
import {
  formatCatalogProductPrice,
  getCartItemPrice,
  getProductMinimumWeight,
  getProductWeightStep,
  isWeightPricedProduct,
  normalizeSelectedWeight
} from '../entities/productPricing';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'product-1',
  title: 'Помидоры розовые',
  price: 250,
  description: '',
  image_url: '',
  ingredients: '',
  weight: '',
  spicy_level: 0,
  serving: '',
  is_popular: false,
  is_new: false,
  is_hit: false,
  is_unlimited: false,
  stock_count: 25,
  category_id: 'vegetables',
  pair_ids: [],
  ...overrides
});

describe('weighted grocery pricing', () => {
  it('uses universal gram fields without pretending the item is a cake', () => {
    const tomatoes = product({
      sale_unit: 'weight',
      quantity_unit: 'gram',
      price_basis_quantity: 1000,
      minimum_quantity: 300,
      quantity_step: 100,
      stock_quantity: 25_000
    });

    assert.equal(tomatoes.pricing_type, undefined);
    assert.equal(isWeightPricedProduct(tomatoes), true);
    assert.equal(getProductMinimumWeight(tomatoes), 0.3);
    assert.equal(getProductWeightStep(tomatoes), 0.1);
    assert.equal(normalizeSelectedWeight(tomatoes, 0.36), 0.4);
    assert.equal(formatCatalogProductPrice(tomatoes), '250 ₽/кг');

    const item: CartItem = { product: tomatoes, quantity: 1, selected_weight: 0.3 };
    assert.equal(getCartItemPrice(item), 75);
  });

  it('keeps confectionery per-kilogram pricing compatible', () => {
    const cake = product({ pricing_type: 'per_kg', minimum_weight: 1.5, weight_step: 0.5, price: 1200 });
    assert.equal(normalizeSelectedWeight(cake, 1.7), 1.5);
    assert.equal(getCartItemPrice({ product: cake, quantity: 1, selected_weight: 2 }), 2400);
  });
});
