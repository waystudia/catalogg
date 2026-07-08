import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Beef,
  Bell,
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
  LocateFixed,
  MapPin,
  MessageCircle,
  Milk,
  Minus,
  Package,
  Paintbrush,
  Phone,
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
  Wheat,
  GripVertical,
  Info,
  Link2,
  Copy,
  CreditCard,
  QrCode,
  RefreshCcw,
  X
} from 'lucide-react';
import JSZip from 'jszip';
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { cabins as demoCabins, categories as demoCategories, products as demoProducts, restaurant as demoRestaurant } from '../data/catalog';
import type { Cabin, CatalogTag, Category, OrderMode, Product, Restaurant, ThemeSettings } from '../entities/models';
import { DishEditorPage } from '../features/dish-editor/DishEditorPage';
import {
  CART_TTL_MS,
  isSauceProduct,
  selectCartCount,
  selectCartTotal,
  useAdminStore,
  useAuthStore,
  useCartStore,
  useOrderStore,
  useThemeStore
} from '../features/stores';
import { buildYandexMapsRouteUrl } from '../features/order/orderLifecycle';
import {
  deleteProductFromSupabase,
  deleteCategoryFromSupabase,
  loadCatalog,
  replaceCatalogInSupabase,
  replaceCabinsInSupabase,
  replaceCategoriesInSupabase,
  replaceTagsInSupabase,
  saveProductToSupabase,
  saveRestaurantToSupabase,
  saveThemeToSupabase,
  supabase,
  hasAdminSession,
  onAdminSessionChange,
  updateProductInSupabase
} from '../shared/supabase';
import {
  createRestaurantOrderFromCart,
  getPublicRestaurantOrderStatus,
  getCatalogIdBySlug,
  getRestaurantDeliverySettings,
  getRestaurantOrders,
  saveRestaurantDeliverySettings,
  subscribeToRestaurantOrdersRealtime,
  updateRestaurantOrderStatus,
  type PublicRestaurantOrderStatus,
  type RestaurantDeliverySettings,
  type RestaurantOrder,
  type RestaurantOrderStatus
} from '../shared/api/restaurantOrdersApi';
import { getRestaurantPaymentsBySlug, saveRestaurantPayments } from '../shared/api/restaurantPaymentsApi';
import { submitSettlementRequest } from '../shared/api/settlementsApi';
import {
  buildOrderStatusShareUrl,
  buildRestaurantOrderFingerprint,
  createRestaurantOrderIdempotencyKey,
  type CreateRestaurantOrderFromCartInput
} from '../shared/api/restaurantOrderPayload';
import { formatOrderTime, groupOrdersByDate } from '../shared/orderListGroups';
import {
  getRestaurantOrderNotificationPermission,
  requestRestaurantOrderNotificationPermission,
  showRestaurantOrderNotification
} from '../shared/restaurantOrderNotifications';
import { imageFileToDataUrl } from '../shared/images';
import {
  chooseMoreAccuratePosition,
  deliveryPositionIsAccurateEnough,
  getDeliveryGeolocationErrorMessage,
  normalizeDeliveryCoordinates,
  type DeliveryCoordinates
} from '../shared/deliveryLocation';
import { DeliveryMapPicker } from '../shared/DeliveryMapPicker';
import {
  loadPaymentSettings,
  loadPaymentStatus,
  savePaymentSettings,
  savePaymentStatus,
  type PaymentStatus,
  type RestaurantPaymentSettings
} from '../shared/paymentSettings';
import {
  loadPublicClientCheckoutProfile,
  normalizeSettlementName,
  savePublicClientProfile
} from '../shared/clientIdentity';
import { appIsRunningStandalone, rememberPwaResumePath } from '../shared/pwaSession';

const queryClient = new QueryClient();

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const DELIVERY_TARGET_ACCURACY_M = 35;
const DELIVERY_LOCATION_TIMEOUT_MS = 15_000;
const DEFAULT_DELIVERY_LOCATION = { lat: 43.3184, lng: 45.6927 };
const parseSettlementList = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
const formatSettlementList = (values: string[]) => values.join('\n');
const buildDeliveryAddress = (city: string, settlement: string, address: string) =>
  [city.trim(), settlement.trim(), address.trim()].filter(Boolean).join(', ');
const publicOrderStatusLabels: Record<RestaurantOrderStatus, string> = {
  new: 'Новый',
  waiting_payment_confirmation: 'Ожидает подтверждения оплаты',
  payment_confirmed: 'Оплата подтверждена',
  accepted: 'В работе',
  confirmed: 'В работе',
  preparing: 'Готовится',
  cooking: 'Готовится',
  ready: 'Готов',
  waiting_driver: 'Ожидает курьера',
  driver_assigned: 'Курьер назначен',
  assigned_driver: 'Курьер назначен',
  picked_up: 'Заказ забран',
  on_the_way: 'В пути',
  delivered: 'Доставлен',
  completed: 'Выполнен',
  cancelled: 'Отменён',
  canceled: 'Отменён'
};
type SettingsScreen = 'settings' | 'settings-profile' | 'settings-categories' | 'settings-design' | 'settings-stock' | 'settings-payments' | 'settings-backup' | 'settings-delete';
type RestaurantAdminScreen = 'admin-home';
type Screen = 'home' | 'catalog' | 'drinks' | 'product' | 'checkout' | RestaurantAdminScreen | SettingsScreen;
type ProductFlag = 'is_popular' | 'is_hidden';
type CategoryEditorMode = 'list' | 'edit' | 'add';
type SettingsCatalogTab = 'tags' | 'cabins' | 'categories';
type CabinEditorMode = 'list' | 'edit' | 'add';
type OrderFlowState = {
  step: 'category' | 'done';
  categoryId?: string;
  selectedByCategory: Record<string, string | undefined>;
};
type FlowAction = {
  categoryId: string;
  categoryName: string;
  selectedId?: string;
  onProductAdd: (product: Product) => void;
  onContinue: () => void;
};
type CatalogDesignExport = {
  theme?: 'light' | 'dark';
  backgroundColor?: string;
  backgroundGradientFrom?: string;
  backgroundGradientTo?: string;
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

const isProductInCategory = (product: Product, categoryId: string) =>
  getProductCategoryIds(product).includes(categoryId);

const getOrderFlowCategories = (categories: Category[]) =>
  categories.filter((category) => category.kind !== 'space' && category.showInOrderFlow === true);

const createCategoryDraft = (name = 'Новая категория'): Category => {
  const id = makeId('category');
  return {
    id,
    slug: id,
    name,
    icon: 'flame',
    kind: 'food',
    showOnHome: true,
    showInOrderFlow: false,
    image: demoCategories[0]?.image ?? ''
  };
};

const createTagDraft = (name = 'Новая метка'): CatalogTag => {
  const id = makeId('tag');
  return {
    id,
    slug: id,
    name,
    icon: '#',
    color: '#7c3aed'
  };
};

type CabinMeta = {
  status: 'active' | 'inactive';
  type: 'normal' | 'vip' | 'premium';
};

const defaultCabinMeta: CabinMeta = { status: 'active', type: 'normal' };

const parseCabinMeta = (feature?: string): CabinMeta => {
  if (!feature) return defaultCabinMeta;
  try {
    const parsed = JSON.parse(feature) as Partial<CabinMeta>;
    return {
      status: parsed.status === 'inactive' ? 'inactive' : 'active',
      type: parsed.type === 'vip' || parsed.type === 'premium' ? parsed.type : 'normal'
    };
  } catch {
    return defaultCabinMeta;
  }
};

const makeCabinFeature = (meta: CabinMeta) => JSON.stringify(meta);

const createCabinDraft = (): Cabin => ({
  id: makeId('cabin'),
  title: '',
  capacity: '',
  feature: makeCabinFeature(defaultCabinMeta),
  image_url: ''
});

const makeLoadingRestaurant = (catalogSlug: string): Restaurant => ({
  ...demoRestaurant,
  id: catalogSlug,
  name: catalogSlug === 'mangal' ? demoRestaurant.name : '',
  subtitle: catalogSlug === 'mangal' ? demoRestaurant.subtitle : '',
  logo_url: '',
  banner_url: ''
});

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
    backgroundGradientFrom: theme.background_gradient_from,
    backgroundGradientTo: theme.background_gradient_to,
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
  background_gradient_from: '#070809',
  background_gradient_to: '#1f2937',
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
  accent_color: '#e8a23a',
  accent_secondary: '#ffd082',
  card_shadow: '0 18px 46px rgba(0, 0, 0, 0.28)'
};

const lightThemePreset: Partial<ThemeSettings> = {
  background_type: 'color',
  background_color: '#f7f3ec',
  background_gradient_from: '#f7f3ec',
  background_gradient_to: '#ffffff',
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

const normalizeHexColor = (value: string) => {
  const hex = value.trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
};

const errorMessageFor = (error: unknown) => {
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown };
    return [value.message, value.details, value.hint].filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(' ');
  }
  return error instanceof Error ? error.message : '';
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
  const gradientFrom = theme.background_gradient_from ?? theme.background_color;
  const gradientTo = theme.background_gradient_to ?? theme.accent_secondary ?? theme.background_color;
  return {
    '--bg': theme.background_type === 'gradient' ? gradientFrom : theme.background_color,
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
    '--primary': theme.accent_color ?? '#e8a23a',
    '--button-radius': `${theme.button_radius}px`,
    '--primary-bg':
      theme.button_style === 'filled'
        ? `linear-gradient(135deg, ${theme.accent_secondary}, ${theme.accent_color})`
        : 'transparent',
    '--primary-text': theme.button_style === 'filled' ? '#1b1408' : theme.accent_secondary,
    backgroundImage:
      theme.background_type === 'gradient'
        ? `linear-gradient(180deg, ${gradientFrom} 0%, ${gradientTo} 100%)`
        : theme.background_type === 'image' && theme.background_image_url
        ? `linear-gradient(rgba(5, 6, 7, 0.78), rgba(5, 6, 7, 0.92)), url(${theme.background_image_url})`
        : undefined
  } as React.CSSProperties;
}

