import type { Product } from '../entities/models';

const legacyProductColumns = [
  'id',
  'title',
  'price',
  'old_price',
  'description',
  'image_url',
  'image_urls',
  'ingredients',
  'weight',
  'spicy_level',
  'serving',
  'is_popular',
  'is_new',
  'is_hit',
  'is_hidden',
  'daily_stock',
  'current_stock',
  'is_unlimited',
  'stock_count',
  'category_id',
  'category_ids',
  'drink_type',
  'pair_ids',
  'choice_card_options',
  'modifier_groups',
  'pricing_type',
  'price_prefix',
  'price_tier',
  'unit',
  'minimum_weight',
  'weight_step',
  'preparation_time',
  'advance_order_hours',
  'allergens',
  'badges',
  'allow_inscription',
  'allow_decoration_comment',
  'allow_production_schedule',
  'publish_choice_cards',
  'generated_from_choice',
  'generated_choice_index',
  'placeholder_kind',
  'sku',
  'barcode',
  'cost_price',
  'minimum_stock',
  'master_product_id',
  'master_content_version',
  'content_source',
  'sale_unit',
  'quantity_unit',
  'price_basis_quantity',
  'minimum_quantity',
  'quantity_step',
  'stock_quantity',
  'allow_substitution'
] as const satisfies readonly (keyof Product)[];

const mutableLegacyProductColumns = legacyProductColumns.filter(
  (column): column is Exclude<(typeof legacyProductColumns)[number], 'id'> => column !== 'id'
);

const pickDefinedProductColumns = (
  product: Partial<Product>,
  columns: readonly (keyof Product)[]
) => Object.fromEntries(columns.flatMap((column) => (
  product[column] === undefined ? [] : [[column, product[column]]]
)));

export const toLegacyProductRow = (product: Product) =>
  pickDefinedProductColumns(product, legacyProductColumns);

export const toLegacyProductPatch = (patch: Partial<Product>) =>
  pickDefinedProductColumns(patch, mutableLegacyProductColumns);
