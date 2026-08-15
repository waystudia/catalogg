import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { OrderConversationPanel } from '../../src/features/order-conversation/OrderConversationPanel';
import type { OrderConversation } from '../../src/shared/api/orderConversationApi';

const conversation: OrderConversation = {
  viewerKind: 'client',
  substitutions: [],
  adjustments: [],
  messages: [
    {
      id: 'system-1',
      senderKind: 'system',
      messageType: 'status_event',
      body: 'Курьер назначен',
      substitutionRequestId: null,
      createdAt: '2026-08-15T12:30:00.000Z'
    },
    {
      id: 'staff-1',
      senderKind: 'staff',
      messageType: 'text',
      body: 'Курьер уже в пути.',
      substitutionRequestId: null,
      createdAt: '2026-08-15T12:31:00.000Z'
    }
  ]
};

test('shows messenger bubbles, a separate system chip and optimistic client send', async () => {
  let resolveSend: ((value: string) => void) | undefined;
  const send = vi.fn(() => new Promise<string>((resolve) => { resolveSend = resolve; }));
  const screen = await render(
    <OrderConversationPanel
      orderId="order-1"
      catalogId="catalog-1"
      expectedViewer="client"
      merchantLabel="Мангал"
      presentation="messenger"
      initialConversation={conversation}
      api={{ load: vi.fn().mockResolvedValue(conversation), resolve: vi.fn(), send, subscribe: () => () => undefined }}
    />
  );

  await expect.element(screen.getByText(/Курьер назначен ·/)).toBeVisible();
  await expect.element(screen.getByText('Курьер уже в пути.')).toBeVisible();
  await expect.element(screen.getByText('Мангал')).toBeVisible();

  await screen.getByLabelText('Сообщение').fill('Спасибо! Буду ждать.');
  await screen.getByRole('button', { name: 'Отправить' }).click();

  await expect.element(screen.getByText('Спасибо! Буду ждать.')).toBeVisible();
  expect(send).toHaveBeenCalledWith('order-1', 'catalog-1', 'Спасибо! Буду ждать.', 'client');
  resolveSend?.('saved-message');
  await expect.poll(() => send.mock.results[0]?.value).toBeDefined();
});
