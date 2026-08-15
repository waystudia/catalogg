import type { Product } from '../../entities/models';
import { getProductChoiceOptions } from '../../entities/productVariants';

const choiceCardTitle = (dishTitle: string, choiceName: string) =>
  /^\d/u.test(choiceName)
    ? `${dishTitle.trim()}, ${choiceName}`
    : `${dishTitle.trim()} ${choiceName}`;

export function synchronizeDishVariantCards(source: Product, products: readonly Product[]) {
  const existingCards = products.filter((product) => product.generated_from_choice === source.id);
  if (!source.publish_choice_cards) {
    return {
      generatedProducts: [] as Product[],
      removedProductIds: existingCards.map((product) => product.id)
    };
  }

  const generatedProducts = getProductChoiceOptions(source).map((choice, index): Product => {
    const existing = existingCards.find((product) => product.generated_choice_index === index);
    return {
      ...source,
      id: existing?.id ?? crypto.randomUUID(),
      title: choiceCardTitle(source.title, choice.name),
      price: choice.price,
      old_price: choice.old_price,
      choice_options: [],
      publish_choice_cards: false,
      generated_from_choice: source.id,
      generated_choice_index: index
    };
  });
  const generatedIds = new Set(generatedProducts.map((product) => product.id));

  return {
    generatedProducts,
    removedProductIds: existingCards
      .filter((product) => !generatedIds.has(product.id))
      .map((product) => product.id)
  };
}

export function mergeDishProductChanges(
  current: readonly Product[],
  savedProducts: readonly Product[],
  removedProductIds: readonly string[]
) {
  const removedIds = new Set(removedProductIds);
  const next = current.filter((product) => !removedIds.has(product.id));
  savedProducts.forEach((savedProduct) => {
    const index = next.findIndex((product) => product.id === savedProduct.id);
    if (index >= 0) next[index] = savedProduct;
    else next.unshift(savedProduct);
  });
  return next;
}

export const getDishProductRemovalIds = (products: readonly Product[], productId: string) => [
  ...products.filter((product) => product.generated_from_choice === productId).map((product) => product.id),
  productId
];

export async function persistDishProductChanges(
  products: readonly Product[],
  removedProductIds: readonly string[],
  operations: {
    save: (product: Product) => Promise<unknown>;
    remove: (productId: string) => Promise<unknown>;
  }
) {
  for (const product of products) {
    await operations.save(product);
  }
  for (const productId of removedProductIds) {
    await operations.remove(productId);
  }
}
