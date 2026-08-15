import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { RestaurantAdminShell } from '../../src/pages/catalog-admin/RestaurantAdminShell';
import '../../src/pages/catalog-admin/catalog-admin.css';
import type { CatalogAdminAccess } from '../../src/shared/api/catalogAdminApi';
import type { RestaurantOrder } from '../../src/shared/api/restaurantOrdersApi';

vi.mock('../../src/features/shared-product-catalog/productPhotoBackground', () => ({
  preloadProductPhotoBackgroundRemoval: vi.fn().mockResolvedValue(undefined),
  removeProductPhotoBackground: vi.fn(async (file: File) => file)
}));

vi.mock('../../src/features/grocery-operations/browserBarcodeDecoder', () => ({
  BARCODE_CAMERA_CONSTRAINTS: { facingMode: { ideal: 'environment' } },
  optimizeBarcodeCameraStream: vi.fn().mockResolvedValue(undefined),
  preloadBrowserBarcodeDecoder: vi.fn().mockResolvedValue(undefined),
  startBrowserBarcodeDecoder: vi.fn().mockResolvedValue({ stop: vi.fn() })
}));

const groceryOwnerAccess = (): CatalogAdminAccess => ({
  hasSession: true,
  isMember: true,
  userId: 'owner-finiki',
  email: 'owner@finiki.example',
  role: 'owner',
  staffRole: null,
  firstLogin: false,
  consentGiven: true,
  subscriptionStatus: 'trial',
  subscriptionEndsAt: null,
  legalActivationStatus: 'draft',
  catalog: {
    id: '00000000-0000-4000-8000-000000000901',
    name: 'Финики',
    slug: 'finiki',
    status: 'draft',
    description: '',
    logoUrl: '',
    templateName: 'Продуктовый магазин',
    templateVersion: 1,
    businessType: 'grocery'
  }
});

const restaurantOwnerAccess = (): CatalogAdminAccess => ({
  ...groceryOwnerAccess(),
  userId: 'owner-mangal',
  email: 'owner@mangal.example',
  catalog: {
    ...groceryOwnerAccess().catalog!,
    id: '00000000-0000-4000-8000-000000000902',
    name: 'Мангал',
    slug: 'mangal',
    templateName: 'Ресторан',
    businessType: 'restaurant'
  }
});

const groceryOrder = (): RestaurantOrder => ({
  id: 'order-f0231',
  orderNumber: 'F0231',
  catalogId: 'finiki',
  isTestOrder: true,
  clientName: 'Дуквах',
  clientPhone: '+7 900 000-00-00',
  fulfillmentType: 'delivery',
  cabinLabel: '',
  deliveryAddress: 'Цоци-Юрт',
  deliveryLat: 43.2332786,
  deliveryLng: 46.0022241,
  clientAccuracyM: 12,
  deliveryCity: '',
  deliverySettlement: 'Цоци-Юрт',
  restaurantAddress: 'Цоци-Юрт',
  restaurantCity: '',
  restaurantLat: 43.23,
  restaurantLng: 46,
  comment: '',
  status: 'waiting_driver',
  paymentStatus: 'confirmed',
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
  subtotal: 345,
  deliveryFee: 0,
  courierPayout: 0,
  total: 345,
  createdAt: '2026-08-16T08:16:00.000Z',
  acceptedAt: '2026-08-16T08:17:00.000Z',
  estimatedReadyAt: null,
  readyAt: '2026-08-16T08:20:00.000Z',
  completedAt: null,
  cancellationReason: '',
  qrToken: null,
  qrExpiresAt: null,
  verificationCode: null,
  items: [{
    id: 'order-f0231-milk',
    productId: 'milk-32',
    title: 'Молоко 3,2% 1 л',
    quantity: 1,
    unitPrice: 110,
    lineTotal: 110,
    saleUnit: 'piece',
    quantityUnit: 'piece',
    requestedQuantity: 1,
    fulfilledQuantity: 1,
    fulfillmentState: 'picked'
  }]
});

test('shows a grocery owner store and product language in the shared workspace', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantAdminShell
          access={groceryOwnerAccess()}
          onRefresh={vi.fn()}
          onSignOut={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );

  await expect.element(screen.getByRole('button', { name: 'Товары' }).first()).toBeVisible();
  await expect.element(screen.getByText('Панель: магазин')).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: /^Финик/ })).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Финансы' })).toBeVisible();
  await expect.element(screen.getByText('Блюда')).not.toBeInTheDocument();
  await expect.element(screen.getByRole('button', { name: 'Чаты' }).first()).toBeVisible();
});

