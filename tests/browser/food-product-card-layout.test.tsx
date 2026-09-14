import { expect, test } from 'vitest';
import type { CSSProperties } from 'react';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { Minus, Plus } from 'lucide-react';
import '../../src/app/styles.css';

test('food menu shows two 16:9 photo cards per row with a visible add action on mobile', async () => {
  try {
    const screen = await render(
      <div className="app-shell app-shell--food" style={{ '--accent': '#ffb533' } as CSSProperties}>
        <main className="screen">
          <div className="catalog-grid">
            <article className="product-tile product-tile--large">
              <div className="product-tile__image">
                <div className="product-photo-carousel">
                  <div className="product-photo-carousel__track">
                    <span className="product-photo-carousel__slide is-active"><img src="/vite.svg" alt="Комбо" /></span>
                  </div>
                </div>
              </div>
              <div className="product-tile__body">
                <div><h3>Комбо</h3><p>Бургер и картошка</p></div>
                <div className="product-tile__bottom">
                  <strong>700 ₽</strong>
                  <div className="product-tile__stepper has-quantity">
                    <button className="product-tile__stepper-button product-tile__stepper-button--minus" type="button" aria-label="Уменьшить Комбо"><Minus /></button>
                    <span className="product-tile__stepper-count">1</span>
                    <button className="add-button product-tile__stepper-button" type="button" aria-label="Добавить Комбо"><Plus /></button>
                  </div>
                </div>
              </div>
            </article>
            <article className="product-tile product-tile--large" aria-label="Вторая карточка" />
          </div>
        </main>
      </div>
    );

    await page.viewport(369, 608);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => window.setTimeout(resolve, 260));

    const tile = document.querySelector<HTMLElement>('.product-tile')!.getBoundingClientRect();
    const photo = document.querySelector<HTMLElement>('.product-tile__image')!.getBoundingClientRect();
    const add = screen.getByRole('button', { name: 'Добавить Комбо' }).element().getBoundingClientRect();
    const minus = screen.getByRole('button', { name: 'Уменьшить Комбо' }).element().getBoundingClientRect();

    const grid = document.querySelector<HTMLElement>('.catalog-grid')!.getBoundingClientRect();
    const tiles = [...document.querySelectorAll<HTMLElement>('.product-tile')];
    const secondTile = tiles[1].getBoundingClientRect();

    expect(tile.width).toBeGreaterThan(140);
    expect(tile.width).toBeLessThan(180);
    expect(secondTile.top).toBeCloseTo(tile.top, 0);
    expect(secondTile.right).toBeLessThanOrEqual(grid.right);
    const body = document.querySelector<HTMLElement>('.product-tile__body')!.getBoundingClientRect();
    expect(Math.abs(photo.width / photo.height - 16 / 9)).toBeLessThan(0.08);
    expect(Math.abs(photo.width - tile.width)).toBeLessThanOrEqual(2);
    expect(body.top).toBeGreaterThanOrEqual(photo.bottom - 1);
    expect(body.bottom).toBeLessThanOrEqual(tile.bottom + 1);
    expect(add.width).toBeGreaterThanOrEqual(28);
    expect(add.height).toBeGreaterThanOrEqual(28);
    expect(add.height).toBe(minus.height);
    expect(body.height).toBeLessThanOrEqual(72);
    expect(getComputedStyle(document.querySelector<HTMLElement>('.product-tile__stepper-count')!).animationName).toBe('food-stepper-reveal');
    expect(getComputedStyle(screen.getByRole('button', { name: 'Добавить Комбо' }).element()).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  } finally {
    await page.viewport(414, 896);
  }
});
