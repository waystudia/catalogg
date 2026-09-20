import { describe, expect, it } from 'vitest';
import { selectMarketplaceFeed } from '../../src/features/client-platform/marketplaceFeed';
import type { ClientPlatformSnapshot } from '../../src/features/client-platform/types';

const snapshot = {
  cities: [{ id: 'grozny', name: 'Грозный' }],
  categories: [], reviews: [], restaurantCategories: [], paymentSettings: [], banners: [], contentPages: [],
  supportWhatsapp: '', supportPhone: '', supportEmail: '', supportTelegram: '', supportHours: '', supportHint: '',
  restaurants: [
    { id: 'a', slug: 'mangal', name: 'Мангал', businessType: 'restaurant', cityId: 'grozny', serviceCityIds: [], categorySlugs: [], rating: 5, deliveryTimeFrom: 20, deliveryTimeTo: 40 },
    { id: 'b', slug: 'sweet', name: 'Сладости', businessType: 'confectionery', cityId: 'grozny', serviceCityIds: [], categorySlugs: [], rating: 4.8, deliveryTimeFrom: 30, deliveryTimeTo: 50 }
  ],
  dishes: [
    { id: 'dish', restaurantSlug: 'mangal', categorySlug: 'food', name: 'Пиде', description: '', price: 350, imageUrl: '', tags: [], isPopular: true, stockCount: 5 },
    { id: 'cake', restaurantSlug: 'sweet', categorySlug: 'cakes', name: 'Торт', description: '', price: 1200, imageUrl: '', tags: [], isPopular: false, stockCount: 2 }
  ]
} as unknown as ClientPlatformSnapshot;

describe('marketplace client home', () => {
  it('shows products from different business types in one feed', () => {
    expect(selectMarketplaceFeed(snapshot, { cityId: 'grozny', businessType: 'all' }).map((item) => item.title)).toEqual(['Пиде', 'Торт']);
  });

  it('filters the feed by business type', () => {
    expect(selectMarketplaceFeed(snapshot, { cityId: 'grozny', businessType: 'confectionery' }).map((item) => item.title)).toEqual(['Торт']);
  });
});
