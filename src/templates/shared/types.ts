import type { ComponentType } from 'react';

export type TemplateKey = 'restaurant-modern' | 'confectionery' | 'barbershop-dark' | 'menswear-premium';

export type TemplateBusinessType =
  | 'restaurant'
  | 'cafe'
  | 'confectionery'
  | 'shop'
  | 'fashion'
  | 'fragrance'
  | 'salon'
  | 'barbershop'
  | 'service';

export type TemplateViewport = 'mobile' | 'tablet' | 'desktop';

export type TemplateSectionKey =
  | 'hero'
  | 'search'
  | 'categories'
  | 'popular'
  | 'new'
  | 'promotions'
  | 'products'
  | 'contacts'
  | 'bottom-navigation';

export type TemplateSectionDefinition = {
  key: TemplateSectionKey;
  label: string;
  enabledByDefault: boolean;
  configurable: boolean;
};

export type TemplateMetadata = {
  key: TemplateKey;
  version: number;
  name: string;
  businessTypes: TemplateBusinessType[];
  description: string;
  sections: TemplateSectionDefinition[];
  immutable: true;
};

export type TemplatePreviewProps = {
  viewport?: TemplateViewport;
};

export type CatalogTemplateModule = {
  metadata: TemplateMetadata;
  Preview: ComponentType<TemplatePreviewProps>;
};

export const defaultCatalogSections: TemplateSectionDefinition[] = [
  { key: 'hero', label: 'Hero', enabledByDefault: true, configurable: true },
  { key: 'search', label: 'Search', enabledByDefault: true, configurable: true },
  { key: 'categories', label: 'Categories', enabledByDefault: true, configurable: true },
  { key: 'popular', label: 'Popular', enabledByDefault: true, configurable: true },
  { key: 'new', label: 'New', enabledByDefault: true, configurable: true },
  { key: 'promotions', label: 'Promotions', enabledByDefault: false, configurable: true },
  { key: 'products', label: 'Products', enabledByDefault: true, configurable: true },
  { key: 'contacts', label: 'Contacts', enabledByDefault: true, configurable: true },
  { key: 'bottom-navigation', label: 'Bottom navigation', enabledByDefault: true, configurable: true }
];
