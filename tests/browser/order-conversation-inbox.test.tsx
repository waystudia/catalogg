import { useState } from 'react';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { OrderConversationInbox, type OrderConversationInboxItem } from '../../src/features/order-conversation/OrderConversationInbox';

const chats: OrderConversationInboxItem[] = [
  {
    orderId: 'order-finik',
    catalogId: 'catalog-finik',
    orderNumber: '1024',
    merchantName: 'Финик',
    merchantLabel: 'Магазин',
    customerName: 'Адам',
    statusLabel: 'Собирается',
    createdAt: '2026-08-14T09:00:00.000Z',
    totalLabel: '1 240 ₽'
  },
  {
    orderId: 'order-mangal',
    catalogId: 'catalog-mangal',
    orderNumber: '2048',
    merchantName: 'Мангал',
    merchantLabel: 'Ресторан',
    customerName: 'Магомед',
    statusLabel: 'Готовится',
    createdAt: '2026-08-13T18:30:00.000Z',
    totalLabel: '890 ₽'
  }
];

const summaryApi = {
  load: async () => [
    {
      orderId: 'order-mangal',
      body: 'Можно заменить товар?',
      senderKind: 'client' as const,
      createdAt: '2026-08-15T11:18:00.000Z'
    },
    {
      orderId: 'order-finik',
      body: 'Заказ уже собран.',
      senderKind: 'staff' as const,
      createdAt: '2026-08-15T11:12:00.000Z'
    }
  ],
  subscribe: () => () => undefined
};

test('mobile opens with a vertical latest-first chat list and no conversation selected', async () => {
  await page.viewport(372, 576);
  window.history.replaceState({}, '', window.location.href);
  const screen = await render(<OrderConversationInbox items={chats} expectedViewer="staff" summaryApi={summaryApi} />);

  await expect.element(screen.getByRole('heading', { name: 'Чаты' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Адам/ })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Магомед/ })).toBeVisible();
  await expect.element(screen.getByText('Можно заменить товар?')).toBeVisible();
  await expect.element(screen.getByRole('region', { name: 'Чат заказа' })).not.toBeInTheDocument();

  await expect.poll(() => Array.from(screen.getByLabelText('Список чатов').element().querySelectorAll<HTMLButtonElement>('.order-inbox__thread')).map((node) => node.textContent)).toEqual([
    expect.stringContaining('Магомед'),
    expect.stringContaining('Адам')
  ]);

  const threadList = screen.getByLabelText('Список чатов').element().querySelector<HTMLElement>('.order-inbox__threads')!;
  expect(getComputedStyle(threadList).overflowY).toBe('auto');
  expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
});

test('mobile opens a full conversation and back returns to the chat list', async () => {
  await page.viewport(372, 576);
  window.history.replaceState({}, '', window.location.href);
  const screen = await render(<OrderConversationInbox items={chats} expectedViewer="client" summaryApi={summaryApi} />);

  await screen.getByRole('button', { name: /Мангал/ }).click();

  await expect.element(screen.getByText('Заказ №2048 · Готовится')).toBeVisible();
  await expect.element(screen.getByRole('region', { name: 'Чат заказа' })).toHaveAttribute('data-presentation', 'messenger');
  await expect.element(screen.getByLabelText('Сообщение')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Назад к списку чатов' })).toBeVisible();

  const composerRect = screen.getByLabelText('Сообщение').element().getBoundingClientRect();
  expect(composerRect.top).toBeGreaterThanOrEqual(0);
  expect(composerRect.bottom).toBeLessThanOrEqual(window.innerHeight);

  await screen.getByRole('button', { name: 'Назад к списку чатов' }).click();

  await expect.element(screen.getByRole('heading', { name: 'Чаты' })).toBeVisible();
  await expect.element(screen.getByRole('region', { name: 'Чат заказа' })).not.toBeInTheDocument();
});

test('browser Back returns to the exact filtered chat list', async () => {
  await page.viewport(372, 576);
  window.history.replaceState({}, '', window.location.href);
  const screen = await render(<OrderConversationInbox items={chats} expectedViewer="client" summaryApi={summaryApi} />);

  await screen.getByLabelText('Поиск чатов').fill('Мангал');
  await screen.getByRole('button', { name: /Мангал/ }).click();
  await expect.element(screen.getByText('Заказ №2048 · Готовится')).toBeVisible();

  window.history.back();

  await expect.element(screen.getByRole('heading', { name: 'Чаты' })).toBeVisible();
  await expect.element(screen.getByLabelText('Поиск чатов')).toHaveValue('Мангал');
  await expect.element(screen.getByRole('button', { name: /Мангал/ })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Финик/ })).not.toBeInTheDocument();
});

test('an explicit order route always switches the inbox to that exact conversation', async () => {
  await page.viewport(1000, 760);
  window.history.replaceState({}, '', window.location.href);

  function RoutedInbox() {
    const [selectedOrderId, setSelectedOrderId] = useState('order-finik');
    return (
      <>
        <button type="button" onClick={() => setSelectedOrderId('order-mangal')}>Открыть чат Магомеда по ссылке</button>
        <OrderConversationInbox
          items={chats}
          expectedViewer="staff"
          selectedOrderId={selectedOrderId}
          summaryApi={summaryApi}
        />
      </>
    );
  }

  const screen = await render(<RoutedInbox />);
  await expect.element(screen.getByText('Заказ №1024 · Собирается')).toBeVisible();

  await screen.getByRole('button', { name: 'Открыть чат Магомеда по ссылке' }).click();

  await expect.element(screen.getByText('Заказ №2048 · Готовится')).toBeVisible();
});
