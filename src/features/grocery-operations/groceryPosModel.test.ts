import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Product } from '../../entities/models';
import { calculateCashSettlement, getCashQuickAmounts, getWeightSaleMinimum } from './groceryPosModel';

const weightedProduct = (patch: Partial<Product> = {}) =>
  ({
    id: 'apricots',
    title: 'Курага',
    price: 890,
    description: '',
    image_url: '',
    ingredients: '',
    weight: 'весовой',
    spicy_level: 0,
    serving: '',
    is_popular: false,
    is_new: false,
    is_hit: false,
    stock_count: 12,
    category_id: 'nuts',
    pair_ids: [],
    sale_unit: 'weight',
    quantity_step: 100,
    minimum_quantity: 250,
    ...patch
  }) as Product;

describe('grocery POS model', () => {
  it('calculates change and a shortfall without negative values', () => {
    assert.deepEqual(calculateCashSettlement(489, '1 000'), {
      received: 1000,
      change: 511,
      shortfall: 0
    });
    assert.deepEqual(calculateCashSettlement(489, '400'), {
      received: 400,
      change: 0,
      shortfall: 89
    });
  });

  it('offers the exact total and useful rounded cash amounts', () => {
    assert.deepEqual(getCashQuickAmounts(489), [489, 500, 1000]);
  });

  it('uses the configured minimum for a weighted product', () => {
    assert.equal(getWeightSaleMinimum(weightedProduct()), 250);
    assert.equal(getWeightSaleMinimum(weightedProduct({ minimum_quantity: undefined, minimum_weight: 0.35 })), 350);
  });
});
