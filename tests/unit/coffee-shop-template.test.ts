import { describe, expect, it } from 'vitest';
import type { CartItem, Product } from '../../src/entities/models';
import {
  buildCartLineId,
  getCartItemTotal,
  getCartLineId,
  getCartItemPrice,
  getSelectedModifierDetails,
  normalizeProductModifierGroups
} from '../../src/entities/productModifiers';
import {
  buildPublicRestaurantOrderItems,
  buildRestaurantOrderFingerprint
} from '../../src/shared/api/restaurantOrderPayload';
import { createSlug, normalizeSlugInput } from '../../src/shared/validation/clientCredentials';

const cappuccino: Product = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Капучино',
  price: 250,
  description: '',
  image_url: '',
  ingredients: '',
  weight: '200 мл',
  spicy_level: 0,
  serving: '',
  is_popular: true,
  is_new: false,
  is_hit: false,
  is_unlimited: true,
  stock_count: 0,
  category_id: 'coffee',
  pair_ids: [],
  modifier_groups: [{
    id: 'volume',
    name: 'Объём',
    required: true,
    minSelected: 1,
    maxSelected: 1,
    options: [
      { id: '200', name: '200 мл', priceDelta: 0, isDefault: true },
      { id: '300', name: '300 мл', priceDelta: 50, isDefault: false }
    ]
  }, {
    id: 'milk',
    name: 'Молоко',
    required: false,
    minSelected: 0,
    maxSelected: 1,
    options: [
      { id: 'regular', name: 'Обычное', priceDelta: 0, isDefault: true },
      { id: 'oat', name: 'Овсяное', priceDelta: 70, isDefault: false }
    ]
  }]
};

describe('coffee shop starter behavior', () => {
  it('creates readable stable slugs from Russian names and normalizes manual input', () => {
    expect(createSlug('Кофейня У Мадины')).toBe('kofeynya-u-madiny');
    expect(createSlug('  Ёлка & Кофе  ')).toBe('elka-kofe');
    expect(normalizeSlugInput(' Coffee  Shop / Грозный ')).toBe('coffee-shop-groznyy');
    expect(createSlug(`${'Очень '.repeat(20)}длинное название`)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('normalizes universal modifier groups and applies selected surcharges', () => {
    const groups = normalizeProductModifierGroups(cappuccino.modifier_groups);
    expect(groups).toHaveLength(2);
    const item: CartItem = {
      product: cappuccino,
      quantity: 2,
      selected_modifiers: [
        { groupId: 'volume', optionId: '300' },
        { groupId: 'milk', optionId: 'oat' }
      ]
    };
    expect(getCartItemPrice(item)).toBe(370);
    expect(getCartItemTotal(item)).toBe(740);
    expect(buildCartLineId(cappuccino.id, undefined, item.selected_modifiers)).not.toBe(buildCartLineId(cappuccino.id));
  });

  it('drops malformed modifier data and clamps group selection rules', () => {
    const normalized = normalizeProductModifierGroups([
      null,
      { name: '   ', options: [{ name: 'Невидимый' }] },
      {
        name: '  Добавки  ',
        required: false,
        minSelected: 7,
        maxSelected: 99,
        options: [
          null,
          { name: '  Корица  ', priceDelta: -50, isDefault: true },
          { name: '', priceDelta: 100 },
          { name: 'Лёд', priceDelta: '30', isDefault: false }
        ]
      },
      {
        name: 'Объём',
        required: true,
        minSelected: 9,
        maxSelected: 9,
        options: [{ name: '300 мл', priceDelta: 50 }]
      }
    ]);

    expect(normalized).toEqual([{
      id: 'group-3',
      name: 'Добавки',
      required: false,
      minSelected: 0,
      maxSelected: 2,
      isActive: true,
      options: [
        { id: 'option-2', name: 'Корица', priceDelta: 0, isDefault: true, isActive: true },
        { id: 'option-4', name: 'Лёд', priceDelta: 30, isDefault: false, isActive: true }
      ]
    }, {
      id: 'group-4',
      name: 'Объём',
      required: true,
      minSelected: 1,
      maxSelected: 1,
      isActive: true,
      options: [{ id: 'option-1', name: '300 мл', priceDelta: 50, isDefault: false, isActive: true }]
    }]);
    expect(normalizeProductModifierGroups(undefined)).toEqual([]);
  });

  it('ignores unknown modifier selections and supports trimmed legacy variant names', () => {
    const item: CartItem = {
      product: {
        ...cappuccino,
        choice_options: ['Маленький', { name: '  Большой  ', price: 410 }]
      },
      quantity: 3,
      selected_choice: 'Большой',
      selected_modifiers: [
        { groupId: 'milk', optionId: 'oat' },
        { groupId: 'missing', optionId: 'unknown' }
      ]
    };

    expect(getSelectedModifierDetails(item).map(({ option }) => option.name)).toEqual(['Овсяное']);
    expect(getCartItemPrice(item)).toBe(480);
    expect(getCartItemTotal(item)).toBe(1440);
  });

  it('builds stable exact line identities for the same selected configuration', () => {
    const selections = [
      { groupId: 'milk', optionId: 'oat' },
      { groupId: 'volume', optionId: '300' }
    ];
    const reversed = [...selections].reverse();
    const lineId = buildCartLineId('coffee', '  Большой  ', selections);

    expect(lineId).toBe('coffee::Большой::milk:oat|volume:300');
    expect(buildCartLineId('coffee', 'Большой', reversed)).toBe(lineId);
    expect(buildCartLineId('coffee')).toBe('coffee::::');
    expect(getCartLineId({ product: cappuccino, quantity: 1, line_id: 'saved-line' })).toBe('saved-line');
    expect(getCartLineId({ product: cappuccino, quantity: 1, selected_modifiers: selections }))
      .toBe(`${cappuccino.id}::::milk:oat|volume:300`);
  });

  it('serializes coffee modifiers into the existing order options array', () => {
    const item: CartItem = {
      product: cappuccino,
      quantity: 1,
      selected_modifiers: [
        { groupId: 'volume', optionId: '300' },
        { groupId: 'milk', optionId: 'oat' }
      ]
    };

    expect(buildPublicRestaurantOrderItems([item])).toEqual([{
      product_id: cappuccino.id,
      quantity: 1,
      options: [
        { group_id: 'volume', option_id: '300', name: 'Объём: 300 мл', product_id: cappuccino.id },
        { group_id: 'milk', option_id: 'oat', name: 'Молоко: Овсяное', product_id: cappuccino.id }
      ]
    }]);

    const otherConfiguration: CartItem = {
      ...item,
      selected_modifiers: [{ groupId: 'volume', optionId: '200' }]
    };
    const baseOrder = { slug: 'coffee-shop', fulfillmentType: 'takeaway' as const };
    expect(buildRestaurantOrderFingerprint({ ...baseOrder, items: [item] }))
      .not.toBe(buildRestaurantOrderFingerprint({ ...baseOrder, items: [otherConfiguration] }));
  });
});
