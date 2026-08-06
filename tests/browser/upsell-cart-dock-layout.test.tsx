import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import '../../src/app/styles.css';

test('upsell reminder keeps free delivery and cart panels visible on mobile', async () => {
  try {
    await page.viewport(383, 628);

    const screen = await render(
      <div className="app-shell">
        <div className="modal-backdrop flow-backdrop flow-backdrop--upsell">
          <section className="flow-modal" role="dialog" aria-label="Вы забыли напитки?">
            <h2>Вы забыли напитки?</h2>
            <div className="flow-products" />
            <button className="primary-wide" type="button">Выбрать «Напитки»</button>
            <button className="ghost-wide" type="button">Продолжить без выбора</button>
          </section>
        </div>
        <div className="cart-dock">
          <div className="free-delivery-progress">До бесплатной доставки осталось 1 260 ₽</div>
          <div className="cart-bar">В корзине 2 товара</div>
        </div>
      </div>
    );

    await expect.element(screen.getByText('До бесплатной доставки осталось 1 260 ₽')).toBeVisible();
    await expect.element(screen.getByText('В корзине 2 товара')).toBeVisible();

    for (const width of [360, 383]) {
      await page.viewport(width, 628);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const backdrop = document.querySelector<HTMLElement>('.flow-backdrop--upsell')!;
      const modal = screen.getByRole('dialog').element();
      const dock = document.querySelector<HTMLElement>('.cart-dock')!;
      const backdropZ = Number.parseInt(getComputedStyle(backdrop).zIndex, 10);
      const dockZ = Number.parseInt(getComputedStyle(dock).zIndex, 10);
      const modalBox = modal.getBoundingClientRect();
      const dockBox = dock.getBoundingClientRect();

      expect(dockZ).toBeGreaterThan(backdropZ);
      expect(modalBox.bottom).toBeLessThanOrEqual(dockBox.top - 8);
      expect(dockBox.bottom).toBeLessThanOrEqual(628);
    }
  } finally {
    await page.viewport(414, 896);
  }
});
