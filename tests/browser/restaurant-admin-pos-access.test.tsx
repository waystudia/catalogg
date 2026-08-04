import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { cabins, categories, products, restaurant } from '../../src/data/catalog';
import { RestaurantAdminWorkspace } from '../../src/features/restaurant-admin/RestaurantAdminWorkspace';
import { defaultRestaurantDeliverySettings } from '../../src/features/restaurant-settings';
import { defaultPaymentSettings } from '../../src/shared/paymentSettings';
import '../../src/app/styles.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function LocationProbe() {
  return <output aria-label="Текущий маршрут">{useLocation().pathname}</output>;
}

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
  await page.viewport(1280, 900);
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
  expect(hero).not.toBeNull();
  expect(hero!.getBoundingClientRect().height).toBeLessThanOrEqual(110);

  await screen.getByRole('button', { name: 'Настройки' }).click();
  await screen.getByRole('button', { name: 'Зал' }).click();
  expect(onOpenSeating).toHaveBeenCalledOnce();
});
