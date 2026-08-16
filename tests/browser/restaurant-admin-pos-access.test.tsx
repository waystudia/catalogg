import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { cabins, categories, products, restaurant } from '../../src/data/catalog';
import { RestaurantAdminWorkspace } from '../../src/features/restaurant-admin/RestaurantAdminWorkspace';
import { defaultRestaurantDeliverySettings } from '../../src/features/restaurant-settings';
import { useAuthStore } from '../../src/features/stores';
import { defaultPaymentSettings } from '../../src/shared/paymentSettings';
import type { RestaurantOrder } from '../../src/shared/api/restaurantOrdersApi';
import '../../src/app/styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function LocationProbe() {
  return <output aria-label="Текущий маршрут">{useLocation().pathname}</output>;
}

function RoutedWorkspace({ orders }: { orders: RestaurantOrder[] }) {
  const location = useLocation();
  const [, routeSection, routeOrderId] = location.pathname.split('/').filter(Boolean);
  return (
    <RestaurantAdminWorkspace
      catalogSlug="mangal"
      restaurant={restaurant}
      categories={categories}
      cabins={cabins}
      products={products}
      orders={orders}
      routeSection={routeSection}
      routeOrderId={routeOrderId}
      paymentSettings={defaultPaymentSettings}
      deliverySettings={defaultRestaurantDeliverySettings}
      moduleAccess={{ pos: 'active', warehouse: 'disabled' }}
      onOpenScreen={() => undefined}
      onOpenSeating={() => undefined}
      onOpenCatalog={() => undefined}
      onAddDish={() => undefined}
      onOrderStatus={async () => undefined}
      onRefreshOrders={() => undefined}
      onSaveDeliverySettings={() => undefined}
    />
  );
}

const chatOrder = (): RestaurantOrder => ({
  id: 'order-chat-1',
  orderNumber: 'M9686',
  catalogId: 'mangal',
  clientName: 'Дуквах',
  clientPhone: '+7 963 880-85-00',
  fulfillmentType: 'delivery',
  cabinLabel: '',
  deliveryAddress: 'Лоци-Юрт',
  deliveryLat: null,
  deliveryLng: null,
  clientAccuracyM: null,
  deliveryCity: '',
  deliverySettlement: '',
  restaurantAddress: '',
  restaurantCity: '',
  restaurantLat: null,
  restaurantLng: null,
  comment: '',
  status: 'preparing',
  paymentStatus: 'unpaid',
  deliveryStatus: 'waiting_courier',
  deliveryId: null,
  deliveryUpdatedAt: null,
  driverName: null,
  driverPhone: null,
  driverVehicleInfo: null,
  driverCarNumber: null,
  driverPhotoUrl: null,
  driverLat: null,
  driverLng: null,
  driverLocationAt: null,
  restaurantPaymentConfirmedAt: null,
  pickupQrConfirmedAt: null,
  subtotal: 1390,
  deliveryFee: 0,
  courierPayout: 0,
  total: 1390,
  createdAt: '2026-08-16T09:21:00.000Z',
  acceptedAt: null,
  readyAt: null,
  completedAt: null,
  cancellationReason: '',
  qrToken: null,
  qrExpiresAt: null,
  verificationCode: null,
  items: [{ id: 'item-chat-1', title: 'Стейк на косточке', quantity: 1, unitPrice: 1390, lineTotal: 1390 }]
});

test('enabled restaurant opens POS from the dashboard quick action under orders and scanner', async () => {
  await page.viewport(1280, 900);
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/mangal/dashboard']}>
        <LocationProbe />
        <RestaurantAdminWorkspace
          catalogSlug="mangal"
          restaurant={restaurant}
          categories={categories}
          cabins={cabins}
          products={products}
          orders={[]}
          routeSection="dashboard"
          paymentSettings={defaultPaymentSettings}
          deliverySettings={defaultRestaurantDeliverySettings}
          moduleAccess={{ pos: 'active', warehouse: 'disabled' }}
          onOpenScreen={() => undefined}
          onOpenSeating={() => undefined}
          onOpenCatalog={() => undefined}
          onAddDish={() => undefined}
          onOrderStatus={async () => undefined}
          onRefreshOrders={() => undefined}
          onSaveDeliverySettings={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );

  const quickActions = screen.getByRole('region', { name: 'Быстрые действия' });
  const posButton = quickActions.getByRole('button', { name: 'POS-касса' });
  await expect.element(posButton).toBeVisible();
  await posButton.click();

  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/mangal/pos');
  await expect.element(screen.getByRole('heading', { name: 'Касса — Новый заказ' })).toBeVisible();
  await expect.element(screen.getByText('Блюда из текущего каталога «Мангал»')).toBeVisible();
});

