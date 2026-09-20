import type { BusinessType } from '../../shared/businessTerminology';
import { buildRestaurantPublicPath, filterRestaurantsWithCityFallback } from './clientPlatformLogic';
import type { ClientDish, ClientPlatformSnapshot, ClientRestaurant, MarketplaceItem } from './types';

export type MarketplaceBusinessFilter = 'all' | BusinessType;

const dishIsAvailable = (dish: ClientDish) => !dish.tags.includes('Нет в наличии');

const toMarketplaceItem = (dish: ClientDish, restaurant: ClientRestaurant): MarketplaceItem => ({
  id: dish.id,
  sourceType: restaurant.businessType === 'restaurant' || restaurant.businessType === 'coffee_shop' ? 'dish' : 'product',
  businessId: restaurant.id,
  businessSlug: restaurant.slug,
  businessType: restaurant.businessType ?? 'restaurant',
  businessName: restaurant.name,
  title: dish.name,
  subtitle: dish.description,
  imageUrl: dish.imageUrl,
  price: dish.price,
  rating: restaurant.rating,
  estimatedTime: `${restaurant.deliveryTimeFrom}–${restaurant.deliveryTimeTo} мин`,
  categoryId: dish.categorySlug,
  href: buildRestaurantPublicPath(restaurant),
  isPopular: dish.isPopular
});

const compareItems = (left: MarketplaceItem, right: MarketplaceItem) => {
  if (left.isPopular !== right.isPopular) return left.isPopular ? -1 : 1;
  return left.title.localeCompare(right.title, 'ru');
};

export function selectMarketplaceFeed(
  snapshot: ClientPlatformSnapshot,
  filters: { cityId: string; businessType: MarketplaceBusinessFilter }
) {
  const businesses = filterRestaurantsWithCityFallback(snapshot.restaurants, {
    cityId: filters.cityId,
    categorySlug: 'all',
    query: ''
  }).filter((business) => filters.businessType === 'all' || business.businessType === filters.businessType);
  const dishesByBusiness = new Map<string, ClientDish[]>();

  snapshot.dishes.filter(dishIsAvailable).forEach((dish) => {
    dishesByBusiness.set(dish.restaurantSlug, [...(dishesByBusiness.get(dish.restaurantSlug) ?? []), dish]);
  });

  const catalogs = businesses.map((business) =>
    (dishesByBusiness.get(business.slug) ?? []).map((dish) => toMarketplaceItem(dish, business)).sort(compareItems)
  );
  const result: MarketplaceItem[] = [];
  const longest = Math.max(0, ...catalogs.map((catalog) => catalog.length));
  for (let index = 0; index < longest; index += 1) {
    catalogs.forEach((catalog) => {
      if (catalog[index]) result.push(catalog[index]);
    });
  }
  return result;
}

export const getMarketplacePage = <T,>(items: T[], visibleCount = 20) => ({
  items: items.slice(0, visibleCount),
  hasMore: items.length > visibleCount
});
