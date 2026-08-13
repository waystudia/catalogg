import { groceryCategories, groceryProducts, groceryRestaurant, groceryTheme } from '../data/groceryCatalog';
import type { Cabin, CatalogTag } from '../entities/models';
import { DEFAULT_PHOTO_QUALITY_SETTINGS } from './photoQuality';

export function getGroceryCatalogFallback(catalogSlug?: string) {
  if (catalogSlug?.trim().toLocaleLowerCase('ru-RU') !== 'finik') return null;

  return {
    restaurant: groceryRestaurant,
    categories: groceryCategories,
    products: groceryProducts,
    cabins: [] as Cabin[],
    tags: [] as CatalogTag[],
    theme: groceryTheme,
    photoQuality: DEFAULT_PHOTO_QUALITY_SETTINGS,
    source: 'demo' as const
  };
}
