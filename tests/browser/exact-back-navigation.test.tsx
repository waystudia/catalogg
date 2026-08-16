import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import { useBrowserBackedState } from '../../src/shared/useBrowserBackedState';
import { ExactScrollRestoration } from '../../src/shared/ExactScrollRestoration';

type FlowState = {
  view: 'list' | 'details' | 'nested';
  query: string;
  draft: string;
};

function ExactBackHarness({ scope }: { scope: string }) {
  const [state, history] = useBrowserBackedState<FlowState>(scope, {
    view: 'list',
    query: '',
    draft: ''
  });

  if (state.view === 'list') {
    return (
      <main style={{ minHeight: 1800 }}>
        <h1>Список</h1>
        <label>Поиск<input aria-label="Поиск" value={state.query} onChange={(event) => history.replace((current) => ({ ...current, query: event.target.value }))} /></label>
        <button type="button" onClick={() => history.open((current) => ({ ...current, view: 'details' }))}>Открыть карточку</button>
      </main>
    );
  }

  if (state.view === 'details') {
    return (
      <main style={{ minHeight: 1800 }}>
        <button type="button" aria-label="Назад" onClick={() => history.back()}>Назад</button>
        <h1>Карточка</h1>
        <label>Черновик<input aria-label="Черновик" value={state.draft} onChange={(event) => history.replace((current) => ({ ...current, draft: event.target.value }))} /></label>
        <button type="button" onClick={() => history.open((current) => ({ ...current, view: 'nested' }))}>Открыть вложенный экран</button>
      </main>
    );
  }

  return (
    <main style={{ minHeight: 1800 }}>
      <button type="button" aria-label="Назад" onClick={() => history.back()}>Назад</button>
      <h1>Вложенный экран</h1>
    </main>
  );
}

test('visible and browser Back restore nested screens, filters and drafts in LIFO order', async () => {
  await page.viewport(372, 576);
  window.history.replaceState({}, '', window.location.href);
  const screen = await render(<HashRouter><ExactScrollRestoration /><ExactBackHarness scope="test:exact-back:lifo" /></HashRouter>);

  await screen.getByLabelText('Поиск').fill('молоко');
  window.scrollTo(0, 500);
  await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  (screen.getByRole('button', { name: 'Открыть карточку' }).element() as HTMLButtonElement).click();
  await expect.poll(() => window.scrollY).toBe(0);
  await screen.getByLabelText('Черновик').fill('не заменять товар');
  window.dispatchEvent(new WheelEvent('wheel'));
  window.scrollTo(0, 300);
  await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  (screen.getByRole('button', { name: 'Открыть вложенный экран' }).element() as HTMLButtonElement).click();
  await expect.poll(() => window.scrollY).toBe(0);

  await expect.element(screen.getByRole('heading', { name: 'Вложенный экран' })).toBeVisible();
  await screen.getByRole('button', { name: 'Назад' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Карточка' })).toBeVisible();
  await expect.element(screen.getByLabelText('Черновик')).toHaveValue('не заменять товар');
  await expect.poll(() => window.scrollY).toBe(300);

  window.history.back();
  await expect.element(screen.getByRole('heading', { name: 'Список' })).toBeVisible();
  await expect.element(screen.getByLabelText('Поиск')).toHaveValue('молоко');
  await expect.poll(() => window.scrollY).toBe(500);
  expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
  const openButton = screen.getByRole('button', { name: 'Открыть карточку' }).element().getBoundingClientRect();
  expect(openButton.bottom).toBeLessThanOrEqual(window.innerHeight);
});

test('a nested direct entry without an origin falls back locally instead of leaving the app', async () => {
  await page.viewport(372, 576);
  window.history.replaceState({}, '', window.location.href);

  function DirectEntryHarness() {
    const [state, history] = useBrowserBackedState('test:exact-back:direct', { view: 'details' as 'list' | 'details' });
    return state.view === 'details'
      ? <button type="button" onClick={() => history.back(() => history.replace({ view: 'list' }))}>Назад</button>
      : <h1>Безопасный список</h1>;
  }

  const screen = await render(<DirectEntryHarness />);
  await screen.getByRole('button', { name: 'Назад' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Безопасный список' })).toBeVisible();
});

test('hash routes start at the top and Back survives late browser scroll restoration', async () => {
  await page.viewport(372, 576);
  window.history.replaceState({}, '', '#/source');

  const screen = await render(
    <HashRouter>
      <ExactScrollRestoration />
      <Routes>
        <Route path="/source" element={<main style={{ minHeight: 2200 }}><h1>Исходный экран</h1><Link to="/next" style={{ position: 'fixed', bottom: 0 }}>Открыть</Link></main>} />
        <Route path="/next" element={<main style={{ minHeight: 2200 }}><h1>Новый экран</h1></main>} />
      </Routes>
    </HashRouter>
  );
  window.scrollTo(0, 500);
  await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  await screen.getByRole('link', { name: 'Открыть' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Новый экран' })).toBeVisible();
  await expect.poll(() => window.scrollY).toBe(0);

  window.history.back();
  window.setTimeout(() => window.scrollTo(0, 900), 50);
  await expect.element(screen.getByRole('heading', { name: 'Исходный экран' })).toBeVisible();
  await expect.poll(() => window.scrollY, { timeout: 2_000 }).toBe(500);
});
