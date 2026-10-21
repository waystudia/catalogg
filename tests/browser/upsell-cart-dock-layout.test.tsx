import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import '../../src/app/styles.css';

test('upsell opens as an independently scrollable mobile page', async () => {
  try {
    await page.viewport(383, 628);

    const screen = await render(
      <div className="app-shell">
        <main className="flow-upsell-page" aria-label="Вы забыли напитки?">
          <section className="flow-upsell-page__content">
            <header className="flow-upsell-head">
              <span />
              <div><h2>Вы забыли напитки?</h2><p>Добавьте к заказу или сразу пропустите.</p></div>
              <button type="button">Пропустить</button>
            </header>
            <div className="flow-products" />
            <footer className="flow-upsell-footer"><span>Добавлено: 1</span><button type="button">Продолжить</button></footer>
          </section>
        </main>
      </div>
    );

    await expect.element(screen.getByText('Вы забыли напитки?')).toBeVisible();

    for (const width of [360, 383]) {
      await page.viewport(width, 628);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const pageElement = document.querySelector<HTMLElement>('.flow-upsell-page')!;
      const footer = document.querySelector<HTMLElement>('.flow-upsell-footer')!;
      const pageBox = pageElement.getBoundingClientRect();
      const footerBox = footer.getBoundingClientRect();

      expect(getComputedStyle(pageElement).overflowY).toBe('auto');
      expect(pageBox.top).toBe(0);
      expect(pageBox.bottom).toBe(628);
      expect(footerBox.bottom).toBeLessThanOrEqual(628);
    }
  } finally {
    await page.viewport(414, 896);
  }
});
