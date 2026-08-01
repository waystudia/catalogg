import { describe, expect, it } from 'vitest';
import type { Product } from '../../src/entities/models';
import { isSauceProduct } from '../../src/features/stores';

const product = (patch: Partial<Product>): Product => ({
  id: 'product-1',
  title: 'Чикен-бургер',
  price: 420,
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
  category_id: 'burgers',
  category_ids: ['burgers'],
  pair_ids: [],
  ...patch
});

describe('sauce product classification', () => {
  it('does not turn a main dish into a sauce because its description mentions sauce', () => {
    expect(isSauceProduct(product({ description: 'Курица, овощи и соус на выбор.' }))).toBe(false);
  });

  it('recognizes sauces by their title or category', () => {
    expect(isSauceProduct(product({ title: 'Чесночный соус' }))).toBe(true);
    expect(isSauceProduct(product({ category_id: 'sauces' }))).toBe(true);
  });
});
