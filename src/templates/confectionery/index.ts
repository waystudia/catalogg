import type {
  Category,
  PriceTier,
  PricingType,
  Product,
  ProductChoiceOption,
  ProductModifierGroup,
  Restaurant,
  ThemeSettings
} from '../../entities/models';

const assetRoot = '/assets/templates/confectionery';

export const confectioneryCategories: Category[] = ([
  { id: 'popular', slug: 'popular', name: 'Популярное', image: `${assetRoot}/products/red-velvet-cake.webp`, icon: 'star', kind: 'food' },
  { id: 'cakes', slug: 'cakes', name: 'Торты', image: `${assetRoot}/products/medovik-cake.webp`, icon: 'cake', kind: 'food' },
  { id: 'custom-cakes', slug: 'custom-cakes', name: 'Торты на заказ', image: `${assetRoot}/products/birthday-custom-cake.webp`, icon: 'cake', kind: 'food' },
  { id: 'pies', slug: 'pies', name: 'Пироги', image: `${assetRoot}/products/apple-pie.webp`, icon: 'pie', kind: 'food' },
  { id: 'portion-desserts', slug: 'portion-desserts', name: 'Порционные десерты', image: `${assetRoot}/products/new-york-cheesecake.webp`, icon: 'dessert', kind: 'food' },
  { id: 'cupcakes-eclairs', slug: 'cupcakes-eclairs', name: 'Капкейки и эклеры', image: `${assetRoot}/products/cupcake-set.webp`, icon: 'cupcake', kind: 'food' },
  { id: 'chocolate-fruit', slug: 'chocolate-fruit', name: 'Фрукты в шоколаде', image: `${assetRoot}/products/strawberry-chocolate-12.webp`, icon: 'strawberry', kind: 'food' },
  { id: 'bakery-cookies', slug: 'bakery-cookies', name: 'Выпечка и печенье', image: `${assetRoot}/products/homemade-cookie-box.webp`, icon: 'cookie', kind: 'food' },
  { id: 'gift-sets', slug: 'gift-sets', name: 'Подарочные наборы', image: `${assetRoot}/products/gift-set-for-her.webp`, icon: 'gift', kind: 'food' },
  { id: 'drinks', slug: 'drinks', name: 'Напитки', image: `${assetRoot}/products/cocoa.webp`, icon: 'cup-soda', kind: 'drink' }
] satisfies Category[]).map((category) => ({ ...category, showOnHome: true, showInOrderFlow: false }));

type ProductSeed = {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  description: string;
  ingredients: string;
  image?: string;
  pricingType?: PricingType;
  pricePrefix?: 'от';
  priceTier?: PriceTier;
  unit?: Product['unit'];
  weight?: string;
  oldPrice?: number;
  popular?: boolean;
  isNew?: boolean;
  badges?: string[];
  choices?: ProductChoiceOption[];
  modifiers?: ProductModifierGroup[];
  minimumWeight?: number;
  weightStep?: number;
  preparationTime?: string;
  advanceOrderHours?: number;
  allergens?: string[];
  customCake?: boolean;
};

const image = (name?: string) => name ? `${assetRoot}/products/${name}.webp` : '';

const customCakeModifiers = (productId: string): ProductModifierGroup[] => [{
  id: `${productId}-filling`,
  name: 'Начинка',
  required: true,
  minSelected: 1,
  maxSelected: 1,
  options: [
    ['medovik', 'Медовик', 0],
    ['red-velvet', 'Красный бархат', 0],
    ['chocolate-cherry', 'Шоколад-вишня', 100],
    ['pistachio-raspberry', 'Фисташка-малина', 250],
    ['snickers', 'Сникерс', 150],
    ['vanilla-strawberry', 'Ваниль-клубника', 100]
  ].map(([id, name, priceDelta], index) => ({
    id: `${productId}-filling-${id}`,
    name: String(name),
    priceDelta: Number(priceDelta),
    isDefault: index === 0,
    isActive: true
  }))
}, {
  id: `${productId}-decor`,
  name: 'Декор',
  required: true,
  minSelected: 1,
  maxSelected: 1,
  options: [
    ['none', 'Без дополнительного декора', 0],
    ['berries', 'Ягоды', 350],
    ['chocolate', 'Шоколадный декор', 300],
    ['minimal', 'Минималистичный декор', 200],
    ['themed', 'Тематический декор', 600]
  ].map(([id, name, priceDelta], index) => ({
    id: `${productId}-decor-${id}`,
    name: String(name),
    priceDelta: Number(priceDelta),
    isDefault: index === 0,
    isActive: true
  }))
}];

