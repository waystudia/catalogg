import type { CatalogTemplateModule, TemplateKey } from './shared/types';

const loaders = {
  'restaurant-modern@1': () => import('./restaurant-modern/v1'),
  'restaurant-modern@2': () => import('./restaurant-modern/v2'),
  'confectionery@1': () => import('./confectionery/v1'),
  'barbershop-dark@1': () => import('./barbershop-dark/v1'),
  'menswear-premium@1': () => import('./menswear-premium/v1')
} satisfies Record<string, () => Promise<CatalogTemplateModule>>;

export type TemplateRegistryKey = keyof typeof loaders;

export const registeredTemplates = Object.keys(loaders) as TemplateRegistryKey[];

export async function loadTemplate(key: TemplateKey, version: number): Promise<CatalogTemplateModule> {
  const loader = loaders[`${key}@${version}` as TemplateRegistryKey];
  if (!loader) {
    throw new Error(`Template not registered: ${key}@${version}`);
  }
  return loader();
}
