import { describe, expect, it } from 'vitest';
import { getRussianPushStatus } from '../../supabase/functions/send-web-push/pushMessages';

describe('Russian Web Push status labels', () => {
  it.each([
    ['new', 'Новый заказ'],
    ['accepted', 'Принят рестораном'],
    ['confirmed', 'Принят рестораном'],
    ['payment_confirmed', 'Оплата подтверждена'],
    ['preparing', 'Готовится'],
    ['cooking', 'Готовится'],
    ['ready', 'Готов к выдаче'],
    ['waiting_driver', 'Ожидает курьера'],
    ['waiting_courier', 'Ожидает курьера'],
    ['assigned', 'Курьер назначен'],
    ['assigned_driver', 'Курьер назначен'],
    ['driver_assigned', 'Курьер назначен'],
    ['arrived_to_restaurant', 'Курьер прибыл в ресторан'],
    ['handed_over', 'Заказ передан курьеру'],
    ['picked_up', 'Заказ передан курьеру'],
    ['on_the_way', 'Курьер в пути'],
    ['arrived_to_client', 'Курьер прибыл к клиенту'],
    ['delivered', 'Доставлен'],
    ['completed', 'Выполнен'],
    ['cancelled', 'Отменён'],
    ['canceled', 'Отменён']
  ])('translates %s without leaking a technical status', (status, expected) => {
    expect(getRussianPushStatus(status)).toBe(expected);
  });

  it('uses a Russian fallback for missing and unknown statuses', () => {
    expect(getRussianPushStatus('custom_backend_state')).toBe('Статус обновлён');
    expect(getRussianPushStatus(undefined)).toBe('Статус обновлён');
    expect(getRussianPushStatus(42)).toBe('Статус обновлён');
  });
});
