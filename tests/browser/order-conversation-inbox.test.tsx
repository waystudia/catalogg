import { expect, test } from 'vitest';
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

test('keeps separate order threads and switches the selected tenant conversation', async () => {
  const screen = await render(<OrderConversationInbox items={chats} expectedViewer="client" />);

  await expect.element(screen.getByRole('heading', { name: 'Чаты по заказам' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Финик/ })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Мангал/ })).toBeVisible();
  await expect.element(screen.getByText('Заказ №1024 · Собирается')).toBeVisible();

  await screen.getByRole('button', { name: /Мангал/ }).click();

  await expect.element(screen.getByText('Заказ №2048 · Готовится')).toBeVisible();
  await expect.element(screen.getByRole('region', { name: 'Чат заказа' })).toHaveAttribute('data-presentation', 'messenger');
  await expect.element(screen.getByLabelText('Сообщение')).toBeVisible();
});