const makeProduct = (seed: ProductSeed): Product => ({
  id: seed.id,
  title: seed.name,
  price: seed.price,
  old_price: seed.oldPrice,
  description: seed.description,
  image_url: image(seed.image),
  image_urls: seed.image ? [image(seed.image)] : [],
  ingredients: seed.ingredients,
  allergens: seed.allergens ?? ['глютен', 'яйца', 'молочные продукты'],
  weight: seed.weight ?? '',
  spicy_level: 0,
  serving: seed.preparationTime ? `Приготовление: ${seed.preparationTime}` : '',
  is_popular: seed.popular ?? false,
  is_new: seed.isNew ?? false,
  is_hit: seed.popular ?? false,
  is_unlimited: true,
  stock_count: 0,
  category_id: seed.categoryId,
  category_ids: seed.popular ? [seed.categoryId, 'popular'] : [seed.categoryId],
  pair_ids: [],
  choice_options: seed.choices,
  modifier_groups: seed.modifiers,
  pricing_type: seed.pricingType ?? 'fixed',
  price_prefix: seed.pricePrefix,
  price_tier: seed.priceTier ?? 'standard',
  unit: seed.unit ?? 'шт',
  minimum_weight: seed.minimumWeight,
  weight_step: seed.weightStep,
  preparation_time: seed.preparationTime,
  advance_order_hours: seed.advanceOrderHours,
  badges: seed.badges,
  allow_inscription: seed.customCake,
  allow_decoration_comment: seed.customCake,
  allow_production_schedule: seed.customCake,
  placeholder_kind: !seed.image ? 'dessert' : undefined
});

const cakePerKg = {
  pricingType: 'per_kg' as const,
  unit: 'кг' as const,
  minimumWeight: 1.5,
  weightStep: 0.5,
  preparationTime: '24–48 часов'
};

const customCake = (id: string) => ({
  ...cakePerKg,
  pricePrefix: 'от' as const,
  priceTier: 'premium' as const,
  advanceOrderHours: 24,
  customCake: true,
  modifiers: customCakeModifiers(id),
  badges: ['На заказ', 'От 1,5 кг']
});

