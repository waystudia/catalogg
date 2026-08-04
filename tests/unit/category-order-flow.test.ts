import { describe, expect, it } from 'vitest';
import {
  categoryToLegacyPersistence,
  getUpsellReminderTitle,
  getOrderFlowCategories,
  getActiveRestaurantCabins,
  getActiveRestaurantTables,
  createCabinDraft,
  createDefaultRestaurantTables,
  makeCabinFeature,
  parseCabinMeta,
  normalizeLegacyCategory
} from '../../src/features/restaurant-settings/catalogAdminModel';
import type { Cabin, Category } from '../../src/entities/models';

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

  it('keeps a valid cabin price and safely normalizes legacy or invalid metadata', () => {
    expect(parseCabinMeta()).toEqual({ kind: 'cabin', status: 'active', type: 'normal', price: 0 });
    expect(parseCabinMeta(makeCabinFeature({ kind: 'table', status: 'inactive', type: 'premium', price: 750 }))).toEqual({
      kind: 'table',
      status: 'inactive',
      type: 'premium',
      price: 750
    });
    expect(parseCabinMeta(JSON.stringify({ status: 'unknown', type: 'unknown', price: -50 }))).toEqual({
      kind: 'cabin',
      status: 'active',
      type: 'normal',
      price: 0
    });
    expect(parseCabinMeta(JSON.stringify({ status: 'active', type: 'vip', price: '750' }))).toEqual({
      kind: 'cabin',
      status: 'active',
      type: 'vip',
      price: 0
    });
    expect(parseCabinMeta('{"status":"active","type":"vip","price":1e400}')).toEqual({
      kind: 'cabin',
      status: 'active',
      type: 'vip',
      price: 0
    });
    expect(parseCabinMeta('Старая подпись кабинки')).toEqual({
      kind: 'cabin',
      status: 'active',
      type: 'normal',
      price: 0
    });
    expect(createDefaultRestaurantTables()).toHaveLength(12);
    expect(createDefaultRestaurantTables()[0]).toEqual({
      id: 'pos-table-1',
      title: 'Стол 1',
      capacity: '2-4 человека',
      feature: makeCabinFeature({ kind: 'table', status: 'active', type: 'normal', price: 0 }),
      image_url: ''
    });
    expect(parseCabinMeta(createDefaultRestaurantTables()[0].feature).kind).toBe('table');
    expect(createCabinDraft()).toMatchObject({ title: '', capacity: '', image_url: '' });
    expect(JSON.parse(createCabinDraft().feature).kind).toBe('cabin');
    expect(parseCabinMeta(createCabinDraft().feature).kind).toBe('cabin');
    expect(parseCabinMeta(createCabinDraft('table').feature).kind).toBe('table');
  });

  it('separates active POS tables from active public cabins', () => {
    const place = (id: string, kind: 'table' | 'cabin', status: 'active' | 'inactive'): Cabin => ({
      id,
      title: id,
      capacity: '4 гостя',
      image_url: '',
      feature: makeCabinFeature({ kind, status, type: 'normal', price: 0 })
    });
    const places = [
      place('table-active', 'table', 'active'),
      place('table-inactive', 'table', 'inactive'),
      place('cabin-active', 'cabin', 'active'),
      place('cabin-inactive', 'cabin', 'inactive')
    ];

    expect(getActiveRestaurantTables(places).map(({ id }) => id)).toEqual(['table-active']);
    expect(getActiveRestaurantCabins(places).map(({ id }) => id)).toEqual(['cabin-active']);
    expect(getActiveRestaurantTables([])).toHaveLength(12);
    expect(getActiveRestaurantTables([place('only-cabin', 'cabin', 'active')])).toHaveLength(12);
  });
});
