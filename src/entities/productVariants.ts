import type { CartItem, Product, ProductChoiceOption, ProductChoiceOptionInput } from './models';
import { getCartItemPrice as getConfiguredCartItemPrice, getCartItemTotal as getConfiguredCartItemTotal } from './productModifiers';

const validPriceOr = (value: unknown, fallback: number) =>
  Number.isFinite(value) && (value as number) > 0 ? value as number : fallback;

export const normalizeProductChoiceOptions = (
  choices: ProductChoiceOptionInput[] | undefined,
  basePrice: number
): ProductChoiceOption[] => {
  const normalized: ProductChoiceOption[] = [];

  for (const choice of choices ?? []) {
    const name = (typeof choice === 'string' ? choice : choice.name).trim();
    if (!name) continue;

    normalized.push({
      name,
      price: validPriceOr((choice as { price?: unknown }).price, basePrice)
    });
    if (normalized.length === 6) break;
  }

  return normalized;
};

export const getProductChoiceOptions = (product: Product) =>
  normalizeProductChoiceOptions(product.choice_options, product.price);

export const getProductStartingPrice = (product: Product) => {
  const choices = getProductChoiceOptions(product);
  return choices.length > 0 ? Math.min(...choices.map((choice) => choice.price)) : product.price;
};

export const getCartItemPrice = (item: CartItem) => getConfiguredCartItemPrice(item);

export const getCartItemTotal = (item: CartItem) => getConfiguredCartItemTotal(item);
