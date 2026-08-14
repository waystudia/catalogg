import { describe, expect, it } from 'vitest';
import {
  getMarketplacePage,
  selectMarketplaceFeed
} from '../../src/features/client-platform/marketplaceFeed';
import type {
  ClientDish,
  ClientPlatformSnapshot,
  ClientRestaurant
} from '../../src/features/client-platform/types';

const getRestaurant = (overrides: Partial<ClientRestaurant> = {}): ClientRestaurant => ({
  id: 'restaurant-1',
  slug: 'mangal',
  name: 'Мангал',
  description: 'Чеченская кухня',
  addressLine: 'Цоци-Юрт',
  lat: 43.24,
  lng: 46.0,
  cityId: 'tsotsi-yurt',
  serviceCityIds: [],
  categorySlugs: ['hits'],
  logoUrl: '/mangal-logo.jpg',
  coverUrl: '/mangal-cover.jpg',
  rating: 4.9,
  minOrderAmount: 0,
  freeDeliveryFrom: 1500,
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
  reviewCount: 18,
  ...overrides
});

const getDish = (overrides: Partial<ClientDish> = {}): ClientDish => ({
  id: 'dish-1',
  restaurantSlug: 'mangal',
  categorySlug: 'hits',
  name: 'Чизбургер',
  description: 'Сочная котлета и свежие овощи',
  price: 320,
  oldPrice: null,
  imageUrl: '/burger.jpg',
  tags: [],
  isPopular: false,
  isAvailable: true,
  stockCount: 20,
  stockQuantity: 20,
  isUnlimited: false,
  saleUnit: 'piece',
  quantityUnit: 'piece',
  priceBasisQuantity: 1,
  minimumQuantity: 1,
  quantityStep: 1,
  allowSubstitution: false,
  sku: 'BURGER-1',
  barcode: '',
  weight: '320 г',
  ...overrides
});

const getSnapshot = ({
  restaurants = [],
  dishes = []
}: {
  restaurants?: ClientRestaurant[];
  dishes?: ClientDish[];
} = {}): ClientPlatformSnapshot => ({
  cities: [],
  categories: [],
  restaurants,
  reviews: [],
  restaurantCategories: [],
  dishes,
  paymentSettings: [],
  banners: [],
  contentPages: [],
  supportWhatsapp: '',
  supportPhone: '',
  supportEmail: '',
  supportTelegram: '',
  supportHours: '',
  supportHint: ''
});

