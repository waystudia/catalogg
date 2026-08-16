import { describe, expect, it } from 'vitest';
import type { Product } from '../../src/entities/models';
import {
  toLegacyProductPatch,
  toLegacyProductRow
} from '../../src/shared/legacyProductPersistence';

const product: Product = {
  id: 'variant-large-spicy',
  title: 'Пицца Маргарита большая острая',
  price: 500,
  old_price: 550,
  description: 'Описание блюда',
  image_url: 'https://cdn.example/pizza.jpg',
  image_urls: ['https://cdn.example/pizza.jpg'],
  ingredients: 'Тесто, сыр, томаты',
  weight: '650 г',
  spicy_level: 2,
  serving: 'с соусом',
  is_popular: true,
  is_new: false,
  is_hit: true,
  is_hidden: false,
  daily_stock: 10,
  current_stock: 9,
  is_unlimited: false,
  stock_count: 9,
  category_id: 'pizza',
  category_ids: ['pizza'],
  pair_ids: ['fries'],
  choice_options: [{ name: 'большая', price: 500 }],
  choice_card_options: [],
  modifier_groups: [{
    id: 'sauce',
    name: 'Соус',
    required: false,
    minSelected: 0,
    maxSelected: 1,
    options: []
  }],
  pricing_type: 'fixed',
  price_tier: 'standard',
  unit: 'шт',
  allergens: ['глютен', 'молоко'],
  badges: ['Острое'],
  allow_inscription: false,
  allow_decoration_comment: true,
  allow_production_schedule: false,
  publish_choice_cards: false,
  generated_from_choice: 'pizza-margherita',
  generated_choice_index: 1,
  sku: 'PIZZA-L-SPICY',
  barcode: '4601234567890',
  sale_unit: 'piece',
  quantity_unit: 'piece',
  price_basis_quantity: 1,
  minimum_quantity: 1,
  quantity_step: 1,
  stock_quantity: 9,
  allow_substitution: false
};

describe('legacy product persistence', () => {
  it('keeps inherited card data supported by the legacy product table', () => {
    const row = toLegacyProductRow({ ...product, unknown_future_field: 'ignored' } as Product);

    expect(row).toMatchObject({
      id: product.id,
      title: product.title,
      description: product.description,
      image_url: product.image_url,
      image_urls: product.image_urls,
      ingredients: product.ingredients,
      serving: product.serving,
      category_id: product.category_id,
      category_ids: product.category_ids,
      pair_ids: product.pair_ids,
      allergens: product.allergens,
      badges: product.badges,
      modifier_groups: product.modifier_groups,
      generated_from_choice: product.generated_from_choice,
      generated_choice_index: product.generated_choice_index
    });
    expect(row).not.toHaveProperty('choice_options');
    expect(row).not.toHaveProperty('unknown_future_field');
  });

  it('filters partial updates through the same explicit column contract', () => {
    expect(toLegacyProductPatch({
      allergens: ['орехи'],
      stock_count: 4,
      choice_options: [{ name: 'новый', price: 100 }]
    })).toEqual({ allergens: ['орехи'], stock_count: 4 });
  });
});
