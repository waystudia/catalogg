export type BackgroundType = 'color' | 'gradient' | 'image';
export type ButtonStyle = 'filled' | 'outline';
export type HeaderStyle = 'centered' | 'compact';
export type OrderMode = 'hall' | 'takeaway' | 'delivery';

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
  whatsapp: string;
  instagram_url: string;
  address: string;
  mapLink: string;
  lat: number | null;
  lng: number | null;
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

export type Product = {
  id: string;
  title: string;
  price: number;
  description: string;
  image_url: string;
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
};
