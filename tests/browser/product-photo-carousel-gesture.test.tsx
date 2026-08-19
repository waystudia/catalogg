import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import { ProductImageCarousel } from '../../src/features/catalog/ProductTile';
import type { Product } from '../../src/entities/models';
import '../../src/app/styles.css';

const product: Product = {
  id: 'photo-gesture-product',
  title: 'Блюдо с двумя фото',
  price: 400,
  description: '',
  image_url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',
  image_urls: [
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E%3C!--one--%3E',
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E%3C!--two--%3E'
  ],
  ingredients: '',
  weight: '',
  spicy_level: 0,
  serving: '',
  is_popular: false,
  is_new: false,
  is_hit: false,
  is_unlimited: true,
  stock_count: 10,
  category_id: 'test',
  pair_ids: []
};

test('horizontal touch intent changes the photo without giving the gallery vertical movement', async () => {
  await render(
    <div style={{ width: 240, height: 240 }}>
      <ProductImageCarousel product={product} />
    </div>
  );

  const track = document.querySelector<HTMLElement>('.product-photo-carousel__track')!;
  await new Promise((resolve) => window.setTimeout(resolve, 260));
  const initialScrollTop = track.scrollTop;
  const initialScrollLeft = track.scrollLeft;

  track.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true,
    pointerId: 7,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 190,
    clientY: 120
  }));
  track.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true,
    cancelable: true,
    pointerId: 7,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 60,
    clientY: 124
  }));
  track.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true,
    pointerId: 7,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 60,
    clientY: 124
  }));
  await new Promise((resolve) => requestAnimationFrame(resolve));

  expect(track.scrollLeft).toBeGreaterThan(initialScrollLeft);
  expect(track.scrollTop).toBe(initialScrollTop);
  expect(getComputedStyle(track).touchAction).toBe('pan-y');
});
