import { Suspense } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PwaHomeRoute, PwaResumeTracker } from '../../src/PwaRoutes';

vi.mock('../../src/shared/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/shared/supabase')>()),
  supabase: null
}));

function LocationProbe() {
  return <output aria-label="Текущий маршрут">{useLocation().pathname}</output>;
}

function ClientProfileFixture() {
  return (
    <main>
      <h1>Профиль клиента</h1>
      <Link to="/">Главная</Link>
    </main>
  );
}

test('explicitly pressing Главная is not undone by a saved PWA resume path', async () => {
  window.localStorage.setItem('waycatalog:pwa-resume-path', '/profile/orders');

  const screen = await render(
    <MemoryRouter initialEntries={['/profile/orders']}>
      <PwaResumeTracker />
      <LocationProbe />
      <Suspense fallback={<p>Загрузка...</p>}>
        <Routes>
          <Route path="/" element={<PwaHomeRoute />} />
          <Route path="/profile/*" element={<ClientProfileFixture />} />
        </Routes>
      </Suspense>
    </MemoryRouter>
  );

  await screen.getByRole('link', { name: 'Главная' }).click();
  await new Promise((resolve) => window.setTimeout(resolve, 100));

  await expect.element(screen.getByLabelText('Текущий маршрут')).toHaveTextContent(/^\/$/);
});
