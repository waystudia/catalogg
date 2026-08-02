import { defaultCatalogSections, type TemplateMetadata } from '../../shared/types';

export const metadata: TemplateMetadata = {
  key: 'confectionery',
  version: 1,
  name: 'Кондитерская',
  businessTypes: ['confectionery'],
  description: 'Торты, десерты, выпечка и подарочные наборы',
  sections: defaultCatalogSections,
  immutable: true
};
