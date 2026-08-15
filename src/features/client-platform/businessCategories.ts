import type { BusinessType } from '../../shared/businessRegistry';
import { getBusinessTypeDefinition } from '../../shared/businessRegistry';
import type { ClientRestaurant } from './types';

export type BusinessCategoryIcon =
  | 'utensils'
  | 'basket'
  | 'cake'
  | 'flower'
  | 'home'
  | 'pharmacy'
  | 'pet'
  | 'gift';

export type BusinessCategory = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly icon: BusinessCategoryIcon;
  readonly imageUrl: string;
  readonly accentColor: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly businessTypes: readonly BusinessType[];
};

const BUSINESS_CATEGORY_SEEDS = [
  {
    id: 'business-category-restaurants',
    slug: 'restaurants',
    name: 'Рестораны',
    description: 'Еда и напитки',
    icon: 'utensils',
    imageUrl: '/assets/mangal-demo/cabins/main-hall.webp',
    accentColor: '#643ff4',
    sortOrder: 10,
    isActive: true,
    businessTypes: ['restaurant', 'coffee_shop']
  },
  {
    id: 'business-category-grocery',
    slug: 'grocery',
    name: 'Продукты',
    description: 'Свежие продукты и магазины',
    icon: 'basket',
    imageUrl: '/assets/template-grocery/hero.webp',
    accentColor: '#20b65d',
    sortOrder: 20,
    isActive: true,
    businessTypes: ['grocery']
  },
  {
    id: 'business-category-confectionery',
    slug: 'confectionery',
    name: 'Кондитерские',
    description: 'Торты, десерты и выпечка',
    icon: 'cake',
    imageUrl: '/assets/templates/confectionery/hero.webp',
    accentColor: '#eb3d89',
    sortOrder: 30,
    isActive: true,
    businessTypes: ['confectionery']
  },
  {
    id: 'business-category-flowers',
    slug: 'flowers',
    name: 'Цветы',
    description: 'Букеты и композиции на любой повод',
    icon: 'flower',
    imageUrl: '/assets/business-categories/flowers.webp',
    accentColor: '#ef3f83',
    sortOrder: 40,
    isActive: true,
    businessTypes: ['flowers']
  },
  {
    id: 'business-category-household',
    slug: 'household',
    name: 'Для дома',
    description: 'Товары для уюта и чистоты',
    icon: 'home',
    imageUrl: '/assets/template-grocery/categories/household.webp',
    accentColor: '#3977ee',
    sortOrder: 50,
    isActive: true,
    businessTypes: ['household']
  },
  {
    id: 'business-category-pharmacy',
    slug: 'pharmacy',
    name: 'Аптеки',
    description: 'Лекарства и товары для здоровья',
    icon: 'pharmacy',
    imageUrl: '/assets/business-categories/pharmacy.webp',
    accentColor: '#1db878',
    sortOrder: 60,
    isActive: true,
    businessTypes: ['pharmacy']
  },
  {
    id: 'business-category-pet-supplies',
    slug: 'pet-supplies',
    name: 'Зоотовары',
    description: 'Всё для питомцев',
    icon: 'pet',
    imageUrl: '/assets/business-categories/pet-supplies.webp',
    accentColor: '#f28b18',
    sortOrder: 70,
    isActive: true,
    businessTypes: []
  },
  {
    id: 'business-category-gifts',
    slug: 'gifts',
    name: 'Подарки',
    description: 'Сувениры и подарки на любой случай',
    icon: 'gift',
    imageUrl: '/assets/business-categories/gifts.webp',
    accentColor: '#8a5cea',
    sortOrder: 80,
    isActive: true,
    businessTypes: ['gifts']
  }
] satisfies readonly BusinessCategory[];

export const BUSINESS_CATEGORIES: readonly BusinessCategory[] = [...BUSINESS_CATEGORY_SEEDS]
  .sort((left, right) => left.sortOrder - right.sortOrder);

