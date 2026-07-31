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
  ZoomIn,
  ZoomOut,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import {
  cabins as demoCabins,
  categories as demoCategories,
  products as demoProducts,
  restaurant as demoRestaurant,
  themeSettings as demoThemeSettings
} from '../data/catalog';
import type { Cabin, CatalogTag, Category, Product, Restaurant, ThemeSettings } from '../entities/models';
import {
  getCartItemPrice,
  getProductChoiceOptions,
  getProductStartingPrice
} from '../entities/productVariants';
import { CheckoutScreen } from '../features/checkout/CheckoutScreen';
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
  isLimitedProduct,
  isProductInCategory,
  loadStockTargets,
  makeLoadingRestaurant,
  playAddSound,
  playCartSound,
  saveStockTargets,
  type StockTargets
} from '../features/restaurant-settings/catalogAdminModel';
import { RestaurantAdminWorkspace } from '../features/restaurant-admin/RestaurantAdminWorkspace';
import { LoginModal } from '../features/auth/LoginModal';
import {
  darkThemePreset,
  DesignEditor,
  DesignSettingsHome,
  PhotoQualitySettingsScreen,
  ThemeSettingsScreen
} from '../features/design-settings';
import { CatalogLoadingScreen } from '../shared/CatalogLoadingScreen';
import { PublicOrderStatusScreen } from '../features/order/PublicOrderStatusScreen';
import {
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

function ProductImageCarousel({ product, hero = false }: { product: Product; hero?: boolean }) {
  const images = product.image_urls?.filter(Boolean).length
    ? product.image_urls.filter(Boolean)
    : product.image_url
      ? [product.image_url]
      : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [displayedIndex, setDisplayedIndex] = useState(images.length > 1 ? 1 : 0);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerScale, setViewerScale] = useState(1);
  const touchStartX = useRef<number | null>(null);
  const didSwipe = useRef(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollEndRef = useRef<number | null>(null);
  const displayedImages = images.length > 1
    ? [images[images.length - 1], ...images, images[0]]
    : (images.length ? images : ['']);

  useEffect(() => {
    setActiveIndex(0);
    setDisplayedIndex(images.length > 1 ? 1 : 0);
    window.requestAnimationFrame(() => {
      const track = trackRef.current;
      if (track) track.scrollTo({ left: images.length > 1 ? track.clientWidth : 0 });
    });
  }, [product.id, images.length]);

  useEffect(() => () => {
    if (scrollEndRef.current !== null) window.clearTimeout(scrollEndRef.current);
  }, []);

  useEffect(() => {
    if (!isViewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isViewerOpen]);

  return (
    <>
      <div
        className={hero ? 'product-photo-carousel product-photo-carousel--hero' : 'product-photo-carousel'}
        data-active-image={images[activeIndex] ?? product.image_url}
        role={hero ? 'button' : undefined}
        tabIndex={hero ? 0 : undefined}
        aria-label={hero ? `Увеличить фото: ${product.title}` : undefined}
        onKeyDown={(event) => {
          if (hero && (event.key === 'Enter' || event.key === ' ')) setIsViewerOpen(true);
        }}
        onClick={(event) => {
          if (didSwipe.current) {
            event.stopPropagation();
            didSwipe.current = false;
            return;
          }
          if (hero) {
            setViewerScale(1);
            setIsViewerOpen(true);
          }
        }}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
          didSwipe.current = false;
        }}
        onTouchEnd={(event) => {
          if (touchStartX.current === null) return;
          const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
          touchStartX.current = null;
          didSwipe.current = Math.abs(delta) >= 12;
        }}
      >
        <div
          className="product-photo-carousel__track"
          ref={trackRef}
          onScroll={(event) => {
            const track = event.currentTarget;
            const width = track.clientWidth;
            if (width <= 0) return;
            const rawIndex = Math.round(track.scrollLeft / width);
            setDisplayedIndex(rawIndex);
            setActiveIndex(images.length > 1 ? (rawIndex - 1 + images.length) % images.length : 0);
            if (scrollEndRef.current !== null) window.clearTimeout(scrollEndRef.current);
            scrollEndRef.current = window.setTimeout(() => {
              if (images.length < 2) return;
              const settledIndex = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
              const resetIndex = settledIndex === 0 ? images.length : settledIndex === images.length + 1 ? 1 : null;
              if (resetIndex === null) return;
              track.style.scrollBehavior = 'auto';
              track.scrollTo({ left: resetIndex * track.clientWidth });
              setDisplayedIndex(resetIndex);
              window.requestAnimationFrame(() => {
                track.style.scrollBehavior = '';
              });
            }, 180);
          }}
        >
          {displayedImages.map((image, index) => (
            <span className={`product-photo-carousel__slide${index === displayedIndex ? ' is-active' : ''}`} key={`${image}-${index}`}>
              <SafeImage
                className={hero ? 'product-hero' : undefined}
                src={image}
                alt={activeIndex === 0 ? product.title : `${product.title}, фото ${activeIndex + 1}`}
                loading={hero ? undefined : 'lazy'}
                draggable={false}
              />
            </span>
          ))}
        </div>
        {images.length > 1 && (
          <span className="product-photo-carousel__dots" aria-label={`Фото ${activeIndex + 1} из ${images.length}`}>
            {images.map((image, index) => <i className={index === activeIndex ? 'is-active' : ''} key={`${image}-dot-${index}`} />)}
          </span>
        )}
      </div>
      {hero && isViewerOpen && (
        <div className="product-photo-viewer" role="dialog" aria-modal="true" aria-label={`Фото блюда ${product.title}`}>
          <button className="product-photo-viewer__close" type="button" onClick={() => setIsViewerOpen(false)} aria-label="Закрыть">
            <X />
          </button>
          <div className="product-photo-viewer__viewport">
            <SafeImage
              src={images[activeIndex] ?? product.image_url}
              alt={product.title}
              style={{ filter: 'var(--dish-photo-filter, none)', transform: `scale(${viewerScale})` }}
              draggable={false}
            />
          </div>
          <div className="product-photo-viewer__controls">
            <button type="button" onClick={() => setViewerScale((value) => Math.max(1, value - 0.5))} aria-label="Уменьшить">
              <ZoomOut />
            </button>
            <button type="button" onClick={() => setViewerScale(1)}>100%</button>
            <button type="button" onClick={() => setViewerScale((value) => Math.min(4, value + 0.5))} aria-label="Увеличить">
              <ZoomIn />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

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
  const decrement = useCartStore((state) => state.decrement);
  const items = useCartStore((state) => state.items);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const currentStock = getCurrentStock(product);
  const soldOut = isLimitedProduct(product) && currentStock <= 0;
  const quantity = items.find((item) => item.product.id === product.id)?.quantity ?? 0;
  const choiceOptions = getProductChoiceOptions(product);

  const captureCartAnimation = (button: HTMLButtonElement) => {
    const buttonRect = button.getBoundingClientRect();
    const tile = button.closest('.product-tile') as HTMLElement | null;
    const carousel = tile?.querySelector('.product-photo-carousel') as HTMLElement | null;
    const image = tile?.querySelector('.product-photo-carousel__slide.is-active img, .product-tile__image img') as HTMLImageElement | null;
    const visibleImageRect = carousel?.getBoundingClientRect() ?? image?.getBoundingClientRect();
    return {
      buttonRect,
      imageRect: visibleImageRect,
      imageUrl: carousel?.dataset.activeImage || image?.currentSrc || product.image_url
    };
  };

  const playCartAnimation = (
    { buttonRect, imageRect, imageUrl }: ReturnType<typeof captureCartAnimation>,
    reverse = false
  ) => {
    const target = document.querySelector('[data-cart-animation-target] .cart-bar__icon') as HTMLElement | null;
    const targetRect = target?.getBoundingClientRect();
    const startX = imageRect ? imageRect.left + imageRect.width / 2 : buttonRect.left + buttonRect.width / 2;
    const startY = imageRect ? imageRect.top + imageRect.height / 2 : buttonRect.top + buttonRect.height / 2;
    const endX = targetRect ? targetRect.left + targetRect.width / 2 : Math.max(50, window.innerWidth * 0.18);
    const endY = targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight - 54;
    const flyer = document.createElement('span');
    const width = Math.min(imageRect?.width ?? 64, 180);
    const height = Math.min(imageRect?.height ?? 64, 150);

    flyer.className = reverse ? 'cart-flyer cart-flyer--reverse' : 'cart-flyer';
    flyer.setAttribute('aria-hidden', 'true');
    flyer.style.setProperty('--flyer-start-x', `${startX}px`);
    flyer.style.setProperty('--flyer-start-y', `${startY}px`);
    flyer.style.setProperty('--flyer-mid-x', `${Math.max(58, Math.min(window.innerWidth - 58, window.innerWidth * 0.5))}px`);
    flyer.style.setProperty('--flyer-mid-y', `${Math.max(86, Math.min(startY - 72, window.innerHeight * 0.32))}px`);
    flyer.style.setProperty('--flyer-end-x', `${endX}px`);
    flyer.style.setProperty('--flyer-end-y', `${endY}px`);
    flyer.style.setProperty('--flyer-width', `${width}px`);
    flyer.style.setProperty('--flyer-height', `${height}px`);

    if (imageUrl) {
      const flyerImage = document.createElement('img');
      flyerImage.src = imageUrl;
      flyerImage.alt = '';
      flyer.append(flyerImage);
    } else {
      flyer.classList.add('cart-flyer--empty');
      flyer.textContent = '+';
    }

    document.body.append(flyer);
    const cleanup = () => flyer.remove();
    flyer.addEventListener('animationend', cleanup, { once: true });
    window.setTimeout(cleanup, 1200);
  };

  return (
    <article
      className={`product-tile product-tile--${variant}${product.is_hidden ? ' is-hidden' : ''}${soldOut ? ' is-sold-out' : ''}`}
      onClick={() => onOpen(product)}
    >
      <div className="product-tile__image">
        <ProductImageCarousel product={product} />
        {product.is_popular && (
          <span className="product-state product-state--popular">
            <Star />
          </span>
        )}
        {quantity > 0 && <b className="product-tile__quantity-badge">{quantity}</b>}
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
          <strong>
            {choiceOptions.length > 0 && 'от '}
            {formatPrice(getProductStartingPrice(product))}
          </strong>
          <div
            className={quantity > 0 ? 'product-tile__stepper has-quantity' : 'product-tile__stepper'}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.preventDefault()}
          >
            {quantity > 0 && (
              <>
                <button
                  className="product-tile__stepper-button product-tile__stepper-button--minus"
                  type="button"
                  aria-label={`Уменьшить ${product.title}`}
                  onClick={(event) => {
                    const animationSnapshot = captureCartAnimation(event.currentTarget);
                    playCartAnimation(animationSnapshot, true);
                    decrement(product.id);
                    playCartSound('remove');
                  }}
                >
                  <Minus />
                </button>
                <span className="product-tile__stepper-count">{quantity}</span>
              </>
            )}
            <button
              className="add-button product-tile__stepper-button"
              type="button"
              disabled={soldOut}
              aria-label={`Добавить ${product.title}`}
              onClick={(event) => {
                const button = event.currentTarget;
                if (choiceOptions.length > 0) {
                  onOpen(product);
                  return;
                }
                const animationSnapshot = captureCartAnimation(button);
                add(product);
                onAdd?.(product);
                playAddSound();
                window.requestAnimationFrame(() => playCartAnimation(animationSnapshot));
              }}
            >
              <Plus />
            </button>
          </div>
        </div>
      </div>
    </article>
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
              {items.map((item) => (
                <article className="cart-item-card" key={item.product.id}>
                  <SafeImage src={item.product.image_url} alt={item.product.title} />
                  <div className="cart-item-card__content">
                    <div className="cart-item-card__top">
                      <div>
                        <h3>{item.product.title}</h3>
                        {item.selected_choice && <small className="cart-item-card__choice">{item.selected_choice}</small>}
                        <p>{item.product.description}</p>
                      </div>
                      <button className="cart-item-card__remove" type="button" onClick={() => remove(item.product.id)} aria-label={`Удалить ${item.product.title}`}>
                        <Trash2 />
                      </button>
                    </div>
                    <div className="cart-item-card__bottom">
                      <strong>{formatPrice(getCartItemPrice(item))}</strong>
                      <div className="cart-quantity" aria-label={`Количество ${item.product.title}`}>
                        <button
                          type="button"
                          onClick={() => {
                            decrement(item.product.id);
                            playCartSound('remove');
                          }}
                          aria-label="Уменьшить"
                        >
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
              />
          ))}
        </div>
      ) : (
        <SafeImage src="" alt="Обложка ресторана" />
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

function CatalogScreen({
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
    .filter((category) => category.kind !== 'space')
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

  useEffect(() => {
    const elements = Array.from(sectionRefs.current.values());
    if (elements.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
        const next = visible[0]?.target.getAttribute('data-catalog-section');
        if (next) setActive(next);
      },
      { rootMargin: '-84px 0px -62% 0px', threshold: [0, 0.01] }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [normalizedQuery, sections.length]);

  useEffect(() => {
    const pill = pillRefs.current.get(active);
    const rail = categoryRailRef.current;
    if (!pill || !rail) return;
    const railRect = rail.getBoundingClientRect();
    const pillRect = pill.getBoundingClientRect();
    if (pillRect.left < railRect.left || pillRect.right > railRect.right) {
      pill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
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
    setActive(id);
    const target = sectionRefs.current.get(id);
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
                <span><Star /> <strong>5.0</strong></span>
                {preparationLabel && <span title={`Готовка ${preparationLabel}`}><Timer /> <strong>{preparationLabel}</strong></span>}
                {freeDeliveryLabel && <span title={`Бесплатная доставка ${freeDeliveryLabel}`}><Truck /> <strong>{freeDeliveryLabel}</strong></span>}
              </section>
            )}
          </div>
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
  const choiceOptions = getProductChoiceOptions(product);
  const cartChoice = items.find((item) => item.product.id === product.id)?.selected_choice;
  const [selectedChoice, setSelectedChoice] = useState(cartChoice ?? choiceOptions[0]?.name ?? '');
  const selectedPrice = choiceOptions.find((option) => option.name === selectedChoice)?.price ?? product.price;
  const pairs = product.pair_ids.map((id) => products.find((item) => item.id === id)).filter((item): item is Product => Boolean(item));
  const isFlowProduct = Boolean(flowAction && isProductInCategory(product, flowAction.categoryId));
  const hasFactValue = (value: string) => {
    const normalized = value.trim().toLocaleLowerCase('ru');
    return Boolean(normalized) && !/^0(?:[.,]0+)?(?:\s*[а-яa-z.]+)?$/i.test(normalized);
  };
  const hasIngredients = hasFactValue(product.ingredients);
  const hasWeight = hasFactValue(product.weight);
  const hasServing = hasFactValue(product.serving);

  const addProduct = () => {
    add(product, selectedChoice || undefined);
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
          <strong>{formatPrice(selectedPrice)}</strong>
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
          <dt>Подаётся</dt>
          <dd>{product.serving}</dd>
        </div>}
      </dl>}

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

      <div className="quantity">
        <button
          type="button"
          onClick={() => {
            decrement(product.id);
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
        {isLimitedProduct(product) && getCurrentStock(product) <= 0 ? 'Закончилось' : `Добавить в корзину - ${formatPrice(selectedPrice)}`}
      </button>
      {isFlowProduct && flowAction?.selectedId && (
        <button className="flow-continue-bar flow-continue-bar--inline" type="button" onClick={flowAction.onContinue}>
          Продолжить <ArrowRight />
        </button>
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
    const title = document.title || 'WayCatalog';
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
  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: catalogQueryKey,
    queryFn: () => loadCatalogWithTimeout(catalogSlug),
    initialData: cachedCatalog?.data,
    initialDataUpdatedAt: cachedCatalog?.savedAt,
    placeholderData: () => ({
      restaurant: makeLoadingRestaurant(catalogSlug),
      categories: demoCategories,
      products: demoProducts,
      cabins: demoCabins,
      tags: defaultTags,
      theme: demoThemeSettings,
      photoQuality: DEFAULT_PHOTO_QUALITY_SETTINGS,
      source: 'demo' as const
    } as CatalogSnapshot),
    staleTime: 2 * 60_000,
    retry: 1,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true
  });
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
  const [photoQuality, setPhotoQuality] = useState<PhotoQualitySettings>(DEFAULT_PHOTO_QUALITY_SETTINGS);
  const [restaurantOrders, setRestaurantOrders] = useState<RestaurantOrder[]>([]);
  const [deliverySettings, setDeliverySettings] = useState<RestaurantDeliverySettings | null>(
    () => readDeliverySettingsCache(catalogSlug)
  );
  const [loadingGraceExpired, setLoadingGraceExpired] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState<RestaurantPaymentSettings>(() => loadPaymentSettings(catalogSlug));
  const [, setStockTargets] = useState<StockTargets>(() => loadStockTargets());
  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clear);
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
    const intervalId = window.setInterval(refreshWhenVisible, 30_000);

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
    setAdminSessionChecked(false);
    void hasAdminSession(catalogSlug).then((hasSession) => {
      if (!isCurrentCatalog) return;
      setAdmin(hasSession);
      setAdminSessionChecked(true);
    }).catch((error) => {
      console.error('Restaurant session restoration failed', error);
      if (!isCurrentCatalog) return;
      setAdmin(false);
      setAdminSessionChecked(true);
    });
    const unsubscribe = onAdminSessionChange((hasSession) => {
      if (!isCurrentCatalog) return;
      setAdmin(hasSession);
      setAdminSessionChecked(true);
    }, catalogSlug);
    return () => {
      isCurrentCatalog = false;
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

  const changeOrderStatus = async (order: RestaurantOrder, status: RestaurantOrderStatus, reason = '') => {
    try {
      await updateRestaurantOrderStatus(order, status, reason);
      setRestaurantOrders((current) =>
        current.map((item) => (item.id === order.id ? { ...item, status } : item))
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
          onBack={openRestaurantSettingsHub}
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
      products={catalog.products}
      orders={restaurantOrders}
      routeSection={routeSection}
      routeOrderId={routeOrderId}
      paymentSettings={paymentSettings}
      deliverySettings={deliverySettings}
      onOpenScreen={setScreen}
      onOpenCatalog={() => {
        setCatalogCategory('all');
        setScreen('catalog');
        const targetPath = `/${catalogSlug}/dishes`;
        rememberPwaResumePath(targetPath);
        navigate(targetPath, { replace: true });
      }}
      onAddDish={() => setAdminEditor('dish')}
      onOrderStatus={changeOrderStatus}
      onOrderDelete={(order) => changeOrderStatus(order, 'cancelled', 'restaurant_deleted')}
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
        '--dish-photo-filter': getPhotoQualityFilter(photoQuality),
        ...(screen.startsWith('settings') ? settingsAccentStyle : {})
      } as CSSProperties}
    >
      <Toaster richColors position="top-center" />
      {(screen === 'admin-home' || screen.startsWith('settings')) && !isAdmin ? (
        adminSessionChecked ? (
          <LoginModal
            catalogSlug={catalogSlug}
            onClose={() => setScreen('home')}
            onSuccess={() => openRestaurantAdminPath(screen === 'settings-payments' ? 'settings-payments' : 'admin-home')}
          />
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
            title={screen === 'product' ? undefined : title}
            canBack={screen !== 'home'}
            onBack={() => {
              if (isAdmin && routeSection === 'dishes') {
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
            onSearch={screen === 'home' ? openCatalogSearch : undefined}
            onShare={screen === 'home' ? shareCurrentPage : undefined}
            onCart={() => setIsCartOpen(true)}
            onAdmin={() => setShowLogin(true)}
            logoUrl={catalog.restaurant.logo_url}
            restaurantName={catalog.restaurant.name}
            restaurantSubtitle={catalog.restaurant.subtitle}
            showBrand={screen !== 'home'}
            showCart
          />

          {screen === 'home' && (
            <CatalogScreen
              restaurant={catalog.restaurant}
              categories={catalog.categories}
              products={catalog.products}
              deliverySettings={deliverySettings}
              initialCategory="all"
              onCart={() => setIsCartOpen(true)}
              onShare={shareCurrentPage}
              onBack={() => navigate('/')}
              onOpenProduct={openProduct}
              onEditProduct={editProduct}
              onDeleteProduct={deleteProduct}
              onToggleProduct={toggleProduct}
              onStockChange={updateProductStock}
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
              deliverySettings={deliverySettings ?? defaultRestaurantDeliverySettings}
              paymentSettings={paymentSettings}
              onEditCart={() => setIsCartOpen(true)}
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
          <CartBar
            deliverySettings={deliverySettings}
            onCheckout={() => setIsCartOpen(true)}
            onContinue={continueFromCartBar}
          />
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
