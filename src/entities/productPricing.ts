import type { CartItem, Product } from './models';

const rubleFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export const formatRublePrice = (value: number) => `${rubleFormatter.format(Math.round(value)).replace(/[\u00a0\u202f]/g, ' ')} ₽`;

export const getProductStartingPrice = (product: Product) => {
  if (product.pricing_type !== 'variant') return product.price;
  const prices = (product.choice_options ?? []).flatMap((choice) => {
    const price = typeof choice === 'string' ? product.price : choice.price;
    return Number.isFinite(price) && price > 0 ? [price] : [];
  });
  return prices.length > 0 ? Math.min(...prices) : product.price;
};

export const formatCatalogProductPrice = (product: Product) => {
  const pricingType = product.pricing_type ?? 'fixed';
  const price = formatRublePrice(getProductStartingPrice(product));
  const prefix = pricingType === 'from' || pricingType === 'variant' || product.price_prefix === 'от' ? 'от ' : '';
  const unit = pricingType === 'per_kg' ? `/${product.unit ?? 'кг'}` : '';
  return `${prefix}${price}${unit}`;
};

const selectedVariantPrice = (item: CartItem) => {
  const selectedName = item.selected_choice?.trim();
  if (!selectedName) return item.product.price;
  const match = (item.product.choice_options ?? [])
    .map((choice) => typeof choice === 'string' ? { name: choice, price: item.product.price } : choice)
    .find((choice) => choice.name.trim() === selectedName);
  return match?.price ?? item.product.price;
};

const selectedModifierDelta = (item: CartItem) => {
  const selections = new Set(
    (item.selected_modifiers ?? []).map((selection) => `${selection.groupId}:${selection.optionId}`)
  );
  return (item.product.modifier_groups ?? []).reduce((total, group) => total + group.options.reduce(
    (groupTotal, option) => selections.has(`${group.id}:${option.id}`)
      ? groupTotal + Math.max(0, Number(option.priceDelta) || 0)
      : groupTotal,
    0
  ), 0);
};

export const normalizeSelectedWeight = (product: Product, requested?: number) => {
  const minimum = Math.max(0.1, product.minimum_weight ?? 1);
  const step = Math.max(0.1, product.weight_step ?? 0.5);
  const value = Number.isFinite(requested) ? Math.max(minimum, requested as number) : minimum;
  const steps = Math.round((value - minimum) / step);
  return Number((minimum + steps * step).toFixed(2));
};

export const getCartItemPrice = (item: CartItem) => {
  const base = item.product.pricing_type === 'per_kg'
    ? Math.round(item.product.price * normalizeSelectedWeight(item.product, item.selected_weight))
    : selectedVariantPrice(item);
  return Math.round(base + selectedModifierDelta(item));
};

export const getCartItemTotal = (item: CartItem) => getCartItemPrice(item) * Math.max(1, item.quantity);