const seeds: ProductSeed[] = [
  { id: 'medovik-classic', categoryId: 'cakes', name: 'Медовик классический', price: 1600, description: 'Тонкие медовые коржи и нежный сметанный крем.', ingredients: 'Мёд, мука, яйца, сметанный крем', image: 'medovik-cake', popular: true, badges: ['Хит', 'От 1,5 кг'], ...cakePerKg },
  { id: 'red-velvet-cake', categoryId: 'cakes', name: 'Красный бархат', price: 1900, description: 'Бархатный бисквит с какао и сливочно-сырным кремом.', ingredients: 'Бисквит, какао, сливочный сыр, сливки', image: 'red-velvet-cake', popular: true, badges: ['Хит', 'От 1,5 кг'], ...cakePerKg },
  { id: 'snickers-cake', categoryId: 'cakes', name: 'Шоколадный «Сникерс»', price: 2200, description: 'Шоколадные коржи, карамель и жареный арахис.', ingredients: 'Шоколад, карамель, арахис, сливочный крем', image: 'snickers-cake', priceTier: 'premium', badges: ['От 1,5 кг'], ...cakePerKg },
  { id: 'pistachio-raspberry-cake', categoryId: 'cakes', name: 'Фисташка-малина', price: 2600, description: 'Фисташковый бисквит, малиновое конфи и воздушный крем.', ingredients: 'Фисташка, малина, сливочный сыр, яйца', image: 'pistachio-raspberry-cake', popular: true, priceTier: 'premium', badges: ['Хит', 'От 1,5 кг'], ...cakePerKg },
  { id: 'carrot-cake', categoryId: 'cakes', name: 'Морковный торт', price: 1750, description: 'Пряный морковный бисквит с орехами и крем-чизом.', ingredients: 'Морковь, грецкий орех, корица, сливочный сыр', badges: ['От 1,5 кг'], ...cakePerKg },
  { id: 'classic-cheesecake', categoryId: 'cakes', name: 'Чизкейк классический', price: 1800, description: 'Нежный запечённый чизкейк на песочной основе.', ingredients: 'Сливочный сыр, сливки, яйца, печенье', image: 'classic-cheesecake', weight: '1,2 кг', popular: true },
  { id: 'bento-cake', categoryId: 'cakes', name: 'Бенто-торт', price: 950, description: 'Мини-торт на двоих с лаконичным оформлением.', ingredients: 'Бисквит, сливочный сыр, ягодная начинка', image: 'bento-cake', pricingType: 'from', priceTier: 'budget', unit: 'шт', weight: '450–500 г', isNew: true, badges: ['Новинка'] },

  { id: 'childrens-custom-cake', categoryId: 'custom-cakes', name: 'Детский торт на заказ', price: 2800, description: 'Торт с безопасным тематическим декором и выбранной начинкой.', ingredients: 'Состав зависит от выбранной начинки', image: 'childrens-custom-cake', ...customCake('childrens-custom-cake') },
  { id: 'birthday-custom-cake', categoryId: 'custom-cakes', name: 'Торт на день рождения', price: 2500, description: 'Праздничный торт с персональной надписью и декором.', ingredients: 'Состав зависит от выбранной начинки', image: 'birthday-custom-cake', popular: true, ...customCake('birthday-custom-cake') },
  { id: 'wedding-custom-cake', categoryId: 'custom-cakes', name: 'Свадебный торт', price: 3500, description: 'Элегантный многоярусный торт для особенного дня.', ingredients: 'Состав зависит от выбранной начинки', image: 'wedding-custom-cake', ...customCake('wedding-custom-cake'), minimumWeight: 3 },
  { id: 'minimal-custom-cake', categoryId: 'custom-cakes', name: 'Минималистичный торт', price: 2300, description: 'Чистые линии, сдержанная палитра и аккуратная надпись.', ingredients: 'Состав зависит от выбранной начинки', ...customCake('minimal-custom-cake') },

  { id: 'apple-pie', categoryId: 'pies', name: 'Яблочный пирог', price: 850, description: 'Домашний пирог с яблоками, корицей и хрустящей корочкой.', ingredients: 'Яблоки, мука, сливочное масло, корица', image: 'apple-pie', priceTier: 'budget', weight: '900 г', popular: true },
  { id: 'cherry-pie', categoryId: 'pies', name: 'Вишнёвый пирог', price: 950, description: 'Рассыпчатое тесто и сочная вишнёвая начинка.', ingredients: 'Вишня, мука, сливочное масло, сахар', image: 'cherry-pie', weight: '900 г' },
  { id: 'cottage-cheese-pie', categoryId: 'pies', name: 'Пирог с творогом', price: 900, description: 'Мягкий пирог с нежной творожной начинкой.', ingredients: 'Творог, яйца, мука, сливочное масло', weight: '900 г' },
  { id: 'chocolate-tart', categoryId: 'pies', name: 'Шоколадный тарт', price: 1250, description: 'Тонкая песочная основа и насыщенный шоколадный ганаш.', ingredients: 'Шоколад, сливки, мука, сливочное масло', image: 'chocolate-tart', priceTier: 'premium', weight: '750 г', isNew: true, badges: ['Новинка'] },

  { id: 'medovik-slice', categoryId: 'portion-desserts', name: 'Медовик, кусочек', price: 220, description: 'Классический медовик в порционной подаче.', ingredients: 'Мёд, мука, сметанный крем', image: 'medovik-slice', priceTier: 'budget', unit: 'порция', weight: '130 г', popular: true },
  { id: 'napoleon-slice', categoryId: 'portion-desserts', name: 'Наполеон, кусочек', price: 240, description: 'Слоёные коржи с нежным заварным кремом.', ingredients: 'Слоёное тесто, молоко, яйца, ваниль', image: 'napoleon-slice', priceTier: 'budget', unit: 'порция', weight: '140 г' },
  { id: 'red-velvet-slice', categoryId: 'portion-desserts', name: 'Красный бархат, кусочек', price: 280, description: 'Влажный бисквит с лёгким крем-чизом.', ingredients: 'Бисквит, какао, сливочный сыр', image: 'red-velvet-slice', priceTier: 'budget', unit: 'порция', weight: '140 г' },
  { id: 'new-york-cheesecake', categoryId: 'portion-desserts', name: 'Чизкейк «Нью-Йорк»', price: 330, oldPrice: 360, description: 'Плотный сливочный чизкейк с ванильной нотой.', ingredients: 'Сливочный сыр, сливки, яйца, печенье', image: 'new-york-cheesecake', unit: 'порция', weight: '150 г', popular: true, badges: ['Выгодно'] },
  { id: 'tiramisu-cup', categoryId: 'portion-desserts', name: 'Тирамису в стаканчике', price: 320, description: 'Маскарпоне, кофе и какао в удобной порционной подаче.', ingredients: 'Маскарпоне, савоярди, кофе, какао', image: 'tiramisu-cup', unit: 'порция', weight: '180 г' },
  { id: 'oreo-trifle', categoryId: 'portion-desserts', name: 'Трайфл Oreo', price: 300, description: 'Шоколадный бисквит, сливочный крем и крошка печенья.', ingredients: 'Бисквит, сливочный крем, шоколадное печенье', unit: 'порция', weight: '180 г' },

  { id: 'vanilla-cupcake', categoryId: 'cupcakes-eclairs', name: 'Капкейк ванильный', price: 180, description: 'Ванильный бисквит с шапочкой сливочного крема.', ingredients: 'Мука, яйца, ваниль, сливочный сыр', image: 'vanilla-cupcake', priceTier: 'budget', weight: '90 г' },
  { id: 'chocolate-cupcake', categoryId: 'cupcakes-eclairs', name: 'Капкейк шоколадный', price: 200, description: 'Шоколадный бисквит и насыщенный крем.', ingredients: 'Шоколад, какао, мука, сливочный сыр', image: 'chocolate-cupcake', priceTier: 'budget', weight: '90 г' },
  { id: 'vanilla-eclair', categoryId: 'cupcakes-eclairs', name: 'Эклер ванильный', price: 150, description: 'Заварное тесто и лёгкий ванильный крем.', ingredients: 'Мука, яйца, молоко, ваниль', image: 'vanilla-eclair', priceTier: 'budget', weight: '75 г' },
  { id: 'pistachio-eclair', categoryId: 'cupcakes-eclairs', name: 'Эклер фисташковый', price: 220, description: 'Эклер с фисташковым кремом и тонкой глазурью.', ingredients: 'Фисташка, молоко, яйца, мука', image: 'pistachio-eclair', weight: '80 г', popular: true },
  { id: 'cupcake-set', categoryId: 'cupcakes-eclairs', name: 'Набор капкейков', price: 760, description: 'Ассорти ванильных и шоколадных капкейков.', ingredients: 'Бисквит, сливочный крем, шоколад, ваниль', image: 'cupcake-set', pricingType: 'variant', unit: 'набор', popular: true, badges: ['Выгодно'], choices: [{ name: '4 штуки', price: 760 }, { name: '6 штук', price: 1080 }, { name: '9 штук', price: 1530 }] },

  { id: 'milk-chocolate-banana', categoryId: 'chocolate-fruit', name: 'Банан в молочном шоколаде', price: 180, description: 'Спелый банан в тонком слое молочного шоколада.', ingredients: 'Банан, молочный шоколад', image: 'milk-chocolate-banana', priceTier: 'budget', popular: true },
  { id: 'pistachio-chocolate-banana', categoryId: 'chocolate-fruit', name: 'Банан в шоколаде с фисташкой', price: 260, description: 'Банан в шоколаде с хрустящей фисташковой крошкой.', ingredients: 'Банан, шоколад, фисташка', image: 'pistachio-chocolate-banana' },
  { id: 'chocolate-banana-set', categoryId: 'chocolate-fruit', name: 'Набор бананов в шоколаде', price: 690, description: 'Набор бананов с разным шоколадом и посыпками.', ingredients: 'Бананы, шоколад, орехи', image: 'chocolate-banana-set', pricingType: 'variant', unit: 'набор', choices: [{ name: '3 штуки', price: 690 }, { name: '5 штук', price: 1090 }, { name: '8 штук', price: 1680 }] },
  { id: 'strawberry-chocolate-6', categoryId: 'chocolate-fruit', name: 'Клубника в шоколаде, 6 штук', price: 790, description: 'Свежая клубника в молочном и белом шоколаде.', ingredients: 'Клубника, шоколад', image: 'strawberry-chocolate-6', unit: 'набор' },
  { id: 'strawberry-chocolate-12', categoryId: 'chocolate-fruit', name: 'Клубника в шоколаде, 12 штук', price: 1500, description: 'Большая подарочная коробка свежей клубники в шоколаде.', ingredients: 'Клубника, шоколад, фисташка', image: 'strawberry-chocolate-12', priceTier: 'premium', unit: 'набор', popular: true, badges: ['Подарочный набор'] },

  { id: 'chocolate-cookie', categoryId: 'bakery-cookies', name: 'Шоколадное печенье', price: 120, description: 'Мягкое печенье с кусочками тёмного шоколада.', ingredients: 'Мука, сливочное масло, шоколад', priceTier: 'budget', weight: '70 г' },
  { id: 'homemade-cookie-box', categoryId: 'bakery-cookies', name: 'Коробка домашнего печенья', price: 450, description: 'Ассорти свежего печенья в аккуратной коробке.', ingredients: 'Песочное и шоколадное печенье', image: 'homemade-cookie-box', priceTier: 'budget', unit: 'набор', weight: '350 г' },
  { id: 'brownie', categoryId: 'bakery-cookies', name: 'Брауни', price: 230, description: 'Плотный шоколадный брауни с влажной серединой.', ingredients: 'Шоколад, сливочное масло, яйца, какао', image: 'brownie', priceTier: 'budget', weight: '110 г', popular: true },
  { id: 'macarons-6', categoryId: 'bakery-cookies', name: 'Макаронс, 6 штук', price: 780, description: 'Шесть миндальных пирожных с разными начинками.', ingredients: 'Миндальная мука, белок, сливочный крем', image: 'macarons-6', unit: 'набор', badges: ['Подарочный набор'] },

  { id: 'mini-sweets-set', categoryId: 'gift-sets', name: 'Мини-набор сладостей', price: 1200, description: 'Небольшой подарок с десертами и печеньем.', ingredients: 'Состав набора уточняется при заказе', image: 'mini-sweets-set', pricingType: 'from', unit: 'набор', badges: ['Подарочный набор'] },
  { id: 'gift-set-for-her', categoryId: 'gift-sets', name: 'Набор «Для неё»', price: 1850, description: 'Клубника в шоколаде, макаронс и мини-десерты.', ingredients: 'Клубника, шоколад, макаронс, десерты', image: 'gift-set-for-her', priceTier: 'premium', unit: 'набор', popular: true, badges: ['Хит', 'Подарочный набор'] },
  { id: 'large-gift-box', categoryId: 'gift-sets', name: 'Большой подарочный бокс', price: 2900, description: 'Премиальный сладкий бокс для важного события.', ingredients: 'Десерты, шоколад, ягоды, печенье', image: 'large-gift-box', pricingType: 'from', priceTier: 'premium', unit: 'набор', badges: ['Подарочный набор'] },
  { id: 'assorted-box', categoryId: 'gift-sets', name: 'Коробка ассорти', price: 1450, description: 'Сбалансированное ассорти популярных сладостей.', ingredients: 'Капкейки, эклеры, печенье, макаронс', unit: 'набор' },

  { id: 'cocoa', categoryId: 'drinks', name: 'Какао', price: 180, description: 'Тёплый молочный какао с насыщенным вкусом.', ingredients: 'Молоко, какао, сахар', image: 'cocoa', priceTier: 'budget', unit: 'порция', weight: '300 мл', popular: true },
  { id: 'milkshake', categoryId: 'drinks', name: 'Молочный коктейль', price: 250, description: 'Густой ванильный коктейль из мороженого и молока.', ingredients: 'Молоко, мороженое, ваниль', image: 'milkshake', priceTier: 'budget', unit: 'порция', weight: '350 мл' },
  { id: 'berry-lemonade', categoryId: 'drinks', name: 'Ягодный лимонад', price: 220, description: 'Освежающий лимонад с ягодами и мятой.', ingredients: 'Ягоды, лимон, мята, содовая', priceTier: 'budget', unit: 'порция', weight: '400 мл' }
];

