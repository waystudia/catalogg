import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Beef,
  CakeSlice,
  Check,
  ChefHat,
  ClipboardList,
  CloudUpload,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Download,
  Drumstick,
  Edit3,
  Eye,
  EyeOff,
  Fish,
  Flame,
  GlassWater,
  Ham,
  Home,
  IceCreamBowl,
  Instagram,
  LogOut,
  MapPin,
  MessageCircle,
  Milk,
  Minus,
  Package,
  Paintbrush,
  Pizza,
  Plus,
  Salad,
  Sandwich,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  Soup,
  Tags,
  Trash2,
  Utensils,
  UtensilsCrossed,
  User,
  Users,
  Wheat,
  GripVertical,
  RefreshCcw,
  X
} from 'lucide-react';
import JSZip from 'jszip';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { cabins as demoCabins, categories as demoCategories, products as demoProducts, restaurant as demoRestaurant } from '../data/catalog';
import type { Cabin, CatalogTag, Category, Product, Restaurant, ThemeSettings } from '../entities/models';
import { DishEditorPage } from '../features/dish-editor/DishEditorPage';
import {
  isSauceProduct,
  selectCartCount,
  selectCartTotal,
  useAdminStore,
  useAuthStore,
  useCartStore,
  useOrderStore,
  useThemeStore
} from '../features/stores';
import {
  deleteProductFromSupabase,
  loadCatalog,
  replaceCatalogInSupabase,
  replaceCabinsInSupabase,
  replaceCategoriesInSupabase,
  replaceTagsInSupabase,
  saveProductToSupabase,
  saveRestaurantToSupabase,
  saveThemeToSupabase,
  hasAdminSession,
  onAdminSessionChange,
  updateProductInSupabase
} from '../shared/supabase';
import { imageFileToDataUrl } from '../shared/images';

const queryClient = new QueryClient();

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

type SettingsScreen = 'settings' | 'settings-profile' | 'settings-categories' | 'settings-design' | 'settings-stock' | 'settings-backup' | 'settings-delete';
type Screen = 'home' | 'catalog' | 'drinks' | 'product' | 'checkout' | SettingsScreen;
type ProductFlag = 'is_popular' | 'is_hidden';
type OrderFlowState = {
  step: 'sauce' | 'drink' | 'done';
  selectedSauce?: string;
  selectedDrink?: string;
};
type FlowAction = {
  type: 'sauce' | 'drink';
  selectedId?: string;
  onProductAdd: (product: Product) => void;
  onContinue: () => void;
};
type CatalogDesignExport = {
  theme?: 'light' | 'dark';
  backgroundColor?: string;
  primaryColor?: string;
  accentColor?: string;
  cardColor?: string;
  productCardColor?: string;
  productCardTextColor?: string;
  settingsCardColor?: string;
  settingsCardTextColor?: string;
  cartPanelColor?: string;
  cartPanelTextColor?: string;
  cardStyle?: 'light' | 'dark';
  textColor?: string;
  mutedTextColor?: string;
  productTitleColor?: string;
  categoryTitleColor?: string;
  radius?: number;
};
type CatalogBackupPayload = {
  restaurant?: Restaurant;
  categories?: Category[];
  cabins?: Cabin[];
  tags?: CatalogTag[];
  products?: Product[];
  design?: CatalogDesignExport;
  theme?: ThemeSettings;
};
type StockTargets = Record<string, number>;
type BackupImageField = {
  owner: 'restaurant' | 'category' | 'cabin' | 'product' | 'theme';
  id: string;
  field: 'logo_url' | 'banner_url' | 'image' | 'image_url' | 'background_image_url';
};

const defaultTags: CatalogTag[] = [
  { id: 'hit', name: 'Хит', icon: '🔥', color: '#ef4444' },
  { id: 'popular', name: 'Популярное', icon: '⭐', color: '#f59e0b' },
  { id: 'new', name: 'Новинка', icon: 'NEW', color: '#38bdf8' },
  { id: 'vegetarian', name: 'Вегетарианское', icon: '🌿', color: '#22c55e' }
];

const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const stockTargetsStorageKey = 'mangal-stock-targets';

const getCurrentStock = (product: Product) => product.current_stock ?? product.stock_count ?? 0;
const getDailyStock = (product: Product) => product.daily_stock ?? product.stock_count ?? 0;
const isLimitedProduct = (product: Product) => !product.is_unlimited;
const applyStockValues = (product: Product, dailyStock: number, currentStock = dailyStock): Product => ({
  ...product,
  daily_stock: dailyStock,
  current_stock: currentStock,
  stock_count: currentStock,
  is_unlimited: product.is_unlimited ?? false
});

const getProductCategoryIds = (product: Product) =>
  product.category_ids?.length ? product.category_ids : [product.category_id];

const loadStockTargets = (): StockTargets => {
  try {
    return JSON.parse(localStorage.getItem(stockTargetsStorageKey) ?? '{}') as StockTargets;
  } catch {
    return {};
  }
};

const saveStockTargets = (targets: StockTargets) => {
  try {
    localStorage.setItem(stockTargetsStorageKey, JSON.stringify(targets));
  } catch {
    // Local storage can be unavailable in strict/private browser modes.
  }
};

const createCatalogBackupPayload = ({
  restaurant,
  categories,
  cabins,
  tags,
  products,
  theme
}: Required<Pick<CatalogBackupPayload, 'restaurant' | 'categories' | 'cabins' | 'tags' | 'products' | 'theme'>>): CatalogBackupPayload => ({
  restaurant,
  categories,
  cabins,
  tags,
  products,
  theme,
  design: {
    theme: theme.background_color === '#f7f3ec' ? 'light' : 'dark',
    backgroundColor: theme.background_color,
    primaryColor: theme.accent_color,
    accentColor: theme.accent_secondary,
    cardColor: theme.card_color,
    productCardColor: theme.product_card_color,
    productCardTextColor: theme.product_card_text_color,
    settingsCardColor: theme.settings_card_color,
    settingsCardTextColor: theme.settings_card_text_color,
    cartPanelColor: theme.cart_panel_color,
    cartPanelTextColor: theme.cart_panel_text_color,
    cardStyle: theme.card_color === '#ffffff' ? 'light' : 'dark',
    textColor: theme.text_primary,
    mutedTextColor: theme.text_secondary,
    productTitleColor: theme.product_title_color,
    categoryTitleColor: theme.category_title_color,
    radius: theme.card_radius
  }
});

const getDataUrlParts = (value: string) => {
  const match = value.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], data: match[2] };
};

const extensionForMime = (mime: string) => {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/svg+xml') return 'svg';
  return 'bin';
};

const addBackupAsset = (
  zip: JSZip,
  field: BackupImageField,
  value: string,
  assetIndex: number
) => {
  const dataUrl = getDataUrlParts(value);
  if (!dataUrl) return value;

  const filename = `assets/${field.owner}-${field.id}-${field.field}-${assetIndex}.${extensionForMime(dataUrl.mime)}`;
  zip.file(filename, dataUrl.data, { base64: true });
  return filename;
};

const fileToDataUrl = async (file: JSZip.JSZipObject) => {
  const blob = await file.async('blob');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

const restoreBackupAsset = async (zip: JSZip, value?: string) => {
  if (!value || !value.startsWith('assets/')) return value;
  const file = zip.file(value);
  return file ? fileToDataUrl(file) : value;
};

const readCatalogBackupFile = async (file: File): Promise<CatalogBackupPayload> => {
  if (file.name.toLowerCase().endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file);
    const catalogFile = zip.file('catalog.json') ?? zip.file('mangal-catalog.json');
    if (!catalogFile) {
      throw new Error('В ZIP не найден catalog.json.');
    }

    const payload = JSON.parse(await catalogFile.async('string')) as CatalogBackupPayload;

    if (payload.restaurant) {
      payload.restaurant = {
        ...payload.restaurant,
        logo_url: (await restoreBackupAsset(zip, payload.restaurant.logo_url)) ?? '',
        banner_url: (await restoreBackupAsset(zip, payload.restaurant.banner_url)) ?? ''
      };
    }
    if (payload.categories) {
      payload.categories = await Promise.all(
        payload.categories.map(async (category) => ({
          ...category,
          image: (await restoreBackupAsset(zip, category.image)) ?? ''
        }))
      );
    }
    if (payload.cabins) {
      payload.cabins = await Promise.all(
        payload.cabins.map(async (cabin) => ({
          ...cabin,
          image_url: (await restoreBackupAsset(zip, cabin.image_url)) ?? ''
        }))
      );
    }
    if (payload.products) {
      payload.products = await Promise.all(
        payload.products.map(async (product) => ({
          ...product,
          image_url: (await restoreBackupAsset(zip, product.image_url)) ?? ''
        }))
      );
    }
    if (payload.theme) {
      payload.theme = {
        ...payload.theme,
        background_image_url: (await restoreBackupAsset(zip, payload.theme.background_image_url)) ?? ''
      };
    }

    return payload;
  }

  return JSON.parse(await file.text()) as CatalogBackupPayload;
};

const downloadCatalogZip = async (payload: CatalogBackupPayload) => {
  const zip = new JSZip();
  const catalog = structuredClone(payload);
  let assetIndex = 0;

  if (catalog.restaurant) {
    catalog.restaurant.logo_url = addBackupAsset(zip, { owner: 'restaurant', id: catalog.restaurant.id, field: 'logo_url' }, catalog.restaurant.logo_url, assetIndex++);
    catalog.restaurant.banner_url = addBackupAsset(zip, { owner: 'restaurant', id: catalog.restaurant.id, field: 'banner_url' }, catalog.restaurant.banner_url, assetIndex++);
  }
  catalog.categories = catalog.categories?.map((category) => ({
    ...category,
    image: addBackupAsset(zip, { owner: 'category', id: category.id, field: 'image' }, category.image, assetIndex++)
  }));
  catalog.cabins = catalog.cabins?.map((cabin) => ({
    ...cabin,
    image_url: addBackupAsset(zip, { owner: 'cabin', id: cabin.id, field: 'image_url' }, cabin.image_url, assetIndex++)
  }));
  catalog.products = catalog.products?.map((product) => ({
    ...product,
    image_url: addBackupAsset(zip, { owner: 'product', id: product.id, field: 'image_url' }, product.image_url, assetIndex++)
  }));
  if (catalog.theme) {
    catalog.theme.background_image_url = addBackupAsset(zip, { owner: 'theme', id: catalog.theme.id, field: 'background_image_url' }, catalog.theme.background_image_url, assetIndex++);
  }

  zip.file('catalog.json', JSON.stringify(catalog, null, 2));
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `catalogg-catalog-${new Date().toISOString().slice(0, 10)}.zip`;
  link.click();
  URL.revokeObjectURL(url);
};

const darkThemePreset: Partial<ThemeSettings> = {
  background_type: 'color',
  background_color: '#070809',
  background_image_url: '',
  card_color: '#121416',
  product_card_color: '#121416',
  product_card_text_color: '#f8f5ef',
  settings_card_color: '#121416',
  settings_card_text_color: '#f8f5ef',
  cart_panel_color: '#111111',
  cart_panel_text_color: '#f8f5ef',
  text_primary: '#f8f5ef',
  text_secondary: '#aaa39a',
  product_title_color: '#f8f5ef',
  category_title_color: '#f8f5ef',
  card_shadow: '0 18px 46px rgba(0, 0, 0, 0.28)'
};

const lightThemePreset: Partial<ThemeSettings> = {
  background_type: 'color',
  background_color: '#f7f3ec',
  background_image_url: '',
  card_color: '#ffffff',
  product_card_color: '#ffffff',
  product_card_text_color: '#181510',
  settings_card_color: '#ffffff',
  settings_card_text_color: '#181510',
  cart_panel_color: '#ffffff',
  cart_panel_text_color: '#181510',
  text_primary: '#181510',
  text_secondary: '#766d62',
  product_title_color: '#111827',
  category_title_color: '#ffffff',
  card_shadow: '0 18px 46px rgba(45, 35, 20, 0.12)'
};

