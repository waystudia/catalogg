import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { HomeActiveOrders } from '../../src/pages/client-platform/ClientPlatformApp';
import { useClientPlatformStore } from '../../src/features/client-platform/store';
import type { ClientOrder } from '../../src/features/client-platform/types';
import '../../src/pages/client-platform/client-platform.css';

const previousOrders = useClientPlatformStore.getState().orders;
afterEach(() => useClientPlatformStore.setState({ orders: previousOrders }));
const order = (id: string, name: string, status: ClientOrder['status']): ClientOrder => ({
  id, restaurantSlug: id, restaurantName: name, orderType: 'pickup', deliveryProvider: 'pickup',
  paymentMethod: 'cash', status, paymentStatus: 'unpaid', totalAmount: 550, addressLine: '',
  clientName: '', clientPhone: '', createdAt: '2026-10-19T12:00:00Z', estimatedTimeMin: 15, estimatedTimeMax: 30, items: []
});

test('home shows separate active orders with links and hides completed orders', async () => {
  await page.viewport(353, 618);
  useClientPlatformStore.setState({ orders: [order('one', 'Мангал', 'new'), order('two', 'Финик', 'cooking'), order('old', 'Старый', 'completed')] });
  const screen = await render(<MemoryRouter><HomeActiveOrders /></MemoryRouter>);
  await expect.element(screen.getByRole('link', { name: /Мангал/ })).toHaveAttribute('href', '/one/order/one');
  await expect.element(screen.getByRole('link', { name: /Финик/ })).toHaveAttribute('href', '/two/order/two');
  expect(screen.getByText('Старый').elements()).toHaveLength(0);
  useClientPlatformStore.setState({ orders: [order('one', 'Мангал', 'ready')] });
  await expect.element(screen.getByText('Готов')).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
});
