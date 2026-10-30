import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { HomeActiveOrders } from '../../src/pages/client-platform/ClientPlatformApp';
import { useClientPlatformStore } from '../../src/features/client-platform/store';
import type { ClientOrder } from '../../src/features/client-platform/types';
import '../../src/pages/client-platform/client-platform.css';

const previousOrders = useClientPlatformStore.getState().orders;
const previousProfile = useClientPlatformStore.getState().profile;
afterEach(() => useClientPlatformStore.setState({ orders: previousOrders, profile: previousProfile }));
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
  await expect.element(screen.getByRole('button', { name: /показать все 2 заказа/i })).toHaveAttribute('aria-expanded', 'false');
  await screen.getByRole('button', { name: /показать все 2 заказа/i }).click();
  await expect.element(screen.getByRole('button', { name: /свернуть заказы/i })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Старый').elements()).toHaveLength(0);
  useClientPlatformStore.setState({ orders: [order('one', 'Мангал', 'ready')] });
  await expect.element(screen.getByText('Готов')).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
});

test('current order shows its number, amount and distinct dish previews on a narrow screen', async () => {
  await page.viewport(319, 620);
  const current = order('one', 'Мангал', 'new');
  current.items = [
    { dishId: 'a', name: 'Айран', price: 150, quantity: 1, imageUrl: '/one.webp' },
    { dishId: 'b', name: 'Чай', price: 200, quantity: 1, imageUrl: '/two.webp' },
    { dishId: 'a', name: 'Айран', price: 150, quantity: 1, imageUrl: '/one.webp' }
  ];
  useClientPlatformStore.setState({ orders: [current] });
  const screen = await render(<MemoryRouter><HomeActiveOrders /></MemoryRouter>);
  await expect.element(screen.getByText('Текущий заказ', { exact: true })).toBeVisible();
  await expect.element(screen.getByText(/№.*550 ₽/)).toBeVisible();
  expect(document.querySelectorAll('.home-active-order__dish-image')).toHaveLength(2);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
});

test('updates saved orders when another tab changes client storage', async () => {
  const storageKey = 'waycatalog-client-platform';
  useClientPlatformStore.setState({ orders: [] });
  const saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
  saved.state.orders = [order('cross-tab-order', 'Мангал', 'new')];
  const updated = JSON.stringify(saved);
  window.localStorage.setItem(storageKey, updated);
  window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: updated, storageArea: window.localStorage }));
  await expect.poll(() => useClientPlatformStore.getState().orders.map((item) => item.id)).toEqual(['cross-tab-order']);
  useClientPlatformStore.getState().saveProfile({ name: 'Тест', phone: '' });
  expect(JSON.parse(window.localStorage.getItem(storageKey) || '{}').state.orders[0].id).toBe('cross-tab-order');
});
