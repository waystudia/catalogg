import { describe, expect, it } from 'vitest';
import type { CartItem, Product } from '../../src/entities/models';
import {
  getCartItemPrice,
  getCartItemTotal,
  getProductStartingPrice,
  normalizeProductChoiceOptions
} from '../../src/entities/productVariants';

const product = (choiceOptions: Product['choice_options'] = []): Product => ({
  id: 'pizza-1',
  title: 'Маргарита',
  price: 500,
  description: '',
  image_url: '',
  ingredients: '',
  weight: '500 г',
  spicy_level: 0,
  serving: '',
  is_popular: false,
  is_new: false,
  is_hit: false,
  stock_count: 10,
  category_id: 'pizza',
  pair_ids: [],
  choice_options: choiceOptions
});

describe('priced product variants', () => {
  it('keeps legacy text variants available at the base product price', () => {
    expect(normalizeProductChoiceOptions(['Средняя', ' Большая '], 500)).toEqual([
      { name: 'Средняя', price: 500 },
      { name: 'Большая', price: 500 }
    ]);
  });

  it('uses the cheapest valid variant as the product starting price', () => {
    const pizza = product([
      { name: 'Маленькая', price: 390 },
      { name: 'Средняя', price: 560 },
      { name: 'Большая', price: 740 }
    ]);

    expect(getProductStartingPrice(pizza)).toBe(390);
    expect(getProductStartingPrice(product())).toBe(500);
  });

  it('uses the selected variant price for every cart quantity', () => {
    const pizza = product([
      { name: 'Средняя', price: 560 },
      { name: 'Большая', price: 740 }
    ]);
    const item: CartItem = { product: pizza, quantity: 2, selected_choice: 'Большая' };

    expect(getCartItemPrice(item)).toBe(740);
    expect(getCartItemTotal(item)).toBe(1480);
  });

  it('falls back to the base price when a saved choice is missing or malformed', () => {
    const pizza = product([{ name: 'Большая', price: 740 }]);

    expect(getCartItemPrice({ product: pizza, quantity: 2, selected_choice: 'Неизвестная' })).toBe(500);
    expect(normalizeProductChoiceOptions([
      { name: ' Без цены ', price: 0 },
      { name: 'Неверная', price: Number.NaN }
    ], 500)).toEqual([
      { name: 'Без цены', price: 500 },
      { name: 'Неверная', price: 500 }
    ]);
    expect(normalizeProductChoiceOptions([
      { name: 'Строковая цена', price: '740' }
    ] as unknown as Product['choice_options'], 500)).toEqual([
      { name: 'Строковая цена', price: 500 }
    ]);
    expect(normalizeProductChoiceOptions(undefined, 500)).toEqual([]);
  });

  it('removes blank variants and keeps the six-item editor limit', () => {
    expect(normalizeProductChoiceOptions([
      '',
      { name: '   ', price: 300 },
      ...Array.from({ length: 7 }, (_, index) => ({ name: `Размер ${index + 1}`, price: 300 + index }))
    ], 500)).toEqual([
      { name: 'Размер 1', price: 300 },
      { name: 'Размер 2', price: 301 },
      { name: 'Размер 3', price: 302 },
      { name: 'Размер 4', price: 303 },
      { name: 'Размер 5', price: 304 },
      { name: 'Размер 6', price: 305 }
    ]);
  });
});
