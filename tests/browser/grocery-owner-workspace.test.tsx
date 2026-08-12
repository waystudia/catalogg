import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { RestaurantAdminShell } from '../../src/pages/catalog-admin/RestaurantAdminShell';
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
  await expect.element(screen.getByText(/управляйте магазином и отслеживайте заказы/i)).toBeVisible();
  await expect.element(screen.getByText('Блюда')).not.toBeInTheDocument();
  await expect.element(screen.getByRole('button', { name: 'Команда' }).first()).toBeVisible();
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
  await expect.element(screen.getByRole('button', { name: 'Настройки' })).not.toBeInTheDocument();
  await expect.element(screen.getByText('Выручка')).not.toBeInTheDocument();
});