test('keeps only the five primary grocery actions in the mobile bottom navigation', async () => {
  await page.viewport(372, 576);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantAdminShell access={groceryOwnerAccess()} onRefresh={vi.fn()} onSignOut={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );

  const bottomNavigation = document.querySelector<HTMLElement>('.restaurant-admin-bottom-nav');
  expect(bottomNavigation).not.toBeNull();
  expect(Array.from(bottomNavigation!.querySelectorAll('button span'), (element) => element.textContent)).toEqual([
    'Главная',
    'Касса',
    'Чаты',
    'Товары',
    'Настройки'
  ]);
});

test('moves secondary grocery sections and import-export into settings', async () => {
  await page.viewport(372, 576);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantAdminShell access={groceryOwnerAccess()} routePath="settings" onRefresh={vi.fn()} onSignOut={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );

  const workspaceLinks = screen.getByRole('region', { name: 'Разделы магазина' });
  for (const label of ['База товаров', 'Поступление', 'Заказы', 'Команда', 'Склад', 'Витрина']) {
    await expect.element(workspaceLinks.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await expect.element(screen.getByRole('region', { name: 'Настройки магазина' }).getByRole('button', { name: 'Импорт / Экспорт', exact: true })).toBeVisible();
});

test('lays out the four grocery dashboard actions as two buttons per row', async () => {
  await page.viewport(372, 576);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantAdminShell access={groceryOwnerAccess()} onRefresh={vi.fn()} onSignOut={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );

  const actions = document.querySelector<HTMLElement>('.ra-quick-actions');
  expect(actions).not.toBeNull();
  const buttons = Array.from(actions!.querySelectorAll<HTMLButtonElement>('button'));
  expect(buttons.map((button) => button.textContent?.trim())).toEqual([
    'Добавить товар',
    'Новое поступление',
    'Открыть склад',
    'Настройки магазина'
  ]);
  await expect.element(screen.getByRole('button', { name: 'Импорт / Экспорт' })).not.toBeInTheDocument();
  const positions = buttons.map((button) => button.getBoundingClientRect());
  expect(positions[0].top).toBe(positions[1].top);
  expect(positions[2].top).toBe(positions[3].top);
  expect(positions[2].top).toBeGreaterThan(positions[0].top);
});

test('returns from an order opened in chat to that same conversation', async () => {
  window.localStorage.setItem('waycatalog:finiki:local-orders', JSON.stringify([groceryOrder()]));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RestaurantAdminShell access={groceryOwnerAccess()} routePath="chats" onRefresh={vi.fn()} onSignOut={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await screen.getByRole('button', { name: /Дуквах/ }).click();
    await screen.getByRole('button', { name: 'Открыть заказ F0231' }).click();
    await expect.element(screen.getByRole('heading', { name: 'Сборка заказа' })).toBeVisible();
    await screen.getByRole('button', { name: 'Назад к заказам' }).click();

    await expect.element(screen.getByRole('button', { name: 'Открыть заказ F0231' })).toBeVisible();
    await expect.element(screen.getByRole('region', { name: 'Чат заказа' })).toBeVisible();
  } finally {
    window.localStorage.removeItem('waycatalog:finiki:local-orders');
  }
});

test('opens the fast shared scanner immediately from the main add-product action', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantAdminShell access={groceryOwnerAccess()} onRefresh={vi.fn()} onSignOut={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );

  await screen.getByRole('button', { name: 'Добавить товар' }).click();
  await expect.element(screen.getByRole('dialog', { name: 'Сканер штрих-кода' })).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Новый товар' })).toBeVisible();
  await expect.element(screen.getByText('Весь кадр')).toBeVisible();
});

test('keeps the full desktop navigation while mobile uses the five primary actions', async () => {
  await page.viewport(1040, 576);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <RestaurantAdminShell access={groceryOwnerAccess()} routePath="chats" onRefresh={vi.fn()} onSignOut={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const navigation = screen.getByRole('navigation', { name: 'Разделы кабинета бизнеса' });
    const labels = Array.from(navigation.element().querySelectorAll('button span')).map((element) => element.textContent);
    expect(labels.indexOf('Команда')).toBeGreaterThan(labels.indexOf('Заказы'));
    expect(labels.indexOf('Чаты')).toBeGreaterThan(labels.indexOf('Команда'));
    expect(labels.indexOf('Чаты')).toBeLessThan(labels.indexOf('Склад'));
    await expect.element(screen.getByRole('heading', { name: 'Чаты' })).toBeVisible();
    await expect.element(screen.getByText('Чатов пока нет')).toBeVisible();
  } finally {
    await page.viewport(372, 576);
  }
});

test('uses the same order chat inbox for a restaurant without changing its business type', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantAdminShell access={restaurantOwnerAccess()} routePath="chats" onRefresh={vi.fn()} onSignOut={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );

  await expect.element(screen.getByText('Панель: ресторан')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Чаты' }).first()).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Чаты' })).toBeVisible();
});

