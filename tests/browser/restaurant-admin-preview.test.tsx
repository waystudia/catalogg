import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { RestaurantAdminPreview } from '../../src/features/restaurant-admin/RestaurantAdminPreview';
import '../../src/app/styles.css';

test('development preview switches between the unchanged restaurant workspace and the new grocery queue', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const screen = await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RestaurantAdminPreview />
      </MemoryRouter>
    </QueryClientProvider>
  );

  await expect.element(screen.getByRole('button', { name: 'Все' })).toBeVisible();
  await expect.element(screen.getByRole('region', { name: 'Заказы магазина' })).not.toBeInTheDocument();

  await screen.getByRole('button', { name: 'Продуктовый магазин' }).click();
  await expect.element(screen.getByRole('region', { name: 'Заказы магазина' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Все' })).not.toBeInTheDocument();
});
