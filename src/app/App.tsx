import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Beef,
  CakeSlice,
  ChefHat,
  CloudUpload,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Drumstick,
  Fish,
  Flame,
  GlassWater,
  Ham,
  Home,
  IceCreamBowl,
  Instagram,
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
  Share2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  Soup,
  Tags,
  Timer,
  Trash2,
  Truck,
  Utensils,
  UtensilsCrossed,
  User,
  Wheat,
  CreditCard,
  X
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { useCatalogCategoryObserver } from './useCatalogCategoryObserver';
import {
  cabins as demoCabins,
  categories as demoCategories,
  products as demoProducts,
  restaurant as demoRestaurant,
  themeSettings as demoThemeSettings
} from '../data/catalog';
import type { Cabin, CartItem, CatalogTag, Category, Product, Restaurant, SelectedProductModifier, ThemeSettings } from '../entities/models';
import { buildCartLineId, getCartLineId, getMissingRequiredModifierGroup, getSelectedModifierDetails } from '../entities/productModifiers';
import { isPublicMenuCategory } from '../entities/publicCategoryVisibility';
import {
  getCartItemPrice,
  getProductChoiceOptions,
} from '../entities/productVariants';
import {
  formatRublePrice,
  getProductMinimumWeight,
  getProductWeightStep,
  isWeightPricedProduct,
  normalizeSelectedWeight
} from '../entities/productPricing';
import { CheckoutScreen } from '../features/checkout/CheckoutScreen';
import { ProductImageCarousel, ProductTile } from '../features/catalog/ProductTile';
import {
  CategoriesSettings,
  BackupSettings,
  DeleteSettings,
  PaymentSettingsCard,
  ProfileSettings,
  SettingsHeader,
  StockSettings,
  defaultRestaurantDeliverySettings
} from '../features/restaurant-settings';
import {
  applyStockValues,
  defaultTags,
  getCurrentStock,
  getDailyStock,
  getOrderFlowCategories,
  getProductCategoryIds,
  getUpsellReminderTitle,
  isLimitedProduct,
  isProductInCategory,
  loadStockTargets,
  makeLoadingRestaurant,
  playCartSound,
  saveStockTargets,
  type StockTargets
} from '../features/restaurant-settings/catalogAdminModel';
import { RestaurantAdminWorkspace } from '../features/restaurant-admin/RestaurantAdminWorkspace';
import type { RestaurantAdminModuleAccess } from '../features/platform-admin-modules/restaurantModuleAccess';
import {
  darkThemePreset,
  DesignEditor,
  DesignSettingsHome,
  PhotoQualitySettingsScreen,
  ThemeSettingsScreen
} from '../features/design-settings';
import { CatalogLoadingScreen } from '../shared/CatalogLoadingScreen';
import {
  getDishProductRemovalIds,
  mergeDishProductChanges,
  persistDishProductChanges
} from '../features/dish-editor/dishVariantCards';
import { buildProfileLoginPath, navigateBackOrFallback } from '../shared/appNavigation';
import { PublicOrderStatusScreen } from '../features/order/PublicOrderStatusScreen';
import { ClientBrowserPairingBanner } from '../features/client-pairing/ClientPairing';
import {
  getProductCartQuantity,
  isSauceProduct,
  selectCartCount,
  selectCartTotal,
  useAdminStore,
  useAuthStore,
  useCartStore,
  useThemeStore
} from '../features/stores';
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
  savePhotoQualityToSupabase,
  saveThemeToSupabase,
  supabase,
  hasAdminSession,
  onAdminSessionChange,
  updateProductInSupabase
} from '../shared/supabase';
import {
  getCatalogIdBySlug,
  getRestaurantDeliverySettings,
  getRestaurantOrders,
  saveRestaurantDeliverySettings,
  subscribeToRestaurantOrdersRealtime,
  updateRestaurantOrderStatus,
  type RestaurantDeliverySettings,
  type RestaurantOrder,
  type RestaurantOrderStatus
} from '../shared/api/restaurantOrdersApi';
import { getRestaurantPaymentsBySlug, saveRestaurantPayments } from '../shared/api/restaurantPaymentsApi';
import { getRestaurantAdminModuleAccessBySlug } from '../shared/api/restaurantModulesApi';
import { BrandLogo } from '../shared/BrandLogo';
import { SafeImage } from '../shared/SafeImage';
import {
  loadPaymentSettings,
  savePaymentSettings,
  type RestaurantPaymentSettings
} from '../shared/paymentSettings';
import {
  appIsRunningStandalone,
  rememberPwaResumePath,
} from '../shared/pwaSession';
import {
  DEFAULT_PHOTO_QUALITY_SETTINGS,
  getPhotoQualityFilter,
  type PhotoQualitySettings
} from '../shared/photoQuality';
import { getBusinessTerms } from '../shared/businessTerminology';
import { getRestaurantCatalogBackTarget } from '../shared/roleSessionSafety';
import { getGroceryCatalogFallback } from '../shared/groceryCatalogFallback';
import { summarizeRestaurantReviews } from '../features/client-platform/clientPlatformLogic';
import type { ClientRestaurantReview } from '../features/client-platform/types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always'
    }
  }
});

type CatalogSnapshot = Awaited<ReturnType<typeof loadCatalog>>;
type CatalogCacheEntry = { savedAt: number; data: CatalogSnapshot };
const CATALOG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CATALOG_CACHE_MAX_BYTES = 1_800_000;
const catalogCacheKey = (slug: string) => `waycatalog:catalog-cache:v2:${slug}`;
const deliverySettingsCacheKey = (slug: string) => `waycatalog:delivery-settings-cache:${slug}`;

const readCatalogCache = (slug: string): CatalogCacheEntry | undefined => {
  try {
    const raw = window.localStorage.getItem(catalogCacheKey(slug));
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as CatalogCacheEntry;
    if (
      !cached?.data?.restaurant ||
      !Array.isArray(cached.data.categories) ||
      !Array.isArray(cached.data.products) ||
      Date.now() - cached.savedAt > CATALOG_CACHE_TTL_MS
    ) {
      window.localStorage.removeItem(catalogCacheKey(slug));
      return undefined;
    }
    return cached;
  } catch {
    return undefined;
  }
};

const writeCatalogCache = (slug: string, data: CatalogSnapshot) => {
  try {
    const serialized = JSON.stringify({ savedAt: Date.now(), data } satisfies CatalogCacheEntry);
    if (serialized.length > CATALOG_CACHE_MAX_BYTES) return;
    window.localStorage.setItem(catalogCacheKey(slug), serialized);
  } catch {
    // The live catalog remains usable when storage is full or unavailable.
  }
};

const readDeliverySettingsCache = (slug: string): RestaurantDeliverySettings | null => {
  try {
    const raw = window.localStorage.getItem(deliverySettingsCacheKey(slug));
    if (!raw) return null;
    const cached = JSON.parse(raw) as { savedAt: number; data: RestaurantDeliverySettings };
    if (!cached?.data || Date.now() - cached.savedAt > CATALOG_CACHE_TTL_MS) {
      window.localStorage.removeItem(deliverySettingsCacheKey(slug));
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
};

const writeDeliverySettingsCache = (slug: string, data: RestaurantDeliverySettings) => {
  try {
    window.localStorage.setItem(
      deliverySettingsCacheKey(slug),
      JSON.stringify({ savedAt: Date.now(), data })
    );
  } catch {
    // Delivery settings still remain available for the current session.
  }
};

const CATALOG_REQUEST_TIMEOUT_MS = 8_000;
const loadCatalogWithTimeout = (slug: string) =>
  new Promise<Awaited<ReturnType<typeof loadCatalog>>>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error('Каталог загружается слишком долго')),
      CATALOG_REQUEST_TIMEOUT_MS
    );
    void loadCatalog(slug).then(
      (catalog) => {
        window.clearTimeout(timeoutId);
        resolve(catalog);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const formatReviewCount = (count: number) => {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${count} отзывов`;
  if (lastDigit === 1) return `${count} отзыв`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} отзыва`;
  return `${count} отзывов`;
};

const loadCatalogReviews = async (catalogSlug: string): Promise<ClientRestaurantReview[]> => {
  if (!supabase) return [];
  const catalogId = await getCatalogIdBySlug(catalogSlug);
  if (!catalogId) return [];

  const { data, error } = await supabase
    .from('client_reviews')
    .select('id, restaurant_id, client_name, rating, comment, created_at')
    .eq('restaurant_id', catalogId)
    .eq('target_type', 'restaurant')
    .eq('is_visible', true)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((review) => ({
    id: String(review.id),
    restaurantId: String(review.restaurant_id),
    clientName: String(review.client_name ?? ''),
    rating: Number(review.rating),
    comment: String(review.comment ?? ''),
    createdAt: String(review.created_at)
  }));
};
type SettingsScreen =
  | 'settings'
  | 'settings-profile'
  | 'settings-categories'
  | 'settings-design'
  | 'settings-theme'
  | 'settings-photo-quality'
  | 'settings-stock'
  | 'settings-payments'
  | 'settings-backup'
  | 'settings-delete';
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
const errorMessageFor = (error: unknown) => {
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown };
    return [value.message, value.details, value.hint].filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(' ');
  }
  return error instanceof Error ? error.message : '';
};

