import { describe, expect, it } from 'vitest';
import {
  getRestaurantOrderBoardColumnId,
  getRestaurantOrderBoardColumns
} from '../../src/features/restaurant-admin/orderBoard';
import { formatAdminOrderItemQuantity } from '../../src/features/restaurant-admin/orderPresentation';
import type { RestaurantOrder } from '../../src/shared/api/restaurantOrdersApi';

describe('restaurant order board', () => {
  it('shows selected quantity before the unit price', () => {
    const item = { quantity: 3, unitPrice: 380 } as RestaurantOrder['items'][number];
    expect(formatAdminOrderItemQuantity(item)).toBe('3 × 380 ₽');
  });

  it('maps every status and keeps the operational columns in left-to-right order', () => {
    expect([
      ['new', getRestaurantOrderBoardColumnId('new')],
      ['waiting_payment_confirmation', getRestaurantOrderBoardColumnId('waiting_payment_confirmation')],
      ['payment_confirmed', getRestaurantOrderBoardColumnId('payment_confirmed')],
      ['accepted', getRestaurantOrderBoardColumnId('accepted')],
      ['confirmed', getRestaurantOrderBoardColumnId('confirmed')],
      ['preparing', getRestaurantOrderBoardColumnId('preparing')],
      ['cooking', getRestaurantOrderBoardColumnId('cooking')],
      ['ready', getRestaurantOrderBoardColumnId('ready')],
      ['waiting_driver', getRestaurantOrderBoardColumnId('waiting_driver')],
      ['driver_assigned', getRestaurantOrderBoardColumnId('driver_assigned')],
      ['assigned_driver', getRestaurantOrderBoardColumnId('assigned_driver')],
      ['picked_up', getRestaurantOrderBoardColumnId('picked_up')],
      ['on_the_way', getRestaurantOrderBoardColumnId('on_the_way')],
      ['delivered', getRestaurantOrderBoardColumnId('delivered')],
      ['completed', getRestaurantOrderBoardColumnId('completed')],
      ['cancelled', getRestaurantOrderBoardColumnId('cancelled')],
      ['canceled', getRestaurantOrderBoardColumnId('canceled')]
    ]).toEqual([
      ['new', 'new'],
      ['waiting_payment_confirmation', 'new'],
      ['payment_confirmed', 'new'],
      ['accepted', 'preparing'],
      ['confirmed', 'preparing'],
      ['preparing', 'preparing'],
      ['cooking', 'preparing'],
      ['ready', 'ready'],
      ['waiting_driver', 'delivery'],
      ['driver_assigned', 'delivery'],
      ['assigned_driver', 'delivery'],
      ['picked_up', 'delivery'],
      ['on_the_way', 'delivery'],
      ['delivered', 'completed'],
      ['completed', 'completed'],
      ['cancelled', 'cancelled'],
      ['canceled', 'cancelled']
    ]);
    expect(getRestaurantOrderBoardColumns()).toEqual([
      { id: 'new', label: 'Новые' },
      { id: 'preparing', label: 'Готовятся' },
      { id: 'ready', label: 'Готовы' },
      { id: 'delivery', label: 'Доставка' },
      { id: 'completed', label: 'Завершённые' },
      { id: 'cancelled', label: 'Отменённые' }
    ]);
  });
});
