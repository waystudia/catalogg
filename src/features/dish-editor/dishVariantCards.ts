import type { Product } from '../../entities/models';
import { getProductChoiceOptions } from '../../entities/productVariants';

const choiceCardTitle = (dishTitle: string, choiceName: string) =>
  /^\d/u.test(choiceName)
    ? `${dishTitle.trim()}, ${choiceName}`
    : `${dishTitle.trim()} ${choiceName}`;

const normalizeCardOptions = (values: readonly string[] | undefined) => (values ?? [])
  .map((value) => value.trim())
  .filter((value, index, options) => value && options.findIndex(
    (candidate) => candidate.toLocaleLowerCase('ru') === value.toLocaleLowerCase('ru')
  ) === index);

export function synchronizeDishVariantCards(source: Product, products: readonly Product[]) {
  const existingCards = products.filter((product) => product.generated_from_choice === source.id);
  if (!source.publish_choice_cards) {
    return {
      generatedProducts: [] as Product[],
      removedProductIds: existingCards.map((product) => product.id)
    };
  }

  const additionalOptions = normalizeCardOptions(source.choice_card_options);
  const cardChoices = getProductChoiceOptions(source).flatMap((choice) =>
    additionalOptions.length > 0
      ? additionalOptions.map((additionalOption) => ({ choice, additionalOption }))
      : [{ choice, additionalOption: '' }]
  );
  const generatedProducts = cardChoices.map(({ choice, additionalOption }, index): Product => {
    const existing = existingCards.find((product) => product.generated_choice_index === index);
    const primaryTitle = choiceCardTitle(source.title, choice.name);
    return {
      ...source,
      id: existing?.id ?? crypto.randomUUID(),
      title: additionalOption ? `${primaryTitle} ${additionalOption}` : primaryTitle,
      price: choice.price,
      old_price: choice.old_price,
      choice_options: [],
      choice_card_options: [],
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
