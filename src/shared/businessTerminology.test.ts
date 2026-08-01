import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BUSINESS_TERMINOLOGY,
  getBusinessTerms,
  normalizeBusinessType
} from './businessTerminology';

describe('business terminology', () => {
  it('defines the complete restaurant vocabulary', () => {
    assert.deepEqual(BUSINESS_TERMINOLOGY.restaurant, {
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

  it('defines the complete coffee shop vocabulary', () => {
    assert.deepEqual(BUSINESS_TERMINOLOGY.coffee_shop, {
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

  it('normalizes legacy and unknown values to restaurant without throwing', () => {
    assert.equal(normalizeBusinessType('coffee_shop'), 'coffee_shop');
    assert.equal(normalizeBusinessType('restaurant'), 'restaurant');
    assert.equal(normalizeBusinessType('coffee'), 'coffee_shop');
    assert.equal(normalizeBusinessType(null), 'restaurant');
    assert.equal(normalizeBusinessType('unknown'), 'restaurant');
    assert.equal(getBusinessTerms(undefined).place, 'Ресторан');
  });
});
