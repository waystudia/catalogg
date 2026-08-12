import type { ClientPlatformSnapshot } from '../features/client-platform/types';
import type { BusinessType } from '../shared/businessTerminology';

export type StorefrontContext = {
  catalogId: string;
  catalogSlug: string;
  businessType: BusinessType;
  hostname: string;
  brandName: string;
  shortName: string;
  logoUrl: string;
  icon192Url: string;
  icon512Url: string;
  themeColor: string;
  backgroundColor: string;
  storefrontMode: 'exclusive' | 'marketplace';
  poweredByWayYaam: true;
};

export const normalizeStorefrontHostname = (value: string) => {
  const input = value.trim();
  if (!input) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return input
      .replace(/^https?:\/\//i, '')
      .split(/[/:]/, 1)[0]
      .toLowerCase()
      .replace(/\.$/, '');
  }
};

export const shouldResolveCustomStorefront = (value: string) => {
  const hostname = normalizeStorefrontHostname(value);
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
  if (hostname === 'wayyaam.ru' || hostname === 'www.wayyaam.ru') return false;
  if (hostname === 'studia95.github.io' || hostname === 'waystudia.github.io') return false;
  return true;
};

export const scopeSnapshotToStorefront = (
  snapshot: ClientPlatformSnapshot,
  storefront: StorefrontContext
): ClientPlatformSnapshot => {
  if (storefront.storefrontMode !== 'exclusive') return snapshot;
  const catalogSlug = storefront.catalogSlug;
  const catalogId = storefront.catalogId;
  return {
    ...snapshot,
    restaurants: snapshot.restaurants.filter((item) => item.id === catalogId && item.slug === catalogSlug),
    restaurantCategories: snapshot.restaurantCategories.filter((item) => item.restaurantSlug === catalogSlug),
    dishes: snapshot.dishes.filter((item) => item.restaurantSlug === catalogSlug),
    reviews: snapshot.reviews.filter((item) => item.restaurantId === catalogId),
    paymentSettings: snapshot.paymentSettings.filter((item) => item.restaurantSlug === catalogSlug)
  };
};
