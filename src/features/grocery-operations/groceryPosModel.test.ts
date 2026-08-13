import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Product } from '../../entities/models';
import { calculateCashSettlement, formatGroceryPosOrderComment, getCashQuickAmounts, getGroceryTransferBankLabel, getWeightSaleMinimum } from './groceryPosModel';

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

  it('stores the actual checkout payment method and cash settlement as hidden metadata plus readable store text', () => {
    assert.equal(
      formatGroceryPosOrderComment({ method: 'cash', cashReceived: 500, cashChange: 320 }),
      '[payment_method:cash]\nКасса магазина · Наличные\nПолучено: 500 ₽ · Сдача: 320 ₽'
    );
    assert.equal(
      formatGroceryPosOrderComment({ method: 'transfer', cashReceived: 0, cashChange: 0 }),
      '[payment_method:bank_transfer]\nКасса магазина · Перевод'
    );
  });

  it('normalizes a legacy restaurant payment label only for the grocery checkout', () => {
    assert.equal(getGroceryTransferBankLabel('Банк / перевод ресторану'), 'Банк / перевод магазину');
    assert.equal(getGroceryTransferBankLabel('Сбер'), 'Сбер');
  });
});