const readableTextFor = (color: string) => {
  const hex = color.trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return '#f8f5ef';
  }
  const [r, g, b] = [0, 2, 4].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 160 ? '#181510' : '#f8f5ef';
};

const iconMap = {
  pot: ChefHat,
  chef: ChefHat,
  utensils: Utensils,
  chechen: UtensilsCrossed,
  galnash: UtensilsCrossed,
  pizza: Pizza,
  burger: Beef,
  meat: Ham,
  kebab: Drumstick,
  chicken: Drumstick,
  sushi: Fish,
  fish: Fish,
  shawarma: Sandwich,
  sandwich: Sandwich,
  salad: Salad,
  soup: Soup,
  sauce: Soup,
  sauces: Soup,
  flame: Flame,
  hot: Flame,
  bottle: ShoppingBag,
  glass: Coffee,
  water: GlassWater,
  soda: CupSoda,
  drink: CupSoda,
  tea: Coffee,
  coffee: Coffee,
  milk: Milk,
  dessert: CakeSlice,
  cake: CakeSlice,
  cookie: Cookie,
  bakery: Croissant,
  bread: Wheat,
  icecream: IceCreamBowl,
  home: Home
};

const categoryIconOptions = [
  { id: 'flame', label: 'Огонь', Icon: Flame },
  { id: 'pot', label: 'Кухня', Icon: ChefHat },
  { id: 'utensils', label: 'Общее меню', Icon: Utensils },
  { id: 'chechen', label: 'Жижиг галнаш', Icon: UtensilsCrossed },
  { id: 'pizza', label: 'Пицца', Icon: Pizza },
  { id: 'burger', label: 'Бургер', Icon: Beef },
  { id: 'shawarma', label: 'Шаурма', Icon: Sandwich },
  { id: 'sushi', label: 'Суши', Icon: Fish },
  { id: 'meat', label: 'Мясо', Icon: Ham },
  { id: 'kebab', label: 'Шашлык', Icon: Drumstick },
  { id: 'sauce', label: 'Соусы', Icon: Soup },
  { id: 'salad', label: 'Салаты', Icon: Salad },
  { id: 'soup', label: 'Супы', Icon: Soup },
  { id: 'drink', label: 'Напитки', Icon: CupSoda },
  { id: 'water', label: 'Вода', Icon: GlassWater },
  { id: 'bottle', label: 'Бутылка', Icon: ShoppingBag },
  { id: 'glass', label: 'Кофе', Icon: Coffee },
  { id: 'tea', label: 'Чай', Icon: Coffee },
  { id: 'milk', label: 'Молочное', Icon: Milk },
  { id: 'dessert', label: 'Десерты', Icon: CakeSlice },
  { id: 'icecream', label: 'Мороженое', Icon: IceCreamBowl },
  { id: 'bakery', label: 'Выпечка', Icon: Croissant },
  { id: 'bread', label: 'Хлеб', Icon: Wheat },
  { id: 'cookie', label: 'Сладкое', Icon: Cookie },
  { id: 'home', label: 'Зал', Icon: Home }
] as const;

function applyTheme(theme: ThemeSettings) {
  return {
    '--bg': theme.background_color,
    '--card': theme.card_color,
    '--product-card': theme.product_card_color ?? theme.card_color,
    '--product-card-text': theme.product_card_text_color ?? theme.text_primary ?? '#181510',
    '--settings-card': theme.settings_card_color ?? theme.card_color,
    '--settings-card-text': theme.settings_card_text_color ?? theme.text_primary ?? '#181510',
    '--cart-panel': theme.cart_panel_color ?? '#111111',
    '--cart-panel-text': theme.cart_panel_text_color ?? theme.text_primary ?? '#f8f5ef',
    '--radius': `${theme.card_radius}px`,
    '--shadow': theme.card_shadow,
    '--text': theme.text_primary ?? '#f8f5ef',
    '--muted': theme.text_secondary ?? '#aaa39a',
    '--product-title': theme.product_title_color ?? theme.text_primary ?? '#f8f5ef',
    '--category-title': theme.category_title_color ?? theme.text_primary ?? '#f8f5ef',
    '--accent': theme.accent_color,
    '--accent-2': theme.accent_secondary,
    '--button-radius': `${theme.button_radius}px`,
    '--primary-bg':
      theme.button_style === 'filled'
        ? `linear-gradient(135deg, ${theme.accent_secondary}, ${theme.accent_color})`
        : 'transparent',
    '--primary-text': theme.button_style === 'filled' ? '#1b1408' : theme.accent_secondary,
    backgroundImage:
      theme.background_type === 'image' && theme.background_image_url
        ? `linear-gradient(rgba(5, 6, 7, 0.78), rgba(5, 6, 7, 0.92)), url(${theme.background_image_url})`
        : undefined
  } as React.CSSProperties;
}

function Logo({
  compact = false,
  logoUrl,
  name,
  subtitle
}: {
  compact?: boolean;
  logoUrl?: string;
  name?: string;
  subtitle?: string;
}) {
  return (
    <div className={compact ? 'brand-logo brand-logo--compact' : 'brand-logo'}>
      {logoUrl && <img src={logoUrl} alt="" />}
      <div>
        <strong>{name?.trim() || 'Каталог'}</strong>
        {!compact && <span>{subtitle?.trim() || 'каталог'}</span>}
      </div>
    </div>
  );
}