test('routes only grocery orders into the compact store queue', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantAdminShell access={groceryOwnerAccess()} routePath="orders" onRefresh={vi.fn()} onSignOut={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );

  await expect.element(screen.getByRole('region', { name: 'Заказы магазина' })).toBeVisible();
  await expect.element(screen.getByRole('region', { name: 'Доска заказов' })).not.toBeInTheDocument();
});

test('keeps the existing restaurant order board outside the grocery workflow', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantAdminShell access={restaurantOwnerAccess()} routePath="orders" onRefresh={vi.fn()} onSignOut={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );

  await expect.element(screen.getByRole('region', { name: 'Доска заказов' })).toBeVisible();
  await expect.element(screen.getByRole('region', { name: 'Заказы магазина' })).not.toBeInTheDocument();
});

test('keeps the grocery POS workspace vertically scrollable at the reported desktop viewport', async () => {
  await page.viewport(1040, 576);
  const screen = await render(
    <main className="restaurant-admin-shell business-workspace-shell business-workspace-shell--pos" data-business-type="grocery">
      <aside className="restaurant-admin-sidebar business-workspace-sidebar" />
      <div className="restaurant-admin-main business-workspace-main">
        <section className="business-workspace-hero"><h1>Финик</h1></section>
        <section className="restaurant-admin-content business-workspace-content" aria-label="Рабочая область кассы">
          <div style={{ height: 1200 }}>Каталог товаров</div>
        </section>
      </div>
    </main>
  );

  const content = screen.getByRole('region', { name: 'Рабочая область кассы' }).element();
  expect(getComputedStyle(content).overflowY).toBe('auto');
  expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
  content.scrollTop = 160;
  expect(content.scrollTop).toBeGreaterThan(0);
});

test('keeps every business navigation item reachable at the reported short desktop viewport', async () => {
  await page.viewport(1040, 576);
  try {
    const screen = await render(
      <main className="restaurant-admin-shell business-workspace-shell">
        <aside className="restaurant-admin-sidebar business-workspace-sidebar">
          <div>WayYaam</div>
          <nav aria-label="Навигация бизнеса">
            {['Главная', 'Касса', 'Товары', 'База товаров', 'Поступление', 'Заказы', 'Команда', 'Чаты', 'Склад', 'Витрина', 'Настройки']
              .map((label) => <button className="restaurant-admin-nav__item" key={label} type="button"><span>{label}</span></button>)}
          </nav>
        </aside>
        <section>Заказы</section>
      </main>
    );

    const navigation = screen.getByRole('navigation', { name: 'Навигация бизнеса' }).element();
    expect(navigation.scrollHeight).toBeGreaterThan(navigation.clientHeight);
    expect(getComputedStyle(navigation).overflowY).toBe('auto');
    navigation.scrollTop = navigation.scrollHeight;
    expect(navigation.scrollTop).toBeGreaterThan(0);
  } finally {
    await page.viewport(414, 896);
  }
});

test('lets the grocery owner open tenant-scoped team management', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantAdminShell access={groceryOwnerAccess()} routePath="settings" onRefresh={vi.fn()} onSignOut={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );

  await screen.getByRole('region', { name: 'Разделы магазина' }).getByRole('button', { name: 'Команда' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Команда бизнеса' })).toBeVisible();
  await expect.element(screen.getByLabelText('E-mail сотрудника')).toBeVisible();
  await expect.element(screen.getByText(/роли действуют только внутри этого магазина/i)).toBeVisible();
});

test('gives a picker an order-only workspace without settings or finance', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantAdminShell
          access={{ ...groceryOwnerAccess(), userId: 'picker-finiki', role: 'viewer', staffRole: 'picker' }}
          onRefresh={vi.fn()}
          onSignOut={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );

  await expect.element(screen.getByRole('button', { name: 'Мои заказы' }).first()).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Чаты' }).first()).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Настройки' })).not.toBeInTheDocument();
  await expect.element(screen.getByText('Выручка')).not.toBeInTheDocument();
});
