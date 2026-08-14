import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getOrderConversationQuickReplies } from './orderConversationQuickReplies';

describe('order conversation quick replies', () => {
  it('offers preparation estimates to restaurant staff without sending them automatically', () => {
    assert.deepEqual(
      getOrderConversationQuickReplies({
        viewer: 'staff',
        orderStatus: 'preparing',
        estimatedMinutes: 25
      }),
      [
        'Заказ будет готов примерно через 25 минут.',
        'Заказ будет готов через 15 минут.',
        'Нам понадобится ещё около 10 минут.'
      ]
    );
  });

  it('uses the delivery stage and ETA for courier replies', () => {
    assert.deepEqual(
      getOrderConversationQuickReplies({
        viewer: 'driver',
        orderStatus: 'on_the_way',
        estimatedMinutes: 12
      }),
      [
        'Забрал заказ. Буду у вас примерно через 12 минут.',
        'Позвоню, когда буду на месте.',
        'Не могу дозвониться. Напишите, пожалуйста, как с вами связаться.'
      ]
    );
  });

  it('keeps short client replies available during delivery', () => {
    assert.deepEqual(
      getOrderConversationQuickReplies({
        viewer: 'client',
        orderStatus: 'arrived_to_client'
      }),
      [
        'Я сейчас выйду.',
        'Позвоните, пожалуйста, когда будете на месте.',
        'Уточню адрес в следующем сообщении.'
      ]
    );
  });
});
