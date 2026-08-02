import type { PriceTier, PricingType, Product, ProductChoiceOption, ProductModifierGroup } from '../../entities/models';
import { normalizeProductChoiceOptions } from '../../entities/productVariants';

export type Dish = {
  id: string;
  name: string;
  price: number;
  categories: string[];
  tags: string[];
  description: string;
  ingredients: string;
  weight: number;
  dailyQuantity: number;
  unlimitedQuantity: boolean;
  serveWith: string;
  images: string[];
  pairIds: string[];
  choiceOptions: ProductChoiceOption[];
  modifierGroups: ProductModifierGroup[];
  pricingType: PricingType;
  priceTier: PriceTier;
  unit: Product['unit'];
  minimumWeight: number;
  weightStep: number;
  advanceOrderHours: number;
  allergens: string;
  allowInscription: boolean;
  allowDecorationComment: boolean;
  allowProductionSchedule: boolean;
};

export function productToDish(product: Product | null, fallbackCategory: string): Dish {
  const categories = product?.category_ids?.length ? product.category_ids : product?.category_id ? [product.category_id] : [fallbackCategory];

  return {
    id: product?.id ?? `dish-${Date.now()}`,
    name: product?.title ?? '',
    price: product?.price ?? 0,
    categories,
    tags: [
      ...(product?.is_hit ? ['Хит'] : []),
      ...(product?.is_popular ? ['Популярное'] : []),
      ...(product?.is_new ? ['Новинка'] : [])
    ],
    description: product?.description ?? '',
    ingredients: product?.ingredients ?? '',
    weight: Number.parseInt(product?.weight ?? '0', 10) || 0,
    dailyQuantity: product?.daily_stock ?? product?.stock_count ?? 0,
    unlimitedQuantity: product?.is_unlimited ?? product === null,
    serveWith: product?.serving ?? '',
    images: product?.image_urls?.length ? product.image_urls : product?.image_url ? [product.image_url] : [],
    pairIds: product?.pair_ids ?? [],
    choiceOptions: normalizeProductChoiceOptions(product?.choice_options, product?.price ?? 0),
    modifierGroups: product?.modifier_groups ?? [],
    pricingType: product?.pricing_type ?? 'fixed',
    priceTier: product?.price_tier ?? 'standard',
    unit: product?.unit ?? 'шт',
    minimumWeight: product?.minimum_weight ?? 1.5,
    weightStep: product?.weight_step ?? 0.5,
    advanceOrderHours: product?.advance_order_hours ?? 0,
    allergens: product?.allergens?.join(', ') ?? '',
    allowInscription: product?.allow_inscription ?? false,
    allowDecorationComment: product?.allow_decoration_comment ?? false,
    allowProductionSchedule: product?.allow_production_schedule ?? false
  };
}

export function dishToProduct(dish: Dish, current: Product | null): Product {
  return {
    ...current,
    id: dish.id,
    title: dish.name,
    price: dish.price,
    description: dish.description,
    image_url: dish.images[0] ?? '',
    image_urls: dish.images,
    ingredients: dish.ingredients,
    weight: `${dish.weight} г`,
    spicy_level: current?.spicy_level ?? 0,
    serving: dish.serveWith,
    is_popular: dish.tags.includes('Популярное'),
    is_new: dish.tags.includes('Новинка'),
    is_hit: dish.tags.includes('Хит'),
    stock_count: dish.dailyQuantity,
    daily_stock: dish.dailyQuantity,
    current_stock: dish.dailyQuantity,
    is_unlimited: dish.unlimitedQuantity,
    category_id: dish.categories[0],
    category_ids: dish.categories,
    drink_type: current?.drink_type,
    pair_ids: dish.pairIds,
    choice_options: dish.choiceOptions,
    modifier_groups: dish.modifierGroups,
    pricing_type: dish.pricingType,
    price_tier: dish.priceTier,
    unit: dish.unit,
    minimum_weight: dish.pricingType === 'per_kg' ? dish.minimumWeight : undefined,
    weight_step: dish.pricingType === 'per_kg' ? dish.weightStep : undefined,
    advance_order_hours: dish.advanceOrderHours || undefined,
    allergens: dish.allergens.split(',').map((value) => value.trim()).filter(Boolean),
    allow_inscription: dish.allowInscription,
    allow_decoration_comment: dish.allowDecorationComment,
    allow_production_schedule: dish.allowProductionSchedule,
    placeholder_kind: dish.images.length === 0 && dish.pricingType ? 'dessert' : current?.placeholder_kind
  };
}
