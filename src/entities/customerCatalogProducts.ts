import type { Product } from './models';

/**
 * A choice published as separate cards replaces its source card for customers.
 * The source remains visible to admins and remains the single editable record.
 */
export const getCustomerCatalogProducts = (products: Product[]) => {
  const populatedChoiceSources = new Set(
    products
      .map((product) => product.generated_from_choice)
      .filter((sourceId): sourceId is string => Boolean(sourceId))
  );

  return products.filter((product) => (
    !product.is_hidden &&
    !(product.publish_choice_cards && populatedChoiceSources.has(product.id))
  ));
};
