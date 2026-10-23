import { describe, expect, it } from 'vitest';
import type { ClientPlatformSnapshot } from '../../src/features/client-platform/types';
import { mergeClientPlatformProductImages } from '../../src/shared/api/clientPlatformApi';

const makeSnapshot = (): ClientPlatformSnapshot => ({
  cities: [],
  categories: [{ id: 'platform-pizza', slug: 'pizza', name: 'Пицца', imageUrl: '', isActive: true }],
  restaurants: [],
  reviews: [],
  restaurantCategories: [
    { id: 'category-1', restaurantSlug: 'mangal', slug: 'pizza', name: 'Пицца', imageUrl: '', sortOrder: 0 }
  ],
  dishes: [
    {
      id: 'dish-1', restaurantSlug: 'mangal', categorySlug: 'pizza', name: 'Маргарита', description: '',
      price: 500, imageUrl: '', tags: [], isPopular: true, stockCount: 10, stockQuantity: 10,
      isUnlimited: false, saleUnit: 'piece', quantityUnit: 'piece', priceBasisQuantity: 1,
      minimumQuantity: 1, quantityStep: 1, allowSubstitution: false, sku: '', barcode: '', weight: '500 г'
    }
  ],
  paymentSettings: [], banners: [], contentPages: [], supportWhatsapp: '', supportPhone: '',
  supportEmail: '', supportTelegram: '', supportHours: '', supportHint: ''
});

describe('progressive marketplace image loading', () => {
  it('adds deferred product images without changing the lightweight snapshot', () => {
    const snapshot = makeSnapshot();
    const hydrated = mergeClientPlatformProductImages(snapshot, { 'dish-1': '/products/margarita.webp' });
    expect(snapshot.dishes[0]?.imageUrl).toBe('');
    expect(hydrated.dishes[0]?.imageUrl).toBe('/products/margarita.webp');
    expect(hydrated.categories[0]?.imageUrl).toBe('/products/margarita.webp');
  });

  it('keeps existing category and dish images when a deferred image is unavailable', () => {
    const snapshot = makeSnapshot();
    snapshot.dishes[0]!.imageUrl = '/products/existing.webp';
    snapshot.categories[0]!.imageUrl = '/categories/pizza.webp';
    const hydrated = mergeClientPlatformProductImages(snapshot, {});
    expect(hydrated.dishes[0]?.imageUrl).toBe('/products/existing.webp');
    expect(hydrated.categories[0]?.imageUrl).toBe('/categories/pizza.webp');
  });

  it('uses the first non-empty dish image as the category fallback', () => {
    const snapshot = makeSnapshot();
    snapshot.dishes = [
      snapshot.dishes[0]!,
      { ...snapshot.dishes[0]!, id: 'dish-2', imageUrl: '/products/second.webp' },
      { ...snapshot.dishes[0]!, id: 'dish-3', imageUrl: '/products/third.webp' }
    ];
    const hydrated = mergeClientPlatformProductImages(snapshot, {});
    expect(hydrated.categories[0]?.imageUrl).toBe('/products/second.webp');
  });

  it('keeps an empty category placeholder until an image becomes available', () => {
    const hydrated = mergeClientPlatformProductImages(makeSnapshot(), {});
    expect(hydrated.categories[0]?.imageUrl).toBe('');
  });
});