const isPlatformRestaurantRlsError = (message: string) =>
  /row-level security/i.test(message) && /table ["']?restaurants["']?/i.test(message);

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

function TopBar({
  title,
  canBack,
  onBack,
  onPlatformBack,
  onSearch,
  onShare,
  onCart,
  onAdmin,
  logoUrl,
  restaurantName,
  restaurantSubtitle,
  showBrand = true,
  showCart = true
}: {
  title?: string;
  canBack?: boolean;
  onBack: () => void;
  onPlatformBack?: () => void;
  onSearch?: () => void;
  onShare?: () => void;
  onCart: () => void;
  onAdmin?: () => void;
  logoUrl?: string;
  restaurantName?: string;
  restaurantSubtitle?: string;
  showBrand?: boolean;
  showCart?: boolean;
}) {
  const items = useCartStore((state) => state.items);
  const count = selectCartCount(items);
  const hasBackAction = Boolean(canBack || onPlatformBack);

  return (
    <header className={!title && !showBrand ? 'top-bar top-bar--minimal' : 'top-bar'}>
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
      ) : showBrand ? (
        <BrandLogo logoUrl={logoUrl} name={restaurantName} subtitle={restaurantSubtitle} />
      ) : (
        <span className="top-bar__spacer" aria-hidden="true" />
      )}
      <div className="top-bar__actions">
        {onSearch && (
          <button className="icon-button top-bar__button" type="button" onClick={onSearch} aria-label="Поиск">
            <Search />
          </button>
        )}
        {showCart && (
          <button className="icon-button top-bar__button cart-icon" type="button" onClick={onCart} aria-label="Корзина">
            <ShoppingCart />
            {count > 0 && <span>{count}</span>}
          </button>
        )}
        {onShare && (
          <button className="icon-button top-bar__button" type="button" onClick={onShare} aria-label="Поделиться">
            <Share2 />
          </button>
        )}
      </div>
    </header>
  );
}