describe('client marketplace feed', () => {
  it('normalizes only available persisted items from businesses serving the selected settlement', () => {
    const grocery = getRestaurant({
      id: 'grocery-1',
      slug: 'finik',
      name: 'Финик',
      cityId: 'kurchaloy',
      serviceCityIds: ['tsotsi-yurt'],
      businessType: 'grocery',
      publicPath: '/finik',
      rating: 4.8,
      deliveryTimeFrom: 20,
      deliveryTimeTo: 30
    });
    const distantPharmacy = getRestaurant({
      id: 'pharmacy-1',
      slug: 'apteka',
      name: 'Аптека рядом',
      cityId: 'grozny',
      businessType: 'pharmacy',
      publicPath: '/apteka'
    });
    const snapshot = getSnapshot({
      restaurants: [getRestaurant(), grocery, distantPharmacy],
      dishes: [
        getDish({ id: 'burger', oldPrice: 400, isPopular: true }),
        getDish({ id: 'dates', restaurantSlug: 'finik', name: 'Финики Тунис', price: 470, imageUrl: '/dates.jpg' }),
        getDish({ id: 'sold-out', restaurantSlug: 'finik', name: 'Макароны', isAvailable: false }),
        getDish({ id: 'medicine', restaurantSlug: 'apteka', name: 'Витамины' })
      ]
    });

    expect(selectMarketplaceFeed(snapshot, { cityId: 'tsotsi-yurt', businessType: 'all' })).toEqual([
      expect.objectContaining({
        id: 'burger',
        sourceType: 'dish',
        businessId: 'restaurant-1',
        businessName: 'Мангал',
        businessType: 'restaurant',
        title: 'Чизбургер',
        price: 320,
        oldPrice: 400,
        discountPercent: 20,
        estimatedTime: '30–40 мин',
        href: '/mangal'
      }),
      expect.objectContaining({
        id: 'dates',
        sourceType: 'product',
        businessId: 'grocery-1',
        businessName: 'Финик',
        businessType: 'grocery',
        title: 'Финики Тунис',
        oldPrice: null,
        discountPercent: null,
        availability: true,
        isPromoted: false,
        promotionLabel: '',
        href: '/finik'
      })
    ]);
  });

  it('keeps the marketplace populated from existing businesses when a settlement has no direct matches', () => {
    const snapshot = getSnapshot({
      restaurants: [
        getRestaurant(),
        getRestaurant({ id: 'pharmacy-1', slug: 'apteka', businessType: 'pharmacy', publicPath: '/apteka' })
      ],
      dishes: [
        getDish(),
        getDish({ id: 'medicine', restaurantSlug: 'apteka', name: 'Витамины' })
      ]
    });

    expect(selectMarketplaceFeed(snapshot, { cityId: 'unknown-settlement', businessType: 'all' }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'dish-1' }),
        expect.objectContaining({ id: 'medicine', businessType: 'pharmacy' })
      ]));
  });

  it('filters the normalized feed by an existing business type', () => {
    const snapshot = getSnapshot({
      restaurants: [
        getRestaurant(),
        getRestaurant({ id: 'grocery-1', slug: 'finik', businessType: 'grocery', publicPath: '/finik' })
      ],
      dishes: [getDish(), getDish({ id: 'dates', restaurantSlug: 'finik' })]
    });

    expect(selectMarketplaceFeed(snapshot, { cityId: 'tsotsi-yurt', businessType: 'grocery' }))
      .toEqual([expect.objectContaining({ id: 'dates', businessType: 'grocery' })]);
  });

  it('interleaves sellers while keeping popular items first inside each seller catalog', () => {
    const snapshot = getSnapshot({
      restaurants: [
        getRestaurant(),
        getRestaurant({ id: 'grocery-1', slug: 'finik', name: 'Финик', businessType: 'grocery', publicPath: '/finik' })
      ],
      dishes: [
        getDish({ id: 'mangal-regular', name: 'Обычное блюдо' }),
        getDish({ id: 'mangal-hit', name: 'Хит Мангал', isPopular: true }),
        getDish({ id: 'finik-regular', restaurantSlug: 'finik', name: 'Обычный товар' }),
        getDish({ id: 'finik-hit', restaurantSlug: 'finik', name: 'Хит Финик', isPopular: true })
      ]
    });

    expect(selectMarketplaceFeed(snapshot, { cityId: 'tsotsi-yurt', businessType: 'all' }).map((item) => item.id))
      .toEqual(['mangal-hit', 'finik-hit', 'mangal-regular', 'finik-regular']);
  });

  it('uses exact stock boundaries and still includes unlimited catalog items', () => {
    const snapshot = getSnapshot({
      restaurants: [getRestaurant()],
      dishes: [
        getDish({ id: 'exact-stock', stockQuantity: 3, minimumQuantity: 3 }),
        getDish({ id: 'below-stock', stockQuantity: 2, minimumQuantity: 3 }),
        getDish({ id: 'unlimited', stockQuantity: 0, minimumQuantity: 3, isUnlimited: true })
      ]
    });

    expect(selectMarketplaceFeed(snapshot, { cityId: 'tsotsi-yurt', businessType: 'all' }).map((item) => item.id))
      .toEqual(['exact-stock', 'unlimited']);
  });

  it('keeps invalid old prices out and recognizes coffee shop dishes', () => {
    const coffeeShop = getRestaurant({
      id: 'coffee-1',
      slug: 'coffee',
      name: 'Кофейня',
      businessType: 'coffee_shop',
      publicPath: '/coffee'
    });
    const snapshot = getSnapshot({
      restaurants: [coffeeShop],
      dishes: [
        getDish({ id: 'equal-price', restaurantSlug: 'coffee', oldPrice: 320 }),
        getDish({ id: 'missing-price', restaurantSlug: 'coffee', oldPrice: undefined })
      ]
    });

    expect(selectMarketplaceFeed(snapshot, { cityId: 'tsotsi-yurt', businessType: 'all' })).toEqual([
      expect.objectContaining({ id: 'equal-price', sourceType: 'dish', oldPrice: null, discountPercent: null }),
      expect.objectContaining({ id: 'missing-price', sourceType: 'dish', oldPrice: null, discountPercent: null })
    ]);
  });

  it('orders a seller catalog by popularity, discount and then title before interleaving uneven catalogs', () => {
    const snapshot = getSnapshot({
      restaurants: [
        getRestaurant(),
        getRestaurant({ id: 'grocery-1', slug: 'finik', name: 'Финик', businessType: 'grocery', publicPath: '/finik' }),
        getRestaurant({ id: 'empty-1', slug: 'empty', name: 'Без товаров', businessType: 'gifts', publicPath: '/empty' })
      ],
      dishes: [
        getDish({ id: 'zeta', name: 'Яблоко' }),
        getDish({ id: 'alpha', name: 'Абрикос' }),
        getDish({ id: 'discount-10', name: 'Скидка 10', price: 90, oldPrice: 100 }),
        getDish({ id: 'discount-20', name: 'Скидка 20', price: 80, oldPrice: 100 }),
        getDish({ id: 'popular', name: 'Хит', isPopular: true }),
        getDish({ id: 'finik-only', restaurantSlug: 'finik', name: 'Финики' })
      ]
    });

    expect(selectMarketplaceFeed(snapshot, { cityId: 'tsotsi-yurt', businessType: 'all' }).map((item) => item.id))
      .toEqual(['popular', 'finik-only', 'discount-20', 'discount-10', 'alpha', 'zeta']);
  });

  it('returns an empty feed when no published seller items are available', () => {
    expect(selectMarketplaceFeed(getSnapshot(), { cityId: 'tsotsi-yurt', businessType: 'all' })).toEqual([]);
  });

  it('returns an exact initial page and reports whether more persisted items remain', () => {
    const items = Array.from({ length: 21 }, (_, index) => ({ id: `item-${index}` }));

    expect(getMarketplacePage(items, 20)).toEqual({
      items: items.slice(0, 20),
      hasMore: true
    });
    expect(getMarketplacePage(items, 21)).toEqual({
      items,
      hasMore: false
    });
  });
});
