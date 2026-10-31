import { useEffect } from 'react';
import { MemoryRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExactBackProvider, useExactBack } from '../../src/shared/ExactBackNavigation';
import { OrdersPage } from '../../src/pages/client-platform/ClientPlatformApp';
import { HomeActiveOrders } from '../../src/pages/client-platform/ClientPlatformApp';
import { useClientPlatformStore } from '../../src/features/client-platform/store';
import type { ClientPlatformSnapshot } from '../../src/features/client-platform/types';

function Detail() {
  const back = useExactBack('/mangal');
  return <button onClick={back}>Назад из заказа</button>;
}
function HistoryButtons() {
  const navigate = useNavigate();
  const location = useLocation();
  return <><output aria-label="Состояние маршрута">{JSON.stringify({ path: location.pathname + location.search, state: location.state })}</output><button onClick={() => navigate(-1)}>Браузер назад</button><button onClick={() => navigate(1)}>Браузер вперёд</button></>;
}
const snapshot = { restaurants: [], dishes: [] } as unknown as ClientPlatformSnapshot;
test('home → current orders → order returns to orders then home, including browser forward', async () => {
  await page.viewport(319, 620);
  const previous = useClientPlatformStore.getState().orders;
  useClientPlatformStore.setState({ orders: [{ id: 'back-test', restaurantSlug: 'mangal', restaurantName: 'Мангал', orderType: 'pickup', deliveryProvider: 'pickup', paymentMethod: 'cash', paymentStatus: 'unpaid', status: 'new', totalAmount: 550, addressLine: '', clientName: '', clientPhone: '', createdAt: '2026-10-30T12:00:00Z', estimatedTimeMin: 15, estimatedTimeMax: 30, items: [] }] });
  try {
    const screen = await render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ExactBackProvider><HistoryButtons /><Routes><Route path="/" element={<><h1>Главная</h1><HomeActiveOrders /></>} /><Route path="/profile/orders" element={<OrdersPage snapshot={snapshot} />} /><Route path="/mangal/order/:id" element={<Detail />} /><Route path="/profile" element={<h1>Профиль</h1>} /></Routes></ExactBackProvider></MemoryRouter></QueryClientProvider>);
    await screen.getByRole('link', { name: /Мангал/ }).click();
    await screen.getByRole('link', { name: /Мангал/ }).click();
    await screen.getByRole('button', { name: 'Назад из заказа' }).click();
    await expect.element(screen.getByRole('heading', { name: 'Мои заказы' })).toBeVisible();
    await screen.getByRole('button', { name: 'Назад', exact: true }).click();
    await expect.element(screen.getByRole('heading', { name: 'Главная' })).toBeVisible();
    await screen.getByRole('button', { name: 'Браузер вперёд' }).click();
    await expect.element(screen.getByRole('heading', { name: 'Мои заказы' })).toBeVisible();
    await screen.getByRole('button', { name: 'Браузер назад' }).click();
    await expect.element(screen.getByRole('heading', { name: 'Главная' })).toBeVisible();
  } finally { useClientPlatformStore.setState({ orders: previous }); }
});
test('direct entry does not treat earlier unknown or privileged history as a client origin', async () => {
  const screen = await render(<MemoryRouter initialEntries={['/admin', '/mangal/order/direct']}><ExactBackProvider><Routes><Route path="/mangal/order/:id" element={<Detail />} /><Route path="/mangal" element={<h1>Каталог</h1>} /><Route path="/admin" element={<Link to="/">Администратор</Link>} /></Routes></ExactBackProvider></MemoryRouter>);
  await screen.getByRole('button', { name: 'Назад из заказа' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Каталог' })).toBeVisible();
});

function ScrollOrigin() {
  return <main style={{ minHeight: 2400 }}><h1>Каталог с фильтром</h1><Link style={{ display: 'block', marginTop: 700 }} to="/mangal/order/scroll">Открыть заказ</Link></main>;
}
test('nested Back restores query, router state and scroll; new forward navigation starts at top', async () => {
  const screen = await render(<MemoryRouter initialEntries={[{ pathname: '/restaurants', search: '?category=coffee', state: { selected: 'coffee' } }]}><ExactBackProvider><HistoryButtons /><Routes><Route path="/restaurants" element={<ScrollOrigin />} /><Route path="/mangal/order/:id" element={<><Detail /><Link to="/notifications">Уведомления</Link></>} /><Route path="/notifications" element={<Detail />} /><Route path="/mangal" element={<p>Неверный каталог</p>} /></Routes></ExactBackProvider></MemoryRouter>);
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  window.dispatchEvent(new WheelEvent('wheel', { deltaY: 650 }));
  window.scrollTo(0, 650);
  await expect.poll(() => window.scrollY).toBe(650);
  await screen.getByRole('link', { name: 'Открыть заказ' }).click();
  await expect.poll(() => window.scrollY).toBe(0);
  await screen.getByRole('link', { name: 'Уведомления' }).click();
  await screen.getByRole('button', { name: 'Назад из заказа' }).click();
  await expect.element(screen.getByRole('link', { name: 'Уведомления' })).toBeVisible();
  await screen.getByRole('button', { name: 'Назад из заказа' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Каталог с фильтром' })).toBeInTheDocument();
  await expect.poll(() => window.scrollY).toBe(650);
  await expect.element(screen.getByLabelText('Состояние маршрута')).toHaveTextContent('/restaurants?category=coffee');
  await expect.element(screen.getByLabelText('Состояние маршрута')).toHaveTextContent('coffee');
});

test('crossing a login boundary discards the previous client stack', async () => {
  const screen = await render(<MemoryRouter><ExactBackProvider><Routes><Route path="/" element={<Link to="/login">Вход</Link>} /><Route path="/login" element={<Link to="/mangal/order/after-login">Открыть после входа</Link>} /><Route path="/mangal/order/:id" element={<Detail />} /><Route path="/mangal" element={<h1>Безопасный каталог</h1>} /></Routes></ExactBackProvider></MemoryRouter>);
  await screen.getByRole('link', { name: 'Вход', exact: true }).click();
  await screen.getByRole('link', { name: 'Открыть после входа' }).click();
  await screen.getByRole('button', { name: 'Назад из заказа' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Безопасный каталог' })).toBeVisible();
});

function TargetedProduct() {
  useEffect(() => { window.scrollTo(0, 650); }, []);
  return <main style={{ minHeight: 2400 }}><h1>Нужный товар</h1></main>;
}
test('a targeted product link keeps its deliberate scroll position', async () => {
  const screen = await render(<MemoryRouter><ExactBackProvider><Routes><Route path="/" element={<Link to="/mangal?focusDish=selected">К товару</Link>} /><Route path="/mangal" element={<TargetedProduct />} /></Routes></ExactBackProvider></MemoryRouter>);
  await screen.getByRole('link', { name: 'К товару' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Нужный товар' })).toBeVisible();
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  await expect.poll(() => window.scrollY).toBe(650);
});
