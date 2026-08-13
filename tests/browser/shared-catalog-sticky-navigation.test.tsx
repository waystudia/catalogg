import { expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { MemoryRouter } from 'react-router-dom';
import { CatalogScreen } from '../../src/app/App';
import type { Category, Product, Restaurant } from '../../src/entities/models';
import '../../src/app/styles.css';

class ControlledIntersectionObserver implements IntersectionObserver {
  static instances: ControlledIntersectionObserver[] = [];
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  readonly targets = new Set<Element>();

  constructor(readonly callback: IntersectionObserverCallback) {
    ControlledIntersectionObserver.instances.push(this);
  }

  disconnect() { this.targets.clear(); }
  observe(target: Element) { this.targets.add(target); }
  takeRecords() { return []; }
  unobserve(target: Element) { this.targets.delete(target); }
}

const restaurant: Restaurant = {
  id: 'finik',
  name: 'Финик',
  subtitle: 'Продуктовый магазин',
  logo_url: '',
  banner_url: '/assets/template-grocery/hero.webp',
  whatsapp: '',
  instagram_url: '',
  address: 'Цоци-Юрт',
  mapLink: '',
  lat: null,
  lng: null,
  business_type: 'grocery'
};

const categories: Category[] = [{
  id: 'drinks',
  slug: 'drinks',
  name: 'Напитки',
  image: '/assets/template-grocery/categories/drinks.webp',
  icon: 'cup-soda',
  kind: 'food'
}];

const products: Product[] = Array.from({ length: 12 }, (_, index) => ({
  id: `product-${index}`,
  title: index === 0 ? 'Pepsi 1,5 л' : `Товар ${index + 1}`,
  price: 175,
  description: 'Тестовая карточка продукта',
  image_url: '/assets/template-grocery/products/pepsi-15.webp',
  ingredients: '',
  weight: '1,5 л',
  spicy_level: 0,
  serving: '',
  is_popular: index < 2,
  is_new: false,
  is_hit: index < 2,
  is_unlimited: true,
  stock_count: 30,
  category_id: 'drinks',
  pair_ids: []
}));

test('keeps back, search, cart, share and categories visible after the catalog starts scrolling', async () => {
  await page.viewport(378, 576);
  const OriginalObserver = window.IntersectionObserver;
  ControlledIntersectionObserver.instances = [];
  window.IntersectionObserver = ControlledIntersectionObserver;

  try {
    const screen = await render(
      <MemoryRouter>
        <CatalogScreen
          restaurant={restaurant}
          categories={categories}
          products={products}
          initialCategory="all"
          onCart={vi.fn()}
          onShare={vi.fn()}
          onBack={vi.fn()}
          onOpenProduct={vi.fn()}
          onEditProduct={vi.fn()}
          onDeleteProduct={vi.fn()}
          onToggleProduct={vi.fn()}
          onStockChange={vi.fn()}
          reviewRating={5}
          reviewCount={0}
          onReviews={vi.fn()}
        />
      </MemoryRouter>
    );
    const nav = document.querySelector<HTMLElement>('.catalog-nav')!;
    const sentinel = document.querySelector<HTMLElement>('.catalog-nav-sentinel')!;
    const sentinelObserver = ControlledIntersectionObserver.instances.find((instance) => instance.targets.has(sentinel));

    expect(getComputedStyle(document.documentElement).overflowX).toBe('clip');
    expect(getComputedStyle(document.body).overflowX).toBe('clip');
    expect(getComputedStyle(nav).position).toBe('sticky');
    expect(getComputedStyle(nav).top).toBe('0px');
    expect(sentinelObserver).toBeDefined();

    sentinelObserver!.callback([{ isIntersecting: false, boundingClientRect: { top: -1 } } as IntersectionObserverEntry], sentinelObserver!);

    await expect.element(screen.getByRole('button', { name: 'Назад' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Поиск' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Корзина' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Поделиться' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Напитки' }).first()).toBeVisible();
    expect(nav.classList.contains('is-stuck')).toBe(true);
  } finally {
    window.IntersectionObserver = OriginalObserver;
    await page.viewport(414, 896);
  }
});
