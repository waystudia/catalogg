import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { useBrowserBackedState } from '../../src/shared/useBrowserBackedState';

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
      <main>
        <h1>Список</h1>
        <label>Поиск<input aria-label="Поиск" value={state.query} onChange={(event) => history.replace((current) => ({ ...current, query: event.target.value }))} /></label>
        <button type="button" onClick={() => history.open((current) => ({ ...current, view: 'details' }))}>Открыть карточку</button>
      </main>
    );
  }

  if (state.view === 'details') {
    return (
      <main>
        <button type="button" aria-label="Назад" onClick={() => history.back()}>Назад</button>
        <h1>Карточка</h1>
        <label>Черновик<input aria-label="Черновик" value={state.draft} onChange={(event) => history.replace((current) => ({ ...current, draft: event.target.value }))} /></label>
        <button type="button" onClick={() => history.open((current) => ({ ...current, view: 'nested' }))}>Открыть вложенный экран</button>
      </main>
    );
  }

  return (
    <main>
      <button type="button" aria-label="Назад" onClick={() => history.back()}>Назад</button>
      <h1>Вложенный экран</h1>
    </main>
  );
}

test('visible and browser Back restore nested screens, filters and drafts in LIFO order', async () => {
  await page.viewport(372, 576);
  window.history.replaceState({}, '', window.location.href);
  const screen = await render(<ExactBackHarness scope="test:exact-back:lifo" />);

  await screen.getByLabelText('Поиск').fill('молоко');
  await screen.getByRole('button', { name: 'Открыть карточку' }).click();
  await screen.getByLabelText('Черновик').fill('не заменять товар');
  await screen.getByRole('button', { name: 'Открыть вложенный экран' }).click();

  await expect.element(screen.getByRole('heading', { name: 'Вложенный экран' })).toBeVisible();
  await screen.getByRole('button', { name: 'Назад' }).click();
  await expect.element(screen.getByRole('heading', { name: 'Карточка' })).toBeVisible();
  await expect.element(screen.getByLabelText('Черновик')).toHaveValue('не заменять товар');

  window.history.back();
  await expect.element(screen.getByRole('heading', { name: 'Список' })).toBeVisible();
  await expect.element(screen.getByLabelText('Поиск')).toHaveValue('молоко');
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
