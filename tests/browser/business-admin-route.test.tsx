import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BusinessAdminRoute } from '../../src/PwaRoutes';

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Текущий маршрут">{`${location.pathname}${location.search}`}</output>;
}

test('opens Finik in the same established business cabinet as Mangal', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/business/finik']}>
      <Routes>
        <Route path="/business/:slug/*" element={<BusinessAdminRoute />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/finik/dashboard');
});

test('preserves the requested business slug when opening the established cabinet', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/business/my%20shop']}>
      <Routes>
        <Route path="/business/:slug/*" element={<BusinessAdminRoute />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/my%20shop/dashboard');
});
