import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { PublicOrderStatusScreen } from '../../src/features/order/PublicOrderStatusScreen';
import '../../src/app/styles.css';


vi.mock('../../src/shared/api/clientPlatformApi', async (importOriginal) => ({
  ...await importOriginal<object>(), saveClientReview: vi.fn(async () => {})
}));

vi.mock('../../src/shared/api/restaurantOrdersApi', () => ({
  getPublicRestaurantOrderStatus: vi.fn(async () => ({
    id: 'order-1234', status: 'waiting_payment_confirmation', fulfillmentType: 'delivery',
    deliveryAddress: 'Тестовая улица, 1', driverName: null, total: 5500,
    items: Array.from({ length: 10 }, (_, index) => ({ id: `item-${index}`, title: `Блюдо ${index + 1}`, quantity: 1, unitPrice: 550, lineTotal: 550 }))
  }))
}));

test('shows the real payment status and all ten items on a narrow screen', async () => {
  await page.viewport(319, 620);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(<QueryClientProvider client={client}><MemoryRouter><PublicOrderStatusScreen catalogSlug="mangal" orderId="order-1234" restaurantWhatsapp="79990000000" products={[{ id: 'dish-1', title: 'Блюдо 1', image_url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="5" height="4"/>' }]} /></MemoryRouter></QueryClientProvider>);
  await expect.element(screen.getByRole('heading', { name: 'Ожидает подтверждения оплаты' })).toBeVisible();
  await screen.getByRole('button', { name: 'Показать все' }).click();
  await expect.element(screen.getByText('Блюдо 10')).toBeInTheDocument();
  await expect.poll(() => document.querySelector('.live-order__item img')?.getAttribute('src')).toBeTruthy();
  const actions = document.querySelector('.live-order__contact-actions')!;
  expect([...actions.children].every((button) => button.scrollWidth <= button.clientWidth)).toBe(true);
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

test('keeps the last known saved stage visible and can retry its server refresh', async () => {
  const { useClientPlatformStore } = await import('../../src/features/client-platform/store');
  const { getPublicRestaurantOrderStatus } = await import('../../src/shared/api/restaurantOrdersApi');
  useClientPlatformStore.getState().submitOrder({ id: 'saved-stage', restaurantSlug: 'mangal', restaurantName: 'Мангал', orderType: 'delivery', deliveryProvider: 'platform', paymentMethod: 'cash', status: 'cooking', paymentStatus: 'unpaid', totalAmount: 150, addressLine: 'Адрес', clientName: 'Тест', clientPhone: '', createdAt: new Date().toISOString(), estimatedTimeMin: 10, estimatedTimeMax: 20, items: [{ dishId: 'drink', name: 'Айран', price: 150, quantity: 1 }] });
  vi.mocked(getPublicRestaurantOrderStatus).mockRejectedValueOnce(new Error('offline'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(<QueryClientProvider client={client}><MemoryRouter><PublicOrderStatusScreen catalogSlug="mangal" orderId="saved-stage" /></MemoryRouter></QueryClientProvider>);
  await expect.element(screen.getByText('Последний известный статус: Готовится')).toBeVisible();
  await expect.element(screen.getByRole('link', { name: 'Войти для обновления' })).toHaveAttribute('href', '/profile?clientAuth=1&returnTo=%2Fmangal%2Forder%2Fsaved-stage');
  await expect.element(screen.getByText('Ресторан Мангал', { exact: true }).first()).toBeVisible();
  vi.mocked(getPublicRestaurantOrderStatus).mockResolvedValueOnce({ id: 'saved-stage', status: 'on_the_way', fulfillmentType: 'delivery', restaurantName: 'Мангал', total: 150, items: [] } as unknown as Awaited<ReturnType<typeof getPublicRestaurantOrderStatus>>);
  await screen.getByRole('button', { name: 'Обновить статус' }).click();
  await expect.element(screen.getByRole('heading', { name: 'В пути' })).toBeVisible();
});

test('opens review and repeat actions on the order itself without a manage page', async () => {
  const { useClientPlatformStore } = await import('../../src/features/client-platform/store');
  const { getPublicRestaurantOrderStatus } = await import('../../src/shared/api/restaurantOrdersApi');
  useClientPlatformStore.getState().submitOrder({ id: 'inline-actions', restaurantSlug: 'mangal', restaurantName: 'Мангал', orderType: 'pickup', deliveryProvider: 'pickup', paymentMethod: 'cash', status: 'completed', paymentStatus: 'confirmed', totalAmount: 150, addressLine: '', clientName: 'Тест', clientPhone: '', createdAt: new Date().toISOString(), estimatedTimeMin: 10, estimatedTimeMax: 20, items: [{ dishId: 'drink', name: 'Айран', price: 150, quantity: 1 }] });
  vi.mocked(getPublicRestaurantOrderStatus).mockResolvedValueOnce(null);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(<QueryClientProvider client={client}><MemoryRouter><PublicOrderStatusScreen catalogSlug="mangal" orderId="inline-actions" /></MemoryRouter></QueryClientProvider>);
  expect(screen.getByRole('link', { name: 'Повторить заказ или оставить отзыв' }).elements()).toHaveLength(0);
  await screen.getByRole('button', { name: 'Оставить отзыв' }).click();
  await expect.element(screen.getByRole('textbox', { name: 'Ваш отзыв' })).toBeVisible();
  await screen.getByRole('button', { name: 'Повторить заказ', exact: true }).click();
  expect(useClientPlatformStore.getState().carts.mangal).toEqual([{ dishId: 'drink', quantity: 1 }]);
  const { useCartStore } = await import('../../src/features/stores');
  expect(useCartStore.getState().items[0].product.title).toBe('Айран');
});


test('submits the inline review with the right order and keeps failures actionable', async () => {
 const { useClientPlatformStore } = await import('../../src/features/client-platform/store');
 const { saveClientReview } = await import('../../src/shared/api/clientPlatformApi');
 const { getPublicRestaurantOrderStatus } = await import('../../src/shared/api/restaurantOrdersApi');
 useClientPlatformStore.getState().submitOrder({ id: 'review-inline', restaurantSlug: 'mangal', restaurantName: 'Мангал', orderType: 'pickup', deliveryProvider: 'pickup', paymentMethod: 'cash', status: 'completed', paymentStatus: 'confirmed', totalAmount: 150, addressLine: '', clientName: 'Тест', clientPhone: '79990000000', createdAt: new Date().toISOString(), estimatedTimeMin: 10, estimatedTimeMax: 20, items: [] });
 vi.mocked(getPublicRestaurantOrderStatus).mockResolvedValueOnce(null);
 vi.mocked(saveClientReview).mockRejectedValueOnce(new Error('Сессия закончилась. Войдите снова.'));
 const screen = await render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><PublicOrderStatusScreen catalogSlug="mangal" orderId="review-inline" restaurantId="catalog-1" /></MemoryRouter></QueryClientProvider>);
 await screen.getByRole('button', { name: 'Оставить отзыв' }).click();
 await screen.getByRole('textbox', { name: 'Ваш отзыв' }).fill('Всё понравилось');
 await screen.getByRole('button', { name: 'Отправить отзыв' }).click();
 await expect.element(screen.getByRole('alert')).toHaveTextContent('Сессия закончилась. Войдите снова.');
 await screen.getByRole('button', { name: 'Отправить отзыв' }).click();
 await expect.element(screen.getByText('Спасибо! Отзыв отправлен.')).toBeVisible();
 expect(saveClientReview).toHaveBeenLastCalledWith(expect.objectContaining({ orderId: 'review-inline', restaurantId: 'catalog-1', rating: 5, comment: 'Всё понравилось' }));
});

test('retains a loaded order and its actions when a background refresh fails', async () => {
 const { getPublicRestaurantOrderStatus } = await import('../../src/shared/api/restaurantOrdersApi');
 vi.mocked(getPublicRestaurantOrderStatus).mockResolvedValueOnce({ id: 'loaded-then-offline', status: 'ready', fulfillmentType: 'delivery', restaurantName: 'Мангал', total: 150, items: [] } as unknown as Awaited<ReturnType<typeof getPublicRestaurantOrderStatus>>);
 const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
 const screen = await render(<QueryClientProvider client={client}><MemoryRouter><PublicOrderStatusScreen catalogSlug="mangal" orderId="loaded-then-offline" /></MemoryRouter></QueryClientProvider>);
 await expect.element(screen.getByRole('heading', { name: 'Готов', exact: true })).toBeVisible();
 vi.mocked(getPublicRestaurantOrderStatus).mockRejectedValueOnce(new Error('offline'));
 await client.refetchQueries({ queryKey: ['public-order-status', 'loaded-then-offline'] });
 await expect.element(screen.getByText('Последний известный статус: Готов', { exact: true })).toBeVisible();
 await expect.element(screen.getByRole('link', { name: 'Открыть заведение' })).toBeVisible();
});
