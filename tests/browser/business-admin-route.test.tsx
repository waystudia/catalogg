import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BusinessAdminRoute } from '../../src/PwaRoutes';

test('opens Finik in its grocery cabinet without changing it into a restaurant route', async () => {
  const screen = await render(
    <Suspense fallback={<p>Загрузка кабинета</p>}>
      <MemoryRouter initialEntries={['/business/finik']}>
        <Routes>
          <Route path="/business/:slug/*" element={<BusinessAdminRoute />} />
        </Routes>
      </MemoryRouter>
    </Suspense>
  );

  await expect.element(screen.getByRole('heading', { name: 'Главная' })).toBeVisible();
  await expect.element(screen.getByText('Управляйте магазином и отслеживайте заказы')).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Товары/ }).first()).toBeVisible();
});
