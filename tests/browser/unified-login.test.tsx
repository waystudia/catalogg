import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LegacyLoginRedirect } from '../../src/PwaRoutes';

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Текущий маршрут">{`${location.pathname}${location.search}`}</output>;
}

test('legacy standalone login opens the embedded profile login instead', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LegacyLoginRedirect />} />
        <Route path="/profile" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent(
    '/profile?login=1&returnTo=%2Fprofile'
  );
});

test('legacy login preserves a safe requested role route', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/login?returnTo=%2Fbusiness%2Ffinik']}>
      <Routes>
        <Route path="/login" element={<LegacyLoginRedirect />} />
        <Route path="/profile" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );

  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent(
    '/profile?login=1&returnTo=%2Fbusiness%2Ffinik'
  );
});