export const getBusinessCategoryBySlug = (slug: string | null | undefined) =>
  BUSINESS_CATEGORIES.find((category) => category.isActive && category.slug === slug);

export const getBusinessCategoryForType = (businessType: BusinessType | undefined) =>
  BUSINESS_CATEGORIES.find((category) =>
    category.businessTypes.includes(businessType ?? 'restaurant')
  );

export type BusinessDiscoveryFilters = {
  readonly cityId: string;
  readonly categorySlug?: string;
  readonly query?: string;
  readonly businessTypes?: readonly BusinessType[];
  readonly deliveryOnly?: boolean;
  readonly freeDeliveryOnly?: boolean;
  readonly limit?: number;
};

const normalizeText = (value: string) => value.trim().toLocaleLowerCase('ru-RU');

const matchesDiscoveryFilters = (
  restaurant: ClientRestaurant,
  filters: BusinessDiscoveryFilters
) => {
  const businessType = restaurant.businessType ?? 'restaurant';
  const businessCategory = getBusinessCategoryForType(businessType);
  const normalizedQuery = normalizeText(filters.query ?? '');
  const hasMenuCategory = Boolean(filters.categorySlug && filters.categorySlug !== 'all');
  const hasBusinessType = Boolean(filters.businessTypes?.length);
  const hasDelivery = restaurant.orderTypes.includes('delivery') &&
    restaurant.deliveryProvider !== 'pickup' && restaurant.deliveryProvider !== 'dine_in';

  if (hasMenuCategory && !restaurant.categorySlugs.includes(filters.categorySlug ?? '')) return false;
  if (hasBusinessType && !filters.businessTypes?.includes(businessType)) return false;
  if (filters.deliveryOnly && !hasDelivery) return false;
  if (filters.freeDeliveryOnly && (!hasDelivery || restaurant.freeDeliveryFrom <= 0)) return false;
  if (!normalizedQuery) return true;

  const typeDefinition = getBusinessTypeDefinition(businessType);
  return normalizeText([
    restaurant.name,
    restaurant.description,
    typeDefinition.label,
    businessCategory?.name ?? '',
    businessCategory?.description ?? ''
  ].join(' ')).includes(normalizedQuery);
};

const locationRank = (restaurant: ClientRestaurant, cityId: string) => {
  if (!cityId) return 0;
  if (restaurant.cityId === cityId) return 0;
  if ((restaurant.serviceCityIds ?? []).includes(cityId)) return 1;
  return 2;
};

const deliveryRank = (restaurant: ClientRestaurant) => {
  const hasDelivery = restaurant.orderTypes.includes('delivery') &&
    restaurant.deliveryProvider !== 'pickup' && restaurant.deliveryProvider !== 'dine_in';
  if (!hasDelivery) return 2;
  return restaurant.freeDeliveryFrom > 0 ? 0 : 1;
};

export const selectBusinessesForDiscovery = (
  restaurants: readonly ClientRestaurant[],
  filters: BusinessDiscoveryFilters
) => {
  const eligible = restaurants.filter((restaurant) => matchesDiscoveryFilters(restaurant, filters));
  const availableInSelectedZone = filters.cityId
    ? eligible.filter((restaurant) => locationRank(restaurant, filters.cityId) < 2)
    : eligible;
  const pool = availableInSelectedZone.length > 0 ? availableInSelectedZone : eligible;
  const limit = filters.limit && filters.limit > 0 ? filters.limit : pool.length;

  return [...pool]
    .sort((left, right) =>
      locationRank(left, filters.cityId) - locationRank(right, filters.cityId) ||
      right.reviewCount - left.reviewCount ||
      right.rating - left.rating ||
      deliveryRank(left) - deliveryRank(right) ||
      left.deliveryTimeFrom - right.deliveryTimeFrom ||
      left.name.localeCompare(right.name, 'ru-RU')
    )
    .slice(0, limit);
};