test('POS uses a compact restaurant header and settings expose the hall editor', async () => {
  await page.viewport(1011, 628);
  const onOpenSeating = vi.fn();
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/mangal/pos']}>
        <RestaurantAdminWorkspace
          catalogSlug="mangal"
          restaurant={restaurant}
          categories={categories}
          cabins={cabins}
          products={products}
          orders={[]}
          routeSection="pos"
          paymentSettings={defaultPaymentSettings}
          deliverySettings={defaultRestaurantDeliverySettings}
          moduleAccess={{ pos: 'active', warehouse: 'disabled' }}
          onOpenScreen={() => undefined}
          onOpenSeating={onOpenSeating}
          onOpenCatalog={() => undefined}
          onAddDish={() => undefined}
          onOrderStatus={async () => undefined}
          onRefreshOrders={() => undefined}
          onSaveDeliverySettings={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );

  const panelLabel = screen.getByText('Панель: ресторан', { exact: true }).element();
  const hero = panelLabel.closest<HTMLElement>('.restaurant-admin__hero');
  const admin = panelLabel.closest<HTMLElement>('.restaurant-admin');
  const logoImage = screen.getByRole('img', { name: 'WayYaam' }).element();
  const sidebar = logoImage.closest<HTMLElement>('.restaurant-admin-sidebar');
  expect(hero).not.toBeNull();
  expect(hero!.getBoundingClientRect().height).toBeLessThanOrEqual(110);
  expect(admin).not.toBeNull();
  expect(sidebar).not.toBeNull();
  expect(admin!.scrollHeight).toBeLessThanOrEqual(628);
  expect(window.getComputedStyle(admin!).overflow).toBe('hidden');
  expect(logoImage.getBoundingClientRect().right).toBeLessThanOrEqual(sidebar!.getBoundingClientRect().right - 8);

  await screen.getByRole('button', { name: 'Настройки' }).click();
  await screen.getByRole('button', { name: 'Зал' }).click();
  expect(onOpenSeating).toHaveBeenCalledOnce();
});

test('restaurant settings exit confirms and invokes the active auth logout', async () => {
  const originalLogout = useAuthStore.getState().logout;
  const logout = vi.fn().mockResolvedValue(undefined);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  useAuthStore.setState({ logout });

  try {
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/mangal/settings']}>
          <RestaurantAdminWorkspace
            catalogSlug="mangal"
            restaurant={restaurant}
            categories={categories}
            cabins={cabins}
            products={products}
            orders={[]}
            routeSection="settings"
            paymentSettings={defaultPaymentSettings}
            deliverySettings={defaultRestaurantDeliverySettings}
            moduleAccess={{ pos: 'active', warehouse: 'disabled' }}
            onOpenScreen={() => undefined}
            onOpenSeating={() => undefined}
            onOpenCatalog={() => undefined}
            onAddDish={() => undefined}
            onOrderStatus={async () => undefined}
            onRefreshOrders={() => undefined}
            onSaveDeliverySettings={() => undefined}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.getByRole('button', { name: 'Выход', exact: true }).click();
    expect(confirm).toHaveBeenCalledWith('Выйти из аккаунта заведения?');
    expect(logout).toHaveBeenCalledOnce();
  } finally {
    confirm.mockRestore();
    useAuthStore.setState({ logout: originalLogout });
  }
});

test('restaurant dashboard opens the shared business chat inbox from quick actions', async () => {
  await page.viewport(372, 576);
  const screen = await render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/mangal/dashboard']}>
        <LocationProbe />
        <RoutedWorkspace orders={[chatOrder()]} />
      </MemoryRouter>
    </QueryClientProvider>
  );

  const quickActions = screen.getByRole('region', { name: 'Быстрые действия' });
  await quickActions.getByRole('button', { name: 'Чаты' }).click();

  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/mangal/chats');
  await expect.element(screen.getByRole('region', { name: 'Чаты по заказам' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Дуквах/u })).toBeVisible();

  await screen.getByLabelText('Поиск чатов').fill('Дуквах');
  await screen.getByRole('button', { name: /Дуквах/u }).click();
  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/mangal/chats/order-chat-1');
  await screen.getByRole('button', { name: 'Назад к списку чатов' }).click();
  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/mangal/chats');
  await expect.element(screen.getByLabelText('Поиск чатов')).toHaveValue('Дуквах');

  await screen.getByRole('button', { name: 'Назад с экрана чатов' }).click();
  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/mangal/dashboard');
});

test('direct restaurant chat entry falls back safely to the chat list and then dashboard', async () => {
  await page.viewport(372, 576);
  const screen = await render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/mangal/chats/order-chat-1']}>
        <LocationProbe />
        <RoutedWorkspace orders={[chatOrder()]} />
      </MemoryRouter>
    </QueryClientProvider>
  );

  await expect.element(screen.getByText('Заказ №M9686 · Готовится')).toBeVisible();
  await screen.getByRole('button', { name: 'Назад к списку чатов' }).click();
  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/mangal/chats');
  await screen.getByRole('button', { name: 'Назад с экрана чатов' }).click();
  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/mangal/dashboard');
});

test('order chat button opens that exact client conversation in the Finik messenger layout', async () => {
  await page.viewport(372, 576);
  const screen = await render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/mangal/orders']}>
        <LocationProbe />
        <RoutedWorkspace orders={[chatOrder()]} />
      </MemoryRouter>
    </QueryClientProvider>
  );

  await screen.getByRole('button', { name: 'Открыть чат заказа' }).click();

  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/mangal/chats/order-chat-1');
  const inbox = screen.getByRole('region', { name: 'Чаты по заказам' });
  await expect.element(inbox).toHaveAttribute('data-view', 'conversation');
  await expect.element(inbox.getByText('Заказ №M9686 · Готовится')).toBeVisible();
  const conversation = inbox.element().querySelector<HTMLElement>('.order-inbox__conversation');
  const bottomNav = inbox.element().closest('.restaurant-admin')!.querySelector<HTMLElement>('.restaurant-admin-nav');
  expect(conversation).not.toBeNull();
  expect(bottomNav).not.toBeNull();
  expect(conversation!.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
  expect(conversation!.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight);
  expect(getComputedStyle(bottomNav!).display).toBe('none');

  await inbox.getByRole('button', { name: 'Назад к списку чатов' }).click();
  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/mangal/orders');
  await expect.element(screen.getByRole('button', { name: 'Открыть чат заказа' })).toBeVisible();
});
