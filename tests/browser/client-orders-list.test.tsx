import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { returnFromPublicOrder } from '../../src/features/order/orderBackNavigation';
import { afterEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { OrdersPage } from '../../src/pages/client-platform/ClientPlatformApp';
import { useClientPlatformStore } from '../../src/features/client-platform/store';
import type { ClientOrder, ClientPlatformSnapshot } from '../../src/features/client-platform/types';
import '../../src/pages/client-platform/client-platform.css';

const previousOrders = useClientPlatformStore.getState().orders;
afterEach(() => useClientPlatformStore.setState({ orders: previousOrders }));
const order = (id: string, status: ClientOrder['status']): ClientOrder => ({
  id, restaurantSlug: 'mangal', restaurantName: 'Мангал', orderType: 'pickup', deliveryProvider: 'pickup',
  paymentMethod: 'cash', status, paymentStatus: 'unpaid', totalAmount: 550, addressLine: '', clientName: '',
  clientPhone: '', createdAt: '2026-10-19T12:00:00Z', estimatedTimeMin: 15, estimatedTimeMax: 30, items: []
});

test('orders are compact links and history is shown in a separate tab', async () => {
  await page.viewport(353, 618);
  useClientPlatformStore.setState({ orders: [order('current-1', 'new'), order('finished-1', 'completed')] });
  const snapshot = { restaurants: [], dishes: [] } as unknown as ClientPlatformSnapshot;
  const screen = await render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><OrdersPage snapshot={snapshot} /></MemoryRouter></QueryClientProvider>);
  await expect.element(screen.getByRole('link', { name: /Мангал/ })).toHaveAttribute('href', '/mangal/order/current-1');
  expect(screen.getByText('Доставлен').elements()).toHaveLength(0);
  await screen.getByRole('tab', { name: 'Завершённые' }).click();
  await expect.element(screen.getByText('Доставлен')).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
});

function DetailForNavigationTest() {
  const navigate = useNavigate();
  const location = useLocation();
  return <button type="button" onClick={() => returnFromPublicOrder(navigate, location.state, 'mangal')}>Назад к заказам</button>;
}

test('back from an order restores the history tab', async () => {
  useClientPlatformStore.setState({ orders: [order('finished-back', 'completed')] });
  const snapshot = { restaurants: [], dishes: [] } as unknown as ClientPlatformSnapshot;
  const screen = await render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/profile/orders']}><Routes><Route path="/profile/orders" element={<OrdersPage snapshot={snapshot} />} /><Route path="/mangal/order/:id" element={<DetailForNavigationTest />} /></Routes></MemoryRouter></QueryClientProvider>);
  await screen.getByRole('tab', { name: 'Завершённые' }).click();
  await screen.getByRole('link', { name: /Мангал/ }).click();
  await screen.getByRole('button', { name: 'Назад к заказам' }).click();
  await expect.element(screen.getByRole('tab', { name: 'Завершённые' })).toHaveAttribute('aria-selected', 'true');
  await expect.element(screen.getByText('Доставлен')).toBeVisible();
});
