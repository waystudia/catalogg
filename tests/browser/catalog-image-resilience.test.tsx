import { expect, test } from 'vitest';
import { render } from 'vitest-browser-react';
import type { Product } from '../../src/entities/models';
import { ProductImageCarousel } from '../../src/features/catalog/ProductTile';
import { SafeImage } from '../../src/shared/SafeImage';

const tinyGif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'menu-product',
  title: 'Блюдо',
  price: 500,
  description: '',
  image_url: 'https://images.unsplash.com/photo-menu?auto=format&fit=crop&w=900&q=80',
  ingredients: '',
  weight: '',
  spicy_level: 0,
  serving: '',
  is_popular: false,
  is_new: false,
  is_hit: false,
  stock_count: 0,
  category_id: 'menu',
  pair_ids: [],
  ...overrides
});

test('catalog images are delivered through the Russian site with a mobile-sized source', async () => {
  const screen = await render(
    <SafeImage
      src="https://images.unsplash.com/photo-menu?auto=format&fit=crop&w=900&q=80"
      alt="Фото блюда"
      width={480}
      height={360}
    />
  );

  const image = screen.getByAltText('Фото блюда');
  await expect.element(image).toBeVisible();

  const source = new URL((image.element() as HTMLImageElement).src);
  expect(source.origin).toBe(window.location.origin);
  expect(source.pathname).toBe('/media/unsplash/photo-menu');
  expect(source.searchParams.get('w')).toBe('480');
  expect(source.searchParams.get('q')).toBe('72');
});

test('repeated base64 images share one compact browser URL instead of duplicating the payload in the DOM', async () => {
  const screen = await render(
    <>
      <SafeImage src={tinyGif} alt="Фото блюда 1" />
      <SafeImage src={tinyGif} alt="Фото блюда 2" />
    </>
  );

  const first = screen.getByAltText('Фото блюда 1');
  const second = screen.getByAltText('Фото блюда 2');
  await expect.element(first).toBeVisible();
  await expect.element(second).toBeVisible();

  const firstSource = (first.element() as HTMLImageElement).src;
  const secondSource = (second.element() as HTMLImageElement).src;
  expect(firstSource).toMatch(/^blob:/);
  expect(secondSource).toBe(firstSource);
});

test('menu cards request a 480 pixel source instead of decoding the original desktop photo', async () => {
  const screen = await render(<ProductImageCarousel product={product()} />);
  const image = screen.getByAltText('Блюдо');

  await expect.element(image).toBeVisible();
  const source = new URL((image.element() as HTMLImageElement).src);
  expect(source.searchParams.get('w')).toBe('480');
});

test('local images keep their source and default to deferred decoding', async () => {
  const screen = await render(<SafeImage src="/assets/logo/icon-192.png" alt="Логотип" />);
  const image = screen.getByAltText('Логотип');

  await expect.element(image).toBeVisible();
  await expect.element(image).toHaveAttribute('src', '/assets/logo/icon-192.png');
  await expect.element(image).toHaveAttribute('loading', 'lazy');
  await expect.element(image).toHaveAttribute('decoding', 'async');
});

test('trackpad gestures switch photos only on the horizontal axis and never scroll the photo surface', async () => {
  await render(<ProductImageCarousel product={product({ image_urls: ['/one.webp', '/two.webp', '/three.webp'] })} />);
  const surface = document.querySelector<HTMLElement>('.product-photo-carousel')!;
  const track = surface.querySelector<HTMLElement>('.product-photo-carousel__track')!;
  surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 70, deltaY: 140 }));
  expect(surface.dataset.activeImage).toBe('/one.webp');
  surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 90, deltaY: 2 }));
  await expect.poll(() => surface.dataset.activeImage).toBe('/two.webp');
  surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 90, deltaY: 2 }));
  expect(surface.dataset.activeImage).toBe('/two.webp');
  surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaX: 200 }));
  expect(surface.dataset.activeImage).toBe('/two.webp');
  expect(track.scrollTop).toBe(0);
  expect(track.scrollLeft).toBe(0);
});


test('a single photo does not intercept trackpad scrolling', async () => {
  await render(<ProductImageCarousel product={product({ image_url: '/only.webp' })} />);
  const surface = document.querySelector<HTMLElement>('.product-photo-carousel')!;
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 90, deltaY: 2 });
  surface.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(surface.dataset.activeImage).toBe('/only.webp');
});