export const confectioneryProducts: Product[] = seeds.map(makeProduct);

export const confectioneryRestaurant: Restaurant = {
  id: 'confectionery',
  name: 'Dolce House',
  subtitle: 'Торты, десерты и сладкие подарки',
  logo_url: `${assetRoot}/logo.svg`,
  banner_url: `${assetRoot}/hero.webp`,
  banner_urls: [`${assetRoot}/hero.webp`],
  whatsapp: '79990000000',
  instagram_url: '',
  address: 'ул. Цветочная, 18',
  mapLink: '',
  lat: null,
  lng: null,
  business_type: 'confectionery',
  catalog_notice: 'Торты на заказ — оформление минимум за 24 часа',
  working_hours: 'Ежедневно, 09:00–21:00',
  minimum_order: 700
};

export const confectioneryTheme: ThemeSettings = {
  id: 'theme-confectionery',
  restaurant_id: confectioneryRestaurant.id,
  background_type: 'color',
  background_color: '#fff8f2',
  background_gradient_from: '#fff8f2',
  background_gradient_to: '#f6e9df',
  background_image_url: '',
  card_color: '#ffffff',
  product_card_color: '#ffffff',
  product_card_text_color: '#382620',
  settings_card_color: '#ffffff',
  settings_card_text_color: '#382620',
  cart_panel_color: '#ffffff',
  cart_panel_text_color: '#382620',
  card_radius: 18,
  card_shadow: '0 14px 36px rgba(91, 55, 45, 0.10)',
  text_primary: '#382620',
  text_secondary: '#806d66',
  product_title_color: '#382620',
  category_title_color: '#ffffff',
  accent_color: '#b85f6b',
  accent_secondary: '#d9a66c',
  button_style: 'filled',
  button_radius: 16,
  header_style: 'compact'
};

export const confectioneryTemplate = {
  id: 'confectionery',
  slug: 'confectionery',
  name: 'Кондитерская',
  shortDescription: 'Торты, десерты, выпечка и подарочные наборы',
  icon: 'cake',
  previewImage: `${assetRoot}/preview.webp`,
  enabled: true,
  restaurant: confectioneryRestaurant,
  categories: confectioneryCategories,
  products: confectioneryProducts,
  theme: confectioneryTheme
} as const;
