import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { RestaurantAdminShell } from '../../src/pages/catalog-admin/RestaurantAdminShell';
import type { CatalogAdminAccess } from '../../src/shared/api/catalogAdminApi';

const groceryOwnerAccess = (): CatalogAdminAccess => ({
  hasSession: true,
  isMember: true,
  email: 'owner@finiki.example',
  role: 'owner',
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
});
