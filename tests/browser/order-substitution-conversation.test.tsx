import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { OrderConversationPanel } from '../../src/features/order-conversation/OrderConversationPanel';
import type { OrderConversation } from '../../src/shared/api/orderConversationApi';

const pendingConversation: OrderConversation = {
  viewerKind: 'client',
  substitutions: [{
    id: 'sub-1',
    originalOrderItemId: 'item-1',
    state: 'pending',
    originalTitle: 'Молоко',
    originalLineTotal: 120,
    proposedTitle: 'Финики 500 г',
    proposedQuantity: 500,
    proposedQuantityUnit: 'gram',
    proposedLineTotal: 200,
    priceDelta: 80,
    note: 'Свежая партия',
    resolutionNote: '',
    version: 3,
    proposedAt: '2026-08-12T10:00:00Z'
  }],
  messages: [{
    id: 'message-1',
    senderKind: 'system',
    messageType: 'substitution_offer',
    body: 'Товара «Молоко» нет. Предложена замена «Финики 500 г».',
    substitutionRequestId: 'sub-1',
    createdAt: '2026-08-12T10:00:00Z'
  }],
  adjustments: []
};

test('client accepts a substitution and can message the store in the same order panel', async () => {
  const resolve = vi.fn().mockResolvedValue({ resolved: true, state: 'accepted' });
  const send = vi.fn().mockResolvedValue('message-2');
  const load = vi.fn().mockResolvedValue({
    ...pendingConversation,
    substitutions: [{ ...pendingConversation.substitutions[0], state: 'accepted', version: 4 }]
  });
  const screen = await render(
    <OrderConversationPanel
      orderId="order-1"
      catalogId="catalog-1"
      expectedViewer="client"
      initialConversation={pendingConversation}
      api={{ load, resolve, send, subscribe: () => () => undefined }}
    />
  );

  await expect.element(screen.getByText('Товара нет в наличии')).toBeVisible();
  await expect.element(screen.getByText('Доплата 80 ₽')).toBeVisible();
  await screen.getByRole('button', { name: 'Заменить' }).click();
  expect(resolve).toHaveBeenCalledWith({
    requestId: 'sub-1',
    decision: 'accepted',
    expectedVersion: 3
  });

  await screen.getByLabelText('Сообщение').fill('Да, эта замена подходит');
  await screen.getByRole('button', { name: 'Отправить' }).click();
  expect(send).toHaveBeenCalledWith('order-1', 'catalog-1', 'Да, эта замена подходит', 'client');
  expect(load).toHaveBeenCalledWith('order-1', 'catalog-1', 'client');
});
