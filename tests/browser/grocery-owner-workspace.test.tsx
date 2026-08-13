import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import { RestaurantAdminShell } from '../../src/pages/catalog-admin/RestaurantAdminShell';
import '../../src/pages/catalog-admin/catalog-admin.css';
import type { CatalogAdminAccess } from '../../src/shared/api/catalogAdminApi';

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
  await expect.element(screen.getByRole('button', { name: 'Команда' }).first()).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Чаты' }).first()).toBeVisible();
});

test('places tenant chats between team and warehouse and opens the shared inbox', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantAdminShell access={groceryOwnerAccess()} routePath="chats" onRefresh={vi.fn()} onSignOut={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );

  const navigation = screen.getByRole('button', { name: 'Главная' }).first().element().closest('nav');
  expect(navigation).not.toBeNull();
  const labels = Array.from(navigation!.querySelectorAll('button span')).map((element) => element.textContent);
  expect(labels.indexOf('Команда')).toBeGreaterThan(labels.indexOf('Заказы'));
  expect(labels.indexOf('Чаты')).toBeGreaterThan(labels.indexOf('Команда'));
  expect(labels.indexOf('Чаты')).toBeLessThan(labels.indexOf('Склад'));
  await expect.element(screen.getByRole('heading', { name: 'Чаты по заказам' })).toBeVisible();
  await expect.element(screen.getByText('Чатов пока нет')).toBeVisible();
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
  await expect.element(screen.getByRole('heading', { name: 'Чаты по заказам' })).toBeVisible();
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

test('lets the grocery owner open tenant-scoped team management', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantAdminShell access={groceryOwnerAccess()} onRefresh={vi.fn()} onSignOut={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );

  await screen.getByRole('button', { name: 'Команда' }).first().click();
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
