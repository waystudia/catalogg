import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { OrderConversationPanel } from '../../src/features/order-conversation/OrderConversationPanel';
import type { OrderConversation } from '../../src/shared/api/orderConversationApi';

const courierConversation: OrderConversation = {
  viewerKind: 'driver',
  substitutions: [],
  messages: [
    {
      id: 'message-client',
      senderKind: 'client',
      messageType: 'text',
      body: 'Домофон не работает, позвоните.',
      substitutionRequestId: null,
      createdAt: '2026-08-14T10:00:00Z'
    },
    {
      id: 'message-status',
      senderKind: 'system',
      messageType: 'status_event',
      body: 'Курьер забрал заказ.',
      substitutionRequestId: null,
      createdAt: '2026-08-14T10:01:00Z'
    }
  ],
  adjustments: []
};

test('courier sees the shared order chat and sends a status-aware prepared reply', async () => {
  const send = vi.fn().mockResolvedValue('message-driver');
  const load = vi.fn().mockResolvedValue(courierConversation);
  const screen = await render(
    <OrderConversationPanel
      orderId="order-1"
      catalogId="catalog-1"
      expectedViewer="driver"
      orderStatus="on_the_way"
      estimatedMinutes={12}
      initialConversation={courierConversation}
      api={{ load, resolve: vi.fn(), send, subscribe: () => () => undefined }}
    />
  );

  await expect.element(screen.getByText('Домофон не работает, позвоните.')).toBeVisible();
  await expect.element(screen.getByText('Курьер забрал заказ.')).toBeVisible();
  await screen.getByRole('button', { name: 'Забрал заказ. Буду у вас примерно через 12 минут.' }).click();
  await expect.element(screen.getByLabelText('Сообщение')).toHaveValue('Забрал заказ. Буду у вас примерно через 12 минут.');
  await screen.getByRole('button', { name: 'Отправить' }).click();

  expect(send).toHaveBeenCalledWith('order-1', 'catalog-1', 'Забрал заказ. Буду у вас примерно через 12 минут.', 'driver');
  expect(load).toHaveBeenCalledWith('order-1', 'catalog-1', 'driver');
});
