import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RestaurantRouteRedirect } from '../../src/PwaRoutes';

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Текущий маршрут">{`${location.pathname}${location.search}`}</output>;
}

test('redirects the former grocery route to the shared public catalog without losing its section', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/r/finik/checkout?source=legacy']}>
      <Routes>
        <Route path="/r/:slug/*" element={<RestaurantRouteRedirect />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent('/finik/checkout?source=legacy');
});
