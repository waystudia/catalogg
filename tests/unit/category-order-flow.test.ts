import { describe, expect, it } from 'vitest';
import {
  categoryToLegacyPersistence,
  getUpsellReminderTitle,
  getOrderFlowCategories,
  normalizeLegacyCategory
} from '../../src/features/restaurant-settings/catalogAdminModel';
import type { Category } from '../../src/entities/models';

const drinksCategory: Category = {
  id: 'drinks',
  slug: 'drinks',
  name: 'Напитки',
  image: '/drinks.jpg',
  icon: 'bottle',
  kind: 'drink',
  showOnHome: true,
  showInOrderFlow: true
};

describe('legacy category order-flow settings', () => {
  it('persists home and additional-category flags with the legacy category row', () => {
    expect(categoryToLegacyPersistence(drinksCategory, 4)).toEqual({
      id: 'drinks',
      name: 'Напитки',
      image: '/drinks.jpg',
      icon: 'bottle',
      kind: 'drink',
      sort_order: 4,
      show_on_home: true,
      show_in_order_flow: true
    });
    expect(categoryToLegacyPersistence({
      ...drinksCategory,
      showOnHome: false,
      showInOrderFlow: false
    }, 5)).toMatchObject({
      show_on_home: false,
      show_in_order_flow: false
    });
  });

  it('restores additional categories after a catalog reload', () => {
    expect(normalizeLegacyCategory({
      id: 'sauces',
      name: 'Соусы',
      image: '/sauces.jpg',
      icon: 'sauce',
      kind: 'food',
      sort_order: 8,
      show_on_home: true,
      show_in_order_flow: true
    })).toMatchObject({
      id: 'sauces',
      showOnHome: true,
      showInOrderFlow: true
    });
    expect(normalizeLegacyCategory({
      id: 'hidden',
      name: 'Скрытая категория',
      image: '',
      icon: 'pot',
      kind: 'food',
      sort_order: 9,
      show_on_home: false,
      show_in_order_flow: false
    })).toMatchObject({
      showOnHome: false,
      showInOrderFlow: false
    });
  });

  it('opens reminders only for selected menu categories, never cabins', () => {
    const sauces = { ...drinksCategory, id: 'sauces', name: 'Соусы', kind: 'food' as const };
    const regular = { ...drinksCategory, id: 'main', name: 'Основное', showInOrderFlow: false };
    const cabins = { ...drinksCategory, id: 'cabins', name: 'Кабинки', kind: 'space' as const };

    expect(getOrderFlowCategories([regular, sauces, cabins])).toEqual([sauces]);
  });

  it('asks whether the customer forgot the selected additional category', () => {
    expect(getUpsellReminderTitle(drinksCategory)).toBe('Вы забыли напитки?');
    expect(getUpsellReminderTitle({ ...drinksCategory, name: 'Соусы' })).toBe('Вы забыли соусы?');
    expect(getUpsellReminderTitle({ ...drinksCategory, name: '  Напитки  ' })).toBe('Вы забыли напитки?');
  });
});
