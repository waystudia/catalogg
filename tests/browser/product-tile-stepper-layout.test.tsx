import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { Minus, Plus } from 'lucide-react';
import '../../src/app/styles.css';

test('selected product uses equal compact quantity buttons on mobile cards', async () => {
  try {
    const screen = await render(
      <article className="product-tile product-tile--compact">
        <div className="product-tile__image" />
        <div className="product-tile__body">
          <div>
            <h3>Coca-Cola</h3>
            <p>Классический освежающий вкус.</p>
          </div>
          <div className="product-tile__bottom">
            <strong>120 ₽</strong>
            <div className="product-tile__stepper has-quantity">
              <button
                className="product-tile__stepper-button product-tile__stepper-button--minus"
                type="button"
                aria-label="Уменьшить Coca-Cola"
              >
                <Minus />
              </button>
              <span className="product-tile__stepper-count">1</span>
              <button
                className="add-button product-tile__stepper-button"
                type="button"
                aria-label="Добавить Coca-Cola"
              >
                <Plus />
              </button>
            </div>
          </div>
        </div>
      </article>
    );

    const minus = screen.getByRole('button', { name: 'Уменьшить Coca-Cola' });
    const add = screen.getByRole('button', { name: 'Добавить Coca-Cola' });

    for (const width of [383, 720]) {
      await page.viewport(width, 628);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const minusBox = minus.element().getBoundingClientRect();
      const addBox = add.element().getBoundingClientRect();
      const bottomBox = document.querySelector<HTMLElement>('.product-tile__bottom')!.getBoundingClientRect();

      expect(minusBox.width).toBe(30);
      expect(addBox.width).toBe(minusBox.width);
      expect(addBox.height).toBe(minusBox.height);
      expect(addBox.right).toBeLessThanOrEqual(bottomBox.right);
    }

    await page.viewport(721, 628);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const desktopMinusBox = minus.element().getBoundingClientRect();
    const desktopAddBox = add.element().getBoundingClientRect();
    expect(desktopMinusBox.width).toBe(38);
    expect(desktopAddBox.width).toBe(desktopMinusBox.width);
  } finally {
    await page.viewport(414, 896);
  }
});
