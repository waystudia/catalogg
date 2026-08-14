import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { Minus, Plus } from 'lucide-react';
import '../../src/app/styles.css';

test('catalog product uses its photo as the card background with details and quantity controls at the bottom', async () => {
  await page.viewport(390, 844);
  try {
    const screen = await render(
      <article className="product-tile product-tile--compact">
        <div className="product-tile__image">
          <div className="product-photo-carousel">
            <div className="product-photo-carousel__track">
              <span className="product-photo-carousel__slide is-active">
                <img
                  src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='360'/%3E"
                  alt="Комбо шаурма"
                />
              </span>
            </div>
            <span className="product-photo-carousel__dots" aria-label="Фото 1 из 2"><i className="is-active" /><i /></span>
          </div>
          <b className="product-tile__quantity-badge">2</b>
        </div>
        <div className="product-tile__body">
          <div>
            <h3>Комбо шаурма</h3>
            <p>Шаурма с сочным мясом, овощами и картофелем.</p>
          </div>
          <div className="product-tile__bottom">
            <strong>400 ₽</strong>
            <div className="product-tile__stepper has-quantity">
              <button className="product-tile__stepper-button product-tile__stepper-button--minus" type="button" aria-label="Уменьшить Комбо шаурма"><Minus /></button>
              <span className="product-tile__stepper-count">2</span>
              <button className="add-button product-tile__stepper-button" type="button" aria-label="Добавить Комбо шаурма"><Plus /></button>
            </div>
          </div>
        </div>
      </article>
    );

    const card = screen.getByRole('article').element();
    const photo = screen.getByRole('img', { name: 'Комбо шаурма' }).element();
    const cardRect = card.getBoundingClientRect();
    const photoRect = photo.getBoundingClientRect();
    const visibleDetails = [
      screen.getByRole('heading', { name: 'Комбо шаурма' }).element(),
      screen.getByText('400 ₽', { exact: true }).element(),
      screen.getByRole('button', { name: 'Уменьшить Комбо шаурма' }).element(),
      screen.getByText('2', { exact: true }).last().element(),
      screen.getByRole('button', { name: 'Добавить Комбо шаурма' }).element(),
      screen.getByLabelText('Фото 1 из 2').element()
    ];

    expect(Math.abs(photoRect.left - cardRect.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(photoRect.top - cardRect.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(photoRect.right - cardRect.right)).toBeLessThanOrEqual(2);
    expect(Math.abs(photoRect.bottom - cardRect.bottom)).toBeLessThanOrEqual(2);
    for (const detail of visibleDetails) {
      const detailRect = detail.getBoundingClientRect();
      expect(detailRect.left).toBeGreaterThanOrEqual(photoRect.left);
      expect(detailRect.right).toBeLessThanOrEqual(photoRect.right);
      expect(detailRect.top).toBeGreaterThanOrEqual(photoRect.top);
      expect(detailRect.bottom).toBeLessThanOrEqual(photoRect.bottom);
    }
    expect(getComputedStyle(screen.getByRole('heading', { name: 'Комбо шаурма' }).element()).color).toBe('rgb(255, 255, 255)');
    await expect.element(screen.getByText('Шаурма с сочным мясом, овощами и картофелем.')).not.toBeVisible();
  } finally {
    await page.viewport(414, 896);
  }
});

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
