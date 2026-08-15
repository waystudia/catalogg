import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { MemoryRouter } from 'react-router-dom';
import { ClientMarketplaceCategories } from '../../src/pages/client-platform/ClientMarketplaceCategories';
import { useClientPlatformStore } from '../../src/features/client-platform/store';
import type { ClientPlatformSnapshot, ClientRestaurant } from '../../src/features/client-platform/types';

const getBusiness = (overrides: Partial<ClientRestaurant> = {}): ClientRestaurant => ({
  id: 'mangal-id',
  slug: 'mangal',
  name: 'Мангал',
  description: 'Чеченская кухня',
  addressLine: 'Цоци-Юрт',
  lat: 43.23,
  lng: 46,
  cityId: 'tsotsi-yurt',
  serviceCityIds: [],
  categorySlugs: ['grill'],
  logoUrl: '',
  coverUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='400'/%3E",
  rating: 5,
  reviewCount: 12,
  minOrderAmount: 0,
  freeDeliveryFrom: 800,
  deliveryTimeFrom: 30,
  deliveryTimeTo: 40,
  deliveryProvider: 'platform',
  theme: {
    accentColor: '#5b3df4',
    backgroundColor: '#ffffff',
    buttonColor: '#5b3df4',
    buttonTextColor: '#ffffff',
    cardColor: '#ffffff',
    textColor: '#111827',
    mutedTextColor: '#667085'
  },
  orderTypes: ['delivery', 'pickup'],
  paymentMethods: ['cash'],
  publicPath: '/mangal',
  businessType: 'restaurant',
  ...overrides
});

const snapshot: ClientPlatformSnapshot = {
  cities: [{
    id: 'tsotsi-yurt',
    slug: 'tsotsi-yurt',
    name: 'Цоци-Юрт',
    region: 'Чеченская Республика',
    isActive: true
  }],
  categories: [],
  restaurants: [
    getBusiness(),
    getBusiness({ id: 'finik-id', slug: 'finik', name: 'Финик', publicPath: '/finik', businessType: 'grocery' }),
    getBusiness({ id: 'dolce-id', slug: 'dolce', name: 'Dolce', publicPath: '/dolce', businessType: 'confectionery' }),
    getBusiness({ id: 'coffee-id', slug: 'coffee', name: 'Кофейня', publicPath: '/coffee', businessType: 'coffee_shop' })
  ],
  reviews: [],
  restaurantCategories: [],
  dishes: [{
    id: 'dish',
    restaurantSlug: 'mangal',
    categorySlug: 'grill',
    name: 'Стейк',
    description: '',
    price: 800,
    oldPrice: 1000,
    imageUrl: '',
    tags: [],
    isPopular: true,
    stockCount: 1,
    stockQuantity: 1,
    isUnlimited: false,
    saleUnit: 'piece',
    quantityUnit: 'piece',
    priceBasisQuantity: 1,
    minimumQuantity: 1,
    quantityStep: 1,
    allowSubstitution: false,
    sku: '',
    barcode: ''
  }],
  paymentSettings: [],
  banners: [],
  contentPages: [],
  supportWhatsapp: '',
  supportPhone: '',
  supportEmail: '',
  supportTelegram: '',
  supportHours: '',
  supportHint: ''
};

test('Categories is a compact business discovery screen with a two-column category grid', async () => {
  await page.viewport(390, 844);
  useClientPlatformStore.setState({ selectedCityId: 'tsotsi-yurt', favoriteRestaurantIds: [] });

  const screen = await render(
    <MemoryRouter>
      <div className="client-platform platform-theme">
        <main className="platform-page">
          <ClientMarketplaceCategories
            snapshot={snapshot}
            isLoading={false}
            isError={false}
            onRetry={() => undefined}
          />
        </main>
      </div>
    </MemoryRouter>
  );

  await expect.element(screen.getByRole('link', { name: /Цоци-Юрт/ })).toHaveAttribute(
    'href',
    '/city?returnTo=%2Fcategories'
  );
  await expect.element(screen.getByRole('searchbox', { name: 'Что хотите заказать?' })).toBeVisible();
  await expect.element(screen.getByRole('button', { name: 'Найти бизнес' })).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Популярное рядом' })).toBeVisible();
  await expect.element(screen.getByRole('link', { name: /Открыть Мангал/ })).toHaveAttribute('href', '/mangal');
  await expect.element(screen.getByText('-20%')).toBeVisible();
  await expect.element(screen.getByRole('heading', { name: 'Категории бизнеса' })).toBeVisible();
  expect(screen.container.querySelector('h1')).toBeNull();

  const categoryGrid = screen.getByRole('list', { name: 'Категории бизнеса' }).element();
  const businessCarousel = screen.getByRole('list', { name: 'Популярные бизнесы рядом' }).element();
  const businessCards = businessCarousel.querySelectorAll<HTMLElement>('.business-discovery-card');
  expect(businessCards).toHaveLength(4);
  expect(businessCards[0].getBoundingClientRect().width).toBeLessThan(businessCarousel.clientWidth / 3);
  expect(getComputedStyle(categoryGrid).gridTemplateColumns.split(' ')).toHaveLength(2);
  expect(categoryGrid.querySelectorAll('.business-category-card')).toHaveLength(8);
  await expect.element(screen.getByRole('link', { name: /Рестораны/ })).toHaveAttribute(
    'href',
    '/restaurants?businessCategory=restaurants'
  );

  await screen.getByRole('button', { name: 'Фильтры' }).click();
  await expect.element(screen.getByRole('dialog', { name: 'Фильтры бизнеса' })).toBeVisible();
});

test('Categories renders horizontal and grid skeletons without a large spinner', async () => {
  const screen = await render(
    <MemoryRouter>
      <div className="client-platform platform-theme">
        <main className="platform-page">
          <ClientMarketplaceCategories
            snapshot={{ ...snapshot, restaurants: [] }}
            isLoading
            isError={false}
            onRetry={() => undefined}
          />
        </main>
      </div>
    </MemoryRouter>
  );

  await expect.element(screen.getByRole('status', { name: 'Загрузка популярных бизнесов' })).toBeVisible();
  await expect.element(screen.getByRole('status', { name: 'Загрузка категорий бизнеса' })).toBeVisible();
  expect(screen.container.querySelector('svg[aria-label="loading"]')).toBeNull();
});
