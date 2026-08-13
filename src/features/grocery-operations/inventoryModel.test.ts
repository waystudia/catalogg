import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Product } from '../../entities/models';
import { applyReceivingLines, formatInventoryQuantity, getProductMargin } from './inventoryModel';

const product = (patch: Partial<Product> = {}): Product => ({
  id: 'milk',
  title: 'Молоко',
  price: 110,
  description: '',
  image_url: '',
  ingredients: '',
  weight: '1 л',
  spicy_level: 0,
  serving: '',
  is_popular: false,
  is_new: false,
  is_hit: false,
  stock_count: 3,
  stock_quantity: 3,
  category_id: 'milk',
  pair_ids: [],
  sale_unit: 'piece',
  ...patch
});

describe('grocery inventory model', () => {
  it('posts receiving quantities and keeps internal cost separate from sale price', () => {
    const [next] = applyReceivingLines([product()], [{
      productId: 'milk',
      quantity: 7,
      unitCost: 70,
      unitPrice: 115,
      minimumStock: 4
    }]);
    assert.equal(next.stock_quantity, 10);
    assert.equal(next.stock_count, 10);
    assert.equal(next.cost_price, 70);
    assert.equal(next.price, 115);
    assert.deepEqual(getProductMargin(next), { amount: 45, percent: 39 });
  });

  it('stores and formats weighted inventory in grams', () => {
    const [next] = applyReceivingLines([
      product({ id: 'dates', title: 'Финики', sale_unit: 'weight', stock_quantity: 1250, stock_count: 2 })
    ], [{ productId: 'dates', quantity: 750, unitCost: 500, unitPrice: 890, minimumStock: 1000 }]);
    assert.equal(next.stock_quantity, 2000);
    assert.equal(next.stock_count, 2);
    assert.equal(formatInventoryQuantity(next), '2 кг');
  });
});