function SafeImage({ src, alt, className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  const label = alt || 'Изображение';

  if (!src || failed) {
    return (
      <div className={className ? `image-fallback ${className}` : 'image-fallback'} role="img" aria-label={label}>
        <em>{label}</em>
      </div>
    );
  }

  return <img {...props} className={className} src={src} alt={alt} onError={() => setFailed(true)} />;
}

function TopBar({
  title,
  canBack,
  onBack,
  onSearch,
  onCart,
  onAdmin,
  logoUrl,
  restaurantName,
  restaurantSubtitle
}: {
  title?: string;
  canBack?: boolean;
  onBack: () => void;
  onSearch?: () => void;
  onCart: () => void;
  onAdmin?: () => void;
  logoUrl?: string;
  restaurantName?: string;
  restaurantSubtitle?: string;
}) {
  const items = useCartStore((state) => state.items);
  const count = selectCartCount(items);

  return (
    <header className="top-bar">
      <button className="icon-button top-bar__button" type="button" onClick={canBack ? onBack : onAdmin} aria-label="Назад">
        {canBack ? <ArrowLeft /> : <User />}
      </button>
      {title ? (
        <h1 className="screen-title">{title}</h1>
      ) : (
        <Logo logoUrl={logoUrl} name={restaurantName} subtitle={restaurantSubtitle} />
      )}
      <div className="top-bar__actions">
        {onSearch && (
          <button className="icon-button top-bar__button" type="button" onClick={onSearch} aria-label="Поиск">
            <Search />
          </button>
        )}
        <button className="icon-button top-bar__button cart-icon" type="button" onClick={onCart} aria-label="Корзина">
          <ShoppingCart />
          {count > 0 && <span>{count}</span>}
        </button>
      </div>
    </header>
  );
}

function CategoryPills({
  categories,
  active,
  onSelect,
  includeAll = true
}: {
  categories: Category[];
  active: string;
  onSelect: (id: string) => void;
  includeAll?: boolean;
}) {
  return (
    <div className="pills">
      {includeAll && (
        <button className={active === 'all' ? 'pill is-active' : 'pill'} type="button" onClick={() => onSelect('all')}>
          Все
        </button>
      )}
      {categories.map((category) => (
        <button
          className={active === category.id ? 'pill is-active' : 'pill'}
          type="button"
          key={category.id}
          onClick={() => onSelect(category.id)}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}

function ProductTile({
  product,
  variant = 'compact',
  onOpen,
  onEdit,
  onDelete,
  onToggle,
  onStockChange,
  onAdd
}: {
  product: Product;
  variant?: 'compact' | 'large' | 'drink';
  onOpen: (product: Product) => void;
  onEdit?: (product: Product) => void;
  onDelete?: (productId: string) => void;
  onToggle?: (productId: string, key: ProductFlag) => void;
  onStockChange?: (productId: string, stockCount: number) => void;
  onAdd?: (product: Product) => void;
}) {
  const add = useCartStore((state) => state.add);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const currentStock = getCurrentStock(product);
  const soldOut = isLimitedProduct(product) && currentStock <= 0;

  return (
    <article
      className={`product-tile product-tile--${variant}${product.is_hidden ? ' is-hidden' : ''}${soldOut ? ' is-sold-out' : ''}`}
      onClick={() => onOpen(product)}
    >
      <div className="product-tile__image">
        <SafeImage src={product.image_url} alt={product.title} loading="lazy" />
        {product.is_popular && (
          <span className="product-state product-state--popular">
            <Star />
          </span>
        )}
        {product.is_hidden && <span className="product-state product-state--hidden">Скрыто</span>}
        {soldOut && <span className="product-state product-state--sold-out">Закончилось</span>}
        {isAdmin && (
          <div className="admin-card-tools" onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label="Редактировать" onClick={() => onEdit?.(product)}>
              <Edit3 />
            </button>
            <button
              type="button"
              aria-label="Минус один остаток"
              disabled={!isLimitedProduct(product) || currentStock <= 0}
              onClick={() => onStockChange?.(product.id, Math.max(0, currentStock - 1))}
            >
              -1
            </button>
            <button
              className={product.is_popular ? 'is-on' : ''}
              type="button"
              aria-label="Популярное"
              onClick={() => onToggle?.(product.id, 'is_popular')}
            >
              <Star />
            </button>
            <button
              className={product.is_hidden ? 'is-on' : ''}
              type="button"
              aria-label={product.is_hidden ? 'Показать' : 'Скрыть'}
              onClick={() => onToggle?.(product.id, 'is_hidden')}
            >
              {product.is_hidden ? <EyeOff /> : <Eye />}
            </button>
            <button type="button" aria-label="Удалить" onClick={() => onDelete?.(product.id)}>
              <Trash2 />
            </button>
            <span className="admin-stock-count">
              Остаток: {isLimitedProduct(product) ? currentStock : 'без лимита'}
            </span>
          </div>
        )}
      </div>
      <div className="product-tile__body">
        <div>
          <h3>{product.title}</h3>
          <p>{soldOut ? 'Закончилось' : product.description}</p>
        </div>
        <div className="product-tile__bottom">
          <strong>{formatPrice(product.price)}</strong>
          <button
            className="add-button"
            type="button"
            disabled={soldOut}
            aria-label={`Добавить ${product.title}`}
            onClick={(event) => {
              event.stopPropagation();
              add(product);
              onAdd?.(product);
            }}
          >
            <Plus />
          </button>
        </div>
      </div>
    </article>
  );
}

function CartBar({ onCheckout, onContinue }: { onCheckout: () => void; onContinue: () => void }) {
  const items = useCartStore((state) => state.items);
  const count = selectCartCount(items);
  const total = selectCartTotal(items);

  if (count === 0) {
    return null;
  }

  return (
    <div className="cart-bar">
      <span className="cart-bar__icon">
        <ShoppingCart />
        <b>{count}</b>
      </span>
      <button className="cart-bar__details" type="button" onClick={onCheckout}>
        <strong>В корзине {count} товара</strong>
        <small>{items.map((item) => item.product.title).join(', ')}</small>
      </button>
      <b>{formatPrice(total)}</b>
      <button className="cart-bar__go" type="button" onClick={onContinue} aria-label="Продолжить">
        <ArrowRight />
      </button>
    </div>
  );
}

function CartSheet({
  isOpen,
  isLoading,
  onClose,
  onCheckout,
  onMenu
}: {
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onCheckout: () => void;
  onMenu: () => void;
}) {
  const items = useCartStore((state) => state.items);
  const add = useCartStore((state) => state.add);
  const decrement = useCartStore((state) => state.decrement);
  const remove = useCartStore((state) => state.remove);
  const count = selectCartCount(items);
  const subtotal = selectCartTotal(items);
  const delivery = 0;
  const total = subtotal + delivery;
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const closeOnSwipe = (clientY: number) => {
    if (touchStartY.current !== null && clientY - touchStartY.current > 70) {
      onClose();
    }
    touchStartY.current = null;
  };

  return (
    <div className="cart-sheet-backdrop" onClick={onClose}>
      <section
        className="cart-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Корзина"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => {
          touchStartY.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchEnd={(event) => {
          closeOnSwipe(event.changedTouches[0]?.clientY ?? 0);
        }}
      >
        <div className="cart-sheet__handle" />
        <header className="cart-sheet__header">
          <div>
            <h2>Корзина</h2>
            <p>{count} товаров</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть корзину">
            <X />
          </button>
        </header>

        {isLoading && (
          <div className="cart-sheet__list">
            {[1, 2, 3].map((item) => (
              <div className="cart-skeleton" key={item}>
                <span />
                <div>
                  <b />
                  <b />
                  <b />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && count === 0 && (
          <div className="cart-empty">
            <ShoppingCart />
            <h3>Корзина пуста</h3>
            <button className="primary-wide" type="button" onClick={onMenu}>
              Перейти к меню
            </button>
          </div>
        )}

        {!isLoading && count > 0 && (
          <>
            <div className="cart-sheet__list">
              {items.map((item) => (
                <article className="cart-item-card" key={item.product.id}>
                  <SafeImage src={item.product.image_url} alt={item.product.title} />
                  <div className="cart-item-card__content">
                    <div className="cart-item-card__top">
                      <div>
                        <h3>{item.product.title}</h3>
                        <p>{item.product.description}</p>
                      </div>
                      <button className="cart-item-card__remove" type="button" onClick={() => remove(item.product.id)} aria-label={`Удалить ${item.product.title}`}>
                        <Trash2 />
                      </button>
                    </div>
                    <div className="cart-item-card__bottom">
                      <strong>{formatPrice(item.product.price)}</strong>
                      <div className="cart-quantity" aria-label={`Количество ${item.product.title}`}>
                        <button type="button" onClick={() => decrement(item.product.id)} aria-label="Уменьшить">
                          <Minus />
                        </button>
                        <span>{item.quantity}</span>
                        <button type="button" onClick={() => add(item.product)} aria-label="Увеличить">
                          <Plus />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <section className="cart-summary">
              <p>
                <span>Сумма товаров</span>
                <strong>{formatPrice(subtotal)}</strong>
              </p>
              <p>
                <span>Доставка</span>
                <strong>{formatPrice(delivery)}</strong>
              </p>
              <p className="cart-summary__total">
                <span>Итого</span>
                <strong>{formatPrice(total)}</strong>
              </p>
            </section>

            <button className="primary-wide cart-checkout" type="button" onClick={onCheckout}>
              Оформить заказ <ArrowRight />
            </button>
            <p className="cart-safe">
              <ShieldCheck /> Безопасная оплата
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function HomeScreen({
  restaurant,
  categories,
  products,
  onOpenCatalog,
  onOpenDrinks,
  onOpenProduct,
  onEditProduct,
  onDeleteProduct,
  onToggleProduct,
  onStockChange
}: {
  restaurant: Restaurant;
  categories: Category[];
  products: Product[];
  onOpenCatalog: (categoryId?: string) => void;
  onOpenDrinks: (categoryId?: string) => void;
  onOpenProduct: (product: Product) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onToggleProduct: (productId: string, key: ProductFlag) => void;
  onStockChange: (productId: string, stockCount: number) => void;
}) {
  const [active, setActive] = useState('chechen');
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const visibleProducts = isAdmin ? products : products.filter((product) => !product.is_hidden);
  const featuredCategories = categories.filter((category) => category.showOnHome !== false);
  const popular = visibleProducts.filter((product) => product.is_popular).slice(0, 6);
  const whatsapp = restaurant.whatsapp.replace(/[^\d]/g, '');
  const openRestaurantMap = () => {
    if (!restaurant.mapLink) {
      alert('Карта не указана');
      return;
    }
    window.open(restaurant.mapLink, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="screen">
      <CategoryPills
        categories={categories.filter((category) => category.kind !== 'space').slice(0, 5)}
        active={active}
        onSelect={(id) => {
          setActive(id);
          const category = categories.find((item) => item.id === id);
          if (category?.kind === 'drink') {
            onOpenDrinks(category.id);
            return;
          }
          onOpenCatalog(id);
        }}
        includeAll={false}
      />

      <section className="category-grid">
        {featuredCategories.map((category) => {
          const Icon = iconMap[category.icon as keyof typeof iconMap] ?? ChefHat;
          return (
            <button
              className="category-card"
              type="button"
              key={category.id}
              onClick={() => {
                if (category.kind === 'drink') {
                  onOpenDrinks(category.id);
                  return;
                }
                onOpenCatalog(category.id);
              }}
            >
              <SafeImage src={category.image} alt={category.name} loading="lazy" />
              <span>
                <Icon />
              </span>
              <strong>{category.name}</strong>
              <ArrowRight />
            </button>
          );
        })}
      </section>

      <section className="section-head">
        <h2>Популярное</h2>
        <button type="button" onClick={() => onOpenCatalog()}>
          Показать все <ArrowRight />
        </button>
      </section>

      <section className="popular-grid">
        {popular.map((product) => (
          <ProductTile
            key={product.id}
            product={product}
            onOpen={onOpenProduct}
            onEdit={onEditProduct}
            onDelete={onDeleteProduct}
            onToggle={onToggleProduct}
            onStockChange={onStockChange}
          />
        ))}
      </section>

      <section className="social-section">
        <div>
          <h2>Наши соцсети</h2>
          <p>Свяжитесь с нами удобным способом</p>
        </div>
        <div className="social-actions">
          <a href={restaurant.instagram_url || 'https://instagram.com/'} target="_blank" rel="noreferrer">
            <Instagram /> Instagram
          </a>
          <a href={`https://wa.me/${whatsapp || '79990000000'}`} target="_blank" rel="noreferrer">
            <MessageCircle /> WhatsApp
          </a>
          <button className="social-location-button" type="button" onClick={openRestaurantMap}>
            <MapPin /> Мы находимся
          </button>
        </div>
      </section>
    </main>
  );
}

function CatalogScreen({
  categories,
  products,
  initialCategory,
  onOpenProduct,
  onEditProduct,
  onDeleteProduct,
  onToggleProduct,
  onStockChange,
  flowAction
}: {
  categories: Category[];
  products: Product[];
  initialCategory: string;
  onOpenProduct: (product: Product) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onToggleProduct: (productId: string, key: ProductFlag) => void;
  onStockChange: (productId: string, stockCount: number) => void;
  flowAction?: FlowAction;
}) {
  const [active, setActive] = useState(initialCategory);
  const [query, setQuery] = useState('');
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const foodCategories = categories.filter((category) => category.kind !== 'space');
  const visibleProducts = isAdmin ? products : products.filter((product) => !product.is_hidden);
  const hasSauces = visibleProducts.some(isSauceProduct);

  useEffect(() => {
    setActive(initialCategory);
  }, [initialCategory]);

  const filtered = visibleProducts.filter((product) => {
    const categoryMatch =
      active === 'all' ||
      getProductCategoryIds(product).includes(active) ||
      (active === 'hits' && product.is_hit) ||
      (active === 'sauces' && isSauceProduct(product));
    const queryMatch = [product.title, product.description, product.ingredients].join(' ').toLowerCase().includes(query.toLowerCase());
    return categoryMatch && queryMatch;
  });

  return (
    <main className="screen">
      <label className="search-field">
        <Search />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти блюдо" />
      </label>
      <div className="pills">
        <button className={active === 'all' ? 'pill is-active' : 'pill'} type="button" onClick={() => setActive('all')}>
          Все
        </button>
        <button className={active === 'hits' ? 'pill is-active' : 'pill'} type="button" onClick={() => setActive('hits')}>
          Хиты <Flame />
        </button>
        {hasSauces && (
          <button className={active === 'sauces' ? 'pill is-active' : 'pill'} type="button" onClick={() => setActive('sauces')}>
            Соусы
          </button>
        )}
        {foodCategories.map((category) => (
          <button
            key={category.id}
            className={active === category.id ? 'pill is-active' : 'pill'}
            type="button"
            onClick={() => setActive(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>
      <section className="catalog-grid">
        {filtered.map((product) => (
          <ProductTile
            key={product.id}
            product={product}
            variant="large"
            onOpen={onOpenProduct}
            onEdit={onEditProduct}
            onDelete={onDeleteProduct}
            onToggle={onToggleProduct}
            onStockChange={onStockChange}
            onAdd={flowAction?.type === 'sauce' && active === 'sauces' ? flowAction.onProductAdd : undefined}
          />
        ))}
      </section>
      {flowAction?.type === 'sauce' && active === 'sauces' && flowAction.selectedId && (
        <button className="flow-continue-bar" type="button" onClick={flowAction.onContinue}>
          Продолжить <ArrowRight />
        </button>
      )}
    </main>
  );
}

function DrinksScreen({
  categories,
  products,
  initialCategory,
  onOpenProduct,
  onEditProduct,
  onDeleteProduct,
  onToggleProduct,
  onStockChange,
  flowAction
}: {
  categories: Category[];
  products: Product[];
  initialCategory: string;
  onOpenProduct: (product: Product) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onToggleProduct: (productId: string, key: ProductFlag) => void;
  onStockChange: (productId: string, stockCount: number) => void;
  flowAction?: FlowAction;
}) {
  const [active, setActive] = useState(initialCategory);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const visibleProducts = isAdmin ? products : products.filter((product) => !product.is_hidden);
  const drinkCategories = categories.filter((category) => category.kind === 'drink');
  const drinks = visibleProducts.filter((product) => product.drink_type && (active === 'all' || getProductCategoryIds(product).includes(active)));

  useEffect(() => {
    setActive(initialCategory);
  }, [initialCategory]);

  return (
    <main className="screen">
      <div className="pills">
        <button className={active === 'all' ? 'pill is-active' : 'pill'} type="button" onClick={() => setActive('all')}>
          Все
        </button>
        {drinkCategories.map((category) => (
          <button className={active === category.id ? 'pill is-active' : 'pill'} type="button" key={category.id} onClick={() => setActive(category.id)}>
            {category.name}
          </button>
        ))}
      </div>
      <section className="drink-grid">
        {drinks.map((product) => (
          <ProductTile
            key={product.id}
            product={product}
            variant="drink"
            onOpen={onOpenProduct}
            onEdit={onEditProduct}
            onDelete={onDeleteProduct}
            onToggle={onToggleProduct}
            onStockChange={onStockChange}
            onAdd={flowAction?.type === 'drink' ? flowAction.onProductAdd : undefined}
          />
        ))}
      </section>
      {flowAction?.type === 'drink' && flowAction.selectedId && (
        <button className="flow-continue-bar" type="button" onClick={flowAction.onContinue}>
          Продолжить <ArrowRight />
        </button>
      )}
    </main>
  );
}

function ProductScreen({
  product,
  products,
  onOpenProduct,
  flowAction
}: {
  product: Product;
  products: Product[];
  onOpenProduct: (product: Product) => void;
  flowAction?: FlowAction;
}) {
  const add = useCartStore((state) => state.add);
  const decrement = useCartStore((state) => state.decrement);
  const items = useCartStore((state) => state.items);
  const quantity = items.find((item) => item.product.id === product.id)?.quantity ?? 0;
  const pairs = product.pair_ids.map((id) => products.find((item) => item.id === id)).filter((item): item is Product => Boolean(item));
  const isFlowProduct =
    (flowAction?.type === 'sauce' && isSauceProduct(product)) ||
    (flowAction?.type === 'drink' && Boolean(product.drink_type));

  const addProduct = () => {
    add(product);
    if (isFlowProduct) {
      flowAction?.onProductAdd(product);
    }
  };

  return (
    <main className="screen product-screen">
      <SafeImage className="product-hero" src={product.image_url} alt={product.title} />
      <div className="product-heading">
        <div>
          <h2>{product.title}</h2>
          <strong>{formatPrice(product.price)}</strong>
        </div>
        {product.is_hit && (
          <span className="hit-badge">
            <Flame /> Хит
          </span>
        )}
      </div>
      <p className="product-description">{product.description}</p>

      <dl className="facts">
        <div>
          <dt>Состав</dt>
          <dd>{product.ingredients}</dd>
        </div>
        <div>
          <dt>Вес</dt>
          <dd>{product.weight}</dd>
        </div>
        <div>
          <dt>Подаётся</dt>
          <dd>{product.serving}</dd>
        </div>
      </dl>

      <div className="quantity">
        <button type="button" onClick={() => decrement(product.id)} aria-label="Уменьшить">
          <Minus />
        </button>
        <strong>{quantity}</strong>
        <button type="button" onClick={addProduct} aria-label="Увеличить">
          <Plus />
        </button>
      </div>

      <h3 className="subhead">Часто берут вместе</h3>
      <section className="pair-grid">
        {pairs.map((item) => (
          <ProductTile key={item.id} product={item} onOpen={onOpenProduct} />
        ))}
      </section>

      <button className="primary-wide" type="button" onClick={addProduct} disabled={isLimitedProduct(product) && getCurrentStock(product) <= 0}>
        {isLimitedProduct(product) && getCurrentStock(product) <= 0 ? 'Закончилось' : `Добавить в корзину - ${formatPrice(product.price)}`}
      </button>
      {isFlowProduct && flowAction?.selectedId && (
        <button className="flow-continue-bar flow-continue-bar--inline" type="button" onClick={flowAction.onContinue}>
          Продолжить <ArrowRight />
        </button>
      )}
    </main>
  );
}

function CheckoutScreen({ restaurant, cabins, onSubmitOrder }: { restaurant: Restaurant; cabins: Cabin[]; onSubmitOrder: () => void }) {
  const { mode, cabinId, setOrder } = useOrderStore();
  const items = useCartStore((state) => state.items);
  const total = selectCartTotal(items);
  const selectedCabin = cabins.find((cabin) => cabin.id === cabinId);
  const orderLines = [
    'Здравствуйте! Хочу оформить заказ.',
    '',
    'Заказ:',
    ...items.map((item, index) => `${index + 1}. ${item.product.title} - ${item.quantity} шт. x ${formatPrice(item.product.price)}`),
    '',
    `Итого: ${formatPrice(total)}`,
    '',
    'Получение:',
    mode === 'hall' ? `В зале${selectedCabin ? `, ${selectedCabin.title}` : ''}` : 'На вынос',
    '',
    'Комментарий:',
    'Пожалуйста, подтвердите заказ.'
  ];
  const whatsappText = encodeURIComponent(orderLines.join('\n'));
  const whatsappHref = restaurant.whatsapp
    ? `https://wa.me/${restaurant.whatsapp.replace(/\D/g, '')}?text=${whatsappText}`
    : '#';
  const openRestaurantMap = () => {
    if (!restaurant.mapLink) {
      alert('Карта не указана');
      return;
    }
    window.open(restaurant.mapLink, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="screen checkout-screen">
      <section className="checkout-segment" aria-label="Тип заказа">
        <button className={mode === 'hall' ? 'checkout-segment__button is-active' : 'checkout-segment__button'} type="button" onClick={() => setOrder({ mode: 'hall', cabinId: cabinId || 'cabin-1' })}>
          <ShoppingCart />
          В зале
        </button>
        <button className={mode === 'takeaway' ? 'checkout-segment__button is-active' : 'checkout-segment__button'} type="button" onClick={() => setOrder({ mode: 'takeaway', cabinId: '' })}>
          <ShoppingBag />
          На вынос
        </button>
      </section>

      {mode === 'hall' && (
        <>
          <section className="checkout-section-head">
            <h2>Кабинки</h2>
            <p>Выберите кабинку в зале</p>
          </section>
          <section className="checkout-cabin-grid">
            {cabins.map(({ id, title, image_url }) => {
              const Icon = id === 'main-hall' ? Users : Home;
              return (
              <button className={cabinId === id ? 'checkout-cabin is-active' : 'checkout-cabin'} type="button" key={id} onClick={() => setOrder({ cabinId: id })}>
                <SafeImage className="checkout-cabin__image" src={image_url} alt={title} />
                <span className="checkout-cabin__overlay" />
                {cabinId === id && (
                  <span className="checkout-cabin__check">
                    <Check />
                  </span>
                )}
                <span className="checkout-cabin__label">
                  <Icon />
                  <strong>{title}</strong>
                </span>
              </button>
              );
            })}
          </section>
        </>
      )}

      {mode === 'takeaway' && (
        <section className="takeaway-note">
          <div className="takeaway-note__message">
            <Package />
            <strong>Вы заберёте заказ самостоятельно</strong>
          </div>
          <div className="restaurant-address">
            <span>Адрес ресторана</span>
            <strong>{restaurant.address || 'Адрес не указан'}</strong>
            <button className="map-link-button" type="button" onClick={openRestaurantMap}>
              <MapPin />
              <span>Показать на карте</span>
            </button>
          </div>
        </section>
      )}

      <section className="checkout-summary">
        <div>
          <span>Финальный шаг</span>
          <h2>Проверьте заказ</h2>
          <p>
            {mode === 'hall'
              ? `Заказ будет подготовлен для зала${selectedCabin ? `, место: ${selectedCabin.title}.` : '.'}`
              : 'Заказ будет подготовлен на самовывоз.'}
          </p>
        </div>
        <div className="checkout-summary__list">
          {items.map((item) => (
            <article className="checkout-order-card" key={item.product.id}>
              <SafeImage src={item.product.image_url} alt={item.product.title} />
              <div className="checkout-order-card__body">
                <div>
                  <h3>{item.product.title}</h3>
                  <p>{item.product.description}</p>
                </div>
                <div className="checkout-order-card__bottom">
                  <strong>{formatPrice(item.product.price)}</strong>
                  <span>{item.quantity} x {formatPrice(item.product.price * item.quantity)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="checkout-summary__total">
          <span>Итого</span>
          <strong>{formatPrice(total)}</strong>
        </div>
        <a
          className={restaurant.whatsapp ? 'primary-wide checkout-summary__action' : 'primary-wide checkout-summary__action is-disabled'}
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            if (!restaurant.whatsapp) {
              event.preventDefault();
              return;
            }
            event.preventDefault();
            window.open(whatsappHref, '_blank', 'noopener,noreferrer');
            window.setTimeout(onSubmitOrder, 500);
          }}
        >
          Отправить заказ
        </a>
      </section>
    </main>
  );
}

function UpsellReminder({
  type,
  products,
  selectedId,
  onSkip,
  onBrowse,
  onDismiss
}: {
  type: 'sauce' | 'drink';
  products: Product[];
  selectedId?: string;
  onSkip: () => void;
  onBrowse: (product?: Product) => void;
  onDismiss: () => void;
}) {
  const isSauces = type === 'sauce';
  const suggestions = products
    .filter((product) => (isSauces ? isSauceProduct(product) : Boolean(product.drink_type)))
    .slice(0, 4);

  return (
    <div className="modal-backdrop flow-backdrop">
      <section className="drink-modal flow-modal">
        <div className="modal-handle" />
        <button className="flow-modal__close" type="button" onClick={onDismiss} aria-label="Закрыть">
          <X />
        </button>
        {isSauces ? <ChefHat className="modal-icon" /> : <Coffee className="modal-icon" />}
        <h2>{isSauces ? 'Выберите соусы' : 'Выберите напитки'}</h2>
        <p>{isSauces ? 'Откройте категорию и выберите соус к заказу.' : 'Откройте категорию и выберите напиток к заказу.'}</p>
        <div className="modal-drinks">
          {suggestions.map((product) => (
            <article className="flow-option-card" key={product.id} onClick={() => onBrowse(product)}>
              <SafeImage src={product.image_url} alt={product.title} />
              <strong>{product.title}</strong>
            </article>
          ))}
        </div>
        {suggestions.length === 0 && (
          <p className="modal-empty">
            {isSauces ? 'Соусов пока нет в каталоге.' : 'Напитков пока нет в каталоге.'}
          </p>
        )}
        {!selectedId && (
          <button className="primary-wide" type="button" onClick={() => onBrowse()}>
            {isSauces ? 'Выбрать соус' : 'Выбрать напиток'}
          </button>
        )}
        <button className="ghost-wide" type="button" onClick={onSkip}>
          {isSauces ? 'Продолжить без соуса' : 'Продолжить без напитка'}
        </button>
      </section>
    </div>
  );
}

function LoginModal({
  catalogSlug,
  onClose,
  onSuccess
}: {
  catalogSlug: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const login = useAuthStore((state) => state.login);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setIsLoading(true);
    setError('');
    const success = await login(String(formData.get('email')), String(formData.get('password')), catalogSlug);
    setIsLoading(false);
    if (success) {
      onSuccess();
      onClose();
      return;
    }
    setError('Неверный email или пароль.');
  };

  return (
    <div className="modal-backdrop">
      <form className="login-modal" onSubmit={submit}>
        <Logo compact />
        <label>
          Email
          <input name="email" type="email" placeholder="admin@example.com" autoCapitalize="none" autoComplete="email" required />
        </label>
        <label>
          Пароль
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {error && <p>{error}</p>}
        <button className="primary-wide" type="submit" disabled={isLoading}>
          {isLoading ? 'Входим...' : 'Войти'}
        </button>
        <button className="ghost-wide" type="button" onClick={onClose}>
          Закрыть
        </button>
      </form>
    </div>
  );
}

function AdminPanel({ onAdd, onSettings }: { onAdd: () => void; onSettings: () => void }) {
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const logout = useAuthStore((state) => state.logout);

  if (!isAdmin) {
    return null;
  }

  return (
    <nav className="admin-panel">
      <button type="button" onClick={onAdd}>
        <Plus /> Добавить
      </button>
      <button type="button" onClick={onSettings}>
        <Settings /> Настройки
      </button>
      <button type="button" onClick={logout} aria-label="Выйти">
        <LogOut /> Выход
      </button>
    </nav>
  );
}

function SettingsHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="settings-header">
      <button className="icon-button" type="button" onClick={onBack} aria-label="Назад">
        <ArrowLeft />
      </button>
      <h1>{title}</h1>
      <span />
    </header>
  );
}

function SettingsHome({ onOpen }: { onOpen: (screen: SettingsScreen) => void }) {
  const items = [
    ['settings-profile', Store, 'Профиль ресторана', 'Название + контакты'],
    ['settings-categories', Tags, 'Параметры и категории', 'Категории + метки'],
    ['settings-design', Paintbrush, 'Дизайн приложения', 'Цвета, тема'],
    ['settings-stock', Package, 'ОБНОВИТЬ БЛЮДА', 'Остатки на день'],
    ['settings-backup', CloudUpload, 'Импорт и экспорт', 'Бэкапы'],
    ['settings-delete', Trash2, 'Удалить каталог', 'Красная зона']
  ] as const;

  return (
    <main className="settings-screen">
      {items.map(([target, Icon, title, subtitle]) => (
        <button
          className={target === 'settings-delete' ? 'settings-card settings-card--danger' : 'settings-card'}
          type="button"
          key={target}
          onClick={() => onOpen(target)}
        >
          <Icon />
          <span>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </span>
          <ArrowRight />
        </button>
      ))}
    </main>
  );
}

function ProfileSettings({
  restaurant,
  onSave
}: {
  restaurant: Restaurant;
  onSave: (restaurant: Restaurant) => void;
}) {
  const [draft, setDraft] = useState(restaurant);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(restaurant);
  }, [restaurant]);

  const updateLogo = async (file?: File) => {
    if (!file) return;
    if (file.type !== 'image/png') {
      setError('Логотип должен быть в PNG.');
      return;
    }
    const value = await imageFileToDataUrl(file, 'logo');
    setDraft((current) => ({ ...current, logo_url: value }));
    setError('');
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError('Название ресторана обязательно.');
      return;
    }
    if (draft.whatsapp && !/^\+?\d{10,15}$/.test(draft.whatsapp)) {
      setError('WhatsApp должен быть в формате +79990000000.');
      return;
    }
    if (draft.instagram_url) {
      try {
        const url = new URL(draft.instagram_url);
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error('invalid');
        }
      } catch {
        setError('Instagram должен быть корректной ссылкой.');
        return;
      }
    }
    onSave({ ...draft, name: draft.name.trim() });
    setError('Сохранено');
  };

  return (
    <main className="settings-screen">
      <form className="settings-form-card" onSubmit={submit}>
        <div className="profile-field">
          <span>Название ресторана</span>
          <div className="profile-identity-field">
            <label className="profile-logo-picker" aria-label="Заменить логотип">
              <input
                type="file"
                accept="image/png"
                onChange={(event) => void updateLogo(event.target.files?.[0])}
              />
              {draft.logo_url ? <img src={draft.logo_url} alt="" /> : <Store />}
            </label>
            <input
              value={draft.name}
              required
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>
          <div className="profile-logo-actions">
            <small>Нажмите на логотип, чтобы заменить PNG.</small>
            {draft.logo_url && (
              <button type="button" onClick={() => setDraft({ ...draft, logo_url: '' })}>
                Удалить логотип
              </button>
            )}
          </div>
        </div>
        <label>
          Описание
          <textarea
            maxLength={200}
            value={draft.subtitle}
            onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })}
          />
          <small>{draft.subtitle.length}/200</small>
        </label>
        <label>
          WhatsApp
          <input
            type="tel"
            value={draft.whatsapp}
            placeholder="+79990000000"
            onChange={(event) => setDraft({ ...draft, whatsapp: event.target.value.replace(/[^\d+]/g, '') })}
          />
        </label>
        <label>
          Instagram
          <input
            type="url"
            value={draft.instagram_url}
            placeholder="https://instagram.com/restaurant"
            onChange={(event) => setDraft({ ...draft, instagram_url: event.target.value })}
          />
        </label>
        <label>
          Адрес
          <input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} />
        </label>
        <label>
          Ссылка на карту
          <input
            type="url"
            value={draft.mapLink ?? ''}
            placeholder="https://yandex.ru/maps/..."
            onChange={(event) => setDraft({ ...draft, mapLink: event.target.value })}
          />
        </label>
        {error && <p className={error === 'Сохранено' ? 'settings-status' : 'settings-error'}>{error}</p>}
        <button className="primary-wide" type="submit">
          Сохранить изменения
        </button>
      </form>
    </main>
  );
}

function InlineEditor({
  placeholder,
  onAdd
}: {
  placeholder: string;
  onAdd: (name: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="inline-editor">
      <input value={value} placeholder={placeholder} onChange={(event) => setValue(event.target.value)} />
      <button
        type="button"
        onClick={() => {
          if (!value.trim()) return;
          onAdd(value.trim());
          setValue('');
        }}
        aria-label="Добавить"
      >
        <Plus />
      </button>
    </div>
  );
}

function CategoriesSettings({
  categories,
  cabins,
  tags,
  onChangeCategories,
  onChangeCabins,
  onChangeTags
}: {
  categories: Category[];
  cabins: Cabin[];
  tags: CatalogTag[];
  onChangeCategories: (categories: Category[]) => void;
  onChangeCabins: (cabins: Cabin[]) => void;
  onChangeTags: (tags: CatalogTag[]) => void;
}) {
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= categories.length) return;
    const next = [...categories];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChangeCategories(next);
  };

  return (
    <main className="settings-screen">
      <section className="settings-form-card">
        <div className="settings-section-head">
          <h2>Категории</h2>
        </div>
        <small>Фото категории лучше загружать широким: 16:9 или около 1.72:1, например 1200 x 700 px.</small>
        <InlineEditor
          placeholder="Новая категория"
          onAdd={(name) => {
            const id = makeId('category');
            onChangeCategories([
              ...categories,
              {
                id,
                slug: id,
                name,
                icon: 'flame',
                kind: 'food',
                showOnHome: true,
                image: demoCategories[0]?.image ?? ''
              }
            ]);
          }}
        />
        <div className="settings-list">
          {categories.map((category, index) => (
            <article className="settings-list-item settings-list-item--category" key={category.id}>
              <GripVertical />
              <label className="settings-thumb">
                {category.image ? <img src={category.image} alt="" /> : <CloudUpload />}
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const image = await imageFileToDataUrl(file);
                    onChangeCategories(categories.map((item) => (item.id === category.id ? { ...item, image } : item)));
                    event.target.value = '';
                  }}
                />
              </label>
              <input
                value={category.name}
                onChange={(event) =>
                  onChangeCategories(categories.map((item) => (item.id === category.id ? { ...item, name: event.target.value } : item)))
                }
              />
              <div className="category-icon-picker" aria-label={`Иконка категории ${category.name}`}>
                {categoryIconOptions.map(({ id, label, Icon }) => (
                  <button
                    className={category.icon === id ? 'is-active' : ''}
                    type="button"
                    key={id}
                    title={label}
                    aria-label={label}
                    onClick={() =>
                      onChangeCategories(categories.map((item) => (item.id === category.id ? { ...item, icon: id } : item)))
                    }
                  >
                    <Icon />
                  </button>
                ))}
              </div>
              <label className="category-home-toggle">
                <input
                  type="checkbox"
                  checked={category.showOnHome !== false}
                  onChange={(event) =>
                    onChangeCategories(
                      categories.map((item) =>
                        item.id === category.id ? { ...item, showOnHome: event.target.checked } : item
                      )
                    )
                  }
                />
                <span>На главной</span>
              </label>
              <select
                value={category.kind}
                aria-label={`Тип категории ${category.name}`}
                onChange={(event) =>
                  onChangeCategories(
                    categories.map((item) =>
                      item.id === category.id ? { ...item, kind: event.target.value as Category['kind'] } : item
                    )
                  )
                }
              >
                <option value="food">Еда</option>
                <option value="drink">Напитки</option>
                <option value="space">Кабинки</option>
              </select>
              <input
                value={category.image}
                aria-label={`Фото категории ${category.name}`}
                placeholder="Ссылка на фото"
                onChange={(event) =>
                  onChangeCategories(categories.map((item) => (item.id === category.id ? { ...item, image: event.target.value } : item)))
                }
              />
              <button type="button" onClick={() => move(index, -1)} aria-label="Выше">
                ↑
              </button>
              <button type="button" onClick={() => move(index, 1)} aria-label="Ниже">
                ↓
              </button>
              <button className="danger-icon" type="button" onClick={() => onChangeCategories(categories.filter((item) => item.id !== category.id))} aria-label="Удалить">
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-form-card">
        <div className="settings-section-head">
          <h2>Кабинки</h2>
        </div>
        <InlineEditor
          placeholder="Новая кабинка"
          onAdd={(title) =>
            onChangeCabins([
              ...cabins,
              {
                id: makeId('cabin'),
                title,
                capacity: 'до 4 гостей',
                feature: 'Уютная зона',
                image_url: demoCabins[0]?.image_url ?? ''
              }
            ])
          }
        />
        <div className="settings-list">
          {cabins.map((cabin) => (
            <article className="settings-list-item settings-list-item--cabin" key={cabin.id}>
              <label className="settings-thumb">
                {cabin.image_url ? <img src={cabin.image_url} alt="" /> : <CloudUpload />}
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const image_url = await imageFileToDataUrl(file);
                    onChangeCabins(cabins.map((item) => (item.id === cabin.id ? { ...item, image_url } : item)));
                    event.target.value = '';
                  }}
                />
              </label>
              <input
                value={cabin.title}
                onChange={(event) => onChangeCabins(cabins.map((item) => (item.id === cabin.id ? { ...item, title: event.target.value } : item)))}
              />
              <input
                value={cabin.capacity}
                aria-label={`Вместимость ${cabin.title}`}
                onChange={(event) => onChangeCabins(cabins.map((item) => (item.id === cabin.id ? { ...item, capacity: event.target.value } : item)))}
              />
              <input
                value={cabin.image_url}
                aria-label={`Фото ${cabin.title}`}
                placeholder="Ссылка на фото"
                onChange={(event) => onChangeCabins(cabins.map((item) => (item.id === cabin.id ? { ...item, image_url: event.target.value } : item)))}
              />
              <button className="danger-icon" type="button" onClick={() => onChangeCabins(cabins.filter((item) => item.id !== cabin.id))} aria-label="Удалить">
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-form-card">
        <div className="settings-section-head">
          <h2>Метки (теги)</h2>
        </div>
        <InlineEditor
          placeholder="Новая метка"
          onAdd={(name) => onChangeTags([...tags, { id: makeId('tag'), name, icon: '⭐', color: '#f59e0b' }])}
        />
        <div className="settings-list">
          {tags.map((tag) => (
            <article className="settings-list-item settings-list-item--tag" key={tag.id}>
              <input
                value={tag.icon}
                aria-label="Иконка"
                onChange={(event) => onChangeTags(tags.map((item) => (item.id === tag.id ? { ...item, icon: event.target.value } : item)))}
              />
              <input
                value={tag.name}
                onChange={(event) => onChangeTags(tags.map((item) => (item.id === tag.id ? { ...item, name: event.target.value } : item)))}
              />
              <input
                type="color"
                value={tag.color}
                aria-label="Цвет"
                onChange={(event) => onChangeTags(tags.map((item) => (item.id === tag.id ? { ...item, color: event.target.value } : item)))}
              />
              <button className="danger-icon" type="button" onClick={() => onChangeTags(tags.filter((item) => item.id !== tag.id))} aria-label="Удалить">
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function ColorSetting({
  label,
  value,
  palette,
  onChange
}: {
  label: string;
  value: string;
  palette: string[];
  onChange: (color: string) => void;
}) {
  return (
    <div className="color-setting">
      <div className="color-setting__head">
        <h2>{label}</h2>
        <label>
          <span style={{ background: value }} />
          <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} />
        </label>
      </div>
      <div className="swatches">
        {palette.map((color) => (
          <button
            className={value.toLowerCase() === color.toLowerCase() ? 'swatch is-active' : 'swatch'}
            style={{ background: color }}
            type="button"
            key={color}
            onClick={() => onChange(color)}
            aria-label={color}
          />
        ))}
      </div>
    </div>
  );
}

function DesignSettings({ theme, onChange }: { theme: ThemeSettings; onChange: (patch: Partial<ThemeSettings>) => void }) {
  const primaryColors = ['#e8a23a', '#3b82f6', '#16a34a', '#ef4444', '#a855f7', '#111827'];
  const accentColors = ['#ffd082', '#f59e0b', '#f97316', '#ec4899', '#06b6d4', '#84cc16'];
  const backgroundColors = ['#070809', '#101419', '#f7f3ec', '#f8fafc', '#fff7ed', '#f1f5f9'];
  const cardColors = ['#121416', '#1f2937', '#ffffff', '#fffaf0', '#f8fafc', '#0f172a'];
  const textColors = ['#f8f5ef', '#ffffff', '#181510', '#111827', '#292524', '#0f172a'];
  const mutedColors = ['#aaa39a', '#cbd5e1', '#766d62', '#64748b', '#57534e', '#475569'];
  const titleColors = ['#f8f5ef', '#ffffff', '#111827', '#181510', '#e8a23a', '#f97316'];
  const updateBackgroundImage = async (file?: File) => {
    if (!file) return;
    const value = await imageFileToDataUrl(file);
    onChange({ background_image_url: value, background_type: 'image' });
  };

  return (
    <main className="settings-screen">
      <section className="settings-form-card">
        <h2>Тема</h2>
        <div className="choice-grid">
          <button
            className={theme.background_color === lightThemePreset.background_color ? 'choice-card is-active' : 'choice-card'}
            type="button"
            onClick={() => onChange(lightThemePreset)}
          >
            Светлая
          </button>
          <button
            className={theme.background_color !== lightThemePreset.background_color ? 'choice-card is-active' : 'choice-card'}
            type="button"
            onClick={() => onChange(darkThemePreset)}
          >
            Тёмная
          </button>
        </div>

        <label className="media-upload media-upload--cover">
          <input
            type="file"
            accept="image/*"
            onChange={(event) => void updateBackgroundImage(event.target.files?.[0])}
          />
          {theme.background_image_url ? <img src={theme.background_image_url} alt="" /> : <CloudUpload />}
          <span>
            <strong>Фоновое изображение</strong>
            <small>Выбрать из медиатеки</small>
          </span>
        </label>
        {theme.background_image_url && (
          <button
            className="ghost-wide"
            type="button"
            onClick={() => onChange({ background_image_url: '', background_type: 'color' })}
          >
            Убрать фоновое изображение
          </button>
        )}

        <ColorSetting label="Фон приложения" value={theme.background_color} palette={backgroundColors} onChange={(color) => onChange({ background_color: color })} />
        <ColorSetting label="Основной цвет" value={theme.accent_color} palette={primaryColors} onChange={(color) => onChange({ accent_color: color })} />
        <ColorSetting label="Цвет акцента" value={theme.accent_secondary} palette={accentColors} onChange={(color) => onChange({ accent_secondary: color })} />
        <ColorSetting label="Цвет карточек" value={theme.card_color} palette={cardColors} onChange={(color) => onChange({ card_color: color })} />
        <ColorSetting label="Цвет текста" value={theme.text_primary} palette={textColors} onChange={(color) => onChange({ text_primary: color })} />
        <ColorSetting label="Вторичный текст" value={theme.text_secondary} palette={mutedColors} onChange={(color) => onChange({ text_secondary: color })} />
        <ColorSetting label="Карточки блюд" value={theme.product_card_color ?? theme.card_color} palette={cardColors} onChange={(color) => onChange({ product_card_color: color, product_card_text_color: readableTextFor(color) })} />
        <ColorSetting label="Текст карточек блюд" value={theme.product_card_text_color ?? theme.text_primary} palette={textColors} onChange={(color) => onChange({ product_card_text_color: color })} />
        <ColorSetting label="Карточки настроек" value={theme.settings_card_color ?? theme.card_color} palette={cardColors} onChange={(color) => onChange({ settings_card_color: color, settings_card_text_color: readableTextFor(color) })} />
        <ColorSetting label="Текст карточек настроек" value={theme.settings_card_text_color ?? theme.text_primary} palette={textColors} onChange={(color) => onChange({ settings_card_text_color: color })} />
        <ColorSetting label="Панель корзины" value={theme.cart_panel_color ?? '#111111'} palette={cardColors} onChange={(color) => onChange({ cart_panel_color: color, cart_panel_text_color: readableTextFor(color) })} />
        <ColorSetting label="Текст панели корзины" value={theme.cart_panel_text_color ?? theme.text_primary} palette={textColors} onChange={(color) => onChange({ cart_panel_text_color: color })} />
        <ColorSetting label="Названия категорий" value={theme.category_title_color ?? theme.text_primary} palette={titleColors} onChange={(color) => onChange({ category_title_color: color })} />

        <label className="range-field">
          <span>Скругление <b>{theme.card_radius}px</b></span>
          <input type="range" min="0" max="24" value={Math.min(theme.card_radius, 24)} onChange={(event) => onChange({ card_radius: Number(event.target.value), button_radius: Math.max(8, Number(event.target.value) - 2) })} />
        </label>

        <button className="primary-wide" type="button">
          Сохранить изменения
        </button>
      </section>
    </main>
  );
}

function StockSettings({
  products,
  onApplyOne,
  onApplyAll,
  onDecrement
}: {
  products: Product[];
  onApplyOne: (productId: string, dailyStock: number) => void;
  onApplyAll: () => void;
  onDecrement: (productId: string) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const limitedProducts = useMemo(() => products.filter(isLimitedProduct), [products]);

  useEffect(() => {
    setDraft(
      Object.fromEntries(
        limitedProducts.map((product) => [product.id, String(getDailyStock(product))])
      )
    );
  }, [limitedProducts]);

  const getQuantity = (productId: string) => {
    const value = Number(draft[productId]);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  };

  return (
    <main className="stock-page">
      <section className="stock-info-card">
        <span className="stock-info-card__icon">
          <ClipboardList />
        </span>
        <div>
          <h2>Обновить блюда</h2>
          <p>Задайте остаток на день. Кнопка -1 меняет текущий остаток, а здесь хранится дневная норма.</p>
        </div>
      </section>

      <button className="stock-refresh-all" type="button" onClick={onApplyAll}>
        <RefreshCcw />
        Обновить полностью
      </button>

      <section className="stock-card-list">
        {limitedProducts.map((product) => {
          const currentStock = getCurrentStock(product);
          return (
            <article className="stock-dish-card" key={product.id}>
              <SafeImage className="stock-dish-card__image" src={product.image_url} alt={product.title} />
              <div className="stock-dish-card__body">
                <h3>{product.title}</h3>
                <p>
                  <span aria-hidden="true" />
                  Сейчас осталось:{' '}
                  <strong>{currentStock <= 0 ? 'Закончилось' : currentStock}</strong>
                </p>
                <label>
                  Норма на день
                  <div className="stock-dish-card__controls">
                    <input
                      inputMode="numeric"
                      min={0}
                      placeholder="0"
                      type="number"
                      value={draft[product.id] ?? ''}
                      onChange={(event) => setDraft((current) => ({ ...current, [product.id]: event.target.value }))}
                    />
                    <button type="button" onClick={() => onDecrement(product.id)} aria-label={`Уменьшить остаток ${product.title} на 1`}>
                      -1
                    </button>
                    <button type="button" onClick={() => onApplyOne(product.id, getQuantity(product.id))}>
                      Обновить
                    </button>
                  </div>
                </label>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function BackupSettings({
  restaurant,
  categories,
  cabins,
  tags,
  products,
  theme,
  onImport
}: {
  restaurant: Restaurant;
  categories: Category[];
  cabins: Cabin[];
  tags: CatalogTag[];
  products: Product[];
  theme: ThemeSettings;
  onImport: (payload: CatalogBackupPayload) => void;
}) {
  const [error, setError] = useState('');
  const exportCatalog = () =>
    void downloadCatalogZip(createCatalogBackupPayload({ restaurant, categories, cabins, tags, products, theme })).catch(() => {
      setError('Не удалось собрать ZIP-архив.');
    });

  return (
    <main className="settings-screen">
      <section className="settings-form-card backup-card">
        <h2>Экспорт каталога</h2>
        <p>Сохраните полную резервную копию: меню, блюда, фото, категории, метки, залы, дизайн и контакты.</p>
        <button className="primary-wide" type="button" onClick={exportCatalog}>
          <Download /> Экспортировать ZIP
        </button>
      </section>
      <section className="settings-form-card backup-card">
        <h2>Импорт каталога</h2>
        <p>Загрузите ZIP-бэкап. JSON из старого экспорта тоже поддерживается.</p>
        {error && <p className="settings-error">{error}</p>}
        <label className="ghost-wide import-file">
          <CloudUpload /> Выбрать файл
          <input
            type="file"
            accept=".zip,application/zip,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setError('');
              try {
                onImport(await readCatalogBackupFile(file));
              } catch {
                setError('Не удалось прочитать файл импорта.');
              }
              event.target.value = '';
            }}
          />
        </label>
      </section>
      <section className="settings-info">
        <strong>Информация</strong>
        <p>Формат: ZIP с catalog.json и папкой assets для загруженных изображений. Рекомендуем делать бэкап перед импортом.</p>
      </section>
    </main>
  );
}

function DeleteSettings({ onCancel, onDelete }: { onCancel: () => void; onDelete: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <main className="delete-screen">
      <div className="delete-icon">
        <Trash2 />
      </div>
      <h2>Удалить весь каталог?</h2>
      <p>Будут удалены блюда, категории, метки и настройки. Это действие нельзя отменить.</p>
      {armed && <strong>Нажмите ещё раз, чтобы подтвердить удаление.</strong>}
      <div className="delete-actions">
        <button
          className="danger-wide"
          type="button"
          onClick={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            onDelete();
          }}
        >
          Удалить каталог
        </button>
        <button className="ghost-wide" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </main>
  );
}

function DesignEditor({
  editingProduct,
  categories,
  products,
  restaurant,
  onSaveProduct,
  onCloseProduct,
  onUpdateRestaurant,
  cartCount,
  onNavigate
}: {
  editingProduct: Product | null;
  categories: Category[];
  products: Product[];
  restaurant: Restaurant;
  onSaveProduct: (product: Product) => void;
  onCloseProduct: () => void;
  onUpdateRestaurant: (patch: Partial<Restaurant>) => void;
  cartCount: number;
  onNavigate: (target: 'home' | 'catalog' | 'drinks' | 'cabins' | 'profile' | 'backup') => void;
}) {
  const editor = useAdminStore((state) => state.editor);
  const setEditor = useAdminStore((state) => state.setEditor);
  const theme = useThemeStore((state) => state.theme);
  const updateTheme = useThemeStore((state) => state.updateTheme);

  if (!editor) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <section className={editor === 'dish' ? 'design-editor design-editor--dish' : 'design-editor'}>
        {editor === 'dish' ? (
          <DishEditorPage
            product={editingProduct}
            categories={categories}
            products={products}
            cartCount={cartCount}
            onBack={() => {
              onCloseProduct();
              setEditor(null);
            }}
            onSave={onSaveProduct}
            onNavigate={(target) => {
              onNavigate(target);
              if (target !== 'profile') {
                onCloseProduct();
                setEditor(null);
              }
            }}
          />
        ) : (
          <>
            <div className="editor-head">
              <h2>{editor === 'design' ? 'Редактор дизайна' : editor === 'settings' ? 'Настройки' : 'Категории'}</h2>
              <button
                className="icon-button"
                type="button"
                onClick={() => {
                  onCloseProduct();
                  setEditor(null);
                }}
              >
                <ArrowLeft />
              </button>
            </div>
            {editor === 'design' ? (
          <div className="theme-form">
            {[
              ['background_color', 'Фон'],
              ['text_primary', 'Текст'],
              ['text_secondary', 'Вторичный текст'],
              ['card_color', 'Карточки'],
              ['accent_color', 'Акцент'],
              ['accent_secondary', 'Акцент 2']
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="color"
                  value={String(theme[key as keyof ThemeSettings])}
                  onChange={(event) => updateTheme({ [key]: event.target.value })}
                />
              </label>
            ))}
            <label>
              Радиус карточек
              <input type="range" min="8" max="34" value={theme.card_radius} onChange={(event) => updateTheme({ card_radius: Number(event.target.value) })} />
            </label>
            <label>
              Радиус кнопок
              <input type="range" min="8" max="28" value={theme.button_radius} onChange={(event) => updateTheme({ button_radius: Number(event.target.value) })} />
            </label>
            <label>
              Фон-картинка
              <input value={theme.background_image_url} onChange={(event) => updateTheme({ background_image_url: event.target.value, background_type: event.target.value ? 'image' : 'color' })} placeholder="https://..." />
            </label>
            <label>
              Стиль кнопок
              <select value={theme.button_style} onChange={(event) => updateTheme({ button_style: event.target.value as ThemeSettings['button_style'] })}>
                <option value="filled">Заливка</option>
                <option value="outline">Обводка</option>
              </select>
            </label>
          </div>
        ) : editor === 'settings' ? (
          <div className="theme-form">
            <label>
              Название ресторана
              <input value={restaurant.name} onChange={(event) => onUpdateRestaurant({ name: event.target.value })} />
            </label>
            <label>
              WhatsApp для заказов
              <input value={restaurant.whatsapp} onChange={(event) => onUpdateRestaurant({ whatsapp: event.target.value.replace(/\D/g, '') })} placeholder="79990000000" />
            </label>
            <label>
              Instagram
              <input value={restaurant.instagram_url} onChange={(event) => onUpdateRestaurant({ instagram_url: event.target.value })} placeholder="https://instagram.com/..." />
            </label>
            <label>
              Адрес
              <input value={restaurant.address} onChange={(event) => onUpdateRestaurant({ address: event.target.value })} />
            </label>
            <label>
              Ссылка на карту
              <input value={restaurant.mapLink ?? ''} onChange={(event) => onUpdateRestaurant({ mapLink: event.target.value })} placeholder="https://yandex.ru/maps/..." />
            </label>
            <div className="import-export">
              <button
                className="primary-wide"
                type="button"
                onClick={() => {
                  onNavigate('backup');
                  onCloseProduct();
                  setEditor(null);
                }}
              >
                Открыть полный импорт и экспорт
              </button>
            </div>
          </div>
        ) : (
          <div className="admin-placeholder">
            <p>Категории готовы к Supabase-таблице category. Сейчас они используются как шаблон для карточек и фильтров.</p>
            <ul>
              {categories.map((category) => (
                <li key={category.id}>{category.name}</li>
              ))}
            </ul>
          </div>
        )}
          </>
        )}
      </section>
    </div>
  );
}

const getCurrentCatalogSlug = () => {
  const route = window.location.hash.startsWith('#/')
    ? window.location.hash.slice(2)
    : window.location.pathname.replace(import.meta.env.BASE_URL, '').replace(/^\/+/, '');
  const firstSegment = route.split('/').filter(Boolean)[0];
  return firstSegment && firstSegment !== 'admin' ? firstSegment : 'mangal';
};

function AppContent() {
  const catalogSlug = useMemo(() => getCurrentCatalogSlug(), []);
  const { data, isLoading } = useQuery({ queryKey: ['catalog', catalogSlug], queryFn: () => loadCatalog(catalogSlug) });
  const themeStore = useThemeStore((state) => state.theme);
  const updateTheme = useThemeStore((state) => state.updateTheme);
  const setAdmin = useAuthStore((state) => state.setAdmin);
  const setAdminEditor = useAdminStore((state) => state.setEditor);
  const [screen, setScreen] = useState<Screen>('home');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [drinkCategory, setDrinkCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderFlow, setOrderFlow] = useState<OrderFlowState>({ step: 'done' });
  const [localProducts, setLocalProducts] = useState<Product[]>(demoProducts);
  const [localCategories, setLocalCategories] = useState<Category[]>(demoCategories);
  const [localCabins, setLocalCabins] = useState<Cabin[]>(demoCabins);
  const [localTags, setLocalTags] = useState<CatalogTag[]>(defaultTags);
  const [localRestaurant, setLocalRestaurant] = useState<Restaurant>(demoRestaurant);
  const [, setStockTargets] = useState<StockTargets>(() => loadStockTargets());
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clear);
  const cartCount = selectCartCount(items);
  const persist = (action: Promise<void>) => {
    void action.catch((error) => {
      console.error('Supabase save failed', error);
      toast.error('Не удалось сохранить изменения в Supabase');
    });
  };

  useEffect(() => {
    void hasAdminSession(catalogSlug).then(setAdmin);
    return onAdminSessionChange(setAdmin, catalogSlug);
  }, [catalogSlug, setAdmin]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [screen, selectedProduct?.id]);

  useEffect(() => {
    if (data?.theme) {
      updateTheme(data.theme);
    }
    if (data?.products) {
      setLocalProducts(
        data.products.map((product) =>
          applyStockValues(product, getDailyStock(product), getCurrentStock(product))
        )
      );
      setStockTargets((current) => {
        const next = { ...current };
        data.products.forEach((product) => {
          if (next[product.id] === undefined) {
            next[product.id] = getDailyStock(product);
          }
        });
        saveStockTargets(next);
        return next;
      });
    }
    if (data?.categories) {
      setLocalCategories(data.categories);
    }
    if (data?.cabins) {
      setLocalCabins(data.cabins);
    }
    if (data?.restaurant) {
      setLocalRestaurant(data.restaurant);
    }
    if (data?.tags && data.tags.length > 0) {
      setLocalTags(data.tags);
    }
  }, [data?.cabins, data?.categories, data?.products, data?.restaurant, data?.tags, data?.theme, updateTheme]);

  const catalog = {
    categories: localCategories,
    products: localProducts,
    cabins: localCabins,
    restaurant: localRestaurant,
    source: data?.source ?? ('demo' as const)
  };

  const title = useMemo(() => {
    if (screen === 'catalog') return 'Все товары';
    if (screen === 'drinks') return 'Напитки';
    if (screen === 'checkout') return 'Оформление заказа';
    return undefined;
  }, [screen]);

  const settingsTitle = useMemo(() => {
    if (screen === 'settings-profile') return 'Профиль ресторана';
    if (screen === 'settings-categories') return 'Параметры и категории';
    if (screen === 'settings-design') return 'Дизайн приложения';
    if (screen === 'settings-stock') return 'Обновить блюда';
    if (screen === 'settings-backup') return 'Импорт и экспорт';
    if (screen === 'settings-delete') return 'Удаление каталога';
    return 'Настройки';
  }, [screen]);

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setScreen('product');
  };

  const editProduct = (product: Product) => {
    setEditingProduct(product);
    setAdminEditor('dish');
  };

  const saveProduct = (product: Product) => {
    const normalizedProduct = applyStockValues(product, getDailyStock(product), getCurrentStock(product));
    setLocalProducts((current) => {
      const exists = current.some((item) => item.id === normalizedProduct.id);
      return exists ? current.map((item) => (item.id === normalizedProduct.id ? normalizedProduct : item)) : [normalizedProduct, ...current];
    });
    if (selectedProduct?.id === normalizedProduct.id) {
      setSelectedProduct(normalizedProduct);
    }
    setEditingProduct(null);
    setAdminEditor(null);
    setStockTargets((current) => {
      const next = { ...current, [normalizedProduct.id]: getDailyStock(normalizedProduct) };
      saveStockTargets(next);
      return next;
    });
    persist(saveProductToSupabase(normalizedProduct));
  };

  const deleteProduct = (productId: string) => {
    setLocalProducts((current) => current.filter((product) => product.id !== productId));
    setStockTargets((current) => {
      const next = { ...current };
      delete next[productId];
      saveStockTargets(next);
      return next;
    });
    if (selectedProduct?.id === productId) {
      setSelectedProduct(null);
      setScreen('home');
    }
    persist(deleteProductFromSupabase(productId));
  };

  const toggleProduct = (productId: string, key: ProductFlag) => {
    const product = localProducts.find((item) => item.id === productId);
    setLocalProducts((current) =>
      current.map((product) =>
        product.id === productId ? { ...product, [key]: !product[key] } : product
      )
    );
    if (product) {
      persist(updateProductInSupabase(productId, { [key]: !product[key] } as Partial<Product>));
    }
  };

  const updateProductStock = (productId: string, stockCount: number) => {
    const normalizedStock = Math.max(0, Math.floor(Number(stockCount) || 0));
    setLocalProducts((current) =>
      current.map((product) =>
        product.id === productId ? { ...product, current_stock: normalizedStock, stock_count: normalizedStock } : product
      )
    );
    if (selectedProduct?.id === productId) {
      setSelectedProduct((current) => (current ? { ...current, current_stock: normalizedStock, stock_count: normalizedStock } : current));
    }
    persist(updateProductInSupabase(productId, { current_stock: normalizedStock, stock_count: normalizedStock }));
  };

  const applyProductStocks = (updates: StockTargets, message = 'Обновлено') => {
    const normalized = Object.fromEntries(
      Object.entries(updates).map(([productId, stockCount]) => [productId, Math.max(0, Math.floor(Number(stockCount) || 0))])
    );
    setStockTargets((current) => {
      const next = { ...current, ...normalized };
      saveStockTargets(next);
      return next;
    });
    setLocalProducts((current) =>
      current.map((product) =>
        normalized[product.id] === undefined ? product : applyStockValues(product, normalized[product.id])
      )
    );
    if (selectedProduct && normalized[selectedProduct.id] !== undefined) {
      setSelectedProduct(applyStockValues(selectedProduct, normalized[selectedProduct.id]));
    }
    toast.success(message);
    persist(
      Promise.all(
        Object.entries(normalized).map(([productId, stockCount]) =>
          updateProductInSupabase(productId, { daily_stock: stockCount, current_stock: stockCount, stock_count: stockCount })
        )
      ).then(() => undefined)
    );
  };

  const refreshAllProductStocks = () => {
    const updates = Object.fromEntries(
      catalog.products.filter(isLimitedProduct).map((product) => [product.id, getDailyStock(product)])
    );
    applyProductStocks(updates, 'Остатки обновлены');
  };

  const saveRestaurant = (value: Restaurant) => {
    setLocalRestaurant(value);
    persist(saveRestaurantToSupabase(value));
  };

  const updateRestaurant = (patch: Partial<Restaurant>) => {
    setLocalRestaurant((current) => {
      const next = { ...current, ...patch };
      persist(saveRestaurantToSupabase(next));
      return next;
    });
  };

  const saveCategories = (values: Category[]) => {
    setLocalCategories(values);
    persist(replaceCategoriesInSupabase(values));
  };

  const saveCabins = (values: Cabin[]) => {
    setLocalCabins(values);
    persist(replaceCabinsInSupabase(values));
  };

  const saveTags = (values: CatalogTag[]) => {
    setLocalTags(values);
    persist(replaceTagsInSupabase(values));
  };

  const saveTheme = (patch: Partial<ThemeSettings>) => {
    const next = { ...themeStore, ...patch };
    updateTheme(patch);
    persist(saveThemeToSupabase(next));
  };

  const finishOrderFlow = () => {
    setOrderFlow((current) => ({ ...current, step: 'done' }));
    setScreen('checkout');
  };

  const continueOrderFlow = () => {
    if (orderFlow.step === 'sauce') {
      setOrderFlow((current) => ({ ...current, step: 'drink' }));
      setScreen('checkout');
      return;
    }
    finishOrderFlow();
  };

  const startOrderFlow = () => {
    if (screen === 'checkout') {
      return;
    }
    const selectedSauce = items.find((item) => isSauceProduct(item.product))?.product.id;
    const selectedDrink = items.find((item) => item.product.drink_type)?.product.id;
    setOrderFlow({ step: 'sauce', selectedSauce, selectedDrink });
  };

  const continueFromCartBar = () => {
    setIsCartOpen(false);
    if (orderFlow.step !== 'done') {
      continueOrderFlow();
      return;
    }
    startOrderFlow();
  };

  const checkoutFromCart = () => {
    setIsCartOpen(false);
    startOrderFlow();
  };

  const openFlowCategory = (product?: Product) => {
    if (orderFlow.step === 'sauce') {
      setCatalogCategory('sauces');
      setScreen('catalog');
      return;
    }
    if (orderFlow.step === 'drink') {
      setDrinkCategory(product?.category_id ?? 'all');
      setScreen('drinks');
    }
  };

  const selectFlowProduct = (product: Product) => {
    if (orderFlow.step === 'sauce' && isSauceProduct(product)) {
      setOrderFlow((current) => ({ ...current, selectedSauce: product.id }));
      return;
    }
    if (orderFlow.step === 'drink' && product.drink_type) {
      setOrderFlow((current) => ({ ...current, selectedDrink: product.id }));
    }
  };

  const resetCatalog = () => {
    setLocalProducts([]);
    setLocalCategories([]);
    setLocalCabins([]);
    setLocalTags([]);
    const emptyRestaurant = { ...demoRestaurant, name: 'Мангал', subtitle: '', whatsapp: '', instagram_url: '', address: '', mapLink: '' };
    setLocalRestaurant(emptyRestaurant);
    saveTheme({
      ...darkThemePreset,
      card_radius: 16,
      accent_color: '#e8a23a',
      accent_secondary: '#ffd082',
      button_style: 'filled',
      button_radius: 14,
      header_style: 'centered'
    });
    persist(replaceCatalogInSupabase({ restaurant: emptyRestaurant, categories: [], cabins: [], tags: [], products: [] }));
    setScreen('settings');
  };

  const renderSettings = () => (
    <>
      <SettingsHeader
        title={settingsTitle}
        onBack={() => {
          if (screen === 'settings') {
            setScreen('home');
            return;
          }
          setScreen('settings');
        }}
      />
      {screen === 'settings' && <SettingsHome onOpen={setScreen} />}
      {screen === 'settings-profile' && (
        <ProfileSettings restaurant={catalog.restaurant} onSave={saveRestaurant} />
      )}
      {screen === 'settings-categories' && (
        <CategoriesSettings
          categories={catalog.categories}
          cabins={catalog.cabins}
          tags={localTags}
          onChangeCategories={saveCategories}
          onChangeCabins={saveCabins}
          onChangeTags={saveTags}
        />
      )}
      {screen === 'settings-design' && <DesignSettings theme={themeStore} onChange={saveTheme} />}
      {screen === 'settings-stock' && (
        <StockSettings
          products={catalog.products}
          onApplyOne={(productId, dailyStock) => applyProductStocks({ [productId]: dailyStock }, 'Обновлено')}
          onApplyAll={refreshAllProductStocks}
          onDecrement={(productId) => {
            const product = catalog.products.find((item) => item.id === productId);
            if (!product) return;
            updateProductStock(productId, Math.max(0, getCurrentStock(product) - 1));
          }}
        />
      )}
      {screen === 'settings-backup' && (
        <BackupSettings
          restaurant={catalog.restaurant}
          categories={catalog.categories}
          cabins={catalog.cabins}
          tags={localTags}
          products={catalog.products}
          theme={themeStore}
          onImport={(payload) => {
            if (payload.products) {
              const products = payload.products.map((product) =>
                applyStockValues(product, getDailyStock(product), getCurrentStock(product))
              );
              setLocalProducts(products);
              const nextTargets = Object.fromEntries(products.map((product) => [product.id, getDailyStock(product)]));
              setStockTargets(nextTargets);
              saveStockTargets(nextTargets);
            }
            if (payload.categories) setLocalCategories(payload.categories);
            if (payload.cabins) setLocalCabins(payload.cabins);
            if (payload.tags) setLocalTags(payload.tags);
            if (payload.restaurant) setLocalRestaurant(payload.restaurant);
            if (payload.theme) updateTheme(payload.theme);
            persist(
              replaceCatalogInSupabase({
                products: payload.products,
                categories: payload.categories,
                cabins: payload.cabins,
                tags: payload.tags,
                restaurant: payload.restaurant,
                theme: payload.theme
              })
            );
            if (payload.design) {
              saveTheme({
                background_color: payload.design.backgroundColor ?? (payload.design.theme === 'light' ? '#f7f3ec' : '#070809'),
                card_color: payload.design.cardColor ?? (payload.design.cardStyle === 'light' ? '#ffffff' : '#121416'),
                product_card_color: payload.design.productCardColor ?? themeStore.product_card_color,
                product_card_text_color: payload.design.productCardTextColor ?? themeStore.product_card_text_color,
                settings_card_color: payload.design.settingsCardColor ?? themeStore.settings_card_color,
                settings_card_text_color: payload.design.settingsCardTextColor ?? themeStore.settings_card_text_color,
                cart_panel_color: payload.design.cartPanelColor ?? themeStore.cart_panel_color,
                cart_panel_text_color: payload.design.cartPanelTextColor ?? themeStore.cart_panel_text_color,
                accent_color: payload.design.primaryColor ?? themeStore.accent_color,
                accent_secondary: payload.design.accentColor ?? themeStore.accent_secondary,
                text_primary: payload.design.textColor ?? themeStore.text_primary,
                text_secondary: payload.design.mutedTextColor ?? themeStore.text_secondary,
                product_title_color: payload.design.productTitleColor ?? themeStore.product_title_color,
                category_title_color: payload.design.categoryTitleColor ?? themeStore.category_title_color,
                card_radius: payload.design.radius ?? themeStore.card_radius
              });
            }
          }}
        />
      )}
      {screen === 'settings-delete' && <DeleteSettings onCancel={() => setScreen('settings')} onDelete={resetCatalog} />}
    </>
  );

  return (
    <div className={screen === 'settings-stock' ? 'app-shell app-shell--stock' : 'app-shell'} style={applyTheme(themeStore)}>
      <Toaster richColors position="top-center" />
      {screen.startsWith('settings') ? (
        renderSettings()
      ) : (
        <>
          <TopBar
            title={screen === 'product' ? undefined : title}
            canBack={screen !== 'home'}
            onBack={() => setScreen('home')}
            onSearch={screen === 'home' ? () => setScreen('catalog') : undefined}
            onCart={() => setIsCartOpen(true)}
            onAdmin={() => setShowLogin(true)}
            logoUrl={catalog.restaurant.logo_url}
            restaurantName={catalog.restaurant.name}
            restaurantSubtitle={catalog.restaurant.subtitle}
          />

          {screen === 'home' && (
            <HomeScreen
              restaurant={catalog.restaurant}
              categories={catalog.categories}
              products={catalog.products}
              onOpenCatalog={(categoryId = 'all') => {
                setCatalogCategory(categoryId);
                setScreen('catalog');
              }}
              onOpenDrinks={(categoryId = 'all') => {
                setDrinkCategory(categoryId);
                setScreen('drinks');
              }}
              onOpenProduct={openProduct}
              onEditProduct={editProduct}
              onDeleteProduct={deleteProduct}
              onToggleProduct={toggleProduct}
              onStockChange={updateProductStock}
            />
          )}
          {screen === 'catalog' && (
            <CatalogScreen
              categories={catalog.categories}
              products={catalog.products}
              initialCategory={catalogCategory}
              onOpenProduct={openProduct}
              onEditProduct={editProduct}
              onDeleteProduct={deleteProduct}
              onToggleProduct={toggleProduct}
              onStockChange={updateProductStock}
              flowAction={
                orderFlow.step === 'sauce'
                  ? {
                      type: 'sauce',
                      selectedId: orderFlow.selectedSauce,
                      onProductAdd: selectFlowProduct,
                      onContinue: continueOrderFlow
                    }
                  : undefined
              }
            />
          )}
          {screen === 'drinks' && (
            <DrinksScreen
              categories={catalog.categories}
              products={catalog.products}
              initialCategory={drinkCategory}
              onOpenProduct={openProduct}
              onEditProduct={editProduct}
              onDeleteProduct={deleteProduct}
              onToggleProduct={toggleProduct}
              onStockChange={updateProductStock}
              flowAction={
                orderFlow.step === 'drink'
                  ? {
                      type: 'drink',
                      selectedId: orderFlow.selectedDrink,
                      onProductAdd: selectFlowProduct,
                      onContinue: continueOrderFlow
                    }
                  : undefined
              }
            />
          )}
          {screen === 'product' && selectedProduct && (
            <ProductScreen
              product={selectedProduct}
              products={catalog.products}
              onOpenProduct={(product) => setSelectedProduct(product)}
              flowAction={
                orderFlow.step === 'sauce' || orderFlow.step === 'drink'
                  ? {
                      type: orderFlow.step,
                      selectedId: orderFlow.step === 'sauce' ? orderFlow.selectedSauce : orderFlow.selectedDrink,
                      onProductAdd: selectFlowProduct,
                      onContinue: continueOrderFlow
                    }
                  : undefined
              }
            />
          )}
          {screen === 'checkout' && (
            <CheckoutScreen
              restaurant={catalog.restaurant}
              cabins={catalog.cabins}
              onSubmitOrder={() => {
                clearCart();
                setOrderFlow({ step: 'done' });
              }}
            />
          )}
          <CartBar onCheckout={() => setIsCartOpen(true)} onContinue={continueFromCartBar} />
        </>
      )}

      <AdminPanel onAdd={() => setAdminEditor('dish')} onSettings={() => setScreen('settings')} />
      <DesignEditor
        editingProduct={editingProduct}
        categories={catalog.categories}
        products={catalog.products}
        restaurant={catalog.restaurant}
        onSaveProduct={saveProduct}
        onCloseProduct={() => setEditingProduct(null)}
        onUpdateRestaurant={updateRestaurant}
        cartCount={cartCount}
        onNavigate={(target) => {
          if (target === 'home') {
            setScreen('home');
          }
          if (target === 'catalog') {
            setCatalogCategory('all');
            setScreen('catalog');
          }
          if (target === 'drinks') {
            setDrinkCategory('all');
            setScreen('drinks');
          }
          if (target === 'cabins') {
            setScreen('checkout');
          }
          if (target === 'profile') {
            setScreen('settings-profile');
          }
          if (target === 'backup') {
            setScreen('settings-backup');
          }
          setAdminEditor(null);
        }}
      />
      {showLogin && (
        <LoginModal
          catalogSlug={catalogSlug}
          onClose={() => setShowLogin(false)}
          onSuccess={() => setScreen('settings')}
        />
      )}
      {orderFlow.step !== 'done' && screen !== 'catalog' && screen !== 'drinks' && (
        <UpsellReminder
          type={orderFlow.step}
          products={catalog.products}
          selectedId={orderFlow.step === 'sauce' ? orderFlow.selectedSauce : orderFlow.selectedDrink}
          onSkip={continueOrderFlow}
          onBrowse={openFlowCategory}
          onDismiss={() => {
            setOrderFlow({ step: 'done' });
          }}
        />
      )}
      <CartSheet
        isOpen={isCartOpen}
        isLoading={isLoading}
        onClose={() => setIsCartOpen(false)}
        onCheckout={checkoutFromCart}
        onMenu={() => {
          setIsCartOpen(false);
          setScreen('catalog');
        }}
      />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
