import type { BusinessType } from '../../shared/businessTerminology';
import { buildRestaurantPublicPath, filterRestaurantsWithCityFallback } from './clientPlatformLogic';
import type {
  ClientDish,
  ClientPlatformSnapshot,
  ClientRestaurant,
  MarketplaceItem
} from './types';

export type MarketplaceBusinessFilter = 'all' | BusinessType;

type MarketplaceFeedFilters = {
  cityId: string;
  businessType: MarketplaceBusinessFilter;
};

const hasAvailableStock = (dish: ClientDish) => dish.isAvailable !== false
  && (dish.isUnlimited || dish.stockQuantity >= dish.minimumQuantity);

const getDiscount = (dish: ClientDish) => {
  if (dish.oldPrice == null || dish.oldPrice <= dish.price) {
    return { oldPrice: null, discountPercent: null };
  }

  return {
    oldPrice: dish.oldPrice,
    discountPercent: Math.round(((dish.oldPrice - dish.price) / dish.oldPrice) * 100)
  };
};

const toMarketplaceItem = (
  dish: ClientDish,
  restaurant: ClientRestaurant
): MarketplaceItem => {
  const businessType = restaurant.businessType ?? 'restaurant';
  const discount = getDiscount(dish);

  return {
    id: dish.id,
    sourceType: businessType === 'restaurant' || businessType === 'coffee_shop' ? 'dish' : 'product',
    businessId: restaurant.id,
    businessSlug: restaurant.slug,
    businessType,
    businessName: restaurant.name,
    title: dish.name,
    subtitle: dish.description,
    imageUrl: dish.imageUrl,
    price: dish.price,
    oldPrice: discount.oldPrice,
    discountPercent: discount.discountPercent,
    rating: restaurant.rating,
    availability: true,
    estimatedTime: `${restaurant.deliveryTimeFrom}–${restaurant.deliveryTimeTo} мин`,
    categoryId: dish.categorySlug,
    href: buildRestaurantPublicPath(restaurant),
    isPopular: dish.isPopular,
    isPromoted: false,
    promotionLabel: ''
  };
};

const compareCatalogItems = (left: MarketplaceItem, right: MarketplaceItem) => {
  if (left.isPopular !== right.isPopular) return left.isPopular ? -1 : 1;
  if (left.discountPercent !== right.discountPercent) {
    return (right.discountPercent ?? 0) - (left.discountPercent ?? 0);
  }
  return left.title.localeCompare(right.title, 'ru');
};

const interleaveSellerCatalogs = (catalogs: MarketplaceItem[][]) => {
  const items: MarketplaceItem[] = [];
  const longestCatalog = Math.max(0, ...catalogs.map((catalog) => catalog.length));

  for (let itemIndex = 0; itemIndex < longestCatalog; itemIndex += 1) {
    for (const catalog of catalogs) {
      const item = catalog[itemIndex];
      if (item) items.push(item);
    }
  }

  return items;
};

export const selectMarketplaceFeed = (
  snapshot: ClientPlatformSnapshot,
  filters: MarketplaceFeedFilters
): MarketplaceItem[] => {
  const eligibleRestaurants = filterRestaurantsWithCityFallback(snapshot.restaurants, {
    cityId: filters.cityId,
    categorySlug: 'all',
    query: ''
  }).filter((restaurant) => filters.businessType === 'all' || restaurant.businessType === filters.businessType);

  const dishesByRestaurant = new Map<string, ClientDish[]>();
  for (const dish of snapshot.dishes) {
    if (!hasAvailableStock(dish)) continue;
    const dishes = dishesByRestaurant.get(dish.restaurantSlug) ?? [];
    dishes.push(dish);
    dishesByRestaurant.set(dish.restaurantSlug, dishes);
  }

  const sellerCatalogs = eligibleRestaurants.map((restaurant) =>
    (dishesByRestaurant.get(restaurant.slug) ?? [])
      .map((dish) => toMarketplaceItem(dish, restaurant))
      .sort(compareCatalogItems)
  ).filter((items) => items.length > 0);

  return interleaveSellerCatalogs(sellerCatalogs);
};

export const getMarketplacePage = <T>(items: T[], visibleCount = 20) => ({
  items: items.slice(0, visibleCount),
  hasMore: items.length > visibleCount
});
