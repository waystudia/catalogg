import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BUSINESS_CATEGORIES,
  getBusinessCategoryBySlug,
  selectBusinessesForDiscovery
} from './businessCategories';
import type { ClientRestaurant } from './types';

const business = (
  id: string,
  overrides: Partial<ClientRestaurant> = {}
): ClientRestaurant => ({
  id,
  slug: id,
  name: id,
  description: '',
  addressLine: '',
  lat: null,
  lng: null,
  cityId: 'city-a',
  serviceCityIds: [],
  categorySlugs: [],
  logoUrl: '',
  coverUrl: '',
  rating: 4.5,
  reviewCount: 0,
  minOrderAmount: 0,
  freeDeliveryFrom: 0,
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
  orderTypes: ['pickup', 'delivery'],
  paymentMethods: ['cash'],
  businessType: 'restaurant',
  ...overrides
});

describe('business categories registry', () => {
  it('keeps the first mobile release data-driven and ordered', () => {
    assert.deepEqual(
      BUSINESS_CATEGORIES.filter((category) => category.isActive).map((category) => category.slug),
      ['restaurants', 'grocery', 'confectionery', 'flowers', 'household', 'pharmacy', 'pet-supplies', 'gifts']
    );

    for (const category of BUSINESS_CATEGORIES) {
      assert.ok(category.id);
      assert.ok(category.name);
      assert.ok(category.description);
      assert.ok(category.icon);
      assert.ok(category.imageUrl);
      assert.match(category.accentColor, /^#[0-9a-f]{6}$/i);
    }
  });

  it('maps a category to the existing shared business types', () => {
    assert.deepEqual(getBusinessCategoryBySlug('restaurants')?.businessTypes, ['restaurant', 'coffee_shop']);
    assert.deepEqual(getBusinessCategoryBySlug('grocery')?.businessTypes, ['grocery']);
  });
});

describe('business discovery selection', () => {
  const businesses = [
    business('served-nearby', {
      cityId: 'city-b',
      serviceCityIds: ['selected-city'],
      rating: 4.9,
      reviewCount: 4
    }),
    business('primary-local', {
      cityId: 'selected-city',
      rating: 4.4,
      reviewCount: 2
    }),
    business('grocery-fallback', {
      cityId: 'city-c',
      businessType: 'grocery',
      rating: 5,
      reviewCount: 9
    })
  ];

  it('prioritizes a primary-city business, then a business serving the settlement', () => {
    assert.deepEqual(
      selectBusinessesForDiscovery(businesses, { cityId: 'selected-city' }).map((item) => item.id),
      ['primary-local', 'served-nearby']
    );
  });

  it('keeps the requested business category when using the populated fallback', () => {
    assert.deepEqual(
      selectBusinessesForDiscovery(businesses, {
        cityId: 'selected-city',
        businessTypes: ['grocery']
      }).map((item) => item.id),
      ['grocery-fallback']
    );
  });

  it('does not turn an unmatched search into every business', () => {
    assert.deepEqual(
      selectBusinessesForDiscovery(businesses, {
        cityId: 'selected-city',
        query: 'такого бизнеса нет'
      }),
      []
    );
  });

  it('applies delivery filters before ranking', () => {
    assert.deepEqual(
      selectBusinessesForDiscovery([
        business('pickup', { orderTypes: ['pickup'] }),
        business('delivery', { freeDeliveryFrom: 800 })
      ], {
        cityId: 'city-a',
        deliveryOnly: true,
        freeDeliveryOnly: true
      }).map((item) => item.id),
      ['delivery']
    );
  });
});
