import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { Suspense } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BusinessAdminRoute, LegacyBusinessAdminRedirect } from '../../src/PwaRoutes';

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

test('redirects the old restaurant dashboard URL to the same business workspace', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/mangal/dashboard']}>
      <Routes>
        <Route path="/:slug/:section" element={<LegacyBusinessAdminRedirect />} />
        <Route path="/business/:slug/*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/business/mangal');
});
