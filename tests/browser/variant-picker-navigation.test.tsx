import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { ExactBackProvider } from '../../src/shared/ExactBackNavigation';
import { ProductTile } from '../../src/features/catalog/ProductTile';
import { products } from '../../src/data/catalog';
import { useAuthStore, useCartStore } from '../../src/features/stores';
import '../../src/app/styles.css';

const settleFrames = () => new Promise<void>(resolve => {
  let remaining = 6;
  const frame = () => { if (--remaining <= 0) resolve(); else requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
});

test('opening and dismissing the actual variant panel keeps the scrolled catalog in place', async () => {
  await page.viewport(422, 618);
  useAuthStore.setState({ isAdmin: false });
  useCartStore.setState({ items: [] });
  const product = { ...products[0], id: 'variant-history', title: 'Выбор порции', choice_options: [{ name: 'Первая', price: 350 }, { name: 'Вторая', price: 400 }] };
  const screen = await render(<MemoryRouter initialEntries={['/mangal']}><ExactBackProvider>
    <div className="app-shell" style={{ paddingTop: 1200, minHeight: 3000 }}><ProductTile product={product} onOpen={vi.fn()} /></div>
  </ExactBackProvider></MemoryRouter>);
  await screen.getByRole('button', { name: 'Добавить Выбор порции' }).click();
  await expect.element(screen.getByRole('dialog', { name: 'Варианты Выбор порции' })).toBeVisible();
  await settleFrames();
  expect(window.scrollY).toBeGreaterThan(500);
  const openedAt = window.scrollY;
  screen.getByRole('button', { name: /^Первая/ }).element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await expect.poll(() => screen.getByRole('dialog').elements().length).toBe(0);
  await settleFrames();
  expect(Math.abs(window.scrollY - openedAt)).toBeLessThan(3);
  expect(useCartStore.getState().items).toHaveLength(0);
});
