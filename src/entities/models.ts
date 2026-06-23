export type BackgroundType = 'color' | 'image';
export type ButtonStyle = 'filled' | 'outline';
export type HeaderStyle = 'centered' | 'compact';
export type OrderMode = 'hall' | 'takeaway';

export type ThemeSettings = {
  id: string;
  restaurant_id: string;
  background_type: BackgroundType;
  background_color: string;
  background_image_url: string;
  card_color: string;
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
};

export type Category = {
  id: string;
  name: string;
  image: string;
  icon: string;
  kind: 'food' | 'drink' | 'space';
};

export type CatalogTag = {
  id: string;
  name: string;
  icon: string;
  color: string;
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
  stock_count: number;
  category_id: string;
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
