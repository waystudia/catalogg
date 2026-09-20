import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import '../../src/app/styles.css';

test('upsell reminder is a regular page and keeps the cart panel visible on mobile', async () => {
  try {
    await page.viewport(383, 628);

    const screen = await render(
      <div className="app-shell app-shell--food">
        <main className="flow-upsell-page" aria-label="Вы забыли напитки?">
          <section className="flow-upsell-page__content">
            <header className="flow-upsell-head">
              <span aria-hidden="true" />
              <div><h2>Вы забыли напитки?</h2><p>Добавьте к заказу или сразу пропустите.</p></div>
              <button type="button">Пропустить</button>
            </header>
            <div className="flow-products" />
          </section>
        </main>
        <div className="cart-dock">
          <div className="free-delivery-progress">До бесплатной доставки осталось 1 260 ₽</div>
          <div className="cart-bar">В корзине 2 товара</div>
        </div>
      </div>
    );

    await expect.element(screen.getByText('До бесплатной доставки осталось 1 260 ₽')).toBeVisible();
    await expect.element(screen.getByText('В корзине 2 товара')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Пропустить' })).toBeVisible();

    for (const width of [360, 383]) {
      await page.viewport(width, 628);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const upsellPage = screen.getByRole('main', { name: 'Вы забыли напитки?' }).element();
      const title = screen.getByText('Вы забыли напитки?').element();
      const dock = document.querySelector<HTMLElement>('.cart-dock')!;
      const pageStyle = getComputedStyle(upsellPage);
      const titleBox = title.getBoundingClientRect();
      const viewportCenter = width / 2;

      expect(pageStyle.position).toBe('relative');
      expect(document.querySelector('.modal-backdrop')).toBeNull();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(upsellPage.getBoundingClientRect().width).toBeLessThanOrEqual(width);
      expect(Math.abs((titleBox.left + titleBox.width / 2) - viewportCenter)).toBeLessThanOrEqual(12);
      expect(dock.getBoundingClientRect().bottom).toBeLessThanOrEqual(628);
    }
  } finally {
    await page.viewport(414, 896);
  }
});
