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
  await expect.element(screen.getByRole('heading', { name: 'Ожидает подтверждения оплаты' })).toBeVisible();
  await screen.getByRole('button', { name: 'Показать все' }).click();
  await expect.element(screen.getByText('Блюдо 10')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Курьер' }).query()).toBeNull();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
});

test('shows the saved order and WhatsApp countdown immediately after checkout', async () => {
  const { useClientPlatformStore } = await import('../../src/features/client-platform/store');
  useClientPlatformStore.getState().submitOrder({
    id: 'confirmation-test', restaurantSlug: 'mangal', restaurantName: 'Мангал', orderType: 'pickup',
    deliveryProvider: 'pickup', paymentMethod: 'cash', status: 'new', paymentStatus: 'unpaid', totalAmount: 5500,
    addressLine: 'Самовывоз', clientName: 'Тест', clientPhone: '', createdAt: new Date().toISOString(),
    estimatedTimeMin: 20, estimatedTimeMax: 30,
    items: Array.from({ length: 10 }, (_, index) => ({ dishId: `dish-${index}`, name: `Тестовое блюдо ${index + 1}`, price: 550, quantity: 1 }))
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[{ pathname: '/mangal/order/confirmation-test', state: { confirmationOrderId: 'confirmation-test', whatsappHref: 'https://wa.me/79990000000', redirectAt: Date.now() + 15000 } }]}><PublicOrderStatusScreen catalogSlug="mangal" orderId="confirmation-test" /></MemoryRouter></QueryClientProvider>);
  await expect.element(screen.getByText('Заказ создан')).toBeVisible();
  await expect.element(screen.getByText('Тестовое блюдо 10')).toBeInTheDocument();
  await expect.element(screen.getByRole('link', { name: 'Перейти сейчас' })).toHaveAttribute('href', 'https://wa.me/79990000000');
  await expect.element(screen.getByText(/откроется WhatsApp/)).toBeInTheDocument();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
});


test('opens WhatsApp after the countdown without creating another order', async () => {
  const { useClientPlatformStore } = await import('../../src/features/client-platform/store');
  useClientPlatformStore.getState().submitOrder({ id: 'auto-test', restaurantSlug: 'mangal', restaurantName: 'Мангал', orderType: 'pickup', deliveryProvider: 'pickup', paymentMethod: 'cash', status: 'new', paymentStatus: 'unpaid', totalAmount: 550, addressLine: '', clientName: '', clientPhone: '', createdAt: new Date().toISOString(), estimatedTimeMin: 10, estimatedTimeMax: 20, items: [{ dishId: 'dish', name: 'Блюдо', price: 550, quantity: 1 }] });
  const redirect = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[{ pathname: '/mangal/order/auto-test', state: { confirmationOrderId: 'auto-test', whatsappHref: 'https://wa.me/79990000000', redirectAt: Date.now() + 300 } }]}><PublicOrderStatusScreen catalogSlug="mangal" orderId="auto-test" onWhatsappRedirect={redirect} /></MemoryRouter></QueryClientProvider>);
  await expect.poll(() => redirect.mock.calls.length).toBe(1);
  expect(redirect).toHaveBeenCalledWith('https://wa.me/79990000000');
  expect(useClientPlatformStore.getState().orders.filter((order) => order.id === 'auto-test')).toHaveLength(1);
});

test('shows courier contacts only after assignment and keeps restaurant contact available', async () => {
  const { getPublicRestaurantOrderStatus } = await import('../../src/shared/api/restaurantOrdersApi');
  vi.mocked(getPublicRestaurantOrderStatus).mockResolvedValueOnce({
    id: 'assigned-order', status: 'driver_assigned', fulfillmentType: 'delivery',
    deliveryAddress: 'Тестовая улица', driverName: 'Курьер', driverPhone: '+79990000001',
    restaurantName: 'Мангал', total: 550, items: []
  } as unknown as Awaited<ReturnType<typeof getPublicRestaurantOrderStatus>>);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(<QueryClientProvider client={client}><MemoryRouter><PublicOrderStatusScreen catalogSlug="mangal" orderId="assigned-order" restaurantWhatsapp="79990000000" /></MemoryRouter></QueryClientProvider>);
  await expect.element(screen.getByRole('tab', { name: 'Курьер' })).toBeVisible();
  await screen.getByRole('button', { name: 'Написать' }).click();
  await expect.element(screen.getByRole('button', { name: 'Написать' })).toBeVisible();
  await screen.getByRole('tab', { name: 'Курьер' }).click();
  await expect.element(screen.getByRole('link', { name: 'Позвонить' })).toHaveAttribute('href', 'tel:+79990000001');
  await expect.element(screen.getByRole('button', { name: 'Написать' })).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
});

test('keeps the saved order and its open controls during a failed background refresh', async () => {
  const { useClientPlatformStore } = await import('../../src/features/client-platform/store');
  const { getPublicRestaurantOrderStatus } = await import('../../src/shared/api/restaurantOrdersApi');
  useClientPlatformStore.getState().submitOrder({ id: 'refresh-test', restaurantSlug: 'mangal', restaurantName: 'Мангал', orderType: 'pickup', deliveryProvider: 'pickup', paymentMethod: 'cash', status: 'new', paymentStatus: 'unpaid', totalAmount: 150, addressLine: '', clientName: '', clientPhone: '', createdAt: new Date().toISOString(), estimatedTimeMin: 10, estimatedTimeMax: 20, items: [{ dishId: 'drink', name: 'Айран', price: 150, quantity: 1 }] });
  vi.mocked(getPublicRestaurantOrderStatus).mockRejectedValue(new Error('unavailable'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(<QueryClientProvider client={client}><MemoryRouter><PublicOrderStatusScreen catalogSlug="mangal" orderId="refresh-test" /></MemoryRouter></QueryClientProvider>);
  await screen.getByRole('button', { name: 'Написать' }).click();
  await expect.element(screen.getByRole('button', { name: 'Написать' })).toBeVisible();
  await client.refetchQueries({ queryKey: ['public-order-status', 'refresh-test'] });
  await expect.element(screen.getByRole('button', { name: 'Написать' })).toBeVisible();
  expect(screen.getByLabelText('Загрузка заказа').query()).toBeNull();
  vi.mocked(getPublicRestaurantOrderStatus).mockReset();
});
