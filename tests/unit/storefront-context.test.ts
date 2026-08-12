import { describe, expect, it } from 'vitest';
import type { ClientPlatformSnapshot } from '../../src/features/client-platform/types';
import {
  normalizeStorefrontHostname,
  scopeSnapshotToStorefront,
  shouldResolveCustomStorefront,
  type StorefrontContext
} from '../../src/entities/storefront';

const storefront: StorefrontContext = {
  catalogId: 'catalog-finiki',
  catalogSlug: 'finiki',
  businessType: 'grocery',
  hostname: 'finiki.example',
  brandName: 'Финики',
  shortName: 'Финики',
  logoUrl: '/finiki-logo.png',
  icon192Url: '/finiki-192.png',
  icon512Url: '/finiki-512.png',
  themeColor: '#8a4b22',
  backgroundColor: '#fffaf4',
  storefrontMode: 'exclusive',
  poweredByWayYaam: true
};

const snapshot = {
  restaurants: [
    { id: 'catalog-finiki', slug: 'finiki' },
    { id: 'catalog-mangal', slug: 'mangal' }
  ],
  restaurantCategories: [
    { restaurantSlug: 'finiki' },
    { restaurantSlug: 'mangal' }
  ],
  dishes: [
    { restaurantSlug: 'finiki' },
    { restaurantSlug: 'mangal' }
  ],
  reviews: [
    { restaurantId: 'catalog-finiki' },
    { restaurantId: 'catalog-mangal' }
  ],
  paymentSettings: [
    { restaurantSlug: 'finiki' },
    { restaurantSlug: 'mangal' }
  ],
  cities: [], categories: [], banners: [], contentPages: [],
  supportWhatsapp: '', supportPhone: '', supportEmail: '', supportTelegram: '', supportHours: '', supportHint: ''
} as unknown as ClientPlatformSnapshot;

describe('white-label storefront context', () => {
  it('normalizes hostnames without accepting paths, schemes, ports, or trailing dots', () => {
    expect(normalizeStorefrontHostname(' HTTPS://Finiki.Example:443/path ')).toBe('finiki.example');
    expect(normalizeStorefrontHostname('finiki.example.')).toBe('finiki.example');
  });

  it('never treats WayYaam, GitHub Pages, or local development as a custom storefront', () => {
    expect(shouldResolveCustomStorefront('wayyaam.ru')).toBe(false);
    expect(shouldResolveCustomStorefront('www.wayyaam.ru')).toBe(false);
    expect(shouldResolveCustomStorefront('studia95.github.io')).toBe(false);
    expect(shouldResolveCustomStorefront('waystudia.github.io')).toBe(false);
    expect(shouldResolveCustomStorefront('localhost:5173')).toBe(false);
    expect(shouldResolveCustomStorefront('finiki.example')).toBe(true);
  });

  it('removes every other merchant while retaining shared WayYaam campaigns and support', () => {
    const scoped = scopeSnapshotToStorefront(snapshot, storefront);
    expect(scoped.restaurants.map((item) => item.slug)).toEqual(['finiki']);
    expect(scoped.restaurantCategories).toHaveLength(1);
    expect(scoped.dishes).toHaveLength(1);
    expect(scoped.reviews).toHaveLength(1);
    expect(scoped.paymentSettings).toHaveLength(1);
    expect(scoped.banners).toBe(snapshot.banners);
  });
});
