export type BackgroundType = 'color' | 'gradient' | 'image';
export type ButtonStyle = 'filled' | 'outline';
export type HeaderStyle = 'centered' | 'compact';
export type OrderMode = 'hall' | 'takeaway' | 'delivery';
export type PricingType = 'fixed' | 'from' | 'per_kg' | 'variant';
export type PriceTier = 'budget' | 'standard' | 'premium';
export type CatalogSaleUnit = 'piece' | 'weight';
export type CatalogQuantityUnit = 'piece' | 'gram';

export type ThemeSettings = {
  id: string;
  restaurant_id: string;
  background_type: BackgroundType;
  background_color: string;
  background_gradient_from?: string;
  background_gradient_to?: string;
  background_image_url: string;
  card_color: string;
  product_card_color?: string;
  product_card_text_color?: string;
  settings_card_color?: string;
  settings_card_text_color?: string;
  cart_panel_color?: string;
  cart_panel_text_color?: string;
  card_radius: number;
  card_shadow: string;
  text_primary: string;
  text_secondary: string;
  product_title_color: string;
  category_title_color: string;
  accent_color: string;
  accent_secondary: string;
  button_style: ButtonStyle;
  button_radius: number;
  header_style: HeaderStyle;
};

export type Restaurant = {
  id: string;
  name: string;
  subtitle: string;
  logo_url: string;
  banner_url: string;
  banner_urls?: string[];
  whatsapp: string;
  instagram_url: string;
  address: string;
  mapLink: string;
  lat: number | null;
  lng: number | null;
  business_type?: import('../shared/businessTerminology').BusinessType;
  catalog_notice?: string;
  working_hours?: string;
  minimum_order?: number;
};

export type Category = {
  id: string;
  slug?: string;
  name: string;
  image: string;
  icon: string;
  kind: 'food' | 'drink' | 'space';
  showOnHome?: boolean;
  showInOrderFlow?: boolean;
};

export type CatalogTag = {
  id: string;
  slug?: string;
  name: string;
  icon: string;
  color: string;
  created_at?: string;
  updated_at?: string;
};

export type ProductChoiceOption = {
  name: string;
  price: number;
  old_price?: number;
};

export type ProductChoiceOptionInput = string | ProductChoiceOption;

export type ProductModifierOption = {
  id: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  isActive?: boolean;
};

export type ProductModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  minSelected: number;
  maxSelected: number;
  isActive?: boolean;
  options: ProductModifierOption[];
};

export type SelectedProductModifier = {
  groupId: string;
  optionId: string;
};

export type Product = {
  id: string;
  title: string;
  price: number;
  old_price?: number;
  description: string;
  image_url: string;
  image_urls?: string[];
  ingredients: string;
  weight: string;
  spicy_level: 0 | 1 | 2 | 3;
  serving: string;
  is_popular: boolean;
  is_new: boolean;
  is_hit: boolean;
  is_hidden?: boolean;
  daily_stock?: number;
  current_stock?: number;
  is_unlimited?: boolean;
  stock_count: number;
  category_id: string;
  category_ids?: string[];
  drink_type?: string;
  pair_ids: string[];
  choice_options?: ProductChoiceOptionInput[];
  modifier_groups?: ProductModifierGroup[];
  pricing_type?: PricingType;
  price_prefix?: 'от';
  price_tier?: PriceTier;
  unit?: 'шт' | 'набор' | 'кг' | 'порция';
  minimum_weight?: number;
  weight_step?: number;
  preparation_time?: string;
  advance_order_hours?: number;
  allergens?: string[];
  badges?: string[];
  allow_inscription?: boolean;
  allow_decoration_comment?: boolean;
  allow_production_schedule?: boolean;
  placeholder_kind?: 'dessert';
  sku?: string;
  barcode?: string;
  cost_price?: number;
  minimum_stock?: number;
  master_product_id?: string;
  master_content_version?: number;
  content_source?: 'local' | 'master' | 'master_override';
  sale_unit?: CatalogSaleUnit;
  quantity_unit?: CatalogQuantityUnit;
  price_basis_quantity?: number;
  minimum_quantity?: number;
  quantity_step?: number;
  stock_quantity?: number;
  allow_substitution?: boolean;
};

export type Cabin = {
  id: string;
  title: string;
  capacity: string;
  feature: string;
  image_url: string;
};

export type CartItem = {
  product: Product;
  quantity: number;
  selected_choice?: string;
  selected_modifiers?: SelectedProductModifier[];
  line_id?: string;
  selected_weight?: number;
  inscription?: string;
  decoration_comment?: string;
  production_date?: string;
  production_time?: string;
};

export type CartConfiguration = {
  selectedWeight?: number;
  inscription?: string;
  decorationComment?: string;
  productionDate?: string;
  productionTime?: string;
};
