import { describe, expect, it } from 'vitest';
import {
  addPosCartItem,
  changePosCartItemQuantity,
  getPosCartItemsCount,
  getPosCartTotal
} from '../../src/features/restaurant-pos/restaurantPosCart';

describe('restaurant POS cart', () => {
  it('adds existing catalog dishes and calculates the order total', () => {
    const first = { productId: 'galnash', title: 'Жижиг-галнаш', unitPrice: 380, quantity: 1 };
    const second = { productId: 'tea', title: 'Чай', unitPrice: 150, quantity: 1 };

    const cart = addPosCartItem(addPosCartItem([], first), second);

    expect(cart).toEqual([first, second]);
    expect(getPosCartItemsCount(cart)).toBe(2);
    expect(getPosCartTotal(cart)).toBe(530);
  });

  it('increments an existing dish instead of creating a duplicate line', () => {
    const item = { productId: 'galnash', title: 'Жижиг-галнаш', unitPrice: 380, quantity: 2 };
    const tea = { productId: 'tea', title: 'Чай', unitPrice: 150, quantity: 1 };

    expect(addPosCartItem([item, tea], { ...item, quantity: 3 })).toEqual([
      { ...item, quantity: 5 },
      tea
    ]);
  });

  it('removes a dish when its quantity reaches zero', () => {
    const item = { productId: 'galnash', title: 'Жижиг-галнаш', unitPrice: 380, quantity: 1 };

    expect(changePosCartItemQuantity([item], 'galnash', -1)).toEqual([]);
  });

  it('changes only the selected dish and keeps the other cart lines', () => {
    const galnash = { productId: 'galnash', title: 'Жижиг-галнаш', unitPrice: 380, quantity: 2 };
    const tea = { productId: 'tea', title: 'Чай', unitPrice: 150, quantity: 1 };

    const cart = changePosCartItemQuantity([galnash, tea], 'galnash', 1);

    expect(cart).toEqual([{ ...galnash, quantity: 3 }, tea]);
    expect(getPosCartTotal(cart)).toBe(1290);
  });

  it('preserves the requested quantity when a new dish is added', () => {
    const item = { productId: 'galnash', title: 'Жижиг-галнаш', unitPrice: 380, quantity: 3 };

    expect(addPosCartItem([], item)).toEqual([item]);
  });
});
