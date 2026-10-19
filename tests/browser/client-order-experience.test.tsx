import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PublicOrderStatusScreen } from '../../src/features/order/PublicOrderStatusScreen';
import '../../src/app/styles.css';

vi.mock('../../src/shared/api/restaurantOrdersApi', () => ({
  getPublicRestaurantOrderStatus: vi.fn(async () => ({
    id: 'order-1234', status: 'waiting_payment_confirmation', fulfillmentType: 'delivery',
    deliveryAddress: 'Тестовая улица, 1', driverName: null, total: 5500,
    items: Array.from({ length: 10 }, (_, index) => ({ id: `item-${index}`, title: `Блюдо ${index + 1}`, quantity: 1, unitPrice: 550, lineTotal: 550 }))
  }))
}));

test('shows the real payment status and all ten items on a narrow screen', async () => {
  await page.viewport(353, 618);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(<QueryClientProvider client={client}><MemoryRouter><PublicOrderStatusScreen catalogSlug="mangal" orderId="order-1234" /></MemoryRouter></QueryClientProvider>);
  await expect.element(screen.getByText('Ожидает подтверждения оплаты')).toBeVisible();
  await expect.element(screen.getByText('Блюдо 10')).toBeInTheDocument();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
});
