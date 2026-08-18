import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { MemoryRouter } from 'react-router-dom';
import {
  MarketplaceBottomNavigation,
  MarketplaceProductGrid
} from '../../src/pages/client-platform/ClientMarketplaceHome';
import type { MarketplaceItem } from '../../src/features/client-platform/types';

const getMarketplaceItem = (overrides: Partial<MarketplaceItem> = {}): MarketplaceItem => ({
  id: 'burger',
  sourceType: 'dish',
  businessId: 'mangal-id',
  businessSlug: 'mangal',
  businessType: 'restaurant',
  businessName: 'Мангал',
  title: 'Чизбургер',
  subtitle: 'Сочная котлета и свежие овощи',
  imageUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'/%3E",
  price: 320,
  oldPrice: 400,
  discountPercent: 20,
  rating: 4.9,
  availability: true,
  estimatedTime: '30–40 мин',
  categoryId: 'hits',
  href: '/mangal',
  isPopular: true,
  isPromoted: false,
  promotionLabel: '',
  ...overrides
});

test('marketplace home keeps exactly two real product cards across a phone viewport', async () => {
  await page.viewport(390, 844);
  try {
    const screen = await render(
      <MemoryRouter>
        <MarketplaceProductGrid
          items={[
            getMarketplaceItem(),
            getMarketplaceItem({
              id: 'dates',
              sourceType: 'product',
              businessId: 'finik-id',
              businessSlug: 'finik',
              businessType: 'grocery',
              businessName: 'Финик',
              title: 'Финики Тунис',
              imageUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'/%3E",
              price: 470,
              oldPrice: null,
              discountPercent: null,
              href: '/finik'
            })
          ]}
          favoriteIds={[]}
          onToggleFavorite={() => undefined}
        />
      </MemoryRouter>
    );

    const grid = screen.getByRole('list', { name: 'Товары рядом' }).element();
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.marketplace-product-card'));
    const gridStyle = getComputedStyle(grid);
    const gridBox = grid.getBoundingClientRect();

    expect(gridStyle.gridTemplateColumns.split(' ')).toHaveLength(2);
    expect(cards).toHaveLength(2);
    expect(Math.abs(cards[0].getBoundingClientRect().width - cards[1].getBoundingClientRect().width)).toBeLessThanOrEqual(1);
    expect(cards[0].getBoundingClientRect().width).toBeLessThan(gridBox.width / 1.8);
    await expect.element(screen.getByText('Мангал')).toBeVisible();
    await expect.element(screen.getByText('Финик', { exact: true })).toBeVisible();
    await expect.element(screen.getByText('-20%')).toBeVisible();
    await expect.element(screen.getByRole('link', { name: 'Открыть Чизбургер в Мангал' })).toHaveAttribute('href', '/mangal');
  } finally {
    await page.viewport(414, 896);
  }
});

test('marketplace home fits a two-by-three product grid above the mobile navigation', async () => {
  await page.viewport(390, 844);
  try {
    const items = Array.from({ length: 6 }, (_, index) => getMarketplaceItem({
      id: `product-${index + 1}`,
      title: `Товар ${index + 1}`,
      oldPrice: null,
      discountPercent: null
    }));
    const screen = await render(
      <MemoryRouter>
        <MarketplaceProductGrid
          items={items}
          favoriteIds={[]}
          onToggleFavorite={() => undefined}
        />
        <MarketplaceBottomNavigation active="home" cartCount={0} />
      </MemoryRouter>
    );

    const grid = screen.getByRole('list', { name: 'Товары рядом' }).element();
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.marketplace-product-card'));
    const firstRowTop = cards[0].getBoundingClientRect().top;
    const thirdRowTop = cards[4].getBoundingClientRect().top;
    const thirdRowBottom = cards[5].getBoundingClientRect().bottom;
    const navigationTop = screen.getByRole('navigation', { name: 'Основная навигация' }).element().getBoundingClientRect().top;

    expect(cards).toHaveLength(6);
    expect(Math.abs(cards[0].getBoundingClientRect().top - cards[1].getBoundingClientRect().top)).toBeLessThanOrEqual(1);
    expect(thirdRowTop).toBeGreaterThan(firstRowTop);
    expect(Math.abs(cards[4].getBoundingClientRect().top - cards[5].getBoundingClientRect().top)).toBeLessThanOrEqual(1);
    expect(thirdRowBottom).toBeLessThanOrEqual(navigationTop);
    await expect.element(screen.getByRole('link', { name: 'Открыть Товар 6 в Мангал' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Добавить Товар 6 в избранное' })).toBeVisible();
  } finally {
    await page.viewport(414, 896);
  }
});

test('permanent client navigation opens Categories from the second tab', async () => {
  const screen = await render(
    <MemoryRouter>
      <MarketplaceBottomNavigation active="categories" cartCount={3} />
    </MemoryRouter>
  );

  await expect.element(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible();
  await expect.element(screen.getByRole('link', { name: /Категории/ })).toHaveAttribute('href', '/categories');
  await expect.element(screen.getByText('3', { exact: true })).toBeVisible();
  expect(screen.getByRole('link', { name: /Категории/ }).element().classList.contains('is-active')).toBe(true);
});
