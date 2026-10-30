import { describe, expect, test } from 'vitest';
import { getOrderStage, getOrderPlaceName } from '../../src/features/order/orderDetailPresentation';

describe('customer-facing order stages', () => {
 test.each([
  ['new', true, 0], ['accepted', true, 1], ['confirmed', true, 1], ['payment_confirmed', true, 1], ['preparing', true, 2], ['cooking', true, 2], ['ready', true, 2],
  ['driver_assigned', true, 2], ['assigned_driver', true, 2], ['waiting_driver', true, 2], ['picked_up', true, 3], ['on_the_way', true, 3], ['completed', true, 4], ['delivered', true, 4],
  ['ready', false, 3], ['completed', false, 3], ['canceled', true, -1], ['cancelled', true, -1], [null, true, -1]
 ] as const)('%s delivery=%s marks stage %s', (status, delivery, expected) => {
  expect(getOrderStage(status, delivery)).toBe(expected);
 });
 test.each(['grocery', 'shop', 'store', 'fashion', 'market', 'Магазин'])('labels %s as a shop', type => { expect(getOrderPlaceName('Финик', type)).toBe('Магазин Финик'); });
 test('does not confuse a business name beginning with a type with an existing prefix', () => { expect(getOrderPlaceName('Ресторанчик', 'restaurant')).toBe('Ресторан Ресторанчик'); });
 test('uses each establishment type and does not repeat its prefix', () => {
  expect(getOrderPlaceName('Мангал', 'restaurant')).toBe('Ресторан Мангал');
  expect(getOrderPlaceName('Финик', 'grocery')).toBe('Магазин Финик');
  expect(getOrderPlaceName('Кофе', 'coffee_shop')).toBe('Кофейня Кофе');
  expect(getOrderPlaceName('Ресторан Мангал', 'restaurant')).toBe('Ресторан Мангал');
 });
});
