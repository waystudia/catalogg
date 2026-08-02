import { describe, expect, it } from 'vitest';
import {
  BUSINESS_TERMINOLOGY,
  getBusinessTerms,
  normalizeBusinessType
} from '../../src/shared/businessTerminology';

describe('business terminology', () => {
  it('keeps the full restaurant vocabulary centralized', () => {
    expect(BUSINESS_TERMINOLOGY.restaurant).toEqual({
      place: 'Ресторан',
      placeLower: 'ресторан',
      placeAccusative: 'ресторан',
      placePrepositional: 'ресторане',
      placeInstrumental: 'рестораном',
      placeGenitive: 'ресторана',
      placeDative: 'ресторану',
      item: 'Блюдо',
      itemLower: 'блюдо',
      items: 'Блюда',
      itemGenitive: 'блюда',
      addItem: 'Добавить блюдо',
      driverRoute: 'Еду в ресторан',
      driverRouteAction: 'Поехать в ресторан',
      driverArrival: 'Я в ресторане',
      driverAtPlaceStatus: 'На месте в ресторане',
      orderPrepared: 'Заказ приготовлен рестораном',
      paymentConfirmation: 'Ресторан получил заказ и проверяет оплату.'
    });
  });

  it('keeps the full coffee shop vocabulary centralized', () => {
    expect(BUSINESS_TERMINOLOGY.coffee_shop).toEqual({
      place: 'Кофейня',
      placeLower: 'кофейня',
      placeAccusative: 'кофейню',
      placePrepositional: 'кофейне',
      placeInstrumental: 'кофейней',
      placeGenitive: 'кофейни',
      placeDative: 'кофейне',
      item: 'Позиция',
      itemLower: 'позиция',
      items: 'Позиции',
      itemGenitive: 'позиции',
      addItem: 'Добавить позицию',
      driverRoute: 'Еду в кофейню',
      driverRouteAction: 'Поехать в кофейню',
      driverArrival: 'Я в кофейне',
      driverAtPlaceStatus: 'На месте в кофейне',
      orderPrepared: 'Заказ приготовлен кофейней',
      paymentConfirmation: 'Кофейня получила заказ и проверяет оплату.'
    });
  });

  it('keeps the confectionery vocabulary centralized', () => {
    expect(BUSINESS_TERMINOLOGY.confectionery).toMatchObject({
      place: 'Кондитерская',
      item: 'Товар',
      addItem: 'Добавить товар',
      driverRoute: 'Еду в кондитерскую',
      orderPrepared: 'Заказ приготовлен кондитерской'
    });
    expect(normalizeBusinessType('confectionery')).toBe('confectionery');
    expect(normalizeBusinessType('bakery')).toBe('confectionery');
    expect(getBusinessTerms('confectionery')).toBe(BUSINESS_TERMINOLOGY.confectionery);
  });

  it('normalizes canonical values, legacy aliases, and invalid input', () => {
    expect(normalizeBusinessType('restaurant')).toBe('restaurant');
    expect(normalizeBusinessType('coffee_shop')).toBe('coffee_shop');
    expect(normalizeBusinessType('coffee')).toBe('coffee_shop');
    expect(normalizeBusinessType('')).toBe('restaurant');
    expect(normalizeBusinessType(null)).toBe('restaurant');
    expect(getBusinessTerms('coffee_shop')).toBe(BUSINESS_TERMINOLOGY.coffee_shop);
    expect(getBusinessTerms(undefined)).toBe(BUSINESS_TERMINOLOGY.restaurant);
  });
});