const settingsAccentStyle = {
  '--accent': '#7c3aed',
  '--accent-2': '#a78bfa',
  '--primary': '#7c3aed',
  '--primary-bg': 'linear-gradient(135deg, #a78bfa, #7c3aed)',
  '--primary-text': '#ffffff'
} as React.CSSProperties;

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
  onPlatformBack,
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
  onPlatformBack?: () => void;
  onSearch?: () => void;
  onCart: () => void;
  onAdmin?: () => void;
  logoUrl?: string;
  restaurantName?: string;
  restaurantSubtitle?: string;
}) {
  const items = useCartStore((state) => state.items);
  const count = selectCartCount(items);
  const hasBackAction = Boolean(canBack || onPlatformBack);

  return (
    <header className="top-bar">
      <button
        className="icon-button top-bar__button"
        type="button"
        onClick={canBack ? onBack : onPlatformBack ?? onAdmin}
        aria-label={hasBackAction ? 'Назад' : 'Вход администратора'}
      >
        {hasBackAction ? <ArrowLeft /> : <User />}
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

function SiteCredit() {
  return (
    <footer className="site-credit">
      <span>Сайт создан в WayCatalog</span>
      <small>© {new Date().getFullYear()} WayCatalog. Все права защищены.</small>
    </footer>
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

function CartAfterOrderPanel({ onClear, onContinue }: { onClear: () => void; onContinue: () => void }) {
  return (
    <div className="cart-after-order">
      <button className="cart-after-order__button" type="button" onClick={onClear}>
        <Trash2 />
        Очистить корзину
      </button>
      <button className="cart-after-order__button" type="button" onClick={onContinue}>
        <ShoppingBag />
        Продолжить покупки
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
  const isFlowCategory = flowAction?.categoryId === active;

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
            onAdd={isFlowCategory ? flowAction?.onProductAdd : undefined}
          />
        ))}
      </section>
      {isFlowCategory && flowAction?.selectedId && (
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
  const drinkCategoryIds = new Set(drinkCategories.map((category) => category.id));
  const drinks = visibleProducts.filter((product) => {
    const productCategoryIds = getProductCategoryIds(product);
    const isDrink = Boolean(product.drink_type) || productCategoryIds.some((categoryId) => drinkCategoryIds.has(categoryId));
    return isDrink && (active === 'all' || productCategoryIds.includes(active));
  });
  const isFlowCategory = flowAction?.categoryId === active;

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
            onAdd={isFlowCategory ? flowAction?.onProductAdd : undefined}
          />
        ))}
      </section>
      {isFlowCategory && flowAction?.selectedId && (
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
  const isFlowProduct = Boolean(flowAction && isProductInCategory(product, flowAction.categoryId));

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

function CheckoutScreen({
  catalogSlug,
  restaurant,
  cabins,
  deliverySettings,
  paymentSettings,
  onSubmitOrder
}: {
  catalogSlug: string;
  restaurant: Restaurant;
  cabins: Cabin[];
  deliverySettings: RestaurantDeliverySettings;
  paymentSettings: RestaurantPaymentSettings;
  onSubmitOrder: () => void;
}) {
  const {
    mode,
    cabinId,
    deliveryCity,
    deliverySettlement,
    deliveryAddress,
    deliveryLat,
    deliveryLng,
    deliveryAccuracyM,
    clientName,
    clientPhone,
    setOrder
  } = useOrderStore();
  const items = useCartStore((state) => state.items);
  const total = selectCartTotal(items);
  const activeCabins = useMemo(
    () => cabins.filter((cabin) => parseCabinMeta(cabin.feature).status === 'active'),
    [cabins]
  );
  const availableModes = useMemo(() => {
    const modes: Array<{ key: OrderMode; label: string; icon: typeof Home }> = [];
    if (deliverySettings.enable_hall_orders) modes.push({ key: 'hall', label: 'В зале', icon: ShoppingCart });
    if (deliverySettings.enable_pickup) modes.push({ key: 'takeaway', label: 'На вынос', icon: ShoppingBag });
    if (deliverySettings.enable_delivery) modes.push({ key: 'delivery', label: 'Доставка', icon: MapPin });
    return modes.length > 0 ? modes : [{ key: 'takeaway', label: 'На вынос', icon: ShoppingBag }];
  }, [deliverySettings.enable_delivery, deliverySettings.enable_hall_orders, deliverySettings.enable_pickup]);
  const settlementOptions = useMemo(
    () => (deliverySettings.service_settlements ?? []).filter(Boolean),
    [deliverySettings.service_settlements]
  );
  const configuredCity = deliverySettings.primary_city.trim();
  const effectiveDeliveryCity = configuredCity || deliveryCity;
  const selectedCabin = activeCabins.find((cabin) => cabin.id === cabinId);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [isDeliveryMapOpen, setIsDeliveryMapOpen] = useState(false);
  const [usesCustomSettlement, setUsesCustomSettlement] = useState(false);
  const [customSettlement, setCustomSettlement] = useState('');
  const effectiveDeliverySettlement = normalizeSettlementName(
    usesCustomSettlement ? customSettlement : deliverySettlement
  );
  const finalDeliveryAddress = buildDeliveryAddress(effectiveDeliveryCity, effectiveDeliverySettlement, deliveryAddress);
  const settlementNeedsAdminReview =
    Boolean(effectiveDeliverySettlement) &&
    !settlementOptions.some((settlement) => normalizeSettlementName(settlement) === effectiveDeliverySettlement);
  const selectedDeliveryLat = deliveryLat ?? DEFAULT_DELIVERY_LOCATION.lat;
  const selectedDeliveryLng = deliveryLng ?? DEFAULT_DELIVERY_LOCATION.lng;
  const locationSessionRef = useRef<{ watchId: number | null; timeoutId: number | null }>({
    watchId: null,
    timeoutId: null
  });
  const profileHydratedRef = useRef(false);
  const submitLockRef = useRef(false);
  const orderAttemptRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);

  const clearLocationSession = useCallback(() => {
    const { watchId, timeoutId } = locationSessionRef.current;
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    locationSessionRef.current = { watchId: null, timeoutId: null };
  }, []);

  const applyDeliveryCoordinates = useCallback(
    (coordinates: DeliveryCoordinates) => {
      const { lat, lng, accuracyM } = normalizeDeliveryCoordinates(coordinates);
      setOrder({
        deliveryLat: lat,
        deliveryLng: lng,
        deliveryAccuracyM: accuracyM,
        deliveryAddress: deliveryAddress || `${lat}, ${lng}`
      });

      if (accuracyM > DELIVERY_TARGET_ACCURACY_M) {
        setGeoError('Получили лучшее доступное местоположение, но точность ниже желаемой. Проверьте адрес.');
      }
    },
    [deliveryAddress, setOrder]
  );

  const applyManualDeliveryPoint = useCallback(
    ({ lat, lng }: { lat: number; lng: number }) => {
      const nextLat = Number(lat.toFixed(7));
      const nextLng = Number(lng.toFixed(7));
      setGeoError('');
      setOrder({
        deliveryLat: nextLat,
        deliveryLng: nextLng,
        deliveryAccuracyM: null,
        deliveryAddress: deliveryAddress || `${nextLat}, ${nextLng}`
      });
    },
    [deliveryAddress, setOrder]
  );

  const locateDeliveryAddress = () => {
    if (!navigator.geolocation) {
      setGeoError('Геолокация недоступна в этом браузере.');
      return;
    }

    clearLocationSession();
    setIsLocating(true);
    setGeoError('');

    let bestCoordinates: DeliveryCoordinates | null = null;
    let finished = false;

    const finish = (coordinates: DeliveryCoordinates | null, message = '') => {
      if (finished) return;
      finished = true;
      clearLocationSession();

      if (coordinates) {
        applyDeliveryCoordinates(coordinates);
      } else {
        setGeoError(message || 'Не удалось получить геолокацию. Проверьте разрешение браузера.');
      }

      setIsLocating(false);
    };

    const handlePosition = (position: GeolocationPosition) => {
      bestCoordinates = chooseMoreAccuratePosition(bestCoordinates, position.coords);

      if (deliveryPositionIsAccurateEnough(bestCoordinates, DELIVERY_TARGET_ACCURACY_M)) {
        finish(bestCoordinates);
      }
    };

    const handleError = (error: GeolocationPositionError) => {
      if (bestCoordinates) {
        finish(bestCoordinates);
        return;
      }
      finish(null, getDeliveryGeolocationErrorMessage(error));
    };

    try {
      const watchId = navigator.geolocation.watchPosition(
        handlePosition,
        handleError,
        { enableHighAccuracy: true, timeout: DELIVERY_LOCATION_TIMEOUT_MS, maximumAge: 0 }
      );
      const timeoutId = window.setTimeout(
        () => finish(bestCoordinates, 'Не удалось получить точную геолокацию. Проверьте адрес вручную.'),
        DELIVERY_LOCATION_TIMEOUT_MS + 1_000
      );
      locationSessionRef.current = { watchId, timeoutId };
    } catch {
      finish(null, 'Не удалось запустить геолокацию. Проверьте разрешение браузера.');
    }
  };

  useEffect(() => clearLocationSession, [clearLocationSession]);

  useEffect(() => {
    if (profileHydratedRef.current) return;
    profileHydratedRef.current = true;
    const savedProfile = loadPublicClientCheckoutProfile(catalogSlug);
    if (!savedProfile) return;

    setOrder({
      clientName: clientName || savedProfile.name,
      clientPhone: clientPhone || savedProfile.phone,
      deliveryCity: deliveryCity || savedProfile.deliveryCity,
      deliverySettlement: deliverySettlement || savedProfile.deliverySettlement,
      deliveryAddress: deliveryAddress || savedProfile.deliveryAddress
    });
  }, [catalogSlug, clientName, clientPhone, deliveryAddress, deliveryCity, deliverySettlement, setOrder]);

  useEffect(() => {
    if (!configuredCity || deliveryCity === configuredCity) return;
    setOrder({ deliveryCity: configuredCity });
  }, [configuredCity, deliveryCity, setOrder]);

  useEffect(() => {
    if (!deliverySettlement || settlementOptions.includes(deliverySettlement)) return;
    setUsesCustomSettlement(true);
    setCustomSettlement(deliverySettlement);
  }, [deliverySettlement, settlementOptions]);

  useEffect(() => {
    if (availableModes.some((item) => item.key === mode)) return;
    const nextMode = (availableModes[0]?.key as OrderMode | undefined) ?? ('takeaway' as OrderMode);
    setOrder({ mode: nextMode, cabinId: nextMode === 'hall' ? activeCabins[0]?.id || '' : '' });
  }, [activeCabins, availableModes, mode, setOrder]);

  useEffect(() => {
    if (mode !== 'hall') return;
    if (activeCabins.length === 1 && cabinId !== activeCabins[0].id) {
      setOrder({ cabinId: activeCabins[0].id });
      return;
    }
    if (activeCabins.length > 1 && cabinId && !activeCabins.some((cabin) => cabin.id === cabinId)) {
      setOrder({ cabinId: '' });
    }
  }, [activeCabins, cabinId, mode, setOrder]);
  const orderLines = [
    'Здравствуйте! Хочу оформить заказ.',
    '',
    'Заказ:',
    ...items.map((item, index) => `${index + 1}. ${item.product.title} - ${item.quantity} шт. x ${formatPrice(item.product.price)}`),
    '',
    `Итого: ${formatPrice(total)}`,
    '',
    'Получение:',
    mode === 'hall'
      ? `В зале${selectedCabin ? `, ${selectedCabin.title}` : ''}`
      : mode === 'delivery'
        ? `Доставка${finalDeliveryAddress ? `, ${finalDeliveryAddress}` : ''}`
        : 'На вынос',
    ...(mode === 'hall' && selectedCabin ? [`Кабинка: ${selectedCabin.title} (${selectedCabin.capacity})`] : []),
    ...(mode === 'delivery' && deliveryCity ? [`Город: ${deliveryCity}`] : []),
    ...(mode === 'delivery' && effectiveDeliverySettlement ? [`Село / район: ${effectiveDeliverySettlement}`] : []),
    ...(mode === 'delivery' && deliveryAddress ? [`Адрес: ${deliveryAddress}`] : []),
    ...(mode === 'delivery' && clientName ? [`Имя: ${clientName}`] : []),
    ...(mode === 'delivery' && clientPhone ? [`Телефон: ${clientPhone}`] : []),
    '',
    'Комментарий:',
    'Пожалуйста, подтвердите заказ.'
  ];
  const getOrderIdempotencyKey = (payload: CreateRestaurantOrderFromCartInput) => {
    const fingerprint = buildRestaurantOrderFingerprint(payload);

    if (orderAttemptRef.current?.fingerprint !== fingerprint) {
      orderAttemptRef.current = {
        fingerprint,
        idempotencyKey: createRestaurantOrderIdempotencyKey(fingerprint)
      };
    }

    return orderAttemptRef.current.idempotencyKey;
  };
  const buildWhatsappHref = (orderId?: string) => {
    if (!restaurant.whatsapp) return '#';

    const lines = orderId
      ? [
          ...orderLines,
          '',
          'Ссылка на статус заказа:',
          buildOrderStatusShareUrl({
            origin: window.location.origin,
            basePath: import.meta.env.BASE_URL,
            restaurantSlug: catalogSlug,
            orderId
          })
        ]
      : orderLines;

    return `https://wa.me/${restaurant.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(lines.join('\n'))}`;
  };
  const whatsappHref = buildWhatsappHref();
  const openRestaurantMap = () => {
    if (!restaurant.mapLink) {
      alert('Карта не указана');
      return;
    }
    window.open(restaurant.mapLink, '_blank', 'noopener,noreferrer');
  };
  const paymentRecipient = paymentSettings.displayName || [paymentSettings.lastName, paymentSettings.firstName, paymentSettings.middleName].filter(Boolean).join(' ');

  return (
    <main className="screen checkout-screen">
      <section className="checkout-segment" aria-label="Тип заказа">
        {availableModes.map(({ key, label, icon: Icon }) => (
          <button
            className={mode === key ? 'checkout-segment__button is-active' : 'checkout-segment__button'}
            type="button"
            key={key}
            onClick={() =>
              setOrder({
                mode: key as OrderMode,
                cabinId: key === 'hall' ? cabinId || activeCabins[0]?.id || '' : ''
              })
            }
          >
            <Icon />
            {label}
          </button>
        ))}
      </section>

      {mode === 'hall' && activeCabins.length > 0 && (
        <>
          <section className="checkout-section-head">
            <h2>Выбор кабинки</h2>
            <p>Выберите кабинку для заказа</p>
          </section>
          <section className="checkout-cabin-grid">
            {activeCabins.map(({ id, title, capacity, image_url }) => {
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
                  <strong>{title}</strong>
                  <small>{capacity}</small>
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

      {mode === 'delivery' && (
        <section className="takeaway-note">
          <div className="takeaway-note__message">
            <MapPin />
            <strong>Укажите населенный пункт и адрес доставки</strong>
          </div>
          <button className="map-link-button checkout-location-button" type="button" onClick={locateDeliveryAddress} disabled={isLocating}>
            <LocateFixed />
            <span>{isLocating ? 'Определяем...' : 'Определить моё местоположение'}</span>
          </button>
          <button className="map-link-button checkout-location-button" type="button" onClick={() => setIsDeliveryMapOpen(true)}>
            <MapPin />
            <span>Уточнить точку на карте</span>
          </button>
          {(deliveryLat !== null && deliveryLng !== null) && (
            <p className="checkout-location-hint">
              Координаты: {deliveryLat.toFixed(7)}, {deliveryLng.toFixed(7)}
              {deliveryAccuracyM ? ` · точность ${deliveryAccuracyM} м` : ' · выбрано вручную'}
            </p>
          )}
          {deliveryAccuracyM && deliveryAccuracyM > 100 && (
            <p className="checkout-location-warning">Точность слабая. Проверьте адрес перед отправкой заказа.</p>
          )}
          {geoError && <p className="checkout-location-warning">{geoError}</p>}
          <div className="checkout-delivery-fields">
            <label className="checkout-field">
              <span>Имя</span>
              <input
                value={clientName}
                onChange={(event) => setOrder({ clientName: event.target.value })}
                placeholder="Ваше имя"
              />
            </label>
            <label className="checkout-field">
              <span>Телефон</span>
              <input
                value={clientPhone}
                onChange={(event) => setOrder({ clientPhone: event.target.value.replace(/[^\d+()\-\s]/g, '') })}
                placeholder="+7"
                inputMode="tel"
              />
            </label>
            <label className="checkout-field">
              <span>Город</span>
              {configuredCity ? (
                <input value={configuredCity} readOnly />
              ) : (
                <input
                  value={deliveryCity}
                  onChange={(event) => setOrder({ deliveryCity: event.target.value })}
                  placeholder="Например: Грозный"
                />
              )}
            </label>
            <label className="checkout-field">
              <span>Село / район</span>
              {settlementOptions.length > 0 ? (
                <>
                  <select
                    value={usesCustomSettlement ? '__other__' : deliverySettlement}
                    onChange={(event) => {
                      if (event.target.value === '__other__') {
                        setUsesCustomSettlement(true);
                        setOrder({ deliverySettlement: customSettlement });
                        return;
                      }
                      setUsesCustomSettlement(false);
                      setCustomSettlement('');
                      setOrder({ deliverySettlement: event.target.value });
                    }}
                  >
                    <option value="">Выберите населенный пункт</option>
                    {settlementOptions.map((settlement) => (
                      <option value={settlement} key={settlement}>
                        {settlement}
                      </option>
                    ))}
                    <option value="__other__">Другое село</option>
                  </select>
                  {usesCustomSettlement && (
                    <input
                      value={customSettlement}
                      onChange={(event) => {
                        const value = event.target.value;
                        setCustomSettlement(value);
                        setOrder({ deliverySettlement: value });
                      }}
                      placeholder="Введите своё село"
                    />
                  )}
                </>
              ) : (
                <input
                  value={deliverySettlement}
                  onChange={(event) => setOrder({ deliverySettlement: event.target.value })}
                  placeholder="Например: Черноречье"
                />
              )}
            </label>
            <label className="checkout-field checkout-field--wide">
              <span>Адрес</span>
              <textarea
                value={deliveryAddress}
                onChange={(event) => setOrder({ deliveryAddress: event.target.value })}
                rows={3}
                placeholder="Улица, дом, ориентир"
              />
            </label>
          </div>
          {isDeliveryMapOpen && (
            <div className="modal-backdrop delivery-map-backdrop">
              <div className="delivery-map-sheet">
                <button
                  className="flow-modal__close"
                  type="button"
                  onClick={() => setIsDeliveryMapOpen(false)}
                  aria-label="Закрыть карту"
                >
                  <X />
                </button>
                <h2>Точка доставки</h2>
                <DeliveryMapPicker
                  lat={selectedDeliveryLat}
                  lng={selectedDeliveryLng}
                  accuracyM={deliveryAccuracyM}
                  isLocating={isLocating}
                  error={geoError}
                  onLocate={locateDeliveryAddress}
                  onChange={applyManualDeliveryPoint}
                  onDone={() => setIsDeliveryMapOpen(false)}
                />
              </div>
            </div>
          )}
        </section>
      )}

      <section className="checkout-summary">
        <div>
          <span>Финальный шаг</span>
          <h2>Проверьте заказ</h2>
          <p>
            {mode === 'hall'
              ? `Заказ будет подготовлен для зала${selectedCabin ? `, кабинка: ${selectedCabin.title} (${selectedCabin.capacity}).` : '.'}`
              : mode === 'delivery'
                ? `Заказ будет отправлен на адрес: ${finalDeliveryAddress || 'адрес пока не указан'}.`
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
        {paymentSettings.transferEnabled && (
          <section className="checkout-payment-card">
            <h3><CreditCard /> Оплата переводом</h3>
            <strong>{formatPrice(total)}</strong>
            <dl>
              <div><dt>Получатель</dt><dd>{paymentRecipient || 'Получатель не указан'}</dd></div>
              <div><dt>Номер</dt><dd>{paymentSettings.transferNumber || 'Номер не указан'}</dd></div>
              <div><dt>Банк</dt><dd>{paymentSettings.bankName || 'Банк не указан'}</dd></div>
            </dl>
            {paymentSettings.qrUrl ? <img src={paymentSettings.qrUrl} alt="QR-код для оплаты" /> : <QrCode />}
            <p>{paymentSettings.comment || 'Переведите сумму ресторану и после оплаты нажмите "Я оплатил".'}</p>
            <div>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(paymentSettings.transferNumber).then(() => toast.success('Номер скопирован'))}>
                <Copy />
                Скопировать
              </button>
              <button type="button" onClick={() => toast.success('Ресторан увидит, что вы отметили оплату')}>
                Я оплатил
              </button>
            </div>
          </section>
        )}
        <a
          className={restaurant.whatsapp ? 'primary-wide checkout-summary__action' : 'primary-wide checkout-summary__action is-disabled'}
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => {
            event.preventDefault();
            if (!restaurant.whatsapp) {
              return;
            }
            if (submitLockRef.current) {
              toast.info('Заказ уже отправляется. Подождите несколько секунд.');
              return;
            }
            if (mode === 'delivery') {
              if (!clientName.trim() || !clientPhone.trim()) {
                toast.error('Введите имя и номер телефона для доставки');
                return;
              }
              if (!effectiveDeliveryCity || !effectiveDeliverySettlement || !deliveryAddress.trim()) {
                toast.error('Укажите город, населенный пункт и адрес доставки');
                return;
              }
              savePublicClientProfile(catalogSlug, {
                name: clientName,
                phone: clientPhone,
                deliveryCity: effectiveDeliveryCity,
                deliverySettlement: effectiveDeliverySettlement,
                deliveryAddress
              });
              if (settlementNeedsAdminReview) {
                void submitSettlementRequest({
                  cityName: effectiveDeliveryCity,
                  settlementName: effectiveDeliverySettlement,
                  source: `restaurant:${catalogSlug}`
                });
              }
            }
            const orderPayload: CreateRestaurantOrderFromCartInput = {
              slug: catalogSlug,
              items,
              fulfillmentType: mode,
              cabinLabel: mode === 'hall' ? selectedCabin?.title ?? '' : '',
              deliveryCity: effectiveDeliveryCity,
              deliverySettlement: effectiveDeliverySettlement,
              deliveryAddress: finalDeliveryAddress,
              deliveryLat,
              deliveryLng,
              deliveryAccuracyM,
              comment: mode === 'hall' && selectedCabin ? `Кабинка: ${selectedCabin.title}` : '',
              customerName: mode === 'delivery' ? clientName.trim() : 'Гость',
              customerPhone: mode === 'delivery' ? clientPhone.trim() : ''
            };
            let whatsappWindow: Window | null = null;
            try {
              whatsappWindow = window.open('about:blank', '_blank');
            } catch {
              whatsappWindow = null;
            }
            const openCreatedOrderWhatsapp = (href: string) => {
              if (whatsappWindow && !whatsappWindow.closed) {
                whatsappWindow.location.href = href;
                return;
              }
              window.location.href = href;
            };
            const closeReservedWhatsappWindow = () => {
              try {
                whatsappWindow?.close();
              } catch {
                // The browser may block controlling a tab after opening it.
              }
            };
            submitLockRef.current = true;
            setIsSubmittingOrder(true);
            void createRestaurantOrderFromCart({
              ...orderPayload,
              idempotencyKey: getOrderIdempotencyKey(orderPayload)
            })
              .then((orderId) => {
                if (orderId) {
                  toast.success('Заказ создан в системе ресторана');
                  openCreatedOrderWhatsapp(buildWhatsappHref(orderId));
                  window.setTimeout(onSubmitOrder, 500);
                  return;
                }
                closeReservedWhatsappWindow();
                toast.error('Не удалось создать заказ в системе ресторана. WhatsApp не открыт, чтобы не потерять и не продублировать заказ.');
              })
              .catch((error) => {
                console.error('Order creation failed', error);
                closeReservedWhatsappWindow();
                toast.error('Заказ не создан в системе ресторана. WhatsApp не открыт, чтобы не потерять и не продублировать заказ.');
              })
              .finally(() => {
                submitLockRef.current = false;
                setIsSubmittingOrder(false);
              });
          }}
          aria-disabled={isSubmittingOrder || !restaurant.whatsapp}
        >
          {isSubmittingOrder ? 'Отправляем заказ...' : 'Отправить заказ'}
        </a>
      </section>
    </main>
  );
}

function PublicOrderStatusScreen({
  catalogSlug,
  orderId
}: {
  catalogSlug: string;
  orderId: string;
}) {
  const navigate = useNavigate();
  const statusQuery = useQuery({
    queryKey: ['public-order-status', orderId],
    queryFn: () => getPublicRestaurantOrderStatus(orderId),
    refetchInterval: 15_000
  });
  const order = statusQuery.data;

  const renderOrder = (value: PublicRestaurantOrderStatus) => (
    <>
      <section className="checkout-summary public-order-status">
        <div>
          <span>Заказ №{value.id.slice(0, 8).toUpperCase()}</span>
          <h2>{publicOrderStatusLabels[value.status] ?? value.status}</h2>
          <p>
            {value.fulfillmentType === 'delivery'
              ? value.deliveryAddress || 'Адрес доставки не указан'
              : value.fulfillmentType === 'takeaway'
                ? 'Самовывоз'
                : 'Заказ в зале'}
          </p>
        </div>
        <div className="checkout-summary__list">
          {value.items.map((item) => (
            <article className="checkout-order-card" key={item.id}>
              <div className="checkout-order-card__body">
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.quantity} x {formatPrice(item.unitPrice)}</p>
                </div>
                <div className="checkout-order-card__bottom">
                  <strong>{formatPrice(item.lineTotal)}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
        {value.driverName && (
          <div className="checkout-summary__total">
            <span>Курьер</span>
            <strong>{value.driverName}</strong>
          </div>
        )}
        <div className="checkout-summary__total">
          <span>Итого</span>
          <strong>{formatPrice(value.total)}</strong>
        </div>
      </section>
      <button className="ghost-wide" type="button" onClick={() => navigate(`/${catalogSlug}`)}>
        Вернуться в ресторан
      </button>
    </>
  );

  return (
    <main className="screen checkout-screen">
      {statusQuery.isLoading ? (
        <section className="checkout-summary">
          <div>
            <span>Статус заказа</span>
            <h2>Загружаем...</h2>
          </div>
        </section>
      ) : statusQuery.error ? (
        <section className="checkout-summary">
          <div>
            <span>Статус заказа</span>
            <h2>Не удалось загрузить заказ</h2>
            <p>Проверьте ссылку или откройте ресторан заново.</p>
          </div>
        </section>
      ) : order ? (
        renderOrder(order)
      ) : (
        <section className="checkout-summary">
          <div>
            <span>Статус заказа</span>
            <h2>Заказ не найден</h2>
            <p>Проверьте ссылку или откройте ресторан заново.</p>
          </div>
        </section>
      )}
    </main>
  );
}

function UpsellReminder({
  category,
  products,
  selectedId,
  onSelect,
  onConfirm,
  onSkip,
  onDismiss
}: {
  category: Category;
  products: Product[];
  selectedId?: string;
  onSelect: (product: Product) => void;
  onConfirm: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}) {
  const add = useCartStore((state) => state.add);
  const decrement = useCartStore((state) => state.decrement);
  const isDrinks = category.kind === 'drink';
  const suggestions = products
    .filter((product) => isProductInCategory(product, category.id))
    .slice(0, 12);
  const selectedProduct = suggestions.find((product) => product.id === selectedId);

  const chooseProduct = (product: Product) => {
    add(product);
    onSelect(product);
  };

  return (
    <div className="modal-backdrop flow-backdrop">
      <section className="flow-modal" role="dialog" aria-modal="true" aria-labelledby="flow-title">
        <div className="modal-handle" />
        <button className="flow-modal__close" type="button" onClick={onDismiss} aria-label="Закрыть">
          <X />
        </button>
        {isDrinks ? <Coffee className="modal-icon" /> : <ChefHat className="modal-icon" />}
        <h2 id="flow-title">Вы выбрали «{category.name}»?</h2>
        <p>Можно добавить к заказу одну из позиций перед оформлением.</p>
        <div className="flow-products">
          {suggestions.map((product) => (
            <article
              className={selectedId === product.id ? 'flow-product-card is-selected' : 'flow-product-card'}
              key={product.id}
            >
              <SafeImage src={product.image_url} alt={product.title} />
              <strong>{product.title}</strong>
              <small>{formatPrice(product.price)}</small>
              <div className="flow-product-card__stepper">
                {selectedId === product.id && (
                  <>
                    <button type="button" onClick={() => decrement(product.id)} aria-label={`Уменьшить ${product.title}`}>
                      <Minus />
                    </button>
                    <span>1</span>
                  </>
                )}
                <button type="button" onClick={() => chooseProduct(product)} aria-label={`Добавить ${product.title}`}>
                  <Plus />
                </button>
              </div>
            </article>
          ))}
        </div>
        {suggestions.length === 0 && (
          <p className="modal-empty">
            В этой категории пока нет товаров.
          </p>
        )}
        {selectedProduct && <p className="flow-selected">Добавлено: {selectedProduct.title}</p>}
        <button className="primary-wide" type="button" disabled={!selectedId} onClick={onConfirm}>
          Выбрать «{category.name}»
        </button>
        <button className="ghost-wide" type="button" onClick={onSkip}>
          Продолжить без выбора
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
      void requestRestaurantOrderNotificationPermission();
      onSuccess();
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

function AdminPanel({ active, onAdd, onSettings }: { active?: 'add' | 'settings'; onAdd: () => void; onSettings: () => void }) {
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const logout = useAuthStore((state) => state.logout);

  if (!isAdmin) {
    return null;
  }

  return (
    <nav className="admin-panel">
      <button className={active === 'add' ? 'is-active' : ''} type="button" onClick={onAdd}>
        <Plus /> Добавить
      </button>
      <button className={active === 'settings' ? 'is-active' : ''} type="button" onClick={onSettings}>
        <Settings /> Настройки
      </button>
      <button type="button" onClick={logout} aria-label="Выйти">
        <LogOut /> Выход
      </button>
    </nav>
  );
}

function SettingsHeader({
  title,
  onBack,
  onAction,
  actionLabel = 'Добавить',
  actionIcon
}: {
  title: string;
  onBack: () => void;
  onAction?: () => void;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
}) {
  return (
    <header className="settings-header">
      <button className="icon-button" type="button" onClick={onBack} aria-label="Назад">
        <ArrowLeft />
      </button>
      <h1>{title}</h1>
      {onAction ? (
        <button className="icon-button" type="button" onClick={onAction} aria-label={actionLabel}>
          {actionIcon ?? <Plus />}
        </button>
      ) : (
        <span />
      )}
    </header>
  );
}

function SettingsHome({ onOpen }: { onOpen: (screen: SettingsScreen) => void }) {
  const items = [
    ['settings-profile', Store, 'Профиль ресторана', 'Название + контакты'],
    ['settings-categories', Tags, 'Параметры и категории', 'Категории + метки'],
    ['settings-design', Paintbrush, 'Дизайн приложения', 'Цвета, тема'],
    ['settings-stock', Package, 'ОБНОВИТЬ БЛЮДА', 'Остатки на день'],
    ['settings-payments', CreditCard, 'Платежи', 'Перевод, ФИО, QR'],
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

const adminOrderStatusLabels: Record<RestaurantOrderStatus, string> = {
  new: 'Новый',
  waiting_payment_confirmation: 'Ждет оплату',
  payment_confirmed: 'Оплата подтверждена',
  accepted: 'Принят',
  confirmed: 'Принят',
  preparing: 'Готовится',
  cooking: 'Готовится',
  ready: 'Готов',
  waiting_driver: 'Ждет водителя',
  driver_assigned: 'Водитель назначен',
  assigned_driver: 'Водитель назначен',
  picked_up: 'Забран',
  on_the_way: 'В пути',
  delivered: 'Доставлен',
  completed: 'Выполнен',
  cancelled: 'Отменен',
  canceled: 'Отменен'
};

const adminOrderStatusTones: Record<RestaurantOrderStatus, 'new' | 'work' | 'ready' | 'delivery' | 'done'> = {
  new: 'new',
  waiting_payment_confirmation: 'work',
  payment_confirmed: 'work',
  accepted: 'work',
  confirmed: 'work',
  preparing: 'work',
  cooking: 'work',
  ready: 'ready',
  waiting_driver: 'delivery',
  driver_assigned: 'delivery',
  assigned_driver: 'delivery',
  picked_up: 'delivery',
  on_the_way: 'delivery',
  delivered: 'done',
  completed: 'done',
  cancelled: 'done',
  canceled: 'done'
};

const adminOrderStatusFilters: Array<{ status: 'all' | RestaurantOrderStatus; label: string }> = [
  { status: 'all', label: 'Все' },
  { status: 'new', label: 'Новые' },
  { status: 'preparing', label: 'Готовятся' },
  { status: 'on_the_way', label: 'В пути' },
  { status: 'completed', label: 'Выполненные' },
  { status: 'cancelled', label: 'Отмененные' }
];

const fulfillmentLabels: Record<string, string> = {
  hall: 'В зале',
  takeaway: 'На вынос',
  delivery: 'Доставка'
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: 'Не оплачен',
  awaiting: 'Ожидает подтверждения',
  confirmed: 'Подтвержден',
  declined: 'Отклонен'
};

function getAdminOrderItemsCount(order: RestaurantOrder) {
  return order.items.reduce((sum, item) => sum + Math.max(1, item.quantity), 0);
}

function getAdminOrderLocationLabel(order: RestaurantOrder) {
  return (
    order.deliverySettlement ||
    order.deliveryCity ||
    order.deliveryAddress ||
    order.cabinLabel ||
    (order.fulfillmentType === 'takeaway' ? 'Самовывоз' : 'В зале')
  );
}

function getAdminOrderPhoneHref(phone: string) {
  const normalizedPhone = phone.replace(/[^\d+]/g, '');
  return normalizedPhone ? `tel:${normalizedPhone}` : '';
}

function getAdminOrderWhatsAppHref(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : '';
}

function getAdminOrderRouteHref(order: RestaurantOrder) {
  return buildYandexMapsRouteUrl({
    from: {
      lat: order.restaurantLat,
      lng: order.restaurantLng,
      address: order.restaurantAddress
    },
    to: {
      lat: order.deliveryLat,
      lng: order.deliveryLng,
      address: getAdminOrderLocationLabel(order)
    }
  });
}

function playRestaurantAdminOrderSound() {
  try {
    const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = window.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextCtor) return;

    const audio = new AudioContextCtor();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.24);
    window.setTimeout(() => void audio.close(), 320);
  } catch {
    // Browsers may block notification sounds until a user gesture.
  }
}

const defaultAdminDeliverySettings: RestaurantDeliverySettings = {
  enable_orders: false,
  enable_delivery: true,
  enable_pickup: true,
  enable_hall_orders: true,
  use_own_courier: false,
  use_platform_drivers: false,
  own_courier_wait_minutes: 5,
  fallback_to_platform_drivers: true,
  qr_required: false,
  minimum_order_amount: 0,
  free_delivery_from: 0,
  default_preparation_minutes: 25,
  delivery_radius_km: 5,
  delivery_area_mode: 'radius',
  primary_city: '',
  service_settlements: [],
  delivery_hours_start: '',
  delivery_hours_end: '',
  out_of_hours_mode: 'warn'
};

function RestaurantAdminShell({
  catalogSlug,
  restaurant,
  categories,
  products,
  orders,
  routeSection,
  routeOrderId,
  paymentSettings,
  deliverySettings,
  onOpenScreen,
  onAddDish,
  onOrderStatus,
  onOrderDelete,
  onSaveDeliverySettings
}: {
  catalogSlug: string;
  restaurant: Restaurant;
  categories: Category[];
  products: Product[];
  orders: RestaurantOrder[];
  routeSection?: string;
  routeOrderId?: string;
  paymentSettings: RestaurantPaymentSettings;
  deliverySettings: RestaurantDeliverySettings | null;
  onOpenScreen: (screen: SettingsScreen) => void;
  onAddDish: () => void;
  onOrderStatus: (order: RestaurantOrder, status: RestaurantOrderStatus, reason?: string) => void;
  onOrderDelete: (order: RestaurantOrder) => void;
  onSaveDeliverySettings: (settings: RestaurantDeliverySettings) => void;
}) {
  const [tab, setTab] = useState<'home' | 'dishes' | 'orders' | 'settings' | 'scanner'>(() =>
    routeSection === 'order'
      ? 'orders'
      : routeSection === 'orders' || routeSection === 'dishes' || routeSection === 'settings' || routeSection === 'scanner'
        ? routeSection
      : 'home'
  );
  const [filter, setFilter] = useState<'all' | RestaurantOrderStatus>('all');
  const [selectedOrder, setSelectedOrder] = useState<RestaurantOrder | null>(null);
  const [recentOrderIds, setRecentOrderIds] = useState<Set<string>>(() => new Set());
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedOrdersRef = useRef(false);
  const [notificationPermission, setNotificationPermission] = useState(() => getRestaurantOrderNotificationPermission());
  const logout = useAuthStore((state) => state.logout);
  const today = new Date().toDateString();
  const todayOrders = orders.filter((order) => new Date(order.createdAt).toDateString() === today);
  const todayRevenue = todayOrders
    .filter((order) => !['cancelled'].includes(order.status))
    .reduce((total, order) => total + order.total, 0);
  const filteredOrders = filter === 'all' ? orders : orders.filter((order) => order.status === filter);
  const selectedVisibleOrder = selectedOrder && filteredOrders.some((order) => order.id === selectedOrder.id)
    ? selectedOrder
    : null;
  const orderGroups = useMemo(() => groupOrdersByDate(filteredOrders), [filteredOrders]);
  const activeOrders = orders.filter((order) => !['completed', 'delivered', 'cancelled'].includes(order.status));
  const enableOrderNotifications = () => {
    void requestRestaurantOrderNotificationPermission().then(setNotificationPermission);
  };

  useEffect(() => {
    if (routeSection === 'order') {
      setTab('orders');
      return;
    }
    if (routeSection === 'orders' || routeSection === 'dishes' || routeSection === 'settings' || routeSection === 'scanner') {
      setTab(routeSection);
    }
  }, [routeSection]);

  useEffect(() => {
    if (!routeOrderId) return;
    const order = orders.find((item) => item.id === routeOrderId);
    if (order) {
      setSelectedOrder(order);
      setFilter('all');
    }
  }, [orders, routeOrderId]);

  useEffect(() => {
    const knownIds = knownOrderIdsRef.current;
    const newOrderIds = hasLoadedOrdersRef.current
      ? orders.filter((order) => order.status === 'new' && !knownIds.has(order.id)).map((order) => order.id)
      : [];

    if (newOrderIds.length > 0) {
      const newOrders = orders.filter((order) => newOrderIds.includes(order.id));
      setRecentOrderIds((current) => new Set([...current, ...newOrderIds]));
      toast.success(newOrderIds.length === 1 ? 'Новый заказ' : `Новых заказов: ${newOrderIds.length}`);
      playRestaurantAdminOrderSound();
      newOrders.slice(0, 3).forEach((order) => {
        void showRestaurantOrderNotification({
          title: `Новый заказ #${order.orderNumber}`,
          body: `${order.clientName || 'Клиент'} · ${formatPrice(order.total)}`,
          tag: `restaurant-order-${order.id}`,
          url: `${window.location.origin}${window.location.pathname}${window.location.search}#/${catalogSlug}/orders`
        });
      });
      window.setTimeout(() => {
        setRecentOrderIds((current) => {
          const next = new Set(current);
          newOrderIds.forEach((id) => next.delete(id));
          return next;
        });
      }, 9000);
    }

    knownOrderIdsRef.current = new Set(orders.map((order) => order.id));
    hasLoadedOrdersRef.current = true;
  }, [catalogSlug, orders]);

  return (
    <main className="restaurant-admin">
      <aside className="restaurant-admin-sidebar">
        <Logo compact />
        <nav aria-label="Разделы админки">
          <button className={tab === 'home' ? 'is-active' : ''} type="button" onClick={() => setTab('home')}><Home />Главная</button>
          <button className={tab === 'dishes' ? 'is-active' : ''} type="button" onClick={() => setTab('dishes')}><Utensils />Блюда</button>
          <button className={tab === 'orders' ? 'is-active' : ''} type="button" onClick={() => setTab('orders')}><ClipboardList />Заказы</button>
          <button className={tab === 'scanner' ? 'is-active' : ''} type="button" onClick={() => setTab('scanner')}><QrCode />Сканер</button>
          <button className={tab === 'settings' ? 'is-active' : ''} type="button" onClick={() => setTab('settings')}><Settings />Настройки</button>
        </nav>
        <button className="restaurant-admin-sidebar__exit" type="button" onClick={logout}><LogOut />Выход</button>
      </aside>

      <div className="restaurant-admin__workspace">
        <section className="restaurant-admin__hero">
          <div>
            <span>Панель ресторана</span>
            <h1>{restaurant.name || 'Ресторан'}</h1>
            <p>{restaurant.subtitle || 'Управляйте меню, заказами и доставкой'}</p>
          </div>
          <div className="restaurant-admin__hero-actions">
            {notificationPermission === 'default' && (
              <button className="restaurant-admin__notification-button" type="button" onClick={enableOrderNotifications}>
                <Bell />
                Уведомления
              </button>
            )}
            <div className="restaurant-admin__logo">
              {restaurant.logo_url ? <img src={restaurant.logo_url} alt="" /> : <Store />}
            </div>
          </div>
        </section>

        {tab === 'home' && (
          <section className="restaurant-admin__content">
            <div className="admin-kpi-grid">
              <article><strong>{products.length}</strong><span>Блюд</span></article>
              <article><strong>{categories.length}</strong><span>Категорий</span></article>
              <article><strong>{todayOrders.length}</strong><span>Заказов сегодня</span></article>
              <article><strong>{formatPrice(todayRevenue)}</strong><span>Выручка</span></article>
              <article><strong>4.8</strong><span>Рейтинг</span></article>
            </div>
            <section className="admin-today-card">
              <div>
                <span>Сегодня</span>
                <strong>{formatPrice(todayRevenue)}</strong>
                <small>{activeOrders.length} активных заказов</small>
              </div>
              <button type="button" onClick={() => setTab('orders')}>
                <ClipboardList />
                Заказы
              </button>
            </section>
            <section className="admin-quick-actions">
              <button type="button" onClick={onAddDish}><Plus />Добавить блюдо</button>
                <button type="button" onClick={() => onOpenScreen('settings-stock')}><Package />Остатки</button>
                <button type="button" onClick={() => setTab('orders')}><ClipboardList />Заказы</button>
                <button type="button" onClick={() => setTab('scanner')}><QrCode />Сканер</button>
              </section>
          </section>
        )}

        {tab === 'dishes' && (
          <section className="restaurant-admin__content">
            <section className="admin-section-card">
              <h2>Блюда и каталог</h2>
              <p>Существующее ядро каталога сохранено. Эти кнопки открывают текущие рабочие экраны.</p>
              <div className="admin-quick-actions">
                <button type="button" onClick={onAddDish}><Plus />Добавить блюдо</button>
                <button type="button" onClick={() => onOpenScreen('settings-categories')}><Tags />Категории</button>
                <button type="button" onClick={() => onOpenScreen('settings-stock')}><RefreshCcw />Остатки</button>
                <button type="button" onClick={() => onOpenScreen('settings-design')}><Paintbrush />Дизайн</button>
              </div>
            </section>
            <div className="admin-menu-preview">
              {products.slice(0, 8).map((product) => (
                <article key={product.id}>
                  <SafeImage src={product.image_url} alt={product.title} />
                  <div>
                    <strong>{product.title}</strong>
                    <small>{formatPrice(product.price)} · остаток {getCurrentStock(product)}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'orders' && (
          <section className="restaurant-admin__content">
            <div className="admin-order-filters">
              {adminOrderStatusFilters.map((item) => (
                <button
                  className={filter === item.status ? 'is-active' : ''}
                  type="button"
                  key={item.status}
                  onClick={() => setFilter(item.status)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="admin-orders-layout">
              <div className="admin-order-list">
                {filteredOrders.length === 0 && (
                  <section className="admin-empty-orders">
                    <ClipboardList />
                    <strong>Заказов пока нет</strong>
                    <span>Новые заказы появятся здесь автоматически.</span>
                  </section>
                )}
                {orderGroups.map((group) => (
                  <section className="admin-order-group" key={group.key}>
                    <h2>{group.label}</h2>
                    <div>
                      {group.orders.map((order) => (
                        <button
                          className="admin-order-card"
                          data-active={selectedVisibleOrder?.id === order.id}
                          data-highlighted={recentOrderIds.has(order.id)}
                          type="button"
                          key={order.id}
                          onClick={() => setSelectedOrder(order)}
                        >
                          <span className="admin-order-card__head">
                            <strong>#{order.orderNumber}</strong>
                            <time dateTime={order.createdAt}>{formatOrderTime(order.createdAt)}</time>
                          </span>
                          <span className="admin-order-card__meta">
                            {fulfillmentLabels[order.fulfillmentType]} · {getAdminOrderItemsCount(order)} поз.
                          </span>
                          <span className="admin-order-card__address">{getAdminOrderLocationLabel(order)}</span>
                          <span className="admin-order-card__foot">
                            <b>{formatPrice(order.total)}</b>
                            <i data-tone={adminOrderStatusTones[order.status]}>
                              {order.status === 'new' && <span aria-hidden="true" />}
                              {adminOrderStatusLabels[order.status]}
                            </i>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              {selectedVisibleOrder && (
                <OrderDetailsPanel
                  order={selectedVisibleOrder}
                  catalogSlug={catalogSlug}
                  paymentSettings={paymentSettings}
                  onClose={() => setSelectedOrder(null)}
                  onStatus={(status, reason) => {
                    onOrderStatus(selectedVisibleOrder, status, reason);
                    setSelectedOrder((current) => (current ? { ...current, status } : current));
                  }}
                  onDelete={() => {
                    onOrderDelete(selectedVisibleOrder);
                    setSelectedOrder(null);
                  }}
                />
              )}
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className="restaurant-admin__content">
            <section className="admin-section-card">
              <h2>Настройки ресторана</h2>
              <div className="admin-quick-actions">
                <button type="button" onClick={() => onOpenScreen('settings-profile')}><Store />Профиль</button>
                <button type="button" onClick={() => onOpenScreen('settings-design')}><Paintbrush />Дизайн</button>
                <button type="button" onClick={() => onOpenScreen('settings-categories')}><Tags />Категории</button>
                <button type="button" onClick={() => onOpenScreen('settings-payments')}><CreditCard />Платежи</button>
                <button type="button" onClick={() => onOpenScreen('settings-backup')}><CloudUpload />Импорт</button>
              </div>
            </section>
            <DeliverySettingsCard settings={deliverySettings ?? defaultAdminDeliverySettings} onSave={onSaveDeliverySettings} />
          </section>
        )}

        {tab === 'scanner' && (
          <section className="restaurant-admin__content">
            <section className="admin-section-card">
              <h2>Сканер QR</h2>
              <p>Открывает ресторан, заказ, подтверждение курьера или экран оплаты по QR-коду.</p>
              <div className="admin-quick-actions">
                <a className="admin-action-link" href={`#/${catalogSlug}/scanner`}><QrCode />Открыть сканер</a>
                <button type="button" onClick={() => window.location.hash = `/${catalogSlug}`}><Store />Каталог</button>
                <button type="button" onClick={() => setTab('orders')}><ClipboardList />Заказы</button>
                <button type="button" onClick={() => onOpenScreen('settings-payments')}><CreditCard />Платежи</button>
              </div>
            </section>
          </section>
        )}
      </div>

      <nav className="restaurant-admin-nav" aria-label="Админка ресторана">
        <button className={tab === 'home' ? 'is-active' : ''} type="button" onClick={() => setTab('home')}><Home />Главная</button>
        <button className={tab === 'dishes' ? 'is-active' : ''} type="button" onClick={() => setTab('dishes')}><Utensils />Блюда</button>
        <button className={tab === 'orders' ? 'is-active' : ''} type="button" onClick={() => setTab('orders')}><ClipboardList />Заказы</button>
        <button className={tab === 'scanner' ? 'is-active' : ''} type="button" onClick={() => setTab('scanner')}><QrCode />Сканер</button>
        <button className={tab === 'settings' ? 'is-active' : ''} type="button" onClick={() => setTab('settings')}><Settings />Настройки</button>
      </nav>
    </main>
  );
}

function OrderDetailsPanel({
  order,
  catalogSlug,
  paymentSettings,
  onClose,
  onStatus,
  onDelete
}: {
  order: RestaurantOrder;
  catalogSlug: string;
  paymentSettings: RestaurantPaymentSettings;
  onClose: () => void;
  onStatus: (status: RestaurantOrderStatus, reason?: string) => void;
  onDelete: () => void;
}) {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(() => loadPaymentStatus(catalogSlug, order.id));
  const updatePaymentStatus = (status: PaymentStatus) => {
    savePaymentStatus(catalogSlug, order.id, status);
    setPaymentStatus(status);
  };
  const phoneHref = getAdminOrderPhoneHref(order.clientPhone);
  const whatsappHref = getAdminOrderWhatsAppHref(order.clientPhone);
  const routeHref = getAdminOrderRouteHref(order);
  const orderAddress = getAdminOrderLocationLabel(order);

  return (
    <aside className="admin-order-details-panel">
      <header className="admin-detail-header">
        <button type="button" onClick={onClose} aria-label="Закрыть детали"><ArrowLeft /></button>
        <div>
          <span>Заказ #{order.orderNumber}</span>
          <h1>{adminOrderStatusLabels[order.status]}</h1>
        </div>
      </header>
      <section className="admin-section-card">
        <div className="admin-order-meta">
          <span>{fulfillmentLabels[order.fulfillmentType]}</span>
          <strong>{order.fulfillmentType === 'delivery' ? orderAddress : order.cabinLabel || 'Без адреса'}</strong>
          <small>{new Date(order.createdAt).toLocaleString('ru-RU')}</small>
        </div>
        {order.comment && <p className="admin-order-comment">{order.comment}</p>}
      </section>
      <section className="admin-section-card admin-customer-card">
        <h2>Данные клиента</h2>
        <div className="admin-customer-card__identity">
          <span><User />{order.clientName || 'Клиент'}</span>
          <span><Phone />{order.clientPhone || 'Телефон не указан'}</span>
        </div>
        <div className="admin-customer-card__actions">
          {phoneHref && <a href={phoneHref}><Phone />Позвонить</a>}
          {whatsappHref && <a href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle />WhatsApp</a>}
        </div>
      </section>
      <section className="admin-section-card admin-route-card">
        <h2>Адрес доставки</h2>
        <p>{orderAddress}</p>
        {order.deliveryLat !== null && order.deliveryLng !== null && (
          <small>{order.deliveryLat.toFixed(7)}, {order.deliveryLng.toFixed(7)}</small>
        )}
        <a href={routeHref} target="_blank" rel="noreferrer"><MapPin />Построить маршрут</a>
      </section>
      <section className="admin-section-card">
        <h2>Состав заказа</h2>
        <div className="admin-order-items">
          {order.items.map((item) => (
            <div key={item.id}>
              <span>{item.title} x {item.quantity}</span>
              <strong>{formatPrice(item.lineTotal)}</strong>
            </div>
          ))}
        </div>
        <div className="admin-order-total">
          <span>Итого</span>
          <strong>{formatPrice(order.total)}</strong>
        </div>
      </section>
      {(order.verificationCode || order.qrToken) && (
        <section className="admin-section-card">
          <h2>Подтверждение доставки</h2>
          <p>Код клиента: <strong>{order.verificationCode ?? 'QR включен'}</strong></p>
        </section>
      )}
      <section className="admin-section-card admin-payment-status">
        <h2>Оплата</h2>
        <p>Статус оплаты: <strong>{paymentStatusLabels[paymentStatus]}</strong></p>
        <p>Статус в заказе: <strong>{order.paymentStatus}</strong></p>
        {paymentSettings.transferEnabled && (
          <div className="admin-payment-requisites">
            <span>Способ: перевод ресторану</span>
            <span>Получатель: {paymentSettings.displayName || [paymentSettings.lastName, paymentSettings.firstName, paymentSettings.middleName].filter(Boolean).join(' ') || 'Не указан'}</span>
            <span>Номер: {paymentSettings.transferNumber || 'Не указан'}</span>
          </div>
        )}
        <div className="admin-order-actions">
          <button type="button" onClick={() => updatePaymentStatus('awaiting')}>Ожидает</button>
          <button type="button" onClick={() => updatePaymentStatus('confirmed')}>Подтвердить</button>
          <button type="button" onClick={() => updatePaymentStatus('declined')}>Отклонить</button>
        </div>
      </section>
      <footer className="admin-order-actions">
        {order.status === 'new' && (
          <>
            <button type="button" onClick={() => onStatus('cancelled', 'restaurant_rejected')}>Отклонить</button>
            <button type="button" onClick={() => onStatus('accepted')}>Принять заказ</button>
          </>
        )}
        {['accepted', 'confirmed'].includes(order.status) && (
          <button type="button" onClick={() => onStatus('preparing')}>Готовится</button>
        )}
        {order.status === 'preparing' && (
          <button
            type="button"
            onClick={() => onStatus('ready')}
          >
            Готово
          </button>
        )}
        {order.status === 'ready' && order.fulfillmentType === 'delivery' && (
          <button
            type="button"
            disabled={order.paymentStatus !== 'confirmed'}
            onClick={() => onStatus('waiting_driver')}
          >
            Вызвать доставку
          </button>
        )}
        {order.status === 'ready' && order.fulfillmentType !== 'delivery' && (
          <button type="button" onClick={() => onStatus('completed')}>Завершить</button>
        )}
        {order.status === 'waiting_driver' && (
          <button type="button" onClick={() => onStatus('on_the_way')}>Передано водителю</button>
        )}
        {order.status === 'on_the_way' && (
          <button type="button" onClick={() => onStatus('delivered')}>Доставлен</button>
        )}
        {!['cancelled', 'canceled', 'completed', 'delivered'].includes(order.status) && (
          <button
            className="admin-order-actions__danger"
            type="button"
            onClick={() => {
              if (window.confirm('Удалить заказ из работы ресторана?')) {
                onDelete();
              }
            }}
          >
            <Trash2 />
            Удалить заказ
          </button>
        )}
      </footer>
    </aside>
  );
}

function DeliverySettingsCard({
  settings,
  onSave
}: {
  settings: RestaurantDeliverySettings;
  onSave: (settings: RestaurantDeliverySettings) => void;
}) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const setBoolean = (key: keyof RestaurantDeliverySettings, value: boolean) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const setNumber = (key: keyof RestaurantDeliverySettings, value: string) => {
    setDraft((current) => ({ ...current, [key]: Math.max(0, Number(value) || 0) }));
  };

  const setText = (key: keyof RestaurantDeliverySettings, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const setSettlements = (value: string) => {
    setDraft((current) => ({ ...current, service_settlements: parseSettlementList(value) }));
  };

  return (
    <section className="admin-section-card delivery-settings-card">
      <h2>Доставка и заказы</h2>
      <label><input type="checkbox" checked={draft.enable_orders} onChange={(event) => setBoolean('enable_orders', event.target.checked)} />Принимать заказы</label>
      <label><input type="checkbox" checked={draft.enable_hall_orders} onChange={(event) => setBoolean('enable_hall_orders', event.target.checked)} />Заказы в зале</label>
      <label><input type="checkbox" checked={draft.enable_pickup} onChange={(event) => setBoolean('enable_pickup', event.target.checked)} />Самовывоз</label>
      <label><input type="checkbox" checked={draft.enable_delivery} onChange={(event) => setBoolean('enable_delivery', event.target.checked)} />Доставка</label>
      <label><input type="checkbox" checked={draft.use_own_courier} onChange={(event) => setBoolean('use_own_courier', event.target.checked)} />Свой курьер</label>
      <label><input type="checkbox" checked={draft.use_platform_drivers} onChange={(event) => setBoolean('use_platform_drivers', event.target.checked)} />Водители платформы</label>
      <label><input type="checkbox" checked={draft.fallback_to_platform_drivers} onChange={(event) => setBoolean('fallback_to_platform_drivers', event.target.checked)} />Передавать платформе после таймера</label>
      <label><input type="checkbox" checked={draft.qr_required} onChange={(event) => setBoolean('qr_required', event.target.checked)} />Требовать QR подтверждение доставки</label>
      <div className="delivery-settings-grid">
        <label>Мин. заказ<input value={draft.minimum_order_amount} inputMode="numeric" onChange={(event) => setNumber('minimum_order_amount', event.target.value)} /></label>
        <label>Бесплатно от<input value={draft.free_delivery_from} inputMode="numeric" onChange={(event) => setNumber('free_delivery_from', event.target.value)} /></label>
        <label>Готовка, мин<input value={draft.default_preparation_minutes} inputMode="numeric" onChange={(event) => setNumber('default_preparation_minutes', event.target.value)} /></label>
        <label>Радиус, км<input value={draft.delivery_radius_km} inputMode="decimal" onChange={(event) => setNumber('delivery_radius_km', event.target.value)} /></label>
        <label>Ожидание курьера<input value={draft.own_courier_wait_minutes} inputMode="numeric" onChange={(event) => setNumber('own_courier_wait_minutes', event.target.value)} /></label>
        <label>
          Зона доставки
          <select value={draft.delivery_area_mode} onChange={(event) => setText('delivery_area_mode', event.target.value as RestaurantDeliverySettings['delivery_area_mode'])}>
            <option value="radius">По радиусу</option>
            <option value="settlements">По городам и селам</option>
            <option value="hybrid">Смешанный режим</option>
          </select>
        </label>
        <label>
          Основной город
          <input value={draft.primary_city} onChange={(event) => setText('primary_city', event.target.value)} placeholder="Например: Грозный" />
        </label>
        <label className="delivery-settings-grid__wide">
          Села и районы обслуживания
          <textarea
            value={formatSettlementList(draft.service_settlements)}
            onChange={(event) => setSettlements(event.target.value)}
            rows={4}
            placeholder={'Одно значение на строку\nЧерноречье\nБеркат-Юрт'}
          />
        </label>
      </div>
      <button type="button" onClick={() => onSave(draft)}>Сохранить доставку</button>
    </section>
  );
}

function PaymentSettingsCard({
  slug,
  settings,
  onSave,
  onBack
}: {
  slug: string;
  settings: RestaurantPaymentSettings;
  onSave: (settings: RestaurantPaymentSettings) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const setField = <K extends keyof RestaurantPaymentSettings>(key: K, value: RestaurantPaymentSettings[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const uploadQr = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setField('qrUrl', await imageFileToDataUrl(file));
    } catch {
      toast.error('Не удалось загрузить QR-код');
    }
  };

  return (
    <main className="settings-screen payment-settings-screen">
      <SettingsHeader title="Платежи" onBack={onBack} />
      <section className="settings-form-card payment-settings-card">
        <h2>Реквизиты для перевода</h2>
        <label className="settings-toggle-row">
          <input type="checkbox" checked={draft.transferEnabled} onChange={(event) => setField('transferEnabled', event.target.checked)} />
          Включить оплату переводом
        </label>
        <label>
          Тип реквизита
          <select value={draft.requisiteType} onChange={(event) => setField('requisiteType', event.target.value as RestaurantPaymentSettings['requisiteType'])}>
            <option value="phone">Телефон</option>
            <option value="card">Карта</option>
            <option value="account">Счет</option>
          </select>
        </label>
        <label>Номер для перевода<input value={draft.transferNumber} onChange={(event) => setField('transferNumber', event.target.value)} /></label>
        <label>Банк<input value={draft.bankName} onChange={(event) => setField('bankName', event.target.value)} placeholder="Сбер, Тинькофф..." /></label>
        <div className="settings-form-grid">
          <label>Фамилия<input value={draft.lastName} onChange={(event) => setField('lastName', event.target.value)} /></label>
          <label>Имя<input value={draft.firstName} onChange={(event) => setField('firstName', event.target.value)} /></label>
          <label>Отчество<input value={draft.middleName} onChange={(event) => setField('middleName', event.target.value)} /></label>
        </div>
        <label>Отображаемое имя<input value={draft.displayName} onChange={(event) => setField('displayName', event.target.value)} placeholder="ФИО, которое увидит клиент" /></label>
        <label>Комментарий к оплате<textarea value={draft.comment} onChange={(event) => setField('comment', event.target.value)} /></label>
        <label className="settings-toggle-row">
          <input type="checkbox" checked={draft.allowCash} onChange={(event) => setField('allowCash', event.target.checked)} />
          Разрешить наличные
        </label>
        <label className="settings-toggle-row">
          <input type="checkbox" checked={draft.requireConfirmation} onChange={(event) => setField('requireConfirmation', event.target.checked)} />
          Требовать подтверждение рестораном
        </label>
        <label className="payment-qr-upload">
          <QrCode />
          {draft.qrUrl ? 'Заменить QR-код' : 'Загрузить QR-код'}
          <input type="file" accept="image/*" onChange={uploadQr} />
        </label>
        <div className="payment-client-preview">
          <h3>Как увидит клиент</h3>
          <strong>{draft.displayName || [draft.lastName, draft.firstName, draft.middleName].filter(Boolean).join(' ') || 'Получатель не указан'}</strong>
          <span>{draft.bankName || 'Банк не указан'} · {draft.transferNumber || 'Номер не указан'}</span>
          {draft.qrUrl ? <img src={draft.qrUrl} alt="QR-код для перевода" /> : <QrCode />}
          <small>{draft.comment}</small>
        </div>
        <button className="primary-wide" type="button" onClick={() => {
          onSave(draft);
          toast.success(`Платежи сохранены для ${slug}`);
        }}>
          Сохранить платежи
        </button>
      </section>
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

  const updateBanner = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Обложка должна быть изображением.');
      return;
    }
    const value = await imageFileToDataUrl(file);
    setDraft((current) => ({ ...current, banner_url: value }));
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
        <div className="profile-field">
          <span>Фото карточки ресторана</span>
          <label className="profile-cover-picker">
            <input
              type="file"
              accept="image/*"
              onChange={(event) => void updateBanner(event.target.files?.[0])}
            />
            {draft.banner_url ? <img src={draft.banner_url} alt="" /> : <span>Добавить фото</span>}
          </label>
          <div className="profile-logo-actions">
            <small>Это фото увидят клиенты на главной и в списке ресторанов.</small>
            {draft.banner_url && (
              <button type="button" onClick={() => setDraft({ ...draft, banner_url: '' })}>
                Удалить фото
              </button>
            )}
          </div>
        </div>
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

function CategoriesSettings({
  categories,
  cabins,
  tags,
  products,
  activeTab,
  onTabChange,
  mode,
  editingId,
  cabinMode,
  editingCabinId,
  onCabinModeChange,
  onModeChange,
  onChangeCategories,
  onChangeCabins,
  onChangeTags
}: {
  categories: Category[];
  cabins: Cabin[];
  tags: CatalogTag[];
  products: Product[];
  activeTab: SettingsCatalogTab;
  onTabChange: (tab: SettingsCatalogTab) => void;
  mode: CategoryEditorMode;
  editingId?: string;
  cabinMode: CabinEditorMode;
  editingCabinId?: string;
  onCabinModeChange: (mode: CabinEditorMode, cabinId?: string) => void;
  onModeChange: (mode: CategoryEditorMode, categoryId?: string) => void;
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
  const editingCategory = editingId ? categories.find((category) => category.id === editingId) : undefined;
  const productCountFor = (categoryId: string) =>
    products.filter((product) => isProductInCategory(product, categoryId)).length;
  const statusFor = (category: Category) => {
    if (category.icon === 'flame' || category.icon === 'hot') return { label: 'Популярная', tone: 'popular' };
    if (category.icon === 'pot' || category.icon === 'chef') return { label: 'Новинка', tone: 'new' };
    return { label: 'Обычная', tone: 'default' };
  };
  const saveCategory = (category: Category) => {
    const normalized = {
      ...category,
      name: category.name.trim() || 'Новая категория',
      showOnHome: category.showOnHome !== false,
      showInOrderFlow: category.showInOrderFlow === true
    };
    const exists = categories.some((item) => item.id === normalized.id);
    onChangeCategories(
      exists
        ? categories.map((item) => (item.id === normalized.id ? normalized : item))
        : [...categories, normalized]
    );
    onModeChange('list');
  };
  const moveCabin = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= cabins.length) return;
    const next = [...cabins];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChangeCabins(next);
  };
  const editingCabin = editingCabinId ? cabins.find((cabin) => cabin.id === editingCabinId) : undefined;
  const saveCabin = (cabin: Cabin) => {
    const normalized = {
      ...cabin,
      title: cabin.title.trim() || 'Новая кабинка',
      capacity: cabin.capacity.trim() || '2-4 человека',
      feature: cabin.feature || makeCabinFeature(defaultCabinMeta)
    };
    const exists = cabins.some((item) => item.id === normalized.id);
    onChangeCabins(exists ? cabins.map((item) => (item.id === normalized.id ? normalized : item)) : [...cabins, normalized]);
    onCabinModeChange('list');
  };
  const saveTag = (tag: CatalogTag) => {
    const normalized = {
      ...tag,
      name: tag.name.trim() || 'Новая метка',
      icon: tag.icon.trim() || '#',
      color: tag.color || '#7c3aed'
    };
    const exists = tags.some((item) => item.id === normalized.id);
    onChangeTags(exists ? tags.map((item) => (item.id === normalized.id ? normalized : item)) : [...tags, normalized]);
  };
  const deleteTag = (tagId: string) => {
    onChangeTags(tags.filter((tag) => tag.id !== tagId));
  };

  const tabs = [
    ['tags', Tags, 'Метки'],
    ['cabins', Store, 'Кабинки'],
    ['categories', Tags, 'Категории']
  ] as const;

  const renderTabs = () => (
    <nav className="category-tabs" aria-label="Разделы настроек">
      {tabs.map(([id, Icon, label]) => (
        <button className={activeTab === id ? 'is-active' : ''} type="button" key={id} onClick={() => onTabChange(id)}>
          <Icon />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );

  if (activeTab === 'tags') {
    return (
      <TagsSettingsScreen
        tags={tags}
        onSave={saveTag}
        onDelete={deleteTag}
        renderTabs={renderTabs}
      />
    );
  }

  if (activeTab === 'cabins') {
    if (cabinMode === 'add' || cabinMode === 'edit') {
      return (
        <CabinEditScreen
          cabin={cabinMode === 'edit' ? editingCabin : undefined}
          mode={cabinMode}
          sortIndex={cabinMode === 'edit' && editingCabin ? cabins.findIndex((item) => item.id === editingCabin.id) : cabins.length}
          onCancel={() => onCabinModeChange('list')}
          onMove={cabinMode === 'edit' && editingCabin ? (direction) => moveCabin(cabins.findIndex((item) => item.id === editingCabin.id), direction) : undefined}
          onSave={saveCabin}
        />
      );
    }

    return (
      <main className="settings-screen category-settings-screen">
        {renderTabs()}
        <section className="category-settings-card">
          <div className="category-settings-tip">
            <Info />
            <span>Выберите кабинку при оформлении заказа. Данные кабинки будут показаны в итоге заказа.</span>
          </div>
          <div className="category-list">
            {cabins.map((cabin) => {
              const meta = parseCabinMeta(cabin.feature);
              return (
                <button className="category-list-card cabin-list-card" type="button" key={cabin.id} onClick={() => onCabinModeChange('edit', cabin.id)}>
                  <SafeImage src={cabin.image_url} alt={cabin.title} className="category-list-card__image" />
                  <span className="category-list-card__content">
                    <strong>{cabin.title}</strong>
                    <small className={meta.status === 'active' ? 'cabin-state cabin-state--active' : 'cabin-state'}>
                      <i />
                      {meta.status === 'active' ? 'Активна' : 'Неактивна'}
                    </small>
                    <span className={`cabin-type-badge cabin-type-badge--${meta.type}`}>
                      {meta.type === 'vip' ? 'VIP' : meta.type === 'premium' ? 'Премиум' : 'Основная'}
                    </span>
                    <em>{cabin.capacity}</em>
                  </span>
                  <ArrowRight className="category-list-card__arrow" />
                </button>
              );
            })}
          </div>
          <button className="category-add-wide" type="button" onClick={() => onCabinModeChange('add')}>
            <Plus />
            Добавить кабинку
          </button>
        </section>
      </main>
    );
  }

  if (mode === 'add' || mode === 'edit') {
    return (
      <CategoryEditScreen
        category={mode === 'edit' ? editingCategory : undefined}
        mode={mode}
        tags={tags}
        sortIndex={mode === 'edit' && editingCategory ? categories.findIndex((item) => item.id === editingCategory.id) : categories.length}
        onCancel={() => onModeChange('list')}
        onMove={mode === 'edit' && editingCategory ? (direction) => move(categories.findIndex((item) => item.id === editingCategory.id), direction) : undefined}
        onSave={saveCategory}
      />
    );
  }

  return (
    <main className="settings-screen category-settings-screen">
      {renderTabs()}
      <section className="category-settings-card">
        <div className="category-settings-tip">
          <Info />
          <span>Фото категории лучше загружать широким: 16:9 или около 1.72:1, например 1200 x 700 px.</span>
        </div>
        <div className="category-list">
          {categories.map((category) => (
            <button className="category-list-card" type="button" key={category.id} onClick={() => onModeChange('edit', category.id)}>
              <GripVertical className="category-list-card__drag" />
              <SafeImage src={category.image} alt={category.name} className="category-list-card__image" />
              <span className="category-list-card__content">
                <strong>{category.name}</strong>
                <span className={`category-status-badge category-status-badge--${statusFor(category).tone}`}>
                  {category.icon === 'flame' || category.icon === 'hot' ? <Flame /> : category.icon === 'pot' || category.icon === 'chef' ? <ChefHat /> : <Utensils />}
                  {statusFor(category).label}
                </span>
                <small>
                  <i />
                  {[
                    category.showOnHome !== false ? 'На главной' : '',
                    category.showInOrderFlow === true ? 'Дополнительное' : ''
                  ].filter(Boolean).join(' / ') || 'Скрыта'}
                </small>
                <em>{productCountFor(category.id)} блюд</em>
              </span>
              <ArrowRight className="category-list-card__arrow" />
            </button>
          ))}
        </div>
        <button className="category-add-wide" type="button" onClick={() => onModeChange('add')}>
          <Plus />
          Добавить категорию
        </button>
      </section>
    </main>
  );
}

function TagsSettingsScreen({
  tags,
  onSave,
  onDelete,
  renderTabs
}: {
  tags: CatalogTag[];
  onSave: (tag: CatalogTag) => void;
  onDelete: (tagId: string) => void;
  renderTabs: () => JSX.Element;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CatalogTag>(() => createTagDraft());
  const editingTag = editingId ? tags.find((tag) => tag.id === editingId) : undefined;

  useEffect(() => {
    if (editingTag) {
      setDraft(editingTag);
      return;
    }
    if (!editingId) {
      setDraft(createTagDraft());
    }
  }, [editingId, editingTag]);

  const resetDraft = () => {
    setEditingId(null);
    setDraft(createTagDraft());
  };

  const saveDraft = () => {
    onSave(draft);
    resetDraft();
  };

  return (
    <main className="settings-screen category-settings-screen">
      {renderTabs()}
      <section className="category-settings-card tag-settings-card">
        <div className="category-settings-tip">
          <Info />
          <span>Метки помогают быстро выделять блюда и категории: хит, новинка, популярное или любой ваш статус.</span>
        </div>

        <div className="tag-edit-panel">
          <label className="tag-edit-field tag-edit-field--name">
            <strong>Название</strong>
            <input
              value={draft.name}
              placeholder="Например: Новинка"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label className="tag-edit-field tag-edit-field--icon">
            <strong>Иконка</strong>
            <input
              value={draft.icon}
              maxLength={6}
              placeholder="#"
              onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
            />
          </label>
          <label className="tag-edit-field tag-edit-field--color">
            <strong>Цвет</strong>
            <input
              type="color"
              value={draft.color}
              onChange={(event) => setDraft({ ...draft, color: event.target.value })}
              aria-label="Цвет метки"
            />
          </label>
          <button className="tag-save-button" type="button" onClick={saveDraft}>
            {editingId ? 'Сохранить' : 'Добавить'}
          </button>
          {editingId && (
            <button className="tag-cancel-button" type="button" onClick={resetDraft}>
              Отмена
            </button>
          )}
        </div>

        <div className="tag-list">
          {tags.map((tag) => (
            <article className="tag-list-card" key={tag.id}>
              <button className="tag-list-card__main" type="button" onClick={() => setEditingId(tag.id)}>
                <span className="tag-preview" style={{ color: tag.color, backgroundColor: `${tag.color}1a` }}>
                  {tag.icon}
                </span>
                <span>
                  <strong>{tag.name}</strong>
                  <small>{tag.color}</small>
                </span>
              </button>
              <button className="tag-icon-button" type="button" onClick={() => setEditingId(tag.id)} aria-label={`Редактировать ${tag.name}`}>
                <Edit3 />
              </button>
              <button className="tag-icon-button tag-icon-button--danger" type="button" onClick={() => onDelete(tag.id)} aria-label={`Удалить ${tag.name}`}>
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function CategoryEditScreen({
  category,
  mode,
  tags,
  sortIndex,
  onCancel,
  onMove,
  onSave
}: {
  category?: Category;
  mode: 'edit' | 'add';
  tags: CatalogTag[];
  sortIndex: number;
  onCancel: () => void;
  onMove?: (direction: -1 | 1) => void;
  onSave: (category: Category) => void;
}) {
  const [draft, setDraft] = useState<Category>(() => category ?? createCategoryDraft(''));

  useEffect(() => {
    setDraft(category ?? createCategoryDraft(''));
  }, [category, mode]);

  const selectedTags = tags.slice(0, mode === 'edit' ? 2 : 0);

  return (
    <main className="settings-screen category-edit-screen">
      <section className="category-edit-card">
        <div className="category-edit-field">
          <strong>Изображение категории</strong>
          {draft.image ? (
            <div className="category-edit-image">
              <SafeImage src={draft.image} alt={draft.name || 'Изображение категории'} />
              <button type="button" onClick={() => setDraft({ ...draft, image: '' })} aria-label="Очистить изображение">
                <X />
              </button>
            </div>
          ) : (
            <label className="category-upload-drop">
              <input
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setDraft({ ...draft, image: await imageFileToDataUrl(file) });
                  event.target.value = '';
                }}
              />
              <Plus />
              <span>Загрузите изображение<br />или перетащите сюда</span>
            </label>
          )}
          <div className="category-edit-actions">
            <label>
              <CloudUpload />
              Загрузить
              <input
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setDraft({ ...draft, image: await imageFileToDataUrl(file) });
                  event.target.value = '';
                }}
              />
            </label>
            <button type="button" disabled={!draft.image} onClick={() => setDraft({ ...draft, image: '' })}>
              <Trash2 />
              Очистить
            </button>
          </div>
        </div>

        <label className="category-edit-field">
          <strong>Название категории</strong>
          <input
            value={draft.name}
            placeholder="Введите название категории"
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>

        <label className="category-edit-field">
          <strong>Ссылка на изображение</strong>
          <span className="category-edit-url">
            <Link2 />
            <input
              value={draft.image}
              placeholder="Вставьте ссылку на изображение"
              onChange={(event) => setDraft({ ...draft, image: event.target.value })}
            />
          </span>
        </label>

        <div className="category-edit-field">
          <strong>Иконки категории</strong>
          <div className="category-edit-icons">
            {categoryIconOptions.slice(0, 12).map(({ id, label, Icon }) => (
              <button
                className={draft.icon === id ? 'is-active' : ''}
                type="button"
                key={id}
                title={label}
                aria-label={label}
                onClick={() => setDraft({ ...draft, icon: id })}
              >
                <Icon />
              </button>
            ))}
          </div>
        </div>

        <div className="category-edit-field">
          <strong>Статус</strong>
          <div className="category-status-options">
            {[
              ['flame', 'Популярная'],
              ['pot', 'Новинка'],
              ['utensils', 'Обычная']
            ].map(([icon, label]) => (
              <button
                className={draft.icon === icon ? 'is-active' : ''}
                type="button"
                key={icon}
                onClick={() => setDraft({ ...draft, icon })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="category-edit-field">
          <strong>Отображение категории</strong>
          <label className="category-edit-radio">
            <input
              type="checkbox"
              checked={draft.showOnHome !== false}
              onChange={(event) => setDraft({ ...draft, showOnHome: event.target.checked })}
            />
            На главной
          </label>
          <label className="category-edit-radio">
            <input
              type="checkbox"
              checked={draft.showInOrderFlow === true}
              onChange={(event) => setDraft({ ...draft, showInOrderFlow: event.target.checked })}
            />
            Дополнительное
          </label>
        </div>

        <div className="category-edit-field">
          <strong>Метки</strong>
          <div className="category-edit-tags">
            {selectedTags.map((tag) => (
              <span key={tag.id}>
                {tag.name}
                <X />
              </span>
            ))}
            <button type="button">
              <Plus />
              Добавить метку
            </button>
          </div>
        </div>

        <div className="category-edit-field">
          <strong>Порядок сортировки</strong>
          <div className="category-sort-row">
            <button type="button" onClick={() => onMove?.(-1)} disabled={!onMove}>
              ↑
            </button>
            <button type="button" onClick={() => onMove?.(1)} disabled={!onMove}>
              ↓
            </button>
            <input value={sortIndex < 0 ? 0 : sortIndex} readOnly aria-label="Порядок сортировки" />
          </div>
        </div>

        <label className="category-edit-field">
          <strong>Описание</strong>
          <textarea placeholder="Описание категории" />
        </label>

        <button className="category-save-button" type="button" onClick={() => onSave(draft)}>
          {mode === 'add' ? 'Добавить категорию' : 'Сохранить изменения'}
        </button>
        <button className="category-cancel-button" type="button" onClick={onCancel}>
          Отмена
        </button>
      </section>
    </main>
  );
}

function CabinEditScreen({
  cabin,
  mode,
  sortIndex,
  onCancel,
  onMove,
  onSave
}: {
  cabin?: Cabin;
  mode: 'edit' | 'add';
  sortIndex: number;
  onCancel: () => void;
  onMove?: (direction: -1 | 1) => void;
  onSave: (cabin: Cabin) => void;
}) {
  const [draft, setDraft] = useState<Cabin>(() => cabin ?? createCabinDraft());

  useEffect(() => {
    setDraft(cabin ?? createCabinDraft());
  }, [cabin, mode]);

  const meta = parseCabinMeta(draft.feature);
  const updateMeta = (patch: Partial<CabinMeta>) => {
    setDraft((current) => ({
      ...current,
      feature: makeCabinFeature({ ...parseCabinMeta(current.feature), ...patch })
    }));
  };

  return (
    <main className="settings-screen category-edit-screen">
      <section className="category-edit-card">
        <div className="category-edit-field">
          <strong>Фото кабинки</strong>
          {draft.image_url ? (
            <div className="category-edit-image">
              <SafeImage src={draft.image_url} alt={draft.title || 'Фото кабинки'} />
              <button type="button" onClick={() => setDraft({ ...draft, image_url: '' })} aria-label="Очистить фото">
                <X />
              </button>
            </div>
          ) : (
            <label className="category-upload-drop">
              <input
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setDraft({ ...draft, image_url: await imageFileToDataUrl(file) });
                  event.target.value = '';
                }}
              />
              <Plus />
              <span>Загрузите изображение<br />или перетащите сюда</span>
            </label>
          )}
          <div className="category-edit-actions">
            <label>
              <CloudUpload />
              Загрузить
              <input
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setDraft({ ...draft, image_url: await imageFileToDataUrl(file) });
                  event.target.value = '';
                }}
              />
            </label>
            <button type="button" disabled={!draft.image_url} onClick={() => setDraft({ ...draft, image_url: '' })}>
              <Trash2 />
              Очистить
            </button>
          </div>
        </div>

        <label className="category-edit-field">
          <strong>Название кабинки</strong>
          <input
            value={draft.title}
            placeholder="Кабинка 2"
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>

        <label className="category-edit-field">
          <strong>Вместимость</strong>
          <input
            value={draft.capacity}
            placeholder="8-10 человек"
            onChange={(event) => setDraft({ ...draft, capacity: event.target.value })}
          />
        </label>

        <div className="category-edit-field">
          <strong>Статус</strong>
          <div className="category-status-options">
            <button className={meta.status === 'active' ? 'is-active' : ''} type="button" onClick={() => updateMeta({ status: 'active' })}>
              Активна
            </button>
            <button className={meta.status === 'inactive' ? 'is-active' : ''} type="button" onClick={() => updateMeta({ status: 'inactive' })}>
              Неактивна
            </button>
          </div>
        </div>

        <div className="category-edit-field">
          <strong>Тип кабинки</strong>
          <div className="category-status-options">
            {[
              ['normal', 'Обычная'],
              ['vip', 'VIP'],
              ['premium', 'Премиум']
            ].map(([type, label]) => (
              <button className={meta.type === type ? 'is-active' : ''} type="button" key={type} onClick={() => updateMeta({ type: type as CabinMeta['type'] })}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="category-edit-field">
          <strong>Порядок сортировки</strong>
          <div className="category-sort-row">
            <button type="button" onClick={() => onMove?.(-1)} disabled={!onMove}>
              ↑
            </button>
            <button type="button" onClick={() => onMove?.(1)} disabled={!onMove}>
              ↓
            </button>
            <input value={sortIndex < 0 ? 0 : sortIndex} readOnly aria-label="Порядок сортировки" />
          </div>
        </div>

        <button className="category-save-button" type="button" onClick={() => onSave(draft)}>
          {mode === 'add' ? 'Добавить кабинку' : 'Сохранить изменения'}
        </button>
        <button className="category-cancel-button" type="button" onClick={onCancel}>
          Отмена
        </button>
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
  const normalizedValue = normalizeHexColor(value) ?? '#000000';
  const [draft, setDraft] = useState(normalizedValue);

  useEffect(() => {
    setDraft(normalizedValue);
  }, [normalizedValue]);

  const updateColor = (color: string) => {
    const normalized = normalizeHexColor(color);
    if (!normalized) return;
    setDraft(normalized);
    onChange(normalized);
  };

  return (
    <div className="color-setting">
      <div className="color-setting__head">
        <h2>{label}</h2>
        <label>
          <span style={{ background: normalizedValue }} />
          <input type="color" value={normalizedValue} onChange={(event) => updateColor(event.target.value)} aria-label={label} />
        </label>
      </div>
      <input
        className="hex-input"
        value={draft}
        inputMode="text"
        maxLength={7}
        onBlur={() => setDraft(normalizedValue)}
        onChange={(event) => {
          const next = event.target.value.startsWith('#') ? event.target.value : `#${event.target.value}`;
          setDraft(next);
          const normalized = normalizeHexColor(next);
          if (normalized) onChange(normalized);
        }}
        aria-label={`${label}: HEX`}
      />
      <div className="swatches">
        {palette.map((color) => (
          <button
            className={normalizedValue.toLowerCase() === color.toLowerCase() ? 'swatch is-active' : 'swatch'}
            style={{ background: color }}
            type="button"
            key={color}
            onClick={() => updateColor(color)}
            aria-label={color}
          />
        ))}
      </div>
    </div>
  );
}

function BackgroundSetting({
  theme,
  palette,
  onChange
}: {
  theme: ThemeSettings;
  palette: string[];
  onChange: (patch: Partial<ThemeSettings>) => void;
}) {
  const gradientFrom = theme.background_gradient_from ?? theme.background_color;
  const gradientTo = theme.background_gradient_to ?? theme.accent_secondary ?? theme.background_color;
  const setMode = (backgroundType: ThemeSettings['background_type']) => {
    if (backgroundType === 'color') {
      onChange({ background_type: 'color', background_color: gradientFrom, background_image_url: '' });
      return;
    }
    if (backgroundType === 'gradient') {
      onChange({
        background_type: 'gradient',
        background_color: gradientFrom,
        background_gradient_from: gradientFrom,
        background_gradient_to: gradientTo,
        background_image_url: ''
      });
      return;
    }
    onChange({ background_type: 'image' });
  };

  return (
    <section className="background-setting">
      <div className="background-mode">
        <button className={theme.background_type === 'color' ? 'is-active' : ''} type="button" onClick={() => setMode('color')}>
          Заливка
        </button>
        <button className={theme.background_type === 'gradient' ? 'is-active' : ''} type="button" onClick={() => setMode('gradient')}>
          Градиент
        </button>
        <button className={theme.background_type === 'image' ? 'is-active' : ''} type="button" onClick={() => setMode('image')}>
          Изображение
        </button>
      </div>

      {theme.background_type === 'gradient' ? (
        <>
          <ColorSetting
            label="Начальный цвет фона"
            value={gradientFrom}
            palette={palette}
            onChange={(color) => onChange({ background_type: 'gradient', background_color: color, background_gradient_from: color })}
          />
          <ColorSetting
            label="Конечный цвет фона"
            value={gradientTo}
            palette={palette}
            onChange={(color) => onChange({ background_type: 'gradient', background_gradient_to: color })}
          />
        </>
      ) : (
        <ColorSetting
          label="Фон приложения"
          value={theme.background_color}
          palette={palette}
          onChange={(color) => onChange({ background_type: 'color', background_color: color, background_image_url: '' })}
        />
      )}
    </section>
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

        <BackgroundSetting theme={theme} palette={backgroundColors} onChange={onChange} />
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
            <BackgroundSetting theme={theme} palette={['#070809', '#101419', '#f7f3ec', '#f8fafc', '#fff7ed', '#f1f5f9']} onChange={updateTheme} />
            {[
              ['text_primary', 'Текст'],
              ['text_secondary', 'Вторичный текст'],
              ['card_color', 'Карточки'],
              ['accent_color', 'Акцент'],
              ['accent_secondary', 'Акцент 2']
            ].map(([key, label]) => (
              <ColorSetting
                key={key}
                label={label}
                value={String(theme[key as keyof ThemeSettings])}
                palette={['#e8a23a', '#ffd082', '#f8f5ef', '#ffffff', '#181510', '#111827']}
                onChange={(color) => updateTheme({ [key]: color })}
              />
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

function AppContent({
  catalogSlug,
  routeSection,
  routeOrderId
}: {
  catalogSlug: string;
  routeSection?: string;
  routeOrderId?: string;
}) {
  const navigate = useNavigate();
  const catalogQueryKey = useMemo(() => ['catalog', catalogSlug] as const, [catalogSlug]);
  const { data, isLoading } = useQuery({
    queryKey: catalogQueryKey,
    queryFn: () => loadCatalog(catalogSlug),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  });
  const themeStore = useThemeStore((state) => state.theme);
  const updateTheme = useThemeStore((state) => state.updateTheme);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const setAdmin = useAuthStore((state) => state.setAdmin);
  const setAdminEditor = useAdminStore((state) => state.setEditor);
  const [screen, setScreen] = useState<Screen>('home');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [drinkCategory, setDrinkCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showAfterOrderPanel, setShowAfterOrderPanel] = useState(false);
  const [orderFlow, setOrderFlow] = useState<OrderFlowState>({ step: 'done', selectedByCategory: {} });
  const [settingsCatalogTab, setSettingsCatalogTab] = useState<SettingsCatalogTab>('categories');
  const [categoryEditor, setCategoryEditor] = useState<{ mode: CategoryEditorMode; categoryId?: string }>({ mode: 'list' });
  const [cabinEditor, setCabinEditor] = useState<{ mode: CabinEditorMode; cabinId?: string }>({ mode: 'list' });
  const [localProducts, setLocalProducts] = useState<Product[]>(demoProducts);
  const [localCategories, setLocalCategories] = useState<Category[]>(demoCategories);
  const [localCabins, setLocalCabins] = useState<Cabin[]>(demoCabins);
  const [localTags, setLocalTags] = useState<CatalogTag[]>(defaultTags);
  const [localRestaurant, setLocalRestaurant] = useState<Restaurant>(() => makeLoadingRestaurant(catalogSlug));
  const [restaurantOrders, setRestaurantOrders] = useState<RestaurantOrder[]>([]);
  const [deliverySettings, setDeliverySettings] = useState<RestaurantDeliverySettings | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<RestaurantPaymentSettings>(() => loadPaymentSettings(catalogSlug));
  const [, setStockTargets] = useState<StockTargets>(() => loadStockTargets());
  const items = useCartStore((state) => state.items);
  const cartUpdatedAt = useCartStore((state) => state.updatedAt);
  const clearCart = useCartStore((state) => state.clear);
  const cartCount = selectCartCount(items);
  const persist = <T,>(action: Promise<T>, onSuccess?: (value: T) => void) => {
    void action.then((value) => {
      onSuccess?.(value);
    }).catch((error) => {
      console.error('Supabase save failed', error);
      const message = errorMessageFor(error);
      toast.error(message ? `Не удалось сохранить: ${message}` : 'Не удалось сохранить изменения в Supabase');
    });
  };
  const openRestaurantAdminPath = useCallback(
    (nextScreen: Screen = 'admin-home') => {
      const targetPath = nextScreen === 'settings-payments' ? `/${catalogSlug}/payments` : `/${catalogSlug}/dashboard`;
      setScreen(nextScreen);
      rememberPwaResumePath(targetPath);
      navigate(targetPath, { replace: true });
    },
    [catalogSlug, navigate]
  );

  const refreshRestaurantOrders = useCallback(() => {
    if (!isAdmin) return;
    void getRestaurantOrders(catalogSlug)
      .then(setRestaurantOrders)
      .catch((error) => {
        console.error('Orders load failed', error);
        toast.error('Не удалось загрузить заказы');
      });
  }, [catalogSlug, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return undefined;

    let cleanup: () => void = () => undefined;
    let cancelled = false;

    void getCatalogIdBySlug(catalogSlug).then((catalogId) => {
      if (cancelled) return;
      cleanup = subscribeToRestaurantOrdersRealtime(catalogId, refreshRestaurantOrders);
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [catalogSlug, isAdmin, refreshRestaurantOrders]);

  useEffect(() => {
    if (!isAdmin) return undefined;

    const refreshOrders = () => {
      refreshRestaurantOrders();
    };
    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshRestaurantOrders();
      }
    };
    const intervalId = window.setInterval(refreshOrders, 12_000);

    window.addEventListener('focus', refreshRestaurantOrders);
    window.addEventListener('pageshow', refreshOrders);
    window.addEventListener('online', refreshRestaurantOrders);
    document.addEventListener('visibilitychange', refreshOnVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshRestaurantOrders);
      window.removeEventListener('pageshow', refreshOrders);
      window.removeEventListener('online', refreshRestaurantOrders);
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
  }, [isAdmin, refreshRestaurantOrders]);

  const refreshDeliverySettings = useCallback(() => {
    if (!isAdmin) return;
    void getRestaurantDeliverySettings(catalogSlug)
      .then(setDeliverySettings)
      .catch((error) => {
        console.error('Delivery settings load failed', error);
      });
  }, [catalogSlug, isAdmin]);

  useEffect(() => {
    void hasAdminSession(catalogSlug).then(setAdmin);
    return onAdminSessionChange(setAdmin, catalogSlug);
  }, [catalogSlug, setAdmin]);

  useEffect(() => {
    if (!isAdmin || routeSection || !appIsRunningStandalone()) return;
    openRestaurantAdminPath('admin-home');
  }, [isAdmin, openRestaurantAdminPath, routeSection]);

  useEffect(() => {
    setPaymentSettings(loadPaymentSettings(catalogSlug));
    void getRestaurantPaymentsBySlug(catalogSlug)
      .then(setPaymentSettings)
      .catch((error) => {
        console.error('Payment settings load failed', error);
      });
  }, [catalogSlug]);

  useEffect(() => {
    refreshRestaurantOrders();
    refreshDeliverySettings();
  }, [refreshDeliverySettings, refreshRestaurantOrders]);

  useEffect(() => {
    const client = supabase;
    if (!client) return undefined;

    const refreshCatalog = () => {
      void queryClient.invalidateQueries({ queryKey: catalogQueryKey });
    };
    const channel = client.channel(`catalog-refresh-${catalogSlug}`);
    ['category', 'categories', 'product', 'products', 'restaurant', 'catalogs', 'catalog_tag', 'tags', 'theme_settings', 'catalog_theme_settings'].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, refreshCatalog);
    });
    channel.subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [catalogQueryKey, catalogSlug]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [screen, selectedProduct?.id]);

  useEffect(() => {
    if (cartCount === 0) {
      setShowAfterOrderPanel(false);
    }
  }, [cartCount]);

  useEffect(() => {
    if (cartCount === 0 || !cartUpdatedAt) return undefined;

    const remainingMs = cartUpdatedAt + CART_TTL_MS - Date.now();
    if (remainingMs <= 0) {
      clearCart();
      toast.info('Корзина очищена: прошло 5 минут.');
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      clearCart();
      toast.info('Корзина очищена: прошло 5 минут.');
    }, remainingMs);

    return () => window.clearTimeout(timeoutId);
  }, [cartCount, cartUpdatedAt, clearCart]);

  useEffect(() => {
    if (routeSection === 'dashboard' || routeSection === 'orders' || routeSection === 'dishes' || routeSection === 'settings' || routeSection === 'scanner') {
      setScreen('admin-home');
    }
    if (routeSection === 'payments') {
      setScreen('settings-payments');
    }
  }, [routeSection]);

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
  const flowCategories = useMemo(() => getOrderFlowCategories(catalog.categories), [catalog.categories]);
  const activeFlowCategory = orderFlow.categoryId
    ? flowCategories.find((category) => category.id === orderFlow.categoryId)
    : undefined;

  const title = useMemo(() => {
    if (screen === 'catalog') return 'Все товары';
    if (screen === 'drinks') return 'Напитки';
    if (screen === 'checkout') return 'Оформление заказа';
    return undefined;
  }, [screen]);

  const settingsTitle = useMemo(() => {
    if (screen === 'settings-profile') return 'Профиль ресторана';
    if (screen === 'settings-categories') {
      if (settingsCatalogTab === 'cabins') {
        if (cabinEditor.mode === 'edit') return 'Редактировать кабинку';
        if (cabinEditor.mode === 'add') return 'Добавить кабинку';
      }
      if (categoryEditor.mode === 'edit') return 'Редактировать категорию';
      if (categoryEditor.mode === 'add') return 'Добавить категорию';
      return 'Параметры и категории';
    }
    if (screen === 'settings-design') return 'Дизайн приложения';
    if (screen === 'settings-stock') return 'Обновить блюда';
    if (screen === 'settings-payments') return 'Платежи';
    if (screen === 'settings-backup') return 'Импорт и экспорт';
    if (screen === 'settings-delete') return 'Удаление каталога';
    return 'Настройки';
  }, [cabinEditor.mode, categoryEditor.mode, screen, settingsCatalogTab]);

  if (catalogSlug !== 'mangal' && isLoading && !data) {
    return (
      <div className="app-shell app-shell--loading" style={applyTheme(themeStore)}>
        <Toaster richColors position="top-center" />
      </div>
    );
  }

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
    persist(replaceCategoriesInSupabase(values), setLocalCategories);
  };

  const deleteCategoryFromSettings = (categoryId: string) => {
    saveCategories(catalog.categories.filter((category) => category.id !== categoryId));
    persist(deleteCategoryFromSupabase(categoryId));
    setCategoryEditor({ mode: 'list' });
  };

  const saveCabins = (values: Cabin[]) => {
    setLocalCabins(values);
    persist(replaceCabinsInSupabase(values));
  };

  const deleteCabinFromSettings = (cabinId: string) => {
    saveCabins(catalog.cabins.filter((cabin) => cabin.id !== cabinId));
    setCabinEditor({ mode: 'list' });
  };

  const saveTags = (values: CatalogTag[]) => {
    setLocalTags(values);
    persist(replaceTagsInSupabase(values), setLocalTags);
  };

  const saveTheme = (patch: Partial<ThemeSettings>) => {
    const next = { ...themeStore, ...patch };
    updateTheme(patch);
    persist(saveThemeToSupabase(next));
  };

  const saveDeliverySettings = (settings: RestaurantDeliverySettings) => {
    setDeliverySettings(settings);
    persist(saveRestaurantDeliverySettings(catalogSlug, settings), () => {
      toast.success('Настройки доставки сохранены');
      refreshDeliverySettings();
    });
  };

  const changeOrderStatus = (order: RestaurantOrder, status: RestaurantOrderStatus, reason = '') => {
    setRestaurantOrders((current) =>
      current.map((item) => (item.id === order.id ? { ...item, status } : item))
    );
    persist(updateRestaurantOrderStatus(order, status, reason), refreshRestaurantOrders);
  };

  const finishOrderFlow = () => {
    setOrderFlow((current) => ({ ...current, step: 'done', categoryId: undefined }));
    setScreen('checkout');
  };

  const continueOrderFlow = () => {
    const currentIndex = flowCategories.findIndex((category) => category.id === orderFlow.categoryId);
    const nextCategory = currentIndex >= 0 ? flowCategories[currentIndex + 1] : undefined;
    if (!nextCategory) {
      finishOrderFlow();
      return;
    }
    setOrderFlow((current) => ({ ...current, step: 'category', categoryId: nextCategory.id }));
  };

  const startOrderFlow = () => {
    if (screen === 'checkout') {
      return;
    }
    const firstCategory = flowCategories[0];
    if (!firstCategory) {
      finishOrderFlow();
      return;
    }
    const selectedByCategory = Object.fromEntries(
      flowCategories.map((category) => [
        category.id,
        items.find((item) => isProductInCategory(item.product, category.id))?.product.id
      ])
    );
    setOrderFlow({ step: 'category', categoryId: firstCategory.id, selectedByCategory });
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

  const clearSubmittedCart = () => {
    clearCart();
    setShowAfterOrderPanel(false);
    setOrderFlow({ step: 'done', selectedByCategory: {} });
  };

  const continueShoppingAfterOrder = () => {
    setShowAfterOrderPanel(false);
    setScreen('home');
  };

  const selectFlowProduct = (product: Product) => {
    const category = activeFlowCategory;
    if (!category || !isProductInCategory(product, category.id)) {
      return;
    }
    setOrderFlow((current) => ({
      ...current,
      selectedByCategory: { ...current.selectedByCategory, [category.id]: product.id }
    }));
  };

  const makeFlowAction = (category?: Category): FlowAction | undefined =>
    category
      ? {
          categoryId: category.id,
          categoryName: category.name,
          selectedId: orderFlow.selectedByCategory[category.id],
          onProductAdd: selectFlowProduct,
          onContinue: continueOrderFlow
        }
      : undefined;

  const resetCatalog = () => {
    setLocalProducts([]);
    setLocalCategories([]);
    setLocalCabins([]);
    setLocalTags([]);
    const emptyRestaurant = { ...demoRestaurant, id: catalogSlug, name: '', subtitle: '', whatsapp: '', instagram_url: '', address: '', mapLink: '' };
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
          if (screen === 'settings-categories' && settingsCatalogTab === 'cabins' && cabinEditor.mode !== 'list') {
            setCabinEditor({ mode: 'list' });
            return;
          }
          if (screen === 'settings-categories' && categoryEditor.mode !== 'list') {
            setCategoryEditor({ mode: 'list' });
            return;
          }
          if (screen === 'settings') {
            setScreen('home');
            return;
          }
          setScreen('settings');
        }}
        onAction={
          screen === 'settings-categories' && settingsCatalogTab === 'cabins' && cabinEditor.mode === 'list'
            ? () => setCabinEditor({ mode: 'add' })
            : screen === 'settings-categories' && settingsCatalogTab === 'cabins' && cabinEditor.mode === 'edit' && cabinEditor.cabinId
              ? () => deleteCabinFromSettings(cabinEditor.cabinId!)
              : screen === 'settings-categories' && settingsCatalogTab === 'categories' && categoryEditor.mode === 'list'
            ? () => setCategoryEditor({ mode: 'add' })
            : screen === 'settings-categories' && settingsCatalogTab === 'categories' && categoryEditor.mode === 'edit' && categoryEditor.categoryId
              ? () => deleteCategoryFromSettings(categoryEditor.categoryId!)
              : undefined
        }
        actionLabel={
          settingsCatalogTab === 'cabins'
            ? cabinEditor.mode === 'edit' ? 'Удалить кабинку' : 'Добавить кабинку'
            : categoryEditor.mode === 'edit' ? 'Удалить категорию' : 'Добавить категорию'
        }
        actionIcon={(settingsCatalogTab === 'cabins' ? cabinEditor.mode : categoryEditor.mode) === 'edit' ? <Trash2 /> : undefined}
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
          products={catalog.products}
          activeTab={settingsCatalogTab}
          onTabChange={(tab) => {
            setSettingsCatalogTab(tab);
            setCategoryEditor({ mode: 'list' });
            setCabinEditor({ mode: 'list' });
          }}
          mode={categoryEditor.mode}
          editingId={categoryEditor.categoryId}
          cabinMode={cabinEditor.mode}
          editingCabinId={cabinEditor.cabinId}
          onCabinModeChange={(mode, cabinId) => setCabinEditor({ mode, cabinId })}
          onModeChange={(mode, categoryId) => setCategoryEditor({ mode, categoryId })}
          onChangeCategories={saveCategories}
          onChangeCabins={saveCabins}
          onChangeTags={saveTags}
        />
      )}
      {screen === 'settings-design' && <DesignSettings theme={themeStore} onChange={saveTheme} />}
      {screen === 'settings-payments' && (
        <PaymentSettingsCard
          slug={catalogSlug}
          settings={paymentSettings}
          onBack={() => setScreen('settings')}
          onSave={(settings) => {
            setPaymentSettings(settings);
            savePaymentSettings(catalogSlug, settings);
            void getCatalogIdBySlug(catalogSlug)
              .then((catalogId) => saveRestaurantPayments(catalogId ?? catalogSlug, catalogSlug, settings))
              .then(() => toast.success('Сохранено'))
              .catch((error) => toast.error(error instanceof Error ? error.message : 'Не удалось сохранить платежи'));
          }}
        />
      )}
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
                background_type: payload.design.backgroundGradientFrom || payload.design.backgroundGradientTo ? 'gradient' : themeStore.background_type,
                background_color: payload.design.backgroundColor ?? (payload.design.theme === 'light' ? '#f7f3ec' : '#070809'),
                background_gradient_from: payload.design.backgroundGradientFrom ?? payload.design.backgroundColor ?? themeStore.background_gradient_from,
                background_gradient_to: payload.design.backgroundGradientTo ?? themeStore.background_gradient_to,
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

  const renderRestaurantAdmin = () => (
    <RestaurantAdminShell
      catalogSlug={catalogSlug}
      restaurant={catalog.restaurant}
      categories={catalog.categories}
      products={catalog.products}
      orders={restaurantOrders}
      routeSection={routeSection}
      routeOrderId={routeOrderId}
      paymentSettings={paymentSettings}
      deliverySettings={deliverySettings}
      onOpenScreen={setScreen}
      onAddDish={() => setAdminEditor('dish')}
      onOrderStatus={changeOrderStatus}
      onOrderDelete={(order) => changeOrderStatus(order, 'cancelled', 'restaurant_deleted')}
      onSaveDeliverySettings={saveDeliverySettings}
    />
  );

  if (routeSection === 'order' && routeOrderId) {
    if (isAdmin) {
      return (
        <div className="app-shell" style={applyTheme(themeStore)}>
          <Toaster richColors position="top-center" />
          {renderRestaurantAdmin()}
        </div>
      );
    }

    return (
      <div className="app-shell" style={applyTheme(themeStore)}>
        <Toaster richColors position="top-center" />
        <TopBar
          title="Статус заказа"
          canBack
          onBack={() => navigate(`/${catalogSlug}`)}
          onPlatformBack={() => navigate('/')}
          onCart={() => navigate(`/${catalogSlug}`)}
          onAdmin={() => setShowLogin(true)}
          logoUrl={catalog.restaurant.logo_url}
          restaurantName={catalog.restaurant.name}
          restaurantSubtitle={catalog.restaurant.subtitle}
        />
        <PublicOrderStatusScreen catalogSlug={catalogSlug} orderId={routeOrderId} />
        <SiteCredit />
      </div>
    );
  }

  return (
    <div
      className={
        screen === 'admin-home'
          ? 'app-shell app-shell--restaurant-admin'
          : screen === 'settings-stock'
          ? 'app-shell app-shell--settings app-shell--stock'
          : screen === 'settings-categories'
            ? 'app-shell app-shell--settings app-shell--category-settings'
            : screen.startsWith('settings')
              ? 'app-shell app-shell--settings'
              : 'app-shell'
      }
      style={{
        ...applyTheme(themeStore),
        ...(screen.startsWith('settings') ? settingsAccentStyle : {})
      }}
    >
      <Toaster richColors position="top-center" />
      {(screen === 'admin-home' || screen.startsWith('settings')) && !isAdmin ? (
        <LoginModal
          catalogSlug={catalogSlug}
          onClose={() => setScreen('home')}
          onSuccess={() => openRestaurantAdminPath(screen === 'settings-payments' ? 'settings-payments' : 'admin-home')}
        />
      ) : screen === 'admin-home' ? (
        renderRestaurantAdmin()
      ) : screen.startsWith('settings') ? (
        renderSettings()
      ) : (
        <>
          <TopBar
            title={screen === 'product' ? undefined : title}
            canBack={screen !== 'home'}
            onBack={() => setScreen('home')}
            onPlatformBack={() => navigate('/')}
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
              flowAction={activeFlowCategory?.kind !== 'drink' ? makeFlowAction(activeFlowCategory) : undefined}
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
              flowAction={activeFlowCategory?.kind === 'drink' ? makeFlowAction(activeFlowCategory) : undefined}
            />
          )}
          {screen === 'product' && selectedProduct && (
            <ProductScreen
              product={selectedProduct}
              products={catalog.products}
              onOpenProduct={(product) => setSelectedProduct(product)}
              flowAction={makeFlowAction(activeFlowCategory)}
            />
          )}
          {screen === 'checkout' && (
            <CheckoutScreen
              catalogSlug={catalogSlug}
              restaurant={catalog.restaurant}
              cabins={catalog.cabins}
              deliverySettings={deliverySettings ?? defaultAdminDeliverySettings}
              paymentSettings={paymentSettings}
              onSubmitOrder={() => {
                setShowAfterOrderPanel(true);
                setOrderFlow({ step: 'done', selectedByCategory: {} });
                setScreen('home');
              }}
            />
          )}
          {showAfterOrderPanel && cartCount > 0 && (
            <CartAfterOrderPanel
              onClear={clearSubmittedCart}
              onContinue={continueShoppingAfterOrder}
            />
          )}
          <SiteCredit />
          <CartBar onCheckout={() => setIsCartOpen(true)} onContinue={continueFromCartBar} />
        </>
      )}

      {!screen.startsWith('settings') && screen !== 'admin-home' && (
        <AdminPanel
          active={undefined}
          onAdd={() => setAdminEditor('dish')}
          onSettings={() => setScreen('admin-home')}
        />
      )}
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
          onSuccess={() => {
            setShowLogin(false);
            openRestaurantAdminPath('admin-home');
          }}
        />
      )}
      {orderFlow.step !== 'done' && activeFlowCategory && screen !== 'catalog' && screen !== 'drinks' && (
        <UpsellReminder
          category={activeFlowCategory}
          products={catalog.products}
          selectedId={orderFlow.selectedByCategory[activeFlowCategory.id]}
          onSelect={selectFlowProduct}
          onConfirm={continueOrderFlow}
          onSkip={continueOrderFlow}
          onDismiss={() => {
            setOrderFlow({ step: 'done', selectedByCategory: {} });
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
  const { slug } = useParams();
  const location = useLocation();
  const pathParts = location.pathname.split('/').filter(Boolean);
  const routeSection = pathParts[1];
  const routeOrderId = routeSection === 'order' ? pathParts[2] : undefined;

  if (!slug) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppContent catalogSlug={slug} routeSection={routeSection} routeOrderId={routeOrderId} />
    </QueryClientProvider>
  );
}
