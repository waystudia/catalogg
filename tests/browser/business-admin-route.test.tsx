import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BusinessAdminRoute } from '../../src/PwaRoutes';

function LocationProbe() {
  return <output aria-label="Текущий маршрут">{useLocation().pathname}</output>;
}

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

  await expect.element(screen.getByText('Панель: магазин')).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Финик' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: /Товары/ }).first()).toBeVisible();
});

test('redirects a restaurant away from the retail workspace to its compact dashboard', async () => {
  const screen = await render(
    <Suspense fallback={<p>Загрузка кабинета</p>}>
      <MemoryRouter initialEntries={['/business/mangal']}>
        <Routes>
          <Route path="/business/:slug/*" element={<BusinessAdminRoute />} />
          <Route path="/:slug/dashboard" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </Suspense>
  );

  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/mangal/dashboard');
});
