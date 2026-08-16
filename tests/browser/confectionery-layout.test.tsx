import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { Plus } from 'lucide-react';
import type { CSSProperties } from 'react';
import { SafeImage } from '../../src/shared/SafeImage';
import { confectioneryCategories } from '../../src/templates/confectionery';
import '../../src/app/styles.css';

const card = (id: string, title: string, image: string, price: string) => (
  <article className="product-tile product-tile--compact" key={id}>
    <div className="product-tile__image">
      <div className="product-photo-carousel">
        <div className="product-photo-carousel__track">
          <span className="product-photo-carousel__slide is-active">
            <SafeImage src={image} alt={title} fallbackKind="dessert" width={1200} height={900} loading="lazy" />
          </span>
        </div>
      </div>
    </div>
    <div className="product-tile__body">
      <div>
        <h3>{title}</h3>
        <p>Нежный десерт из натуральных ингредиентов.</p>
      </div>
      <div className="product-tile__bottom">
        <strong>{price}</strong>
        <div className="product-tile__stepper">
          <button className="add-button product-tile__stepper-button" type="button" aria-label={`Добавить ${title}`}>
            <Plus />
          </button>
        </div>
      </div>
    </div>
  </article>
);

test('confectionery cards, prices and horizontal categories stay usable at every target viewport', async () => {
  try {
    await render(
      <div
        className="app-shell app-shell--confectionery"
        style={{
          '--bg': '#fff8f2',
          '--card': '#ffffff',
          '--product-card': '#ffffff',
          '--product-card-text': '#382620',
          '--text': '#382620',
          '--muted': '#806d66',
          '--accent': '#b85f6b',
          '--accent-2': '#d9a66c',
          '--primary': '#b85f6b',
          '--radius': '18px',
          '--button-radius': '16px'
        } as CSSProperties}
      >
        <main className="screen">
          <div className="pills" aria-label="Категории">
            {confectioneryCategories.map((category) => <button className="pill" type="button" key={category.id}>{category.name}</button>)}
          </div>
          <div className="catalog-grid">
            {card('cake', 'Красный бархат', '/assets/templates/confectionery/products/red-velvet-cake.webp', '1 900 ₽/кг')}
            {card('placeholder', 'Морковный торт', '', '1 750 ₽/кг')}
            {card('set', 'Большой подарочный бокс', '/assets/templates/confectionery/products/large-gift-box.webp', 'от 2 900 ₽')}
          </div>
        </main>
      </div>
    );

    for (const [width, height] of [[360, 800], [375, 812], [390, 844], [430, 932], [768, 1024], [1440, 900]]) {
      await page.viewport(width, height);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const shell = document.querySelector<HTMLElement>('.app-shell')!;
      const tiles = [...document.querySelectorAll<HTMLElement>('.product-tile')];
      const price = document.querySelector<HTMLElement>('.product-tile strong')!;
      const add = document.querySelector<HTMLButtonElement>('.add-button')!;

      expect(shell.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
      expect(shell.getBoundingClientRect().right).toBeLessThanOrEqual(width);
      expect(tiles.every((tile) => tile.getBoundingClientRect().left >= 0 && tile.getBoundingClientRect().right <= width)).toBe(true);
      expect(price.getBoundingClientRect().width).toBeGreaterThan(0);
      expect(add.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(add.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }

    const placeholder = document.querySelector<HTMLElement>('.image-fallback--dessert')!;
    expect(placeholder.textContent).toContain('Фото скоро');
    expect(placeholder.getBoundingClientRect().height).toBeGreaterThan(0);
    const singlePhoto = document.querySelector<HTMLElement>('.product-photo-carousel')!;
    const singlePhotoTrack = document.querySelector<HTMLElement>('.product-photo-carousel__track')!;
    expect(getComputedStyle(singlePhoto).touchAction).toBe('pan-y');
    expect(getComputedStyle(singlePhotoTrack).touchAction).toBe('pan-y');
  } finally {
    await page.viewport(414, 896);
  }
});

test('swipeable dish photos allow both horizontal gallery swipes and vertical page scroll', async () => {
  const screen = await render(
    <div className="product-photo-carousel product-photo-carousel--swipeable">
      <div className="product-photo-carousel__track">
        <span className="product-photo-carousel__slide is-active"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" alt="Фото блюда" /></span>
        <span className="product-photo-carousel__slide"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" alt="Второе фото блюда" /></span>
      </div>
    </div>
  );

  const carousel = screen.getByRole('img', { name: 'Фото блюда', exact: true }).element().closest<HTMLElement>('.product-photo-carousel')!;
  const track = carousel.querySelector<HTMLElement>('.product-photo-carousel__track')!;
  expect(getComputedStyle(carousel).touchAction).toBe('pan-x pan-y');
  expect(getComputedStyle(track).touchAction).toBe('pan-x pan-y');
  expect(getComputedStyle(track).overflowX).toBe('auto');
});
