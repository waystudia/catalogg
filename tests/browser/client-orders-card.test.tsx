import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { MemoryRouter } from 'react-router-dom';
import { ClientOrderCard, getClientOrderBadgeLabel, OrderFilterChips } from '../../src/features/client-orders/ClientOrders';
import type { ClientOrder, ClientRestaurant } from '../../src/features/client-platform/types';

const order: ClientOrder = {
  id: '11111111-1111-4111-8111-111111111111',
  catalogId: '22222222-2222-4222-8222-222222222222',
  restaurantSlug: 'mangal',
  restaurantName: 'Мангал',
  orderType: 'delivery',
  deliveryProvider: 'platform',
  paymentMethod: 'cash',
  status: 'on_the_way',
  paymentStatus: 'confirmed',
  totalAmount: 1840,
  addressLine: 'ул. Мира, 12, 2 подъезд, кв. 45',
  clientName: 'Адам',
  clientPhone: '+79000000000',
  createdAt: '2026-08-14T15:40:00.000Z',
  estimatedTimeMin: 15,
  estimatedTimeMax: 20,
  items: []
};

const restaurant = {
  slug: 'mangal',
  name: 'Мангал',
  logoUrl: '',
  businessType: 'restaurant'
} as ClientRestaurant;

test('renders a compact active order with only details and its order-scoped chat actions', async () => {
  const screen = await render(
    <MemoryRouter>
      <ClientOrderCard
        order={order}
        restaurant={restaurant}
        orderNumber="M3719"
        statusLabel="В пути"
        detailsPath="/mangal/order/111"
        chatPath="/profile/orders/111/chat"
        unreadCount={1}
        onRepeat={vi.fn()}
      />
    </MemoryRouter>
  );

  await expect.element(screen.getByText('Мангал')).toBeVisible();
  await expect.element(screen.getByText('Заказ №M3719')).toBeVisible();
  await expect.element(screen.getByText('Курьер в пути')).toBeVisible();
  await expect.element(screen.getByText('ул. Мира, 12, 2 подъезд, кв. 45')).toBeVisible();
  await expect.element(screen.getByRole('link', { name: 'Подробнее' })).toBeVisible();
  await expect.element(screen.getByRole('link', { name: /Чат с рестораном/ })).toBeVisible();
  expect(document.querySelectorAll('.client-order-card__actions > *')).toHaveLength(2);
  expect(document.body.textContent).not.toContain('43.');
});

test('filter chips expose all real order states without a separate chats tab', async () => {
  const onChange = vi.fn();
  const screen = await render(<OrderFilterChips value="all" currentCount={2} onChange={onChange} />);
  await expect.element(screen.getByRole('button', { name: 'Все' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Текущие 2/ })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Завершённые' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Отменённые' })).toBeVisible();
  expect(document.body.textContent).not.toContain('Чаты');
});

test('uses lifecycle wording in the status badge instead of duplicating the short status', () => {
  expect(getClientOrderBadgeLabel('completed')).toBe('Заказ завершён');
  expect(getClientOrderBadgeLabel('canceled')).toBe('Заказ отменён');
  expect(getClientOrderBadgeLabel('assigned_driver')).toBe('Курьер назначен');
  expect(getClientOrderBadgeLabel('on_the_way')).toBe('Заказ у курьера');
});

test('keeps all four order filters reachable without horizontal overflow at 372px', async () => {
  await render(
    <div style={{ boxSizing: 'border-box', width: 372, paddingInline: 16 }}>
      <OrderFilterChips value="all" currentCount={2} onChange={vi.fn()} />
    </div>
  );
  const filters = document.querySelector<HTMLElement>('.client-order-filters');
  expect(filters).not.toBeNull();
  expect(filters!.scrollWidth).toBeLessThanOrEqual(filters!.clientWidth);
});