function SiteCredit() {
  return (
    <footer className="site-credit">
      <span>Сайт создан в WayYaam</span>
      <small>© {new Date().getFullYear()} WayYaam. Все права защищены.</small>
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

function CartBar({
  deliverySettings,
  onCheckout,
  onContinue
}: {
  deliverySettings?: RestaurantDeliverySettings | null;
  onCheckout: () => void;
  onContinue: () => void;
}) {
  const items = useCartStore((state) => state.items);
  const count = selectCartCount(items);
  const total = selectCartTotal(items);
  const freeDeliveryFrom = Math.max(0, deliverySettings?.free_delivery_from ?? 0);
  const remainingForFreeDelivery = Math.max(0, freeDeliveryFrom - total);
  const deliveryProgress = freeDeliveryFrom > 0 ? Math.min(100, (total / freeDeliveryFrom) * 100) : 0;
  const itemWord = count % 10 === 1 && count % 100 !== 11 ? 'товар' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'товара' : 'товаров';

  if (count === 0) {
    return null;
  }

  return (
    <div className="cart-dock">
      {freeDeliveryFrom > 0 && (
        <div className="free-delivery-progress">
          <Truck />
          <div>
            <strong>
              {remainingForFreeDelivery > 0
                ? `До бесплатной доставки осталось ${formatPrice(remainingForFreeDelivery)}`
                : 'Бесплатная доставка доступна'}
            </strong>
            <span><i style={{ width: `${deliveryProgress}%` }} /></span>
          </div>
        </div>
      )}
      <div className="cart-bar" data-cart-animation-target>
        <span className="cart-bar__icon">
          <ShoppingCart />
          <b>{count}</b>
        </span>
        <button className="cart-bar__details" type="button" onClick={onCheckout}>
          <strong><span>В корзине</span><span>{count} {itemWord}</span></strong>
          <small>{items.map((item) => item.product.title).join(', ')}</small>
        </button>
        <b>{formatPrice(total)}</b>
        <button className="cart-bar__go" type="button" onClick={onContinue} aria-label="Продолжить">
          <ArrowRight />
        </button>
      </div>
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
              {items.map((item) => {
                const lineId = getCartLineId(item);
                const modifierLabel = getSelectedModifierDetails(item).map(({ group, option }) => `${group.name}: ${option.name}`).join(' · ');
                return (
                <article className="cart-item-card" key={lineId}>
                  <SafeImage src={item.product.image_url} alt={item.product.title} fallbackKind={item.product.placeholder_kind} width={320} height={240} loading="lazy" />
                  <div className="cart-item-card__content">
                    <div className="cart-item-card__top">
                      <div>
                        <h3>{item.product.title}</h3>
                        {item.selected_choice && <small className="cart-item-card__choice">{item.selected_choice}</small>}
                        {modifierLabel && <small className="cart-item-card__choice">{modifierLabel}</small>}
                        {item.selected_weight !== undefined && <small className="cart-item-card__choice">Вес: {item.selected_weight.toLocaleString('ru-RU')} кг</small>}
                        {item.inscription && <small className="cart-item-card__choice">Надпись: «{item.inscription}»</small>}
                        {item.decoration_comment && <small className="cart-item-card__choice">Оформление: {item.decoration_comment}</small>}
                        {item.production_date && <small className="cart-item-card__choice">Дата: {item.production_date}</small>}
                        {item.production_time && <small className="cart-item-card__choice">Время: {item.production_time}</small>}
                        <p>{item.product.description}</p>
                      </div>
                      <button className="cart-item-card__remove" type="button" onClick={() => remove(lineId)} aria-label={`Удалить ${item.product.title}`}>
                        <Trash2 />
                      </button>
                    </div>
                    <div className="cart-item-card__bottom">
                      <strong>{formatPrice(getCartItemPrice(item))}</strong>
                      <div className="cart-quantity" aria-label={`Количество ${item.product.title}`}>
                        <button
                          type="button"
                          onClick={() => {
                            decrement(lineId);
                            playCartSound('remove');
                          }}
                          aria-label="Уменьшить"
                        >
                          <Minus />
                        </button>
                        <span>{item.quantity}</span>
                        <button type="button" onClick={() => add(item.product, item.selected_choice, item.selected_modifiers, {
                          selectedWeight: item.selected_weight,
                          inscription: item.inscription,
                          decorationComment: item.decoration_comment,
                          productionDate: item.production_date,
                          productionTime: item.production_time
                        })} aria-label="Увеличить">
                          <Plus />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );})}
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

// Kept as the legacy home composition for existing template previews and admin design work.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const [active, setActive] = useState('all');
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const visibleProducts = isAdmin ? products : products.filter((product) => !product.is_hidden);
  const featuredCategories = categories.filter((category) => category.showOnHome !== false && isPublicMenuCategory(category));
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
        categories={categories.filter(isPublicMenuCategory).slice(0, 5)}
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

function RestaurantCoverCarousel({ restaurant }: { restaurant: Restaurant }) {
  const images = Array.from(
    new Set([...(restaurant.banner_urls ?? []), restaurant.banner_url].map((value) => value?.trim()).filter(Boolean))
  ).slice(0, 3) as string[];
  const imagesKey = images.join('|');
  const [activeIndex, setActiveIndex] = useState(0);
  const [interactionVersion, setInteractionVersion] = useState(0);
  const pointerStartX = useRef<number | null>(null);
  const autoDirection = useRef<1 | -1>(1);

  useEffect(() => {
    setActiveIndex(0);
    autoDirection.current = 1;
  }, [restaurant.id, imagesKey]);

  useEffect(() => {
    if (images.length < 2) return undefined;
    const timeoutId = window.setTimeout(() => {
      setActiveIndex((current) => {
        if (current >= images.length - 1) autoDirection.current = -1;
        if (current <= 0) autoDirection.current = 1;
        return current + autoDirection.current;
      });
    }, 4_500);
    return () => window.clearTimeout(timeoutId);
  }, [activeIndex, images.length, interactionVersion]);

  const restartAutoPlay = () => setInteractionVersion((value) => value + 1);
  const finishSwipe = (clientX: number) => {
    const startX = pointerStartX.current;
    pointerStartX.current = null;
    restartAutoPlay();
    if (startX === null || Math.abs(clientX - startX) < 28 || images.length < 2) return;
    const direction = clientX < startX ? 1 : -1;
    autoDirection.current = direction;
    setActiveIndex((current) => Math.max(0, Math.min(images.length - 1, current + direction)));
  };

  return (
    <section
      className="restaurant-menu-hero"
      aria-label={`Обложки ресторана ${restaurant.name}`}
      onPointerDown={(event) => {
        pointerStartX.current = event.clientX;
        restartAutoPlay();
      }}
      onPointerUp={(event) => finishSwipe(event.clientX)}
      onPointerCancel={() => {
        pointerStartX.current = null;
        restartAutoPlay();
      }}
    >
      {images.length > 0 ? (
        <div
          className="restaurant-menu-hero__track"
          style={{ '--cover-index': activeIndex } as CSSProperties}
        >
          {images.map((image, index) => (
              <SafeImage
                className={index === activeIndex ? 'is-active' : ''}
                src={image}
                alt={`Обложка ${index + 1}`}
                key={`${image}-${index}`}
                draggable={false}
                width={1440}
                height={1080}
                loading={index === 0 ? 'eager' : 'lazy'}
              />
          ))}
        </div>
      ) : (
        <SafeImage src="" alt="Обложка ресторана" width={1440} height={1080} />
      )}
      {images.length > 1 && (
        <div className="restaurant-menu-hero__dots" aria-label={`Обложка ${activeIndex + 1} из ${images.length}`}>
          {images.map((image, index) => (
            <button
              className={index === activeIndex ? 'is-active' : ''}
              type="button"
              key={`${image}-dot`}
              onClick={() => {
                setActiveIndex(index);
                restartAutoPlay();
              }}
              aria-label={`Показать обложку ${index + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function CatalogScreen({
  restaurant,
  categories,
  products,
  deliverySettings,
  initialCategory,
  onCart,
  onShare,
  onBack,
  onOpenProduct,
  onEditProduct,
  onDeleteProduct,
  onToggleProduct,
  onStockChange,
  reviewRating,
  reviewCount,
  onReviews,
  flowAction
}: {
  restaurant?: Restaurant;
  categories: Category[];
  products: Product[];
  deliverySettings?: RestaurantDeliverySettings | null;
  initialCategory: string;
  onCart: () => void;
  onShare: () => void;
  onBack: () => void;
  onOpenProduct: (product: Product) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onToggleProduct: (productId: string, key: ProductFlag) => void;
  onStockChange: (productId: string, stockCount: number) => void;
  reviewRating: number;
  reviewCount: number;
  onReviews: () => void;
  flowAction?: FlowAction;
}) {
  const terms = getBusinessTerms(restaurant?.business_type);
  const [active, setActive] = useState(initialCategory);
  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNavStuck, setIsNavStuck] = useState(false);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const cartItems = useCartStore((state) => state.items);
  const cartCount = selectCartCount(cartItems);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const pillRefs = useRef(new Map<string, HTMLButtonElement>());
  const categoryRailRef = useRef<HTMLDivElement | null>(null);
  const navSentinelRef = useRef<HTMLSpanElement | null>(null);
  const initialScrollDoneRef = useRef(false);
  const visibleProducts = isAdmin ? products : products.filter((product) => !product.is_hidden);
  const normalizedQuery = query.trim().toLocaleLowerCase('ru');
  const queryMatches = useCallback(
    (product: Product) =>
      !normalizedQuery ||
      [product.title, product.description, product.ingredients]
        .join(' ')
        .toLocaleLowerCase('ru')
        .includes(normalizedQuery),
    [normalizedQuery]
  );
  const hits = visibleProducts.filter((product) => (product.is_hit || product.is_popular) && queryMatches(product));
  const sauces = visibleProducts.filter((product) => isSauceProduct(product) && queryMatches(product));
  const realSections = categories
    .filter(isPublicMenuCategory)
    .map((category) => ({
      id: category.id,
      title: category.name,
      image: category.image,
      products: visibleProducts.filter(
        (product) => getProductCategoryIds(product).includes(category.id) && queryMatches(product)
      )
    }))
    .filter((section) => section.products.length > 0);
  const sections = [
    ...(hits.length > 0 ? [{ id: 'hits', title: 'Хиты 🔥', products: hits }] : []),
    ...(sauces.length > 0 ? [{ id: 'sauces', title: 'Соусы', products: sauces }] : []),
    ...realSections
  ];
  const isFlowCategory = Boolean(flowAction?.categoryId && realSections.some((section) => section.id === flowAction.categoryId));
  const preparationLabel = deliverySettings?.default_preparation_minutes
    ? `${Math.max(10, deliverySettings.default_preparation_minutes)}-${Math.min(60, Math.max(10, deliverySettings.default_preparation_minutes) + 20)} мин`
    : '';
  const freeDeliveryLabel = deliverySettings?.free_delivery_from
    ? `Бесплатно от ${Math.round(deliverySettings.free_delivery_from).toLocaleString('ru-RU').replace(/\s/g, '')}₽`
    : '';

  useEffect(() => {
    setActive(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    if (initialScrollDoneRef.current || initialCategory === 'all') return undefined;
    const frame = window.requestAnimationFrame(() => {
      sectionRefs.current.get(initialCategory)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      initialScrollDoneRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialCategory, sections.length]);

  const lockCategoryUntilVisible = useCatalogCategoryObserver(
    sectionRefs, normalizedQuery, sections.length, setActive
  );

  useEffect(() => {
    const pill = pillRefs.current.get(active);
    const rail = categoryRailRef.current;
    if (!pill || !rail) return undefined;

    const frame = window.requestAnimationFrame(() => {
      const railRect = rail.getBoundingClientRect();
      const pillRect = pill.getBoundingClientRect();
      const centeredLeft = rail.scrollLeft
        + pillRect.left
        - railRect.left
        - (rail.clientWidth - pillRect.width) / 2;
      const maxLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);

      rail.scrollTo({
        left: Math.min(maxLeft, Math.max(0, centeredLeft)),
        behavior: 'smooth'
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    const sentinel = navSentinelRef.current;
    if (!sentinel) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setIsNavStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    const target = sectionRefs.current.get(id);
    lockCategoryUntilVisible(id, target);
    setActive(id);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main className="screen catalog-screen">
      {restaurant && (
        <>
          <RestaurantCoverCarousel restaurant={restaurant} />
          <div className="restaurant-menu-overview">
            <section className="restaurant-menu-identity">
              {restaurant.logo_url
                ? <SafeImage src={restaurant.logo_url} alt={`Логотип ${restaurant.name}`} />
                : <span className="restaurant-menu-identity__logo" aria-hidden="true"><Store /></span>}
              <div>
                <h1>{restaurant.name}</h1>
                {restaurant.subtitle && <p>{restaurant.subtitle}</p>}
              </div>
            </section>
            {(preparationLabel || freeDeliveryLabel) && (
              <section className="restaurant-menu-highlights" aria-label={`Информация о заведении: ${terms.place}`}>
                <button type="button" onClick={onReviews} aria-label={`Открыть отзывы: ${reviewRating.toFixed(1)}, ${formatReviewCount(reviewCount)}`}>
                  <Star /> <strong>{reviewRating.toFixed(1)}</strong>
                </button>
                {preparationLabel && <span title={`Готовка ${preparationLabel}`}><Timer /> <strong>{preparationLabel}</strong></span>}
                {freeDeliveryLabel && <span title={`Бесплатная доставка ${freeDeliveryLabel}`}><Truck /> <strong>{freeDeliveryLabel}</strong></span>}
              </section>
            )}
          </div>
          {restaurant.catalog_notice && (
            <aside className="catalog-notice"><CakeSlice /> <span>{restaurant.catalog_notice}</span></aside>
          )}
        </>
      )}
      <span className="catalog-nav-sentinel" ref={navSentinelRef} aria-hidden="true" />
      <div className={isNavStuck ? 'catalog-nav is-stuck' : 'catalog-nav'}>
        <div className="catalog-nav__toolbar">
          <button className="icon-button" type="button" onClick={onBack} aria-label="Назад">
            <ArrowLeft />
          </button>
          <div className="catalog-nav__actions">
            <button
              className={isSearchOpen ? 'icon-button is-active' : 'icon-button'}
              type="button"
              onClick={() => setIsSearchOpen((value) => !value)}
              aria-label={isSearchOpen ? 'Закрыть поиск' : 'Поиск'}
            >
              {isSearchOpen ? <X /> : <Search />}
            </button>
            <button className="icon-button cart-icon" type="button" onClick={onCart} aria-label="Корзина">
              <ShoppingCart />
              {cartCount > 0 && <span>{cartCount}</span>}
            </button>
            <button className="icon-button" type="button" onClick={onShare} aria-label="Поделиться">
              <Share2 />
            </button>
          </div>
        </div>
        <div className="catalog-nav__rail pills" ref={categoryRailRef}>
          {[
            { id: 'all', title: 'Все' },
            ...sections.map((section) => ({ id: section.id, title: section.id === 'hits' ? 'Хиты 🔥' : section.title }))
          ].map((item) => (
            <button
              ref={(node) => {
                if (node) pillRefs.current.set(item.id, node);
                else pillRefs.current.delete(item.id);
              }}
              key={item.id}
              className={active === item.id ? 'pill is-active' : 'pill'}
              type="button"
              onClick={() => scrollToSection(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
      </div>
      {isSearchOpen && (
        <label className="search-field catalog-search">
          <Search />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Найти ${terms.itemLower} во всём меню`}
          />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск"><X /></button>}
        </label>
      )}
      <span
        className="catalog-start-marker"
        data-catalog-section="all"
        ref={(node) => {
          if (node) sectionRefs.current.set('all', node);
          else sectionRefs.current.delete('all');
        }}
      />
      {!normalizedQuery && realSections.length > 0 && (
        <section className="catalog-category-showcase" aria-label="Категории меню">
          {realSections.map((section) => (
            <button
              className="catalog-category-showcase__card"
              type="button"
              key={`showcase-${section.id}`}
              onClick={() => scrollToSection(section.id)}
            >
              <SafeImage src={section.image} alt={section.title} />
              <span className="catalog-category-showcase__shade" />
              <strong>{section.title}</strong>
              <ArrowRight />
            </button>
          ))}
        </section>
      )}
      <div className="catalog-sections">
        {sections.map((section) => (
          <section
            className="catalog-section"
            data-catalog-section={section.id}
            id={`catalog-section-${section.id}`}
            key={section.id}
            ref={(node) => {
              if (node) sectionRefs.current.set(section.id, node);
              else sectionRefs.current.delete(section.id);
            }}
          >
            <h2>{section.title}</h2>
            <div className="catalog-grid">
              {section.products.map((product) => (
                <ProductTile
                  key={`${section.id}-${product.id}`}
                  product={product}
                  variant="large"
                  onOpen={onOpenProduct}
                  onEdit={onEditProduct}
                  onDelete={onDeleteProduct}
                  onToggle={onToggleProduct}
                  onStockChange={onStockChange}
                  onAdd={flowAction?.categoryId === section.id ? flowAction.onProductAdd : undefined}
                />
              ))}
            </div>
          </section>
        ))}
        {sections.length === 0 && <p className="catalog-empty">По вашему запросу ничего не найдено.</p>}
      </div>
      {isFlowCategory && flowAction?.selectedId && (
        <button className="flow-continue-bar" type="button" onClick={flowAction.onContinue}>
          Продолжить <ArrowRight />
        </button>
      )}
    </main>
  );
}

function CatalogReviewsScreen({
  restaurant,
  reviews
}: {
  restaurant: Restaurant;
  reviews: ClientRestaurantReview[];
}) {
  const summary = summarizeRestaurantReviews(reviews);

  return (
    <main className="screen catalog-reviews-screen">
      <section className="catalog-review-summary">
        <Star />
        <strong>{summary.rating.toFixed(1)}</strong>
        <span>{formatReviewCount(summary.reviewCount)}</span>
      </section>
      {reviews.length === 0 ? (
        <section className="catalog-reviews-empty">
          <MessageCircle />
          <strong>Отзывов пока нет</strong>
          <p>Первый отзыв можно оставить в разделе «Мои заказы» после оформления заказа.</p>
        </section>
      ) : (
        <section className="catalog-review-list" aria-label={`Отзывы о ${restaurant.name}`}>
          {reviews.map((review) => (
            <article className="catalog-review-card" key={review.id}>
              <header>
                <strong>{review.clientName || 'Клиент WayYaam'}</strong>
                <span><Star /> {review.rating.toFixed(1)}</span>
              </header>
              <p>{review.comment}</p>
              <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString('ru-RU')}</time>
            </article>
          ))}
        </section>
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
  businessType,
  onOpenProduct,
  flowAction
}: {
  product: Product;
  products: Product[];
  businessType: Restaurant['business_type'];
  onOpenProduct: (product: Product) => void;
  flowAction?: FlowAction;
}) {
  const add = useCartStore((state) => state.add);
  const decrement = useCartStore((state) => state.decrement);
  const items = useCartStore((state) => state.items);
  const choiceOptions = getProductChoiceOptions(product);
  const existingConfiguration = items.find((item) => item.product.id === product.id);
  const cartChoice = existingConfiguration?.selected_choice;
  const [selectedChoice, setSelectedChoice] = useState(cartChoice ?? choiceOptions[0]?.name ?? '');
  const [selectedModifiers, setSelectedModifiers] = useState<SelectedProductModifier[]>(() =>
    (product.modifier_groups ?? []).filter((group) => group.isActive !== false).flatMap((group) => group.options
      .filter((option) => option.isDefault && option.isActive !== false)
      .slice(0, group.maxSelected)
      .map((option) => ({ groupId: group.id, optionId: option.id })))
  );
  const [selectedWeight, setSelectedWeight] = useState(() => normalizeSelectedWeight(product, existingConfiguration?.selected_weight));
  const weightMinimum = getProductMinimumWeight(product);
  const weightStep = getProductWeightStep(product);
  const weightMaximum = product.sale_unit === 'weight' && !product.is_unlimited && Number.isFinite(product.stock_quantity)
    ? Math.max(weightMinimum, (product.stock_quantity ?? 0) / 1000)
    : Number.POSITIVE_INFINITY;
  const weightLabel = businessType === 'confectionery' ? 'Вес торта' : 'Вес товара';
  const formattedSelectedWeight = selectedWeight < 1
    ? `${Math.round(selectedWeight * 1000)} г`
    : `${selectedWeight.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} кг`;
  const [inscription, setInscription] = useState(existingConfiguration?.inscription ?? '');
  const [decorationComment, setDecorationComment] = useState(existingConfiguration?.decoration_comment ?? '');
  const [productionDate, setProductionDate] = useState(existingConfiguration?.production_date ?? '');
  const [productionTime, setProductionTime] = useState(existingConfiguration?.production_time ?? '');
  const minProductionDate = useMemo(() => {
    const date = new Date(Date.now() + Math.max(0, product.advance_order_hours ?? 0) * 60 * 60 * 1000);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }, [product.advance_order_hours]);
  const configuration = {
    selectedWeight: isWeightPricedProduct(product) ? selectedWeight : undefined,
    inscription: product.allow_inscription ? inscription : undefined,
    decorationComment: product.allow_decoration_comment ? decorationComment : undefined,
    productionDate: product.allow_production_schedule ? productionDate : undefined,
    productionTime: product.allow_production_schedule ? productionTime : undefined
  };
  const configuredItem: CartItem = {
    product,
    quantity: 1,
    selected_choice: selectedChoice || undefined,
    selected_modifiers: selectedModifiers,
    selected_weight: configuration.selectedWeight,
    inscription: configuration.inscription,
    decoration_comment: configuration.decorationComment,
    production_date: configuration.productionDate,
    production_time: configuration.productionTime
  };
  const selectedPrice = getCartItemPrice(configuredItem);
  const selectedLineId = buildCartLineId(product.id, selectedChoice || undefined, selectedModifiers, configuration);
  const quantity = items.find((item) => getCartLineId(item) === selectedLineId)?.quantity ?? 0;
  const pairs = product.pair_ids.map((id) => products.find((item) => item.id === id)).filter((item): item is Product => Boolean(item));
  const isFlowProduct = Boolean(flowAction && isProductInCategory(product, flowAction.categoryId));
  const hasFactValue = (value: string) => {
    const normalized = value.trim().toLocaleLowerCase('ru');
    return Boolean(normalized) && !/^0(?:[.,]0+)?(?:\s*[а-яa-z.]+)?$/i.test(normalized);
  };
  const hasIngredients = hasFactValue(product.ingredients);
  const hasWeight = hasFactValue(product.weight) && !['весовой', 'на вес'].includes(product.weight.trim().toLocaleLowerCase('ru'));
  const hasServing = hasFactValue(product.serving);
  const hasAllergens = (product.allergens ?? []).length > 0;

  const addProduct = () => {
    const missingModifierGroup = getMissingRequiredModifierGroup(product.modifier_groups, selectedModifiers);
    if (missingModifierGroup) {
      toast.error(`Выберите: ${missingModifierGroup.name}`);
      return;
    }
    if (product.allow_production_schedule && (!productionDate || !productionTime)) {
      toast.error('Выберите дату и время изготовления');
      return;
    }
    if (product.allow_production_schedule && productionDate < minProductionDate) {
      toast.error(`Заказ возможен не раньше ${minProductionDate}`);
      return;
    }
    add(product, selectedChoice || undefined, selectedModifiers, configuration);
    if (isFlowProduct) {
      flowAction?.onProductAdd(product);
    }
  };

  return (
    <main className="screen product-screen">
      <ProductImageCarousel product={product} hero />
      <div className="product-heading">
        <div>
          <h2>{product.title}</h2>
          <strong>{formatRublePrice(selectedPrice)}</strong>
        </div>
        {product.is_hit && (
          <span className="hit-badge">
            <Flame /> Хит
          </span>
        )}
      </div>
      <p className="product-description">{product.description}</p>

      {(hasIngredients || hasWeight || hasServing) && <dl className="facts">
        {hasIngredients && <div>
          <dt>Состав</dt>
          <dd>{product.ingredients}</dd>
        </div>}
        {hasWeight && <div>
          <dt>Вес</dt>
          <dd>{product.weight}</dd>
        </div>}
        {hasServing && <div>
          <dt>Срок</dt>
          <dd>{product.serving}</dd>
        </div>}
        {hasAllergens && <div>
          <dt>Аллергены</dt>
          <dd>{product.allergens?.join(', ')}</dd>
        </div>}
      </dl>}

      {isWeightPricedProduct(product) && (
        <fieldset className="product-choice-group product-customization">
          <legend>{weightLabel} *</legend>
          <div className="product-weight-stepper" role="group" aria-label={weightLabel}>
            <button
              type="button"
              aria-label={`Уменьшить ${weightLabel.toLocaleLowerCase('ru')}`}
              disabled={selectedWeight <= weightMinimum}
              onClick={() => setSelectedWeight(normalizeSelectedWeight(product, selectedWeight - weightStep))}
            >
              <Minus />
            </button>
            <output aria-live="polite">
              <strong>{formattedSelectedWeight}</strong>
              <small>{formatRublePrice(product.price * selectedWeight)}</small>
            </output>
            <button
              type="button"
              aria-label={`Увеличить ${weightLabel.toLocaleLowerCase('ru')}`}
              disabled={selectedWeight + weightStep > weightMaximum}
              onClick={() => setSelectedWeight(normalizeSelectedWeight(product, selectedWeight + weightStep))}
            >
              <Plus />
            </button>
          </div>
        </fieldset>
      )}

      {choiceOptions.length > 0 && (
        <fieldset className="product-choice-group">
          <legend>Выберите вариант</legend>
          {choiceOptions.map((option) => (
            <label key={option.name}>
              <input
                type="radio"
                name={`product-choice-${product.id}`}
                value={option.name}
                checked={selectedChoice === option.name}
                onChange={() => setSelectedChoice(option.name)}
              />
              <span aria-hidden="true" />
              <strong>{option.name}</strong>
              <small>{formatPrice(option.price)}</small>
            </label>
          ))}
        </fieldset>
      )}

      {(product.modifier_groups ?? []).filter((group) => group.isActive !== false).map((group) => (
        <fieldset className="product-choice-group" key={group.id}>
          <legend>{group.name}{group.required ? ' *' : ''}</legend>
          {group.options.filter((option) => option.isActive !== false).map((option) => {
            const checked = selectedModifiers.some((value) => value.groupId === group.id && value.optionId === option.id);
            return (
              <label key={option.id}>
                <input
                  type={group.maxSelected > 1 ? 'checkbox' : 'radio'}
                  name={`product-modifier-${product.id}-${group.id}`}
                  checked={checked}
                  onChange={() => setSelectedModifiers((current) => {
                    const withoutGroup = current.filter((value) => value.groupId !== group.id);
                    if (group.maxSelected === 1) return [...withoutGroup, { groupId: group.id, optionId: option.id }];
                    if (checked) return current.filter((value) => !(value.groupId === group.id && value.optionId === option.id));
                    const inGroup = current.filter((value) => value.groupId === group.id);
                    return inGroup.length >= group.maxSelected ? current : [...current, { groupId: group.id, optionId: option.id }];
                  })}
                />
                <span aria-hidden="true" />
                <strong>{option.name}</strong>
                <small>{option.priceDelta > 0 ? `+${formatPrice(option.priceDelta)}` : 'Без доплаты'}</small>
              </label>
            );
          })}
        </fieldset>
      ))}

      {(product.allow_inscription || product.allow_decoration_comment || product.allow_production_schedule) && (
        <section className="product-custom-fields" aria-label="Параметры заказного торта">
          {product.advance_order_hours && (
            <p className="product-advance-notice"><Timer /> Оформление минимум за {product.advance_order_hours} часа</p>
          )}
          {product.allow_inscription && (
            <label>
              Надпись на торте
              <input
                maxLength={80}
                value={inscription}
                onChange={(event) => setInscription(event.target.value.slice(0, 80))}
                placeholder="Например: С днём рождения, Амина"
              />
              <small>{inscription.length}/80</small>
            </label>
          )}
          {product.allow_decoration_comment && (
            <label>
              Комментарий к оформлению
              <textarea
                maxLength={300}
                value={decorationComment}
                onChange={(event) => setDecorationComment(event.target.value.slice(0, 300))}
                placeholder="Цвета, пожелания и важные детали"
              />
            </label>
          )}
          {product.allow_production_schedule && (
            <div className="product-schedule-fields">
              <label>
                Дата изготовления *
                <input type="date" min={minProductionDate} value={productionDate} onChange={(event) => setProductionDate(event.target.value)} />
              </label>
              <label>
                Желаемое время *
                <input type="time" value={productionTime} onChange={(event) => setProductionTime(event.target.value)} />
              </label>
            </div>
          )}
        </section>
      )}

      <div className="quantity">
        <button
          type="button"
          onClick={() => {
            decrement(selectedLineId);
            playCartSound('remove');
          }}
          aria-label="Уменьшить"
        >
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
        {isLimitedProduct(product) && getCurrentStock(product) <= 0 ? 'Закончилось' : `Добавить в корзину — ${formatRublePrice(selectedPrice)}`}
      </button>
      {isFlowProduct && flowAction?.selectedId && (
        <button className="flow-continue-bar flow-continue-bar--inline" type="button" onClick={flowAction.onContinue}>
          Продолжить <ArrowRight />
        </button>
      )}
    </main>
  );
}

const isSauceCategory = (category: Category) => Boolean(
  [category.id, category.slug, category.name]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ru-RU')
    .match(/соус|sauce/)
);

function UpsellReminder({
  category,
  products,
  onSelect,
  onConfirm,
  onSkip,
  onDismiss
}: {
  category: Category;
  products: Product[];
  onSelect: (product: Product) => void;
  onConfirm: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}) {
  const items = useCartStore((state) => state.items);
  const add = useCartStore((state) => state.add);
  const decrement = useCartStore((state) => state.decrement);
  const isDrinks = category.kind === 'drink';
  const categorySuggestions = products.filter(
    (product) => !product.is_hidden && isProductInCategory(product, category.id)
  );
  const suggestions = (
    categorySuggestions.length > 0
      ? categorySuggestions
      : isSauceCategory(category)
        ? products.filter((product) => !product.is_hidden && isSauceProduct(product))
        : []
  ).slice(0, 12);
  const selectedSuggestions = suggestions.filter((product) => getProductCartQuantity(items, product.id) > 0);
  const selectedSuggestionCount = selectedSuggestions.reduce(
    (count, product) => count + getProductCartQuantity(items, product.id),
    0
  );
  const hasSelectedSuggestions = selectedSuggestionCount > 0;

  const chooseProduct = (product: Product) => {
    add(product);
    onSelect(product);
    playCartSound('add');
  };

  return (
    <div className="modal-backdrop flow-backdrop flow-backdrop--upsell">
      <section className="flow-modal" role="dialog" aria-modal="true" aria-labelledby="flow-title">
        <div className="modal-handle" />
        <button className="flow-modal__close" type="button" onClick={onDismiss} aria-label="Закрыть">
          <X />
        </button>
        {isDrinks ? <Coffee className="modal-icon" /> : <ChefHat className="modal-icon" />}
        <h2 id="flow-title">{getUpsellReminderTitle(category)}</h2>
        <p>Можно добавить к заказу одну или несколько позиций перед оформлением.</p>
        <div className="flow-products">
          {suggestions.map((product) => {
            const quantity = getProductCartQuantity(items, product.id);
            return (
              <article
                className={quantity > 0 ? 'flow-product-card is-selected' : 'flow-product-card'}
                key={product.id}
              >
                <SafeImage src={product.image_url} alt={product.title} />
                <strong>{product.title}</strong>
                <small>{formatPrice(product.price)}</small>
                <div className="flow-product-card__stepper">
                  {quantity > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          decrement(product.id);
                          playCartSound('remove');
                        }}
                        aria-label={`Уменьшить ${product.title}`}
                      >
                        <Minus />
                      </button>
                      <span>{quantity}</span>
                    </>
                  )}
                  <button type="button" onClick={() => chooseProduct(product)} aria-label={`Добавить ${product.title}`}>
                    <Plus />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {suggestions.length === 0 && (
          <p className="modal-empty">
            В этой категории пока нет товаров.
          </p>
        )}
        {hasSelectedSuggestions && <p className="flow-selected">Добавлено позиций: {selectedSuggestionCount}</p>}
        <button className="primary-wide" type="button" disabled={!hasSelectedSuggestions} onClick={onConfirm}>
          Выбрать «{category.name}»
        </button>
        <button className="ghost-wide" type="button" onClick={onSkip}>
          Продолжить без выбора
        </button>
      </section>
    </div>
  );
}

export function AdminPanel({ onAdd }: { onAdd: () => void }) {
  const isAdmin = useAuthStore((state) => state.isAdmin);

  if (!isAdmin) {
    return null;
  }

  return (
    <nav className="admin-panel">
      <button type="button" onClick={onAdd}>
        <Plus /> Добавить
      </button>
    </nav>
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
  const shareCurrentPage = useCallback(async () => {
    const url = window.location.href;
    const title = document.title || 'WayYaam';
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Ссылка скопирована');
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') {
        toast.error('Не удалось поделиться ссылкой');
      }
    }
  }, []);
  const openCatalogSearch = useCallback(() => {
    const searchButton = document.querySelector<HTMLButtonElement>(
      '.catalog-nav__actions button[aria-label="Поиск"], .catalog-nav__actions button[aria-label="Закрыть поиск"]'
    );
    searchButton?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (searchButton?.getAttribute('aria-label') === 'Поиск') searchButton.click();
  }, []);
  const catalogQueryKey = useMemo(() => ['catalog', catalogSlug] as const, [catalogSlug]);
  const cachedCatalog = useMemo(() => readCatalogCache(catalogSlug), [catalogSlug]);
  const placeholderCatalog = useMemo<CatalogSnapshot>(() => getGroceryCatalogFallback(catalogSlug) ?? ({
    restaurant: makeLoadingRestaurant(catalogSlug),
    categories: demoCategories,
    products: demoProducts,
    cabins: demoCabins,
    tags: defaultTags,
    theme: demoThemeSettings,
    photoQuality: DEFAULT_PHOTO_QUALITY_SETTINGS,
    source: 'demo' as const
  }), [catalogSlug]);
  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: catalogQueryKey,
    queryFn: () => loadCatalogWithTimeout(catalogSlug),
    initialData: cachedCatalog?.data,
    initialDataUpdatedAt: cachedCatalog?.savedAt,
    placeholderData: () => placeholderCatalog,
    staleTime: 2 * 60_000,
    retry: 1,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true
  });
  const { data: restaurantReviews = [] } = useQuery({
    queryKey: ['restaurant-reviews', catalogSlug],
    queryFn: () => loadCatalogReviews(catalogSlug),
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnReconnect: true
  });
  const restaurantReviewSummary = summarizeRestaurantReviews(restaurantReviews);
  const themeStore = useThemeStore((state) => state.theme);
  const updateTheme = useThemeStore((state) => state.updateTheme);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const setAdmin = useAuthStore((state) => state.setAdmin);
  const [adminSessionChecked, setAdminSessionChecked] = useState(false);
  const setAdminEditor = useAdminStore((state) => state.setEditor);
  const [screen, setScreen] = useState<Screen>('home');
  const catalogScrollPositionRef = useRef(0);
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [drinkCategory, setDrinkCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showAfterOrderPanel, setShowAfterOrderPanel] = useState(false);
  const [orderFlow, setOrderFlow] = useState<OrderFlowState>({ step: 'done', selectedByCategory: {} });
  const [settingsCatalogTab, setSettingsCatalogTab] = useState<SettingsCatalogTab>('categories');
  const [categoryEditor, setCategoryEditor] = useState<{ mode: CategoryEditorMode; categoryId?: string }>({ mode: 'list' });
  const [cabinEditor, setCabinEditor] = useState<{ mode: CabinEditorMode; cabinId?: string }>({ mode: 'list' });
  const [localProducts, setLocalProducts] = useState<Product[]>(() => placeholderCatalog.products);
  const [localCategories, setLocalCategories] = useState<Category[]>(() => placeholderCatalog.categories);
  const [localCabins, setLocalCabins] = useState<Cabin[]>(() => placeholderCatalog.cabins);
  const [localTags, setLocalTags] = useState<CatalogTag[]>(() => placeholderCatalog.tags);
  const [localRestaurant, setLocalRestaurant] = useState<Restaurant>(() => placeholderCatalog.restaurant);
  const [photoQuality, setPhotoQuality] = useState<PhotoQualitySettings>(DEFAULT_PHOTO_QUALITY_SETTINGS);
  const [restaurantOrders, setRestaurantOrders] = useState<RestaurantOrder[]>([]);
  const [deliverySettings, setDeliverySettings] = useState<RestaurantDeliverySettings | null>(
    () => readDeliverySettingsCache(catalogSlug)
  );
  const [loadingGraceExpired, setLoadingGraceExpired] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState<RestaurantPaymentSettings>(() => loadPaymentSettings(catalogSlug));
  const disabledModuleAccess: RestaurantAdminModuleAccess = { pos: 'disabled', warehouse: 'disabled' };
  const restaurantModuleAccessQuery = useQuery({
    queryKey: ['restaurant-admin-module-access', catalogSlug],
    queryFn: () => getRestaurantAdminModuleAccessBySlug(catalogSlug),
    enabled: isAdmin,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  });
  const [, setStockTargets] = useState<StockTargets>(() => loadStockTargets());
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clear);
  const setCartCatalogScope = useCartStore((state) => state.setCatalogScope);
  useLayoutEffect(() => {
    setCartCatalogScope(catalogSlug);
  }, [catalogSlug, setCartCatalogScope]);
  const cartCount = selectCartCount(items);
  const persist = <T,>(action: Promise<T>, onSuccess?: (value: T) => void) => {
    void action.then((value) => {
      onSuccess?.(value);
    }).catch((error) => {
      console.error('Supabase save failed', error);
      const message = errorMessageFor(error);
      if (isPlatformRestaurantRlsError(message)) {
        toast.warning('Профиль сохранён. Точку ресторана применим после обновления прав Supabase.');
        return;
      }
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
  const openRestaurantSettingsHub = useCallback(() => {
    const targetPath = `/${catalogSlug}/settings`;
    setScreen('admin-home');
    rememberPwaResumePath(targetPath);
    navigate(targetPath, { replace: true });
  }, [catalogSlug, navigate]);

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
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshOrders();
      }
    };
    const intervalId = window.setInterval(refreshOrders, 10_000);

    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('pageshow', refreshWhenVisible);
    window.addEventListener('online', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('pageshow', refreshWhenVisible);
      window.removeEventListener('online', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [isAdmin, refreshRestaurantOrders]);

  const refreshDeliverySettings = useCallback(() => {
    void getRestaurantDeliverySettings(catalogSlug)
      .then((settings) => {
        setDeliverySettings(settings);
        writeDeliverySettingsCache(catalogSlug, settings);
      })
      .catch((error) => {
        console.error('Delivery settings load failed', error);
      });
  }, [catalogSlug]);

  useEffect(() => {
    setDeliverySettings(readDeliverySettingsCache(catalogSlug));
  }, [catalogSlug]);

  useEffect(() => {
    let isCurrentCatalog = true;
    let sessionRetryTimeoutId: number | undefined;
    setAdminSessionChecked(false);
    const restoreAdminSession = () => {
      void hasAdminSession(catalogSlug).then((hasSession) => {
        if (!isCurrentCatalog) return;
        setAdmin(hasSession);
        setAdminSessionChecked(true);
      }).catch((error) => {
        console.warn('Restaurant session restoration will retry', error);
        if (!isCurrentCatalog) return;
        setAdminSessionChecked(false);
        sessionRetryTimeoutId = window.setTimeout(restoreAdminSession, 2_500);
      });
    };
    restoreAdminSession();
    const unsubscribe = onAdminSessionChange((hasSession) => {
      if (!isCurrentCatalog) return;
      setAdmin(hasSession);
      setAdminSessionChecked(true);
    }, catalogSlug);
    return () => {
      isCurrentCatalog = false;
      window.clearTimeout(sessionRetryTimeoutId);
      unsubscribe();
    };
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
    ['category', 'categories', 'product', 'products', 'restaurant', 'restaurants', 'catalogs', 'catalog_tag', 'tags', 'theme_settings', 'catalog_theme_settings'].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, refreshCatalog);
    });
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'restaurant_delivery_settings' },
      refreshDeliverySettings
    );
    channel.subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [catalogQueryKey, catalogSlug, refreshDeliverySettings]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [screen, selectedProduct?.id]);

  useEffect(() => {
    if (cartCount === 0) {
      setShowAfterOrderPanel(false);
    }
  }, [cartCount]);

  useEffect(() => {
    if (routeSection === 'checkout' && !isAdmin) {
      setScreen('checkout');
      return;
    }
    if (routeSection === 'dishes' && isAdmin) {
      setCatalogCategory('all');
      setScreen('catalog');
      return;
    }
    if (routeSection === 'dashboard' || routeSection === 'orders' || routeSection === 'dishes' || routeSection === 'settings' || routeSection === 'scanner') {
      setScreen('admin-home');
    }
    if (routeSection === 'payments') {
      setScreen('settings-payments');
    }
  }, [isAdmin, routeSection]);

  useEffect(() => {
    setLoadingGraceExpired(false);
    const timeoutId = window.setTimeout(() => setLoadingGraceExpired(true), 7_000);
    return () => window.clearTimeout(timeoutId);
  }, [catalogSlug]);

  useEffect(() => {
    if (data && !isPlaceholderData) writeCatalogCache(catalogSlug, data);
  }, [catalogSlug, data, isPlaceholderData]);

  useEffect(() => {
    if (data?.theme) {
      updateTheme(data.theme);
    }
    if (data?.photoQuality) {
      setPhotoQuality(data.photoQuality);
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
  }, [
    data?.cabins,
    data?.categories,
    data?.photoQuality,
    data?.products,
    data?.restaurant,
    data?.tags,
    data?.theme,
    updateTheme
  ]);

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
        return 'Зал: столики и кабинки';
      }
      if (categoryEditor.mode === 'edit') return 'Редактировать категорию';
      if (categoryEditor.mode === 'add') return 'Добавить категорию';
      return 'Параметры и категории';
    }
    if (screen === 'settings-design') return 'Дизайн приложения';
    if (screen === 'settings-theme') return 'Тема';
    if (screen === 'settings-photo-quality') return 'Качество фотографий';
    if (screen === 'settings-stock') return 'Обновить блюда';
    if (screen === 'settings-payments') return 'Платежи';
    if (screen === 'settings-backup') return 'Импорт и экспорт';
    if (screen === 'settings-delete') return 'Удаление каталога';
    return 'Настройки';
  }, [cabinEditor.mode, categoryEditor.mode, screen, settingsCatalogTab]);

  if (isLoading && !data && !loadingGraceExpired) {
    return <CatalogLoadingScreen />;
  }

  const openProduct = (product: Product) => {
    catalogScrollPositionRef.current = window.scrollY;
    setSelectedProduct(product);
    setScreen('product');
  };

  const returnFromProduct = () => {
    setSelectedProduct(null);
    setScreen('home');
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: catalogScrollPositionRef.current, behavior: 'auto' });
      });
    });
  };

  const editProduct = (product: Product) => {
    setEditingProduct(product);
    setAdminEditor('dish');
  };

  const saveProduct = (product: Product, generatedProducts: Product[] = [], removedProductIds: string[] = []) => {
    const normalizedProducts = [product, ...generatedProducts].map((item) =>
      applyStockValues(item, getDailyStock(item), getCurrentStock(item))
    );
    const normalizedProduct = normalizedProducts[0];
    setLocalProducts((current) => mergeDishProductChanges(current, normalizedProducts, removedProductIds));
    if (selectedProduct?.id === normalizedProduct.id) {
      setSelectedProduct(normalizedProduct);
    }
    setEditingProduct(null);
    setAdminEditor(null);
    setStockTargets((current) => {
      const next = { ...current };
      removedProductIds.forEach((productId) => delete next[productId]);
      normalizedProducts.forEach((savedProduct) => {
        next[savedProduct.id] = getDailyStock(savedProduct);
      });
      saveStockTargets(next);
      return next;
    });
    persist(persistDishProductChanges(normalizedProducts, removedProductIds, {
      save: saveProductToSupabase,
      remove: deleteProductFromSupabase
    }));
  };

  const deleteProduct = (productId: string) => {
    const removedProductIds = getDishProductRemovalIds(localProducts, productId);
    const removedIds = new Set(removedProductIds);
    setLocalProducts((current) => current.filter((product) => !removedIds.has(product.id)));
    setStockTargets((current) => {
      const next = { ...current };
      removedProductIds.forEach((removedProductId) => delete next[removedProductId]);
      saveStockTargets(next);
      return next;
    });
    if (selectedProduct?.id === productId) {
      setSelectedProduct(null);
      setScreen('home');
    }
    persist(persistDishProductChanges([], removedProductIds, {
      save: saveProductToSupabase,
      remove: deleteProductFromSupabase
    }));
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

  const savePhotoQuality = async (settings: PhotoQualitySettings) => {
    await savePhotoQualityToSupabase(catalogSlug, settings);
    setPhotoQuality(settings);
    queryClient.setQueryData(catalogQueryKey, (current: typeof data) =>
      current ? { ...current, photoQuality: settings } : current
    );
    toast.success('Качество фотографий сохранено');
  };

  const saveDeliverySettings = (settings: RestaurantDeliverySettings) => {
    setDeliverySettings(settings);
    persist(saveRestaurantDeliverySettings(catalogSlug, settings), () => {
      toast.success('Настройки доставки сохранены');
      refreshDeliverySettings();
    });
  };

  const changeOrderStatus = async (
    order: RestaurantOrder,
    status: RestaurantOrderStatus,
    reason = '',
    readyMinutes?: 10 | 15 | 20 | 30
  ) => {
    try {
      await updateRestaurantOrderStatus(order, status, reason, readyMinutes);
      setRestaurantOrders((current) =>
        current.map((item) => (item.id === order.id ? {
          ...item,
          status,
          estimatedReadyAt:
            status === 'accepted' && readyMinutes
              ? new Date(Date.now() + readyMinutes * 60_000).toISOString()
              : item.estimatedReadyAt
        } : item))
      );
      refreshRestaurantOrders();
    } catch (error) {
      const message = errorMessageFor(error);
      toast.error(message ? `Не удалось сохранить: ${message}` : 'Не удалось обновить заказ');
      throw error;
    }
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
    if (screen === 'checkout') {
      const review = document.getElementById('checkout-review');
      review?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => review?.focus({ preventScroll: true }), 450);
      return;
    }
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
    const belongsToFlowCategory = Boolean(
      category && (
        isProductInCategory(product, category.id) ||
        (isSauceCategory(category) && isSauceProduct(product))
      )
    );
    if (!category || !belongsToFlowCategory) {
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
    const emptyRestaurant = { ...demoRestaurant, id: catalogSlug, name: '', subtitle: '', whatsapp: '', instagram_url: '', address: '', mapLink: '', lat: null, lng: null };
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
    openRestaurantSettingsHub();
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
          if (screen === 'settings') return openRestaurantSettingsHub();
          if (screen === 'settings-theme' || screen === 'settings-photo-quality') {
            setScreen('settings-design');
            return;
          }
          openRestaurantSettingsHub();
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
      {screen === 'settings-design' && (
        <DesignSettingsHome
          onOpenTheme={() => setScreen('settings-theme')}
          onOpenPhotoQuality={() => setScreen('settings-photo-quality')}
        />
      )}
      {screen === 'settings-theme' && <ThemeSettingsScreen theme={themeStore} onChange={saveTheme} />}
      {screen === 'settings-photo-quality' && (
        <PhotoQualitySettingsScreen
          products={catalog.products}
          value={photoQuality}
          onSave={savePhotoQuality}
        />
      )}
      {screen === 'settings-payments' && (
        <PaymentSettingsCard
          slug={catalogSlug}
          settings={paymentSettings}
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
    <RestaurantAdminWorkspace
      catalogSlug={catalogSlug}
      restaurant={catalog.restaurant}
      categories={catalog.categories}
      cabins={catalog.cabins}
      products={catalog.products}
      orders={restaurantOrders}
      routeSection={routeSection}
      routeOrderId={routeOrderId}
      paymentSettings={paymentSettings}
      deliverySettings={deliverySettings}
      moduleAccess={restaurantModuleAccessQuery.data ?? disabledModuleAccess}
      onOpenScreen={setScreen}
      onOpenSeating={() => {
        setSettingsCatalogTab('cabins');
        setCategoryEditor({ mode: 'list' });
        setCabinEditor({ mode: 'list' });
        setScreen('settings-categories');
      }}
      onOpenCatalog={() => {
        setCatalogCategory('all');
        setScreen('catalog');
        const targetPath = `/${catalogSlug}/dishes`;
        rememberPwaResumePath(targetPath);
        navigate(targetPath, { replace: true });
      }}
      onAddDish={() => setAdminEditor('dish')}
      onOrderStatus={changeOrderStatus}
      onRefreshOrders={refreshRestaurantOrders}
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
          onBack={() => navigateBackOrFallback(navigate, `/${catalogSlug}`)}
          onPlatformBack={() => navigate('/')}
          onCart={() => navigate(`/${catalogSlug}`)}
          onAdmin={() => navigate(buildProfileLoginPath(`/business/${catalogSlug}`))}
          logoUrl={catalog.restaurant.logo_url}
          restaurantName={catalog.restaurant.name}
          restaurantSubtitle={catalog.restaurant.subtitle}
        />
        <PublicOrderStatusScreen
          catalogSlug={catalogSlug}
          orderId={routeOrderId}
          businessType={catalog.restaurant.business_type}
        />
        <SiteCredit />
      </div>
    );
  }

  const businessTemplateClass = catalog.restaurant.business_type === 'confectionery'
    ? ' app-shell--confectionery'
    : '';

  return (
    <div
      className={`${
        screen === 'admin-home'
          ? 'app-shell app-shell--restaurant-admin'
          : screen === 'settings-stock'
          ? 'app-shell app-shell--settings app-shell--stock'
          : screen === 'settings-categories'
            ? 'app-shell app-shell--settings app-shell--category-settings'
            : screen.startsWith('settings')
              ? 'app-shell app-shell--settings'
              : 'app-shell'
      }${businessTemplateClass}`}
      style={{
        ...applyTheme(themeStore),
        '--dish-photo-filter': getPhotoQualityFilter(photoQuality),
        ...(screen.startsWith('settings') ? settingsAccentStyle : {})
      } as CSSProperties}
    >
      <Toaster richColors position="top-center" />
      {(screen === 'admin-home' || screen.startsWith('settings')) && !isAdmin ? (
        adminSessionChecked ? (
          <Navigate to={buildProfileLoginPath(`/business/${catalogSlug}`)} replace />
        ) : (
          <main className="restaurant-session-check" role="status" aria-live="polite">
            <span />
            <strong>Проверяем вход в ресторан...</strong>
          </main>
        )
      ) : screen === 'admin-home' ? (
        renderRestaurantAdmin()
      ) : screen.startsWith('settings') ? (
        renderSettings()
      ) : (
        <>
            <TopBar
            title={routeSection === 'reviews' ? 'Отзывы' : screen === 'product' ? undefined : title}
            canBack={routeSection === 'reviews' || screen !== 'home'}
            onBack={() => {
              if (routeSection === 'reviews') {
                navigate(`/${catalogSlug}`);
                return;
              }
              if (routeSection === 'dishes') {
                openRestaurantAdminPath('admin-home');
                return;
              }
              if (screen === 'product') {
                returnFromProduct();
                return;
              }
              setScreen('home');
            }}
            onPlatformBack={() => navigate('/')}
            onSearch={screen === 'home' && routeSection !== 'reviews' ? openCatalogSearch : undefined}
            onShare={screen === 'home' && routeSection !== 'reviews' ? shareCurrentPage : undefined}
            onCart={() => setIsCartOpen(true)}
            onAdmin={() => navigate(buildProfileLoginPath(`/business/${catalogSlug}`))}
            logoUrl={catalog.restaurant.logo_url}
            restaurantName={catalog.restaurant.name}
            restaurantSubtitle={catalog.restaurant.subtitle}
            showBrand={screen !== 'home'}
            showCart
          />

          <ClientBrowserPairingBanner />

          {routeSection === 'reviews' && !isAdmin && (
            <CatalogReviewsScreen restaurant={catalog.restaurant} reviews={restaurantReviews} />
          )}

          {screen === 'home' && routeSection !== 'reviews' && (
            <CatalogScreen
              restaurant={catalog.restaurant}
              categories={catalog.categories}
              products={catalog.products}
              deliverySettings={deliverySettings}
              initialCategory="all"
              onCart={() => setIsCartOpen(true)}
              onShare={shareCurrentPage}
              onBack={() => navigate(getRestaurantCatalogBackTarget({ catalogSlug, isAdmin, routeSection }))}
              onOpenProduct={openProduct}
              onEditProduct={editProduct}
              onDeleteProduct={deleteProduct}
              onToggleProduct={toggleProduct}
              onStockChange={updateProductStock}
              reviewRating={restaurantReviewSummary.rating}
              reviewCount={restaurantReviewSummary.reviewCount}
              onReviews={() => navigate(`/${catalogSlug}/reviews`)}
              flowAction={activeFlowCategory ? makeFlowAction(activeFlowCategory) : undefined}
            />
          )}
          {screen === 'catalog' && (
            <CatalogScreen
              categories={catalog.categories}
              products={catalog.products}
              deliverySettings={deliverySettings}
              initialCategory={catalogCategory}
              onCart={() => setIsCartOpen(true)}
              onShare={shareCurrentPage}
              onBack={() => setScreen('home')}
              onOpenProduct={openProduct}
              onEditProduct={editProduct}
              onDeleteProduct={deleteProduct}
              onToggleProduct={toggleProduct}
              onStockChange={updateProductStock}
              reviewRating={restaurantReviewSummary.rating}
              reviewCount={restaurantReviewSummary.reviewCount}
              onReviews={() => navigate(`/${catalogSlug}/reviews`)}
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
              key={selectedProduct.id}
              product={selectedProduct}
              products={catalog.products}
              businessType={catalog.restaurant.business_type}
              onOpenProduct={(product) => setSelectedProduct(product)}
              flowAction={makeFlowAction(activeFlowCategory)}
            />
          )}
          {screen === 'checkout' && (
            <CheckoutScreen
              catalogSlug={catalogSlug}
              restaurant={catalog.restaurant}
              cabins={catalog.cabins}
              deliverySettings={deliverySettings ?? defaultRestaurantDeliverySettings}
              paymentSettings={paymentSettings}
              onEditCart={() => setIsCartOpen(true)}
              onSubmitOrder={(orderId) => {
                setShowAfterOrderPanel(true);
                setOrderFlow({ step: 'done', selectedByCategory: {} });
                navigate(`/${catalogSlug}/order/${orderId}`);
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
          <CartBar
            deliverySettings={deliverySettings}
            onCheckout={() => setIsCartOpen(true)}
            onContinue={continueFromCartBar}
          />
        </>
      )}

      {!screen.startsWith('settings') && screen !== 'admin-home' && (
        <AdminPanel
          onAdd={() => setAdminEditor('dish')}
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
      {orderFlow.step !== 'done' && activeFlowCategory && screen !== 'catalog' && screen !== 'drinks' && (
        <UpsellReminder
          category={activeFlowCategory}
          products={catalog.products}
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
