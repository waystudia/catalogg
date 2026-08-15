import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ClientOrderChatPage } from '../../src/features/client-orders/ClientOrderChatPage';
import type { ClientOrder, ClientRestaurant } from '../../src/features/client-platform/types';

vi.mock('../../src/features/order-conversation/OrderConversationPanel', () => ({
  OrderConversationPanel: () => <section className="order-conversation" data-presentation="messenger">Сообщения заказа</section>
}));

const order: ClientOrder = {
  id: '03e9b1ba-11e9-4003-9b0b-346e99a1d7c2',
  catalogId: '22222222-2222-4222-8222-222222222222',
  restaurantSlug: 'finik',
  restaurantName: 'Финик',
  orderType: 'delivery',
  deliveryProvider: 'platform',
  paymentMethod: 'cash',
  status: 'completed',
  paymentStatus: 'confirmed',
  totalAmount: 1300,
  addressLine: 'Цоци-Юрт',
  clientName: 'Адам',
  clientPhone: '+79000000000',
  createdAt: '2026-08-13T18:11:00.000Z',
  estimatedTimeMin: 15,
  estimatedTimeMax: 20,
  items: []
};

const restaurant = {
  id: order.catalogId,
  slug: 'finik',
  name: 'Финик',
  logoUrl: '',
  businessType: 'grocery'
} as ClientRestaurant;

test('uses the marketplace messenger header and a full-width order details action', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/profile/orders/03e9/chat']}>
      <Routes>
        <Route
          path="/profile/orders/:id/chat"
          element={(
            <ClientOrderChatPage
              order={order}
              restaurant={restaurant}
              orderNumber="F8364"
              detailsPath="/finik/order/03e9"
            />
          )}
        />
        <Route path="/finik/order/:id" element={<p>Экран деталей</p>} />
      </Routes>
    </MemoryRouter>
  );

  await expect.element(screen.getByLabelText('Чат с магазином')).toBeVisible();
  await expect.element(screen.getByText('Чат заказа')).toBeVisible();
  const detailsLink = screen.getByRole('link', { name: /Детали заказа/ });
  await expect.element(detailsLink).toBeVisible();
  expect(document.body.textContent).not.toContain('Доставлен');

  const context = document.querySelector('.client-order-chat-context') as HTMLElement;
  const details = document.querySelector('.client-order-chat-context > a') as HTMLElement;
  expect(details.getBoundingClientRect().width).toBe(context.clientWidth - 32);

  await detailsLink.click();
  await expect.element(screen.getByText('Экран деталей')).toBeVisible();
});
