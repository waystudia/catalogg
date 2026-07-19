import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Banknote,
  Bell,
  Bike,
  Building2,
  Car,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock,
  ExternalLink,
  Grid2X2,
  Heart,
  Home,
  LocateFixed,
  LogOut,
  MapPin,
  MessageCircle,
  Minus,
  PackageCheck,
  Phone,
  Plus,
  QrCode,
  ReceiptText,
  Repeat2,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Truck,
  User,
  UserRoundCheck,
  WalletCards
} from 'lucide-react';
import type { CSSProperties, FormEvent } from 'react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { buildOrderAfterClientPaymentNotice, buildRestaurantPublicPath, buildSupportWhatsappUrl, buildYandexMapsUrl, calculateCartSummary, filterRestaurants, filterRestaurantsWithCityFallback, getDeliveryProviderLabel, mergeClientOrderRealtimePatch, requireSavedRestaurantOrderId, resolveCheckoutSettlement, selectClientOrderForStatus } from '../../features/client-platform/clientPlatformLogic';
import { clientPlatformSnapshot, fallbackPaymentSettings } from '../../features/client-platform/mockData';
import {
  selectAllCartCount,
  selectCheckoutDraft,
  selectRestaurantCart,
  useClientPlatformStore
} from '../../features/client-platform/store';
import type {
  ClientAddress,
  ClientCartLine,
  ClientCheckoutDraft,
  ClientDeliveryProvider,
  ClientDish,
  ClientOrder,
  ClientOrderStatus,
  ClientOrderType,
  ClientPaymentMethod,
  ClientPlatformCategory,
  ClientPlatformSnapshot,
  ClientRestaurant,
  PlatformBanner
} from '../../features/client-platform/types';
import {
  createClientPlatformOrder,
  getClientPlatformSnapshot,
  saveClientReview,
  saveClientSignup,
  subscribeClientOrderRealtime,
  subscribeClientPlatformSnapshotRealtime
} from '../../shared/api/clientPlatformApi';
import { DeliveryMapPicker } from '../../shared/DeliveryMapPicker';
import type { DeliveryLocationSearchResult } from '../../shared/deliveryGeocoder';
import { DeliveryTrackingMap } from '../../shared/DeliveryTrackingMap';
import { submitSettlementRequest } from '../../shared/api/settlementsApi';
import { buildYandexMapsRouteUrl } from '../../features/order/orderLifecycle';
import { resolveLoginRedirect } from '../../shared/api/loginRedirectApi';
import { signOutPlatformAdmin } from '../../shared/api/platformAdminApi';
import { createRestaurantOrderIdempotencyKey } from '../../shared/api/restaurantOrderPayload';
import {
  chooseMoreAccuratePosition,
  DELIVERY_GEOLOCATION_OPTIONS,
  DELIVERY_LOCATION_TIMEOUT_MS,
  DELIVERY_TARGET_ACCURACY_M,
  deliveryPositionIsAccurateEnough,
  getDeliveryGeolocationErrorMessage,
  getDeliveryLowAccuracyMessage,
  deliveryGeolocationTimeoutMessage,
  normalizeDeliveryCoordinates,
  type DeliveryCoordinates
} from '../../shared/deliveryLocation';
import { clearPwaResumePath, rememberPwaResumePath } from '../../shared/pwaSession';
import './client-platform.css';

const clientPlatformQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always'
    }
  }
});
const clientPlatformLoadingSnapshot: ClientPlatformSnapshot = {
  ...clientPlatformSnapshot,
  cities: [],
  restaurants: [],
  restaurantCategories: [],
  dishes: [],
  banners: []
};

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

const orderTypeLabels: Record<ClientOrderType, string> = {
  dine_in: 'В зале',
  pickup: 'На вынос',
  delivery: 'Доставка'
};

const paymentMethodLabels: Record<ClientPaymentMethod, string> = {
  qr: 'QR-код',
  bank_transfer: 'Банковский перевод',
  cash: 'Наличными'
};

const statusLabels: Record<ClientOrderStatus, string> = {
  new: 'Новый',
  waiting_payment_confirmation: 'Ожидает подтверждения оплаты',
  payment_confirmed: 'Оплата подтверждена',
  accepted: 'Принят',
  cooking: 'Готовится',
  ready: 'Готов',
  waiting_driver: 'Ожидает курьера',
  assigned_driver: 'Курьер назначен',
  picked_up: 'Заказ забран',
  on_the_way: 'В пути',
  completed: 'Доставлен',
  canceled: 'Отменён'
};

const toClientOrderStatus = (status: string | undefined): ClientOrderStatus | undefined => {
  if (!status) return undefined;
  if (status === 'preparing') return 'cooking';
  if (status === 'confirmed') return 'accepted';
  if (status === 'waiting_courier') return 'waiting_driver';
  if (status === 'assigned' || status === 'arrived_to_restaurant') return 'assigned_driver';
  if (status === 'handed_over') return 'picked_up';
  if (status === 'arrived_to_client') return 'on_the_way';
  if (status === 'driver_assigned') return 'assigned_driver';
  if (status === 'delivered') return 'completed';
  if (status === 'cancelled') return 'canceled';
  if (
    status === 'new' ||
    status === 'waiting_payment_confirmation' ||
    status === 'payment_confirmed' ||
    status === 'accepted' ||
    status === 'cooking' ||
    status === 'ready' ||
    status === 'waiting_driver' ||
    status === 'assigned_driver' ||
    status === 'picked_up' ||
    status === 'on_the_way' ||
    status === 'completed' ||
    status === 'canceled'
  ) {
    return status;
  }

  return undefined;
};

const providerIcons: Record<ClientDeliveryProvider, typeof Truck> = {
  restaurant: Store,
  platform: Bike,
  pickup: PackageCheck,
  dine_in: Home
};

const restaurantCssVars = (restaurant: ClientRestaurant) =>
  ({
    '--restaurant-accent': restaurant.theme.accentColor,
    '--restaurant-bg': restaurant.theme.backgroundColor,
    '--restaurant-button': restaurant.theme.buttonColor,
    '--restaurant-button-text': restaurant.theme.buttonTextColor,
    '--restaurant-card': restaurant.theme.cardColor,
    '--restaurant-text': restaurant.theme.textColor,
    '--restaurant-muted': restaurant.theme.mutedTextColor
  }) as CSSProperties;

const getRestaurantDishes = (snapshot: ClientPlatformSnapshot, slug: string) =>
  snapshot.dishes.filter((dish) => dish.restaurantSlug === slug);

const getRestaurantCategories = (snapshot: ClientPlatformSnapshot, slug: string) =>
  snapshot.restaurantCategories
    .filter((category) => category.restaurantSlug === slug)
    .sort((left, right) => left.sortOrder - right.sortOrder);

const getPaymentSettings = (snapshot: ClientPlatformSnapshot, restaurantSlug: string) =>
  snapshot.paymentSettings.find((settings) => settings.restaurantSlug === restaurantSlug) ?? {
    ...fallbackPaymentSettings,
    restaurantSlug
  };

const getRestaurantBySlug = (snapshot: ClientPlatformSnapshot, slug?: string) =>
  snapshot.restaurants.find((restaurant) => restaurant.slug === slug);

const getCityIdFromSearch = (snapshot: ClientPlatformSnapshot, citySlug: string | null) =>
  snapshot.cities.find((city) => city.slug === citySlug || city.id === citySlug)?.id;

const getPromoDetailPath = (banner: PlatformBanner) => `/promo/${encodeURIComponent(banner.id)}`;

const isVideoMediaUrl = (url: string) => /\.(mp4|webm|ogg)(?:[?#].*)?$/i.test(url.trim());

const countRestaurantsForCity = (snapshot: ClientPlatformSnapshot, cityId: string) =>
  filterRestaurants(snapshot.restaurants, { cityId, categorySlug: 'all', query: '' }).length;

const formatRestaurantCount = (count: number) => {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return `${count} ресторанов`;
  if (lastDigit === 1) return `${count} ресторан`;
  if (lastDigit >= 2 && lastDigit <= 4) return `${count} ресторана`;
  return `${count} ресторанов`;
};

const getCityRestaurantsPath = (cityId?: string) => cityId ? `/restaurants?city=${encodeURIComponent(cityId)}` : '/restaurants';

const getDeliveryFee = (restaurant: ClientRestaurant, draft: ClientCheckoutDraft, summary: { subtotal: number }) =>
  draft.orderType === 'delivery' && summary.subtotal > 0 && summary.subtotal < restaurant.freeDeliveryFrom ? 120 : 0;

function usePlatformData() {
  return useQuery({
    queryKey: ['client-platform'],
    queryFn: getClientPlatformSnapshot,
    staleTime: 60_000,
    placeholderData: (previous) => previous
  });
}

export function ClientPlatformApp() {
  return (
    <QueryClientProvider client={clientPlatformQueryClient}>
      <ClientPlatformContent />
    </QueryClientProvider>
  );
}

function ClientPlatformContent() {
  const { data } = usePlatformData();
  const snapshot = data ?? clientPlatformLoadingSnapshot;
  const queryClient = useQueryClient();
  const location = useLocation();
  const { slug } = useParams();

  useEffect(() => subscribeClientPlatformSnapshotRealtime(() => {
    void queryClient.invalidateQueries({ queryKey: ['client-platform'] });
  }), [queryClient]);

  if (location.pathname.startsWith('/r/')) {
    return <RestaurantArea snapshot={snapshot} slug={slug} />;
  }

  if (location.pathname.startsWith('/promo/')) {
    return (
      <PlatformLayout active="home">
        <PromoDetailPage snapshot={snapshot} bannerId={decodeURIComponent(location.pathname.replace('/promo/', ''))} />
      </PlatformLayout>
    );
  }

  if (location.pathname.startsWith('/profile')) {
    return <ProfileArea snapshot={snapshot} />;
  }

  if (location.pathname === '/city') {
    return (
      <PlatformLayout active="home">
        <CityPage snapshot={snapshot} />
      </PlatformLayout>
    );
  }

  if (location.pathname === '/categories') {
    return (
      <PlatformLayout active="search">
        <CategoriesPage snapshot={snapshot} />
      </PlatformLayout>
    );
  }

  if (location.pathname === '/restaurants') {
    return (
      <PlatformLayout active="search">
        <RestaurantsPage snapshot={snapshot} />
      </PlatformLayout>
    );
  }

  if (location.pathname === '/cart') {
    return (
      <PlatformLayout active="cart">
        <PlatformCartPage snapshot={snapshot} />
      </PlatformLayout>
    );
  }

  return (
    <PlatformLayout active="home">
      <HomePage snapshot={snapshot} />
    </PlatformLayout>
  );
}

function PlatformLayout({
  active,
  children
}: {
  active: 'home' | 'search' | 'cart' | 'orders' | 'profile';
  children: ReactNode;
}) {
  const cartCount = useClientPlatformStore((state) => selectAllCartCount(state.carts));

  return (
    <div className="client-platform platform-theme">
      <div className="platform-page">{children}</div>
      <BottomNav active={active} cartCount={cartCount} />
    </div>
  );
}

function PageHeader({
  title,
  backTo = '/',
  action
}: {
  title: string;
  backTo?: string;
  action?: ReactNode;
}) {
  return (
    <header className="platform-header">
      <Link className="icon-button" to={backTo} aria-label="Назад">
        <ArrowLeft />
      </Link>
      <h1>{title}</h1>
      <div className="platform-header__action">
        {action ?? (
          <button className="icon-button" type="button" onClick={() => window.location.reload()} aria-label="Обновить">
            <RefreshCw />
          </button>
        )}
      </div>
    </header>
  );
}

function BottomNav({
  active,
  cartCount
}: {
  active: 'home' | 'search' | 'cart' | 'orders' | 'profile';
  cartCount: number;
}) {
  const items = [
    { id: 'home', label: 'Главная', to: '/', Icon: Home },
    { id: 'search', label: 'Поиск', to: '/restaurants', Icon: Search },
    { id: 'cart', label: 'Корзина', to: '/cart', Icon: ShoppingCart },
    { id: 'orders', label: 'Заказы', to: '/profile/orders', Icon: ReceiptText },
    { id: 'profile', label: 'Профиль', to: '/profile', Icon: User }
  ] as const;

  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {items.map(({ id, label, to, Icon }) => (
        <Link className={active === id ? 'is-active' : ''} to={to} key={id}>
          <span className="bottom-nav__icon">
            <Icon />
            {id === 'cart' && cartCount > 0 && <b>{cartCount}</b>}
          </span>
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

function HomePage({ snapshot }: { snapshot: ClientPlatformSnapshot }) {
  const navigate = useNavigate();
  const selectedCityId = useClientPlatformStore((state) => state.selectedCityId);
  const city = snapshot.cities.find((item) => item.id === selectedCityId);
  const restaurants = filterRestaurantsWithCityFallback(snapshot.restaurants, { cityId: selectedCityId })
    .slice()
    .sort((left, right) => right.rating - left.rating);
  const banners = snapshot.banners.filter((item) => item.isActive);
  const [query, setQuery] = useState('');

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(`/restaurants?query=${encodeURIComponent(query)}`);
  };

  return (
    <>
      <header className="home-topbar">
        <Link className="city-pill" to="/city">
          <MapPin />
          <span>{city?.name ?? 'Выбрать город'}</span>
        </Link>
        <button className="icon-button" type="button" aria-label="Уведомления">
          <Bell />
        </button>
      </header>

      <form className="platform-search" onSubmit={submitSearch}>
        <Search />
        <input
          aria-label="Поиск блюд и ресторанов"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск блюд и ресторанов"
          type="search"
        />
      </form>

      <PromoCarousel banners={banners.length > 0 ? banners : snapshot.banners.slice(0, 1)} />

      <SectionHeader title="Популярные рестораны" to={getCityRestaurantsPath(city?.id)} />
      {restaurants.length > 0 ? (
        <div className="restaurant-grid">
          {restaurants.slice(0, 4).map((restaurant) => (
            <RestaurantCard restaurant={restaurant} categories={snapshot.categories} key={restaurant.id} />
          ))}
        </div>
      ) : (
        <section className="empty-state empty-state--compact">
          <Store />
          <strong>Рестораны пока не подключены</strong>
          <Link to="/city">Выбрать другое место</Link>
        </section>
      )}

      <SectionHeader title="Категории" to="/categories" />
      <div className="category-quick-grid">
        {snapshot.categories.slice(0, 6).map((category) => (
          <Link className="category-quick-card" to={`/restaurants?category=${category.slug}`} key={category.id}>
            <img src={category.imageUrl} alt="" />
            <span>{category.name}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

function PromoCarousel({ banners }: { banners: PlatformBanner[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const bannerIds = banners.map((banner) => banner.id).join('|');

  useEffect(() => {
    setActiveIndex(0);
    trackRef.current?.scrollTo({ left: 0 });
  }, [bannerIds]);

  useEffect(() => {
    if (banners.length < 2) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((index) => {
        const nextIndex = (index + 1) % banners.length;
        const track = trackRef.current;
        if (track) track.scrollTo({ left: nextIndex * track.clientWidth, behavior: 'smooth' });
        return nextIndex;
      });
    }, 5000);

    return () => window.clearInterval(timer);
  }, [banners.length]);

  if (banners.length === 0) return null;

  return (
    <section className="promo-carousel" aria-label="Баннеры">
      <div
        className="promo-carousel__track"
        ref={trackRef}
        onScroll={(event) => {
          const width = event.currentTarget.clientWidth;
          if (width > 0) setActiveIndex(Math.round(event.currentTarget.scrollLeft / width));
        }}
      >
        {banners.map((banner) => (
          <article
            className={banner.imageUrl ? 'promo-band promo-band--media' : 'promo-band'}
            style={{ backgroundColor: banner.backgroundColor }}
            key={banner.id}
          >
            {banner.imageUrl && (
              <span className="promo-band__media">
                {isVideoMediaUrl(banner.imageUrl)
                  ? <video src={banner.imageUrl} muted playsInline autoPlay loop />
                  : <img src={banner.imageUrl} alt="" />}
              </span>
            )}
            <div>
              <strong>{banner.title}</strong>
              <span>{banner.subtitle}</span>
            </div>
            <Link to={getPromoDetailPath(banner)}>Подробнее</Link>
          </article>
        ))}
      </div>
      <div className="promo-carousel__dots" aria-label={`Баннер ${activeIndex + 1} из ${banners.length}`}>
        {banners.map((banner, index) => (
          <button
            className={index === activeIndex ? 'is-active' : ''}
            type="button"
            onClick={() => {
              setActiveIndex(index);
              const track = trackRef.current;
              if (track) track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
            }}
            aria-label={`Показать баннер ${index + 1}`}
            aria-current={index === activeIndex ? 'true' : undefined}
            key={banner.id}
          />
        ))}
      </div>
    </section>
  );
}

function PromoDetailPage({
  snapshot,
  bannerId
}: {
  snapshot: ClientPlatformSnapshot;
  bannerId: string;
}) {
  const banner = snapshot.banners.find((item) => item.id === bannerId);

  if (!banner) {
    return (
      <>
        <PageHeader title="Баннер" />
        <section className="empty-state">
          <Bell />
          <strong>Баннер не найден</strong>
          <Link to="/">На главную</Link>
        </section>
      </>
    );
  }

  const hasActionLink = banner.linkUrl.trim().length > 0;
  const actionIsExternal = /^https?:\/\//i.test(banner.linkUrl);

  return (
    <>
      <PageHeader title={banner.title} />
      <article className="promo-detail">
        {banner.imageUrl && (
          <div className="promo-detail__media">
            {isVideoMediaUrl(banner.imageUrl)
              ? <video src={banner.imageUrl} controls playsInline />
              : <img src={banner.imageUrl} alt="" />}
          </div>
        )}
        <span>{banner.kind}</span>
        <h2>{banner.title}</h2>
        <p>{banner.subtitle}</p>
        {hasActionLink && (
          actionIsExternal ? (
            <a href={banner.linkUrl} target="_blank" rel="noreferrer">
              Открыть
            </a>
          ) : (
            <Link to={banner.linkUrl}>
              Открыть
            </Link>
          )
        )}
      </article>
    </>
  );
}

function SectionHeader({ title, to }: { title: string; to: string }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      <Link to={to}>Смотреть все</Link>
    </div>
  );
}

function CityPage({ snapshot }: { snapshot: ClientPlatformSnapshot }) {
  const navigate = useNavigate();
  const selectedCityId = useClientPlatformStore((state) => state.selectedCityId);
  const recentCityIds = useClientPlatformStore((state) => state.recentCityIds);
  const setSelectedCity = useClientPlatformStore((state) => state.setSelectedCity);
  const [query, setQuery] = useState('');
  const [otherSettlement, setOtherSettlement] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const citiesWithRestaurantsFirst = snapshot.cities
    .slice()
    .sort((left, right) => countRestaurantsForCity(snapshot, right.id) - countRestaurantsForCity(snapshot, left.id));
  const nearestCityId = citiesWithRestaurantsFirst.find((city) => countRestaurantsForCity(snapshot, city.id) > 0)?.id ??
    citiesWithRestaurantsFirst[0]?.id ??
    '';
  const filteredCities = citiesWithRestaurantsFirst.filter((city) =>
    `${city.name} ${city.region}`.toLocaleLowerCase('ru-RU').includes(query.toLocaleLowerCase('ru-RU').trim())
  );
  const recentCities = recentCityIds
    .map((cityId) => snapshot.cities.find((city) => city.id === cityId))
    .filter((city): city is NonNullable<typeof city> => Boolean(city));

  const chooseCity = (cityId: string) => {
    setSelectedCity(cityId);
    navigate('/');
  };

  const submitOtherSettlement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = otherSettlement.trim();
    if (!value) return;
    setIsSubmittingRequest(true);
    setRequestMessage('');
    try {
      await submitSettlementRequest({ cityName: '', settlementName: value, source: 'city_picker' });
      setRequestMessage('Заявка отправлена суперадмину. Мы добавим населённый пункт в справочник.');
      setOtherSettlement('');
    } catch (error) {
      setRequestMessage(error instanceof Error ? error.message : 'Не удалось отправить заявку.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  return (
    <>
      <PageHeader title="Выбор города" />
      <label className="platform-search">
        <Search />
        <input
          aria-label="Поиск города или села"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск города или села"
          type="search"
        />
      </label>
      <button className="wide-action" type="button" disabled={!nearestCityId} onClick={() => chooseCity(nearestCityId)}>
        <LocateFixed />
        Показать ближайшие рестораны
      </button>
      {recentCities.length > 0 && (
        <section className="plain-section">
          <h2>Недавние</h2>
          <div className="chip-row">
            {recentCities.map((city) => (
              <button
                className={city.id === selectedCityId ? 'filter-chip is-active' : 'filter-chip'}
                type="button"
                onClick={() => chooseCity(city.id)}
                key={city.id}
              >
                {city.name}
                <small>{formatRestaurantCount(countRestaurantsForCity(snapshot, city.id))}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      <section className="plain-section">
        <h2>Все города и сёла</h2>
        {filteredCities.length > 0 ? (
          <div className="city-list">
            {filteredCities.map((city) => (
              <button className="city-row" type="button" onClick={() => chooseCity(city.id)} key={city.id}>
                <span>
                  <strong>{city.name}</strong>
                  <small>
                    {countRestaurantsForCity(snapshot, city.id) > 0
                      ? formatRestaurantCount(countRestaurantsForCity(snapshot, city.id))
                      : 'Пока нет ресторанов'}
                    {city.region ? ` · ${city.region}` : ''}
                  </small>
                </span>
                {city.id === selectedCityId ? <Check /> : <ChevronRight />}
              </button>
            ))}
          </div>
        ) : (
          <p className="city-list-empty">Населённые пункты не найдены.</p>
        )}
      </section>
      <section className="plain-section city-other-section">
        <h2>Другие села</h2>
        <p>Не нашли свой населённый пункт? Напишите его, и суперадмин добавит его в справочник.</p>
        <form className="other-settlement-form" onSubmit={(event) => void submitOtherSettlement(event)}>
          <input
            value={otherSettlement}
            onChange={(event) => setOtherSettlement(event.target.value)}
            placeholder="Введите село или город"
            aria-label="Другое село или город"
          />
          <button type="submit" disabled={isSubmittingRequest || !otherSettlement.trim()}>
            {isSubmittingRequest ? 'Отправляем...' : 'Отправить заявку'}
          </button>
        </form>
        {requestMessage && <p className="form-message">{requestMessage}</p>}
      </section>
    </>
  );
}

function CategoriesPage({ snapshot }: { snapshot: ClientPlatformSnapshot }) {
  return (
    <>
      <PageHeader title="Категории" />
      <div className="category-tile-grid">
        {snapshot.categories.map((category) => (
          <Link className="category-tile" to={`/restaurants?category=${category.slug}`} key={category.id}>
            <img src={category.imageUrl} alt="" />
            <strong>{category.name}</strong>
          </Link>
        ))}
      </div>
      <Link className="wide-link" to="/restaurants">
        <Grid2X2 />
        Все категории
      </Link>
    </>
  );
}

function RestaurantsPage({ snapshot }: { snapshot: ClientPlatformSnapshot }) {
  const selectedCityId = useClientPlatformStore((state) => state.selectedCityId);
  const [searchParams, setSearchParams] = useSearchParams();
  const cityId = getCityIdFromSearch(snapshot, searchParams.get('city')) ?? selectedCityId;
  const categorySlug = searchParams.get('category') ?? 'all';
  const queryParam = searchParams.get('query') ?? '';
  const [query, setQuery] = useState(queryParam);
  const restaurants = filterRestaurantsWithCityFallback(snapshot.restaurants, { cityId, categorySlug, query });

  const setCategory = (slug: string) => {
    const next = new URLSearchParams(searchParams);
    if (slug === 'all') {
      next.delete('category');
    } else {
      next.set('category', slug);
    }
    setSearchParams(next);
  };

  return (
    <>
      <PageHeader title="Рестораны" />
      <label className="platform-search">
        <Search />
        <input
          aria-label="Поиск ресторанов"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск ресторанов"
          type="search"
        />
      </label>
      <div className="chip-row chip-row--scroll">
        <button className={categorySlug === 'all' ? 'filter-chip is-active' : 'filter-chip'} type="button" onClick={() => setCategory('all')}>
          Все
        </button>
        {snapshot.categories.map((category) => (
          <button
            className={categorySlug === category.slug ? 'filter-chip is-active' : 'filter-chip'}
            type="button"
            onClick={() => setCategory(category.slug)}
            key={category.id}
          >
            {category.name}
          </button>
        ))}
      </div>
      <div className="restaurant-list">
        {restaurants.map((restaurant) => (
          <RestaurantListItem restaurant={restaurant} categories={snapshot.categories} key={restaurant.id} />
        ))}
      </div>
    </>
  );
}

function RestaurantCard({
  restaurant,
  categories
}: {
  restaurant: ClientRestaurant;
  categories: ClientPlatformCategory[];
}) {
  const categoryNames = categories
    .filter((category) => restaurant.categorySlugs.includes(category.slug))
    .map((category) => category.name)
    .slice(0, 3)
    .join(' · ');
  const hasDelivery = restaurant.orderTypes.includes('delivery') &&
    (restaurant.deliveryProvider === 'platform' || restaurant.deliveryProvider === 'restaurant');

  return (
    <Link className="restaurant-card" to={buildRestaurantPublicPath(restaurant)}>
      <img src={restaurant.coverUrl} alt="" />
      <span className="restaurant-card__body">
        <span className="restaurant-card__title">
          <strong>{restaurant.name}</strong>
          <small>
            <Star /> {restaurant.rating}
          </small>
        </span>
        <small>{categoryNames}</small>
        <b>от {formatPrice(restaurant.minOrderAmount)} · {restaurant.deliveryTimeFrom}-{restaurant.deliveryTimeTo} мин</b>
        {hasDelivery && restaurant.freeDeliveryFrom > 0 && (
          <em>Бесплатная доставка от {formatPrice(restaurant.freeDeliveryFrom)}</em>
        )}
      </span>
    </Link>
  );
}

function RestaurantListItem({
  restaurant,
  categories
}: {
  restaurant: ClientRestaurant;
  categories: ClientPlatformCategory[];
}) {
  const ProviderIcon = providerIcons[restaurant.deliveryProvider];
  const categoryNames = categories
    .filter((category) => restaurant.categorySlugs.includes(category.slug))
    .map((category) => category.name)
    .slice(0, 3)
    .join(' · ');

  return (
    <Link className="restaurant-list-item" to={buildRestaurantPublicPath(restaurant)}>
      <img src={restaurant.coverUrl} alt="" />
      <span>
        <strong>{restaurant.name}</strong>
        <small>{categoryNames}</small>
        <small>от {formatPrice(restaurant.minOrderAmount)} · {restaurant.deliveryTimeFrom}-{restaurant.deliveryTimeTo} мин</small>
        <em>
          <ProviderIcon />
          {getDeliveryProviderLabel(restaurant.deliveryProvider)}
        </em>
      </span>
      <b>
        <Star /> {restaurant.rating}
      </b>
    </Link>
  );
}

function RestaurantArea({
  snapshot,
  slug
}: {
  snapshot: ClientPlatformSnapshot;
  slug?: string;
}) {
  const restaurant = getRestaurantBySlug(snapshot, slug);
  const location = useLocation();

  if (!restaurant) {
    return (
      <div className="client-platform platform-theme">
        <div className="platform-page">
          <PageHeader title="Ресторан не найден" backTo="/restaurants" />
          <Link className="wide-link" to="/restaurants">
            <Store />
            К ресторанам
          </Link>
        </div>
      </div>
    );
  }

  const routeSegments = location.pathname.split('/').filter(Boolean);
  const section = routeSegments[2] ?? 'catalog';
  const orderId = routeSegments[3];

  return (
    <div className="restaurant-client" style={restaurantCssVars(restaurant)}>
      {section === 'cart' ? (
        <CartPage snapshot={snapshot} restaurant={restaurant} />
      ) : section === 'checkout' ? (
        <CheckoutPage snapshot={snapshot} restaurant={restaurant} />
      ) : section === 'address' ? (
        <AddressPage restaurant={restaurant} />
      ) : section === 'payment' && location.pathname.endsWith('/confirm') ? (
        <PaymentConfirmPage snapshot={snapshot} restaurant={restaurant} />
      ) : section === 'payment' ? (
        <PaymentPage snapshot={snapshot} restaurant={restaurant} />
      ) : section === 'order' ? (
        <OrderStatusPage snapshot={snapshot} restaurant={restaurant} orderId={orderId} />
      ) : (
        <RestaurantCatalogPage snapshot={snapshot} restaurant={restaurant} />
      )}
    </div>
  );
}

function RestaurantTopbar({ restaurant, title }: { restaurant: ClientRestaurant; title?: string }) {
  const navigate = useNavigate();

  return (
    <header className="restaurant-topbar">
      <button className="restaurant-icon-button" type="button" onClick={() => navigate(-1)} aria-label="Назад">
        <ArrowLeft />
      </button>
      <Link className="restaurant-home-link" to="/">
        <Home />
        Главное меню
      </Link>
      <strong>{title ?? restaurant.name}</strong>
    </header>
  );
}

function RestaurantCatalogPage({
  snapshot,
  restaurant
}: {
  snapshot: ClientPlatformSnapshot;
  restaurant: ClientRestaurant;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const favoriteRestaurantIds = useClientPlatformStore((state) => state.favoriteRestaurantIds);
  const favoriteDishIds = useClientPlatformStore((state) => state.favoriteDishIds);
  const toggleFavoriteRestaurant = useClientPlatformStore((state) => state.toggleFavoriteRestaurant);
  const toggleFavoriteDish = useClientPlatformStore((state) => state.toggleFavoriteDish);
  const addDish = useClientPlatformStore((state) => state.addDish);
  const cartLines = useClientPlatformStore((state) => selectRestaurantCart(state.carts, restaurant.slug));
  const restaurantCategories = getRestaurantCategories(snapshot, restaurant.slug);
  const dishes = getRestaurantDishes(snapshot, restaurant.slug);
  const activeCategory = searchParams.get('category') ?? 'all';
  const visibleDishes = dishes.filter((dish) =>
    activeCategory === 'all' || activeCategory === 'popular' ? dish.isPopular : dish.categorySlug === activeCategory
  );
  const summary = calculateCartSummary(cartLines, dishes, 0);
  const ProviderIcon = providerIcons[restaurant.deliveryProvider];

  return (
    <>
      <RestaurantTopbar restaurant={restaurant} />
      <section className="restaurant-hero">
        <img src={restaurant.coverUrl} alt="" />
        <div className="restaurant-hero__content">
          <span className="restaurant-logo">{restaurant.logoUrl ? <img src={restaurant.logoUrl} alt="" /> : restaurant.name.slice(0, 1)}</span>
          <button
            className={favoriteRestaurantIds.includes(restaurant.id) ? 'restaurant-round is-active' : 'restaurant-round'}
            type="button"
            onClick={() => toggleFavoriteRestaurant(restaurant.id)}
            aria-label="Добавить ресторан в избранное"
          >
            <Heart />
          </button>
          <h1>{restaurant.name}</h1>
          <p>{restaurant.description}</p>
          <div className="restaurant-facts">
            <span>
              <Star /> {restaurant.rating}
            </span>
            <span>
              <Clock /> {restaurant.deliveryTimeFrom}-{restaurant.deliveryTimeTo} мин
            </span>
            <span>от {formatPrice(restaurant.minOrderAmount)}</span>
            <span>
              <ProviderIcon />
              {getDeliveryProviderLabel(restaurant.deliveryProvider)}
            </span>
          </div>
        </div>
      </section>

      <main className="restaurant-content">
        <div className="restaurant-chip-row">
          <button className={activeCategory === 'all' ? 'is-active' : ''} type="button" onClick={() => setSearchParams({})}>
            Все
          </button>
          {restaurantCategories.map((category) => (
            <button
              className={activeCategory === category.slug ? 'is-active' : ''}
              type="button"
              onClick={() => setSearchParams({ category: category.slug })}
              key={category.id}
            >
              {category.name}
            </button>
          ))}
        </div>

        <section className="restaurant-section">
          <h2>Категории</h2>
          <div className="restaurant-category-grid">
            {restaurantCategories.map((category) => (
              <button type="button" onClick={() => setSearchParams({ category: category.slug })} key={category.id}>
                <img src={category.imageUrl} alt="" />
                <span>{category.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="restaurant-section">
          <h2>{activeCategory === 'all' ? 'Популярное' : restaurantCategories.find((category) => category.slug === activeCategory)?.name ?? 'Блюда'}</h2>
          <div className="dish-grid">
            {visibleDishes.map((dish) => (
              <article className="dish-card" key={dish.id}>
                <button
                  className={favoriteDishIds.includes(dish.id) ? 'dish-card__favorite is-active' : 'dish-card__favorite'}
                  type="button"
                  onClick={() => toggleFavoriteDish(dish.id)}
                  aria-label="Добавить блюдо в избранное"
                >
                  <Heart />
                </button>
                <img src={dish.imageUrl} alt="" />
                <div>
                  <strong>{dish.name}</strong>
                  <small>{dish.tags.join(' · ')}</small>
                  <span>{formatPrice(dish.price)}</span>
                </div>
                <button className="dish-add" type="button" onClick={() => addDish(restaurant.slug, dish.id)} aria-label={`Добавить ${dish.name}`}>
                  <Plus />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="restaurant-info-band">
          <a href="https://instagram.com/" target="_blank" rel="noreferrer">Instagram</a>
          <a href="https://wa.me/79280000000" target="_blank" rel="noreferrer">WhatsApp</a>
          <a href="https://yandex.ru/maps/" target="_blank" rel="noreferrer">Местоположение</a>
        </section>
      </main>

      {summary.quantity > 0 && (
        <Link className="restaurant-cart-bar" to={`/r/${restaurant.slug}/cart`}>
          <ShoppingCart />
          <span>В корзине {summary.quantity} товара</span>
          <strong>{formatPrice(summary.total)}</strong>
          <ChevronRight />
        </Link>
      )}
    </>
  );
}

function CartPage({
  snapshot,
  restaurant
}: {
  snapshot: ClientPlatformSnapshot;
  restaurant: ClientRestaurant;
}) {
  const dishes = getRestaurantDishes(snapshot, restaurant.slug);
  const lines = useClientPlatformStore((state) => selectRestaurantCart(state.carts, restaurant.slug));
  const increment = useClientPlatformStore((state) => state.addDish);
  const decrement = useClientPlatformStore((state) => state.decrementDish);
  const summary = calculateCartSummary(lines, dishes, 0);

  return (
    <>
      <RestaurantTopbar restaurant={restaurant} title="Корзина" />
      <main className="restaurant-flow">
        {lines.length === 0 ? (
          <EmptyState title="Корзина пуста" linkTo={`/r/${restaurant.slug}`} linkText="Вернуться в каталог" />
        ) : (
          <>
            <CartLineList lines={lines} dishes={dishes} restaurantSlug={restaurant.slug} onIncrement={increment} onDecrement={decrement} />
            <CartTotal summary={summary} />
            <Link className="restaurant-primary-button" to={`/r/${restaurant.slug}/checkout`}>
              Оформить заказ
            </Link>
          </>
        )}
      </main>
    </>
  );
}

function CartLineList({
  lines,
  dishes,
  restaurantSlug,
  onIncrement,
  onDecrement
}: {
  lines: ClientCartLine[];
  dishes: ClientDish[];
  restaurantSlug: string;
  onIncrement: (restaurantSlug: string, dishId: string) => void;
  onDecrement: (restaurantSlug: string, dishId: string) => void;
}) {
  return (
    <div className="cart-lines">
      {lines.map((line) => {
        const dish = dishes.find((item) => item.id === line.dishId);
        if (!dish) return null;

        return (
          <article className="cart-line" key={line.dishId}>
            <img src={dish.imageUrl} alt="" />
            <span>
              <strong>{dish.name}</strong>
              <small>{line.quantity} x {formatPrice(dish.price)}</small>
            </span>
            <div className="quantity-stepper">
              <button type="button" onClick={() => onDecrement(restaurantSlug, dish.id)} aria-label="Уменьшить количество">
                <Minus />
              </button>
              <b>{line.quantity}</b>
              <button type="button" onClick={() => onIncrement(restaurantSlug, dish.id)} aria-label="Увеличить количество">
                <Plus />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CartTotal({ summary }: { summary: { subtotal: number; deliveryFee: number; total: number } }) {
  return (
    <section className="cart-total">
      <span>
        <small>Сумма блюд</small>
        <b>{formatPrice(summary.subtotal)}</b>
      </span>
      {summary.deliveryFee > 0 && (
        <span>
          <small>Доставка</small>
          <b>{formatPrice(summary.deliveryFee)}</b>
        </span>
      )}
      <strong>
        Итого
        <b>{formatPrice(summary.total)}</b>
      </strong>
    </section>
  );
}

function CheckoutPage({
  snapshot,
  restaurant
}: {
  snapshot: ClientPlatformSnapshot;
  restaurant: ClientRestaurant;
}) {
  const navigate = useNavigate();
  const profile = useClientPlatformStore((state) => state.profile);
  const saveProfile = useClientPlatformStore((state) => state.saveProfile);
  const drafts = useClientPlatformStore((state) => state.checkoutDrafts);
  const updateDraft = useClientPlatformStore((state) => state.updateCheckoutDraft);
  const selectedCityId = useClientPlatformStore((state) => state.selectedCityId);
  const setSelectedCity = useClientPlatformStore((state) => state.setSelectedCity);
  const setOrderType = useClientPlatformStore((state) => state.setDraftOrderType);
  const draft = selectCheckoutDraft(drafts, restaurant.slug);
  const selectedCity = snapshot.cities.find((city) => city.id === selectedCityId);
  const checkoutSettlement = resolveCheckoutSettlement(selectedCity?.name ?? '', draft.deliverySettlement);
  const supportedOrderTypes = restaurant.orderTypes;
  const activeOrderType = supportedOrderTypes.includes(draft.orderType)
    ? draft.orderType
    : supportedOrderTypes[0] ?? 'pickup';
  const lines = useClientPlatformStore((state) => selectRestaurantCart(state.carts, restaurant.slug));
  const dishes = getRestaurantDishes(snapshot, restaurant.slug);
  const summary = calculateCartSummary(lines, dishes, 0);
  const increment = useClientPlatformStore((state) => state.addDish);
  const decrement = useClientPlatformStore((state) => state.decrementDish);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateDraft(restaurant.slug, { orderType: activeOrderType, deliverySettlement: checkoutSettlement });
    saveProfile({ name: draft.clientName || profile.name, phone: draft.clientPhone || profile.phone });
    navigate(activeOrderType === 'delivery' ? `/r/${restaurant.slug}/address` : `/r/${restaurant.slug}/payment`);
  };

  return (
    <>
      <RestaurantTopbar restaurant={restaurant} title="Оформление заказа" />
      <form className="restaurant-flow" onSubmit={submit}>
        <div className="segment-control">
          {supportedOrderTypes.map((orderType) => (
            <button
              className={activeOrderType === orderType ? 'is-active' : ''}
              type="button"
              onClick={() => setOrderType(restaurant.slug, orderType)}
              key={orderType}
            >
              {orderTypeLabels[orderType]}
            </button>
          ))}
        </div>

        {activeOrderType === 'dine_in' && (
          <section className="flow-section">
            <h2>Выбор кабинки</h2>
            <div className="booth-grid">
              {['Кабинка №1', 'Кабинка №2', 'Большая кабинка'].map((booth) => (
                <button
                  className={draft.boothName === booth ? 'is-active' : ''}
                  type="button"
                  onClick={() => updateDraft(restaurant.slug, { boothName: booth })}
                  key={booth}
                >
                  <strong>{booth}</strong>
                  <small>до {booth === 'Большая кабинка' ? 10 : 4} гостей</small>
                </button>
              ))}
            </div>
          </section>
        )}

        {activeOrderType === 'delivery' && (
          <section className="flow-section">
            <label className="field-label">
              <span>Село или город доставки</span>
              <select
                value={checkoutSettlement}
                onChange={(event) => {
                  const nextSettlement = event.target.value;
                  const nextCity = snapshot.cities.find((city) => city.name === nextSettlement);
                  if (nextCity) setSelectedCity(nextCity.id);
                  updateDraft(restaurant.slug, { deliverySettlement: nextSettlement });
                }}
                required
              >
                <option value="">Выберите населённый пункт</option>
                {snapshot.cities.map((city) => <option value={city.name} key={city.id}>{city.name}</option>)}
              </select>
            </label>
            <h2>Контакты</h2>
            <label className="field-label">
              <span>Имя</span>
              <input
                required
                value={draft.clientName || profile.name}
                onChange={(event) => updateDraft(restaurant.slug, { clientName: event.target.value })}
                placeholder="Ваше имя"
              />
            </label>
            <label className="field-label">
              <span>Номер телефона</span>
              <input
                required
                value={draft.clientPhone || profile.phone}
                onChange={(event) => updateDraft(restaurant.slug, { clientPhone: event.target.value })}
                placeholder="+7"
                type="tel"
              />
            </label>
          </section>
        )}

        <section className="flow-section">
          <h2>Ваш заказ</h2>
          <CartLineList
            lines={lines}
            dishes={dishes}
            restaurantSlug={restaurant.slug}
            onIncrement={increment}
            onDecrement={decrement}
          />
          <CartTotal summary={summary} />
        </section>

        <button className="restaurant-primary-button" type="submit" disabled={summary.quantity === 0}>
          Далее
        </button>
      </form>
    </>
  );
}

function AddressPage({ restaurant }: { restaurant: ClientRestaurant }) {
  const navigate = useNavigate();
  const addresses = useClientPlatformStore((state) => state.addresses);
  const addAddress = useClientPlatformStore((state) => state.addAddress);
  const selectAddress = useClientPlatformStore((state) => state.selectDraftAddress);
  const drafts = useClientPlatformStore((state) => state.checkoutDrafts);
  const updateDraft = useClientPlatformStore((state) => state.updateCheckoutDraft);
  const draft = selectCheckoutDraft(drafts, restaurant.slug);
  const [tab, setTab] = useState<'address' | 'map'>('address');
  const [newAddress, setNewAddress] = useState('');
  const [geoError, setGeoError] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const locationSessionRef = useRef<{ watchId: number | null; timeoutId: number | null }>({
    watchId: null,
    timeoutId: null
  });

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

  const applyClientCoordinates = useCallback(
    (coordinates: DeliveryCoordinates) => {
      const { lat, lng, accuracyM } = normalizeDeliveryCoordinates(coordinates);
      updateDraft(restaurant.slug, {
        deliveryLat: lat,
        deliveryLng: lng,
        deliveryAccuracyM: accuracyM,
        deliveryAddress: draft.deliveryAddress || `${lat}, ${lng}`
      });
      setTab('map');

      if (accuracyM > DELIVERY_TARGET_ACCURACY_M) {
        setGeoError(getDeliveryLowAccuracyMessage(accuracyM));
      }
    },
    [draft.deliveryAddress, restaurant.slug, updateDraft]
  );

  const locateClient = () => {
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
        applyClientCoordinates(coordinates);
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
        DELIVERY_GEOLOCATION_OPTIONS
      );
      const timeoutId = window.setTimeout(
        () => finish(bestCoordinates, deliveryGeolocationTimeoutMessage),
        DELIVERY_LOCATION_TIMEOUT_MS + 1_000
      );
      locationSessionRef.current = { watchId, timeoutId };
    } catch {
      finish(null, 'Не удалось запустить геолокацию. Проверьте разрешение браузера.');
    }
  };

  useEffect(() => clearLocationSession, [clearLocationSession]);

  const selectMapPoint = ({ lat, lng }: { lat: number; lng: number }) => {
    const nextLat = Number(lat.toFixed(7));
    const nextLng = Number(lng.toFixed(7));
    setGeoError('');
    updateDraft(restaurant.slug, {
      deliveryLat: nextLat,
      deliveryLng: nextLng,
      deliveryAccuracyM: null,
      deliveryAddress: draft.deliveryAddress || `${nextLat}, ${nextLng}`
    });
  };

  const selectSearchedMapPoint = (result: DeliveryLocationSearchResult) => {
    updateDraft(restaurant.slug, { deliveryAddress: result.label });
  };

  const saveNewAddress = () => {
    if (!newAddress.trim()) return;
    const address: ClientAddress = {
      id: `address-${Date.now().toString(36)}`,
      title: 'Новый адрес',
      addressLine: newAddress.trim(),
      lat: draft.deliveryLat,
      lng: draft.deliveryLng,
      accuracyM: draft.deliveryAccuracyM,
      entrance: draft.deliveryEntrance,
      floor: draft.deliveryFloor,
      apartment: draft.deliveryApartment,
      intercomCode: draft.deliveryIntercomCode,
      landmark: draft.deliveryLandmark,
      comment: draft.deliveryComment,
      isDefault: true
    };
    addAddress(address);
    selectAddress(restaurant.slug, address);
    setNewAddress('');
  };

  return (
    <>
      <RestaurantTopbar restaurant={restaurant} title="Адрес доставки" />
      <main className="restaurant-flow">
        <section className="flow-section">
          <button className="secondary-flow-button" type="button" onClick={locateClient} disabled={isLocating}>
            <LocateFixed />
            {isLocating ? 'Определяем...' : 'Определить моё местоположение'}
          </button>
          <small className="location-hint">
            {draft.deliveryLat.toFixed(7)}, {draft.deliveryLng.toFixed(7)}
            {draft.deliveryAccuracyM ? ` · точность ${draft.deliveryAccuracyM} м` : ''}
          </small>
          {draft.deliveryAccuracyM && draft.deliveryAccuracyM > 100 && (
            <p className="geo-warning">Точность слабая. Проверьте точку и адрес перед оплатой.</p>
          )}
          {geoError && <p className="geo-warning">{geoError}</p>}
        </section>

        <div className="segment-control">
          <button className={tab === 'address' ? 'is-active' : ''} type="button" onClick={() => setTab('address')}>
            Адрес
          </button>
          <button className={tab === 'map' ? 'is-active' : ''} type="button" onClick={() => setTab('map')}>
            На карте
          </button>
        </div>

        {tab === 'address' ? (
          <section className="flow-section">
            <div className="address-list">
              {addresses.map((address) => (
                <button
                  className={draft.addressId === address.id ? 'address-card is-active' : 'address-card'}
                  type="button"
                  onClick={() => selectAddress(restaurant.slug, address)}
                  key={address.id}
                >
                  <span>
                    <strong>{address.title}</strong>
                    <small>{address.addressLine}</small>
                  </span>
                  {draft.addressId === address.id ? <Check /> : <span />}
                </button>
              ))}
            </div>
            <label className="field-label">
              <span>Добавить новый адрес</span>
              <input value={newAddress} onChange={(event) => setNewAddress(event.target.value)} placeholder="Улица, дом, квартира" />
            </label>
            <div className="address-details-grid">
              <label className="field-label">
                <span>Подъезд</span>
                <input value={draft.deliveryEntrance} onChange={(event) => updateDraft(restaurant.slug, { deliveryEntrance: event.target.value })} />
              </label>
              <label className="field-label">
                <span>Этаж</span>
                <input value={draft.deliveryFloor} onChange={(event) => updateDraft(restaurant.slug, { deliveryFloor: event.target.value })} />
              </label>
              <label className="field-label">
                <span>Квартира</span>
                <input value={draft.deliveryApartment} onChange={(event) => updateDraft(restaurant.slug, { deliveryApartment: event.target.value })} />
              </label>
              <label className="field-label">
                <span>Домофон</span>
                <input value={draft.deliveryIntercomCode} onChange={(event) => updateDraft(restaurant.slug, { deliveryIntercomCode: event.target.value })} />
              </label>
            </div>
            <label className="field-label">
              <span>Ориентир</span>
              <input value={draft.deliveryLandmark} onChange={(event) => updateDraft(restaurant.slug, { deliveryLandmark: event.target.value })} placeholder="Например: вход со двора" />
            </label>
            <button className="secondary-flow-button" type="button" onClick={saveNewAddress}>
              <Plus />
              Сохранить адрес
            </button>
          </section>
        ) : (
          <section className="map-panel">
            <DeliveryMapPicker
              lat={draft.deliveryLat}
              lng={draft.deliveryLng}
              accuracyM={draft.deliveryAccuracyM}
              isLocating={isLocating}
              error={geoError}
              onLocate={locateClient}
              onChange={selectMapPoint}
              onSearchSelect={selectSearchedMapPoint}
            />
          </section>
        )}

        <label className="field-label">
          <span>Адрес</span>
          <input
            required
            value={draft.deliveryAddress}
            onChange={(event) => updateDraft(restaurant.slug, { deliveryAddress: event.target.value })}
            placeholder="Улица, дом, квартира"
          />
        </label>

        <label className="field-label">
          <span>Комментарий курьеру</span>
          <textarea
            value={draft.deliveryComment}
            onChange={(event) => updateDraft(restaurant.slug, { deliveryComment: event.target.value })}
            placeholder="Позвоните перед подъездом"
          />
        </label>
        <button className="restaurant-primary-button" type="button" onClick={() => navigate(`/r/${restaurant.slug}/payment`)}>
          Продолжить
        </button>
      </main>
    </>
  );
}

function PaymentPage({
  snapshot,
  restaurant
}: {
  snapshot: ClientPlatformSnapshot;
  restaurant: ClientRestaurant;
}) {
  const navigate = useNavigate();
  const drafts = useClientPlatformStore((state) => state.checkoutDrafts);
  const setPaymentMethod = useClientPlatformStore((state) => state.setDraftPaymentMethod);
  const draft = selectCheckoutDraft(drafts, restaurant.slug);
  const paymentSettings = getPaymentSettings(snapshot, restaurant.slug);
  const allowedMethods = restaurant.paymentMethods.filter((method) => {
    if (method === 'qr') return paymentSettings.enableQr;
    if (method === 'bank_transfer') return paymentSettings.enableBankTransfer;
    return paymentSettings.enableCash;
  });
  const selectedMethod = allowedMethods.includes(draft.paymentMethod) ? draft.paymentMethod : allowedMethods[0] ?? 'cash';
  const lines = useClientPlatformStore((state) => selectRestaurantCart(state.carts, restaurant.slug));
  const dishes = getRestaurantDishes(snapshot, restaurant.slug);
  const summaryWithoutDelivery = calculateCartSummary(lines, dishes, 0);
  const summary = {
    ...summaryWithoutDelivery,
    deliveryFee: getDeliveryFee(restaurant, draft, summaryWithoutDelivery),
    total: summaryWithoutDelivery.subtotal + getDeliveryFee(restaurant, draft, summaryWithoutDelivery)
  };

  return (
    <>
      <RestaurantTopbar restaurant={restaurant} title="Способ оплаты" />
      <main className="restaurant-flow">
        <section className="payment-total">
          <span>К оплате</span>
          <strong>{formatPrice(summary.total)}</strong>
        </section>
        <div className="payment-method-list">
          {allowedMethods.map((method) => (
            <button
              className={selectedMethod === method ? 'payment-method is-active' : 'payment-method'}
              type="button"
              onClick={() => setPaymentMethod(restaurant.slug, method)}
              key={method}
            >
              {method === 'qr' ? <QrCode /> : method === 'bank_transfer' ? <Building2 /> : <Banknote />}
              <span>
                <strong>{paymentMethodLabels[method]}</strong>
                <small>{method === 'cash' ? 'Оплата при получении' : 'Ресторан подтвердит оплату вручную'}</small>
              </span>
            </button>
          ))}
        </div>
        <button
          className="restaurant-primary-button"
          type="button"
          onClick={() => {
            setPaymentMethod(restaurant.slug, selectedMethod);
            navigate(`/r/${restaurant.slug}/payment/confirm`);
          }}
        >
          Перейти к оплате
        </button>
      </main>
    </>
  );
}

function PaymentConfirmPage({
  snapshot,
  restaurant
}: {
  snapshot: ClientPlatformSnapshot;
  restaurant: ClientRestaurant;
}) {
  const navigate = useNavigate();
  const drafts = useClientPlatformStore((state) => state.checkoutDrafts);
  const profile = useClientPlatformStore((state) => state.profile);
  const submitOrder = useClientPlatformStore((state) => state.submitOrder);
  const draft = selectCheckoutDraft(drafts, restaurant.slug);
  const paymentSettings = getPaymentSettings(snapshot, restaurant.slug);
  const lines = useClientPlatformStore((state) => selectRestaurantCart(state.carts, restaurant.slug));
  const dishes = getRestaurantDishes(snapshot, restaurant.slug);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState('');
  const submitLockRef = useRef(false);
  const orderAttemptRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const summaryWithoutDelivery = calculateCartSummary(lines, dishes, 0);
  const deliveryFee = getDeliveryFee(restaurant, draft, summaryWithoutDelivery);
  const summary = { ...summaryWithoutDelivery, deliveryFee, total: summaryWithoutDelivery.subtotal + deliveryFee };
  const orderItems = lines.flatMap((line) => {
    const dish = dishes.find((item) => item.id === line.dishId);
    return dish ? [{ dishId: dish.id, name: dish.name, price: dish.price, quantity: line.quantity }] : [];
  });
  const getOrderIdempotencyKey = () => {
    const fingerprint = JSON.stringify({
      restaurantSlug: restaurant.slug,
      orderType: draft.orderType,
      paymentMethod: draft.paymentMethod,
      clientName: (draft.clientName || profile.name).trim(),
      clientPhone: (draft.clientPhone || profile.phone).replace(/\D/g, ''),
      deliveryAddress: draft.orderType === 'delivery' ? draft.deliveryAddress.trim() : '',
      boothName: draft.orderType === 'dine_in' ? draft.boothName.trim() : '',
      lines: lines
        .map((line) => ({ dishId: line.dishId, quantity: Math.max(1, line.quantity) }))
        .sort((left, right) => left.dishId.localeCompare(right.dishId))
    });

    if (orderAttemptRef.current?.fingerprint !== fingerprint) {
      orderAttemptRef.current = {
        fingerprint,
        idempotencyKey: createRestaurantOrderIdempotencyKey(fingerprint)
      };
    }

    return orderAttemptRef.current.idempotencyKey;
  };

  const confirmPayment = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setIsSubmitting(true);
    setOrderError('');
    let orderId = '';

    try {
      const remoteOrderId = await createClientPlatformOrder({
        restaurant,
        profile,
        draft,
        lines,
        dishes,
        subtotal: summary.subtotal,
        deliveryFee: summary.deliveryFee,
        total: summary.total,
        idempotencyKey: getOrderIdempotencyKey()
      });
      orderId = requireSavedRestaurantOrderId(remoteOrderId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'неизвестная ошибка';
      setOrderError(`Заказ не создан в системе ресторана. Supabase: ${message}`);
      return;
    } finally {
      submitLockRef.current = false;
      setIsSubmitting(false);
    }

    const order = buildOrderAfterClientPaymentNotice({
      id: orderId,
      restaurantSlug: restaurant.slug,
      restaurantName: restaurant.name,
      orderType: draft.orderType,
      deliveryProvider: draft.orderType === 'delivery' ? restaurant.deliveryProvider : draft.orderType === 'pickup' ? 'pickup' : 'dine_in',
      paymentMethod: draft.paymentMethod,
      totalAmount: summary.total,
      addressLine: draft.orderType === 'delivery' ? draft.deliveryAddress : draft.boothName,
      deliveryLat: draft.orderType === 'delivery' ? draft.deliveryLat : null,
      deliveryLng: draft.orderType === 'delivery' ? draft.deliveryLng : null,
      clientName: draft.clientName || profile.name,
      clientPhone: draft.clientPhone || profile.phone,
      items: orderItems,
      estimatedTimeMin: restaurant.deliveryTimeFrom,
      estimatedTimeMax: restaurant.deliveryTimeTo
    });

    submitOrder(order);
    navigate(`/r/${restaurant.slug}/order/${order.id}`);
  };

  return (
    <>
      <RestaurantTopbar restaurant={restaurant} title="Оплата заказа" />
      <main className="restaurant-flow payment-confirm">
        <p>Сумма к оплате</p>
        <strong>{formatPrice(summary.total)}</strong>
        {draft.paymentMethod === 'qr' && paymentSettings.qrImageUrl && <img className="qr-image" src={paymentSettings.qrImageUrl} alt="QR-код оплаты" />}
        {draft.paymentMethod !== 'cash' && (
          <section className="payment-requisites">
            <span>{paymentSettings.recipientFullName}</span>
            <span>{paymentSettings.bankName}</span>
            <span>{paymentSettings.recipientPhone}</span>
            <small>{paymentSettings.paymentComment}</small>
          </section>
        )}
        {orderError && <small className="form-error">{orderError}</small>}
        <button className="restaurant-primary-button" type="button" onClick={() => void confirmPayment()} disabled={summary.quantity === 0 || isSubmitting}>
          {isSubmitting ? 'Отправляем заказ...' : draft.paymentMethod === 'cash' ? 'Подтвердить заказ' : 'Я оплатил(а) заказ'}
        </button>
      </main>
    </>
  );
}

function OrderStatusPage({
  snapshot,
  restaurant,
  orderId
}: {
  snapshot: ClientPlatformSnapshot;
  restaurant: ClientRestaurant;
  orderId?: string;
}) {
  const orders = useClientPlatformStore((state) => state.orders);
  const syncOrderPatch = useClientPlatformStore((state) => state.syncOrderPatch);
  const order = selectClientOrderForStatus(orders, restaurant.slug, orderId);
  const restaurantImage = snapshot.restaurants.find((item) => item.slug === restaurant.slug)?.coverUrl;

  useEffect(() => {
    if (!order?.id) return undefined;

    return subscribeClientOrderRealtime(order.id, (patch) => {
      syncOrderPatch(order.id, mergeClientOrderRealtimePatch({
        status: toClientOrderStatus(patch.deliveryStatus ?? patch.status),
        paymentStatus: patch.paymentStatus,
        driverName: patch.driverName,
        driverPhone: patch.driverPhone,
        driverLat: patch.driverLat,
        driverLng: patch.driverLng,
        driverLocationAt: patch.driverLocationAt
      }));
    });
  }, [order?.id, syncOrderPatch]);

  if (!order) {
    return (
      <>
        <RestaurantTopbar restaurant={restaurant} title="Статус заказа" />
        <main className="restaurant-flow">
          <EmptyState title="Заказ не найден" linkTo={`/r/${restaurant.slug}`} linkText="Открыть ресторан" />
        </main>
      </>
    );
  }

  return (
    <>
      <RestaurantTopbar restaurant={restaurant} title="Заказ в доставке" />
      <main className="restaurant-flow">
        <section className="order-status-head">
          <span className="restaurant-logo">{restaurant.name.slice(0, 1)}</span>
          <span>
            <strong>{order.restaurantName}</strong>
            <small>Заказ №{order.id}</small>
            <small>{orderTypeLabels[order.orderType]}</small>
          </span>
          {restaurantImage && <img src={restaurantImage} alt="" />}
        </section>
        <section className="status-panel">
          <small>Статус заказа</small>
          <h1>{statusLabels[order.status]}</h1>
          {order.status === 'waiting_payment_confirmation' && <p>Ресторан получил заказ и проверяет оплату.</p>}
          <OrderProgress status={order.status} />
        </section>
        <section className="delivery-info">
          <h2>Информация о доставке</h2>
          <span>
            <strong>Кто доставляет</strong>
            <small>{getDeliveryProviderLabel(order.deliveryProvider, order.orderType)}</small>
          </span>
          {order.driverName && (
            <span>
              <strong>{order.driverName}</strong>
              <a href={`tel:${order.driverPhone}`}>
                <Phone />
                Позвонить
              </a>
            </span>
          )}
          {order.driverName && order.driverLat !== null && order.driverLat !== undefined && order.driverLng !== null && order.driverLng !== undefined && (
            <span>
              <strong>Таксист в пути</strong>
              <small>{order.driverLat.toFixed(5)}, {order.driverLng.toFixed(5)}</small>
              {order.driverLocationAt && <small>Обновлено {new Date(order.driverLocationAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>}
              <a
                href={buildYandexMapsRouteUrl({
                  from: { lat: order.driverLat, lng: order.driverLng, address: 'Водитель' },
                  to: { lat: order.deliveryLat, lng: order.deliveryLng, address: order.addressLine }
                })}
                target="_blank"
                rel="noreferrer"
              >
                <MapPin />
                Отследить на карте
              </a>
            </span>
          )}
          <span>
            <strong>Время</strong>
            <small>{order.estimatedTimeMin}-{order.estimatedTimeMax} мин</small>
          </span>
          <span>
            <strong>Адрес</strong>
            <small>{order.addressLine}</small>
          </span>
        </section>
        {order.orderType === 'delivery' && restaurant.lat !== null && restaurant.lng !== null &&
          typeof order.deliveryLat === 'number' && Number.isFinite(order.deliveryLat) &&
          typeof order.deliveryLng === 'number' && Number.isFinite(order.deliveryLng) && (
            <section className="delivery-tracking-section">
              <h2>Карта доставки</h2>
              <DeliveryTrackingMap
                restaurant={{ lat: restaurant.lat, lng: restaurant.lng, label: 'Ресторан', address: restaurant.addressLine }}
                client={{ lat: order.deliveryLat, lng: order.deliveryLng, label: 'Вы', address: order.addressLine }}
                driver={order.driverLat !== null && order.driverLat !== undefined && order.driverLng !== null && order.driverLng !== undefined
                  ? { lat: order.driverLat, lng: order.driverLng, label: 'Таксист', address: order.driverName }
                  : null}
              />
            </section>
          )}
        <a
          className="secondary-flow-button"
          href={buildSupportWhatsappUrl(snapshot.supportWhatsapp)}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle />
          Связаться с поддержкой
        </a>
        <Link className="restaurant-primary-button restaurant-primary-button--soft" to="/">
          Вернуться на главную
        </Link>
      </main>
    </>
  );
}

function OrderProgress({ status }: { status: ClientOrderStatus }) {
  const steps: Array<{ id: ClientOrderStatus; label: string }> = [
    { id: 'accepted', label: 'Принят' },
    { id: 'cooking', label: 'Готовится' },
    { id: 'ready', label: 'Подтверждён' },
    { id: 'assigned_driver', label: 'Курьер' },
    { id: 'picked_up', label: 'Забран' },
    { id: 'on_the_way', label: 'В пути' },
    { id: 'completed', label: 'Доставлен' }
  ];
  const normalizedStatus = status === 'payment_confirmed' ? 'accepted' : status === 'waiting_driver' ? 'ready' : status;
  const statusIndex = steps.findIndex((step) => step.id === normalizedStatus);
  const activeIndex = status === 'waiting_payment_confirmation' || status === 'new' ? 0 : Math.max(statusIndex, 0);

  return (
    <div className="order-progress">
      {steps.map((step, index) => (
        <span className={index <= activeIndex ? 'is-active' : ''} key={step.id}>
          <b>{index <= activeIndex ? <Check /> : null}</b>
          <small>{step.label}</small>
        </span>
      ))}
    </div>
  );
}

function ProfileArea({ snapshot }: { snapshot: ClientPlatformSnapshot }) {
  const location = useLocation();

  if (location.pathname === '/profile/orders') {
    return (
      <PlatformLayout active="orders">
        <OrdersPage snapshot={snapshot} />
      </PlatformLayout>
    );
  }

  if (location.pathname === '/profile/favorites') {
    return (
      <PlatformLayout active="profile">
        <FavoritesPage snapshot={snapshot} />
      </PlatformLayout>
    );
  }

  if (location.pathname === '/profile/addresses') {
    return (
      <PlatformLayout active="profile">
        <AddressesPage />
      </PlatformLayout>
    );
  }

  if (location.pathname === '/profile/payments') {
    return (
      <PlatformLayout active="profile">
        <ProfilePaymentsPage />
      </PlatformLayout>
    );
  }

  if (location.pathname === '/profile/support') {
    return (
      <PlatformLayout active="profile">
        <SupportPage supportWhatsapp={snapshot.supportWhatsapp} />
      </PlatformLayout>
    );
  }

  return (
    <PlatformLayout active="profile">
      <ProfilePage />
    </PlatformLayout>
  );
}

function SupportPage({ supportWhatsapp }: { supportWhatsapp: string }) {
  return (
    <>
      <PageHeader title="Поддержка" backTo="/profile" />
      <section className="empty-state">
        <MessageCircle />
        <strong>Поддержка WayCatalog</strong>
        <a href={buildSupportWhatsappUrl(supportWhatsapp)} target="_blank" rel="noreferrer">
          Написать в WhatsApp
        </a>
      </section>
    </>
  );
}

function ProfilePage() {
  const navigate = useNavigate();
  const profile = useClientPlatformStore((state) => state.profile);
  const addresses = useClientPlatformStore((state) => state.addresses);
  const saveProfile = useClientPlatformStore((state) => state.saveProfile);
  const [clientName, setClientName] = useState(profile.name);
  const [clientPhone, setClientPhone] = useState(profile.phone);
  const [clientMessage, setClientMessage] = useState('');
  const [clientError, setClientError] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [activeRole, setActiveRole] = useState<'client' | 'restaurant' | 'driver' | null>(null);
  const [restaurantEmail, setRestaurantEmail] = useState('');
  const [restaurantPassword, setRestaurantPassword] = useState('');
  const [restaurantError, setRestaurantError] = useState('');
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [isSigningRestaurant, setIsSigningRestaurant] = useState(false);
  const items = [
    { to: '/profile/orders', label: 'Мои заказы', Icon: ReceiptText },
    { to: '/profile/favorites', label: 'Избранное', Icon: Heart },
    { to: '/profile/addresses', label: 'Адреса доставки', Icon: MapPin },
    { to: '/profile/payments', label: 'Способы оплаты', Icon: WalletCards },
    { to: '/profile/support', label: 'Поддержка', Icon: MessageCircle },
    { to: '/profile/settings', label: 'Настройки', Icon: Settings }
  ];
  const displayName = profile.name || 'Гость WayCatalog';
  const displayPhone = profile.phone || 'Телефон не указан';
  const displayAddress = addresses.find((address) => address.isDefault)?.addressLine ?? addresses[0]?.addressLine ?? '';

  const submitClientProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextProfile = { name: clientName.trim(), phone: clientPhone.trim() };

    setClientError('');
    setClientMessage('');
    setIsSavingClient(true);

    if (!nextProfile.name || !nextProfile.phone) {
      setClientError('Введите имя и номер телефона.');
      setIsSavingClient(false);
      return;
    }

    try {
      saveProfile(nextProfile);
      await saveClientSignup(nextProfile);
      setClientMessage('Профиль сохранён');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'неизвестная ошибка';
      setClientError(`Профиль сохранён на устройстве. Supabase: ${message}`);
    } finally {
      setIsSavingClient(false);
    }
  };

  const submitStaffLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRestaurantError('');
    setIsSigningRestaurant(true);

    try {
      const redirect = await resolveLoginRedirect(restaurantEmail, restaurantPassword);
      if (!redirect) {
        throw new Error('Неверный email или пароль.');
      }
      if (activeRole === 'driver' && redirect !== '/driver') {
        throw new Error('Этот аккаунт не является водителем.');
      }
      const targetPath = redirect === '/admin' ? '/admin/clients' : redirect;
      rememberPwaResumePath(targetPath);
      navigate(targetPath, { replace: true });
    } catch (error) {
      setRestaurantError(error instanceof Error ? error.message : 'Не удалось войти.');
    } finally {
      setIsSigningRestaurant(false);
    }
  };

  const logout = () => {
    clearPwaResumePath();
    saveProfile({ name: '', phone: '' });
    setClientName('');
    setClientPhone('');
    setClientMessage('');
    setClientError('');
    setRestaurantEmail('');
    setRestaurantPassword('');
    setRestaurantError('');
    setActiveRole(null);
    setAccountOpen(false);
    void signOutPlatformAdmin();
  };

  return (
    <>
      <PageHeader title="Профиль" />
      <section className="profile-card">
        <span className="avatar"><CircleUserRound /></span>
        <span>
          <strong>{displayName}</strong>
          <small>{displayPhone}</small>
          {displayAddress && <small className="profile-card__address"><MapPin /> {displayAddress}</small>}
        </span>
        <ChevronRight />
      </section>

      <button
        className="profile-cabinet-button"
        type="button"
        onClick={() => {
          setAccountOpen((value) => !value);
          if (!accountOpen) setActiveRole(null);
        }}
      >
        <CircleUserRound />
        <span>
          <strong>Личный кабинет</strong>
          <small>Вход для клиента, ресторана или водителя</small>
        </span>
        <ChevronRight />
      </button>

      {accountOpen && (
        <section className="profile-account-panel">
          <div className="profile-role-grid">
            <button className={activeRole === 'client' ? 'is-active' : ''} type="button" onClick={() => setActiveRole('client')}>
              <UserRoundCheck />
              <span>Клиент</span>
            </button>
            <button className={activeRole === 'restaurant' ? 'is-active' : ''} type="button" onClick={() => setActiveRole('restaurant')}>
              <Building2 />
              <span>Ресторан</span>
            </button>
            <button className={activeRole === 'driver' ? 'is-active' : ''} type="button" onClick={() => setActiveRole('driver')}>
              <Car />
              <span>Водитель</span>
            </button>
          </div>

          {activeRole === 'client' && (
            <form className="profile-inline-form" onSubmit={submitClientProfile}>
              <label className="field-label">
                <span>Имя</span>
                <input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Ваше имя" />
              </label>
              <label className="field-label">
                <span>Телефон</span>
                <input value={clientPhone} onChange={(event) => setClientPhone(event.target.value)} placeholder="+7" inputMode="tel" />
              </label>
              {clientError && <small className="form-error">{clientError}</small>}
              {clientMessage && <small className="form-success">{clientMessage}</small>}
              <button className="wide-action" type="submit" disabled={isSavingClient}>
                <UserRoundCheck />
                {isSavingClient ? 'Сохраняем...' : 'Войти как клиент'}
              </button>
            </form>
          )}

          {activeRole === 'restaurant' && (
            <form className="profile-inline-form" onSubmit={submitStaffLogin}>
              <label className="field-label">
                <span>Email</span>
                <input value={restaurantEmail} onChange={(event) => setRestaurantEmail(event.target.value)} type="email" autoComplete="email" required />
              </label>
              <label className="field-label">
                <span>Пароль</span>
                <input value={restaurantPassword} onChange={(event) => setRestaurantPassword(event.target.value)} type="password" autoComplete="current-password" required />
              </label>
              {restaurantError && <small className="form-error">{restaurantError}</small>}
              <button className="wide-action" type="submit" disabled={isSigningRestaurant}>
                <ShieldCheck />
                {isSigningRestaurant ? 'Проверяем...' : 'Войти как ресторан'}
              </button>
            </form>
          )}

          {activeRole === 'driver' && (
            <form className="profile-inline-form" onSubmit={submitStaffLogin}>
              <label className="field-label">
                <span>Email</span>
                <input value={restaurantEmail} onChange={(event) => setRestaurantEmail(event.target.value)} type="email" autoComplete="email" required />
              </label>
              <label className="field-label">
                <span>Пароль</span>
                <input value={restaurantPassword} onChange={(event) => setRestaurantPassword(event.target.value)} type="password" autoComplete="current-password" required />
              </label>
              <small className="form-muted">Аккаунт водителя создаёт и выдаёт супер-админ.</small>
              {restaurantError && <small className="form-error">{restaurantError}</small>}
              <button className="wide-action" type="submit" disabled={isSigningRestaurant}>
                <Car />
                {isSigningRestaurant ? 'Проверяем...' : 'Войти как водитель'}
              </button>
            </form>
          )}
        </section>
      )}

      <nav className="profile-menu">
        {items.map(({ to, label, Icon }) => (
          <Link to={to} key={to}>
            <Icon />
            <span>{label}</span>
            <ChevronRight />
          </Link>
        ))}
        <button type="button" onClick={logout}>
          <LogOut />
          <span>Выйти</span>
          <ChevronRight />
        </button>
      </nav>
    </>
  );
}

function OrdersPage({ snapshot }: { snapshot: ClientPlatformSnapshot }) {
  const navigate = useNavigate();
  const profile = useClientPlatformStore((state) => state.profile);
  const orders = useClientPlatformStore((state) => state.orders);
  const repeatOrder = useClientPlatformStore((state) => state.repeatOrder);
  const syncOrderPatch = useClientPlatformStore((state) => state.syncOrderPatch);
  const [reviewOrderId, setReviewOrderId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [isReviewSending, setIsReviewSending] = useState(false);
  const currentOrders = orders.filter((order) => !['completed', 'canceled'].includes(order.status));
  const currentOrderIds = currentOrders.map((order) => order.id).sort().join('|');
  const finishedOrders = orders.filter((order) => order.status === 'completed');
  const canceledOrders = orders.filter((order) => order.status === 'canceled');

  useEffect(() => {
    if (!currentOrderIds) return undefined;

    const unsubscribes = currentOrderIds.split('|').map((orderId) =>
      subscribeClientOrderRealtime(orderId, (patch) => {
        syncOrderPatch(orderId, mergeClientOrderRealtimePatch({
          status: toClientOrderStatus(patch.deliveryStatus ?? patch.status),
          paymentStatus: patch.paymentStatus,
          driverName: patch.driverName,
          driverPhone: patch.driverPhone,
          driverLat: patch.driverLat,
          driverLng: patch.driverLng,
          driverLocationAt: patch.driverLocationAt
        }));
      })
    );

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [currentOrderIds, syncOrderPatch]);

  const submitReview = async (event: FormEvent<HTMLFormElement>, order: ClientOrder) => {
    event.preventDefault();
    const restaurant = snapshot.restaurants.find((item) => item.slug === order.restaurantSlug);

    setReviewError('');
    setReviewMessage('');
    setIsReviewSending(true);

    try {
      await saveClientReview({
        restaurantId: restaurant?.id ?? '',
        clientName: profile.name || order.clientName,
        clientPhone: profile.phone || order.clientPhone,
        rating: reviewRating,
        comment: reviewComment
      });
      setReviewMessage('Отзыв отправлен');
      setReviewComment('');
      setReviewOrderId(null);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Не удалось отправить отзыв');
    } finally {
      setIsReviewSending(false);
    }
  };

  const renderOrder = (order: ClientOrder) => {
    const restaurant = snapshot.restaurants.find((item) => item.slug === order.restaurantSlug);
    const restaurantMapHref = restaurant
      ? buildYandexMapsUrl({
          addressLine: restaurant.addressLine,
          lat: restaurant.lat ?? Number.NaN,
          lng: restaurant.lng ?? Number.NaN
        })
      : '';

    return (
    <article className="order-card" key={order.id}>
      <span className="order-card__summary">
        <strong>{order.restaurantName}</strong>
        <small>{new Date(order.createdAt).toLocaleDateString('ru-RU')} · {formatPrice(order.totalAmount)}</small>
        <em>{statusLabels[order.status]}</em>
        <small>{orderTypeLabels[order.orderType]} · {getDeliveryProviderLabel(order.deliveryProvider, order.orderType)}</small>
        <small>{order.addressLine}</small>
      </span>
      <div className="order-card__actions">
        <Link to={`/r/${order.restaurantSlug}/order/${order.id}`}>
          <ReceiptText />
          Статус
        </Link>
        {restaurantMapHref && (
          <a href={restaurantMapHref} target="_blank" rel="noreferrer">
            <MapPin />
            Ресторан
          </a>
        )}
        <button
          type="button"
          onClick={() => {
            repeatOrder(order);
            navigate(`/r/${order.restaurantSlug}/cart`);
          }}
        >
          <Repeat2 />
          Повторить
        </button>
        <button
          type="button"
          onClick={() => {
            setReviewOrderId(reviewOrderId === order.id ? null : order.id);
            setReviewError('');
            setReviewMessage('');
          }}
        >
          <Star />
          Отзыв
        </button>
      </div>
      {order.driverName && (
        <section className="order-card__driver">
          <span>
            <Bike />
            <strong>{order.driverName}</strong>
            {order.driverLocationAt && <small>Обновлено {new Date(order.driverLocationAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>}
          </span>
          {order.driverPhone && (
            <a href={`tel:${order.driverPhone}`}>
              <Phone />
              {order.driverPhone}
            </a>
          )}
        </section>
      )}
      {reviewOrderId === order.id && (
        <form className="order-review-form" onSubmit={(event) => void submitReview(event, order)}>
          <label>
            Оценка
            <select value={reviewRating} onChange={(event) => setReviewRating(Number(event.target.value))}>
              <option value={5}>5</option>
              <option value={4}>4</option>
              <option value={3}>3</option>
              <option value={2}>2</option>
              <option value={1}>1</option>
            </select>
          </label>
          <label>
            Отзыв
            <textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} rows={3} />
          </label>
          {reviewError && <small className="form-error">{reviewError}</small>}
          <button type="submit" disabled={isReviewSending}>
            {isReviewSending ? 'Отправляем...' : 'Отправить отзыв'}
          </button>
        </form>
      )}
    </article>
    );
  };

  return (
    <>
      <PageHeader title="Мои заказы" backTo="/profile" />
      <OrderGroup title="Текущие" orders={currentOrders} renderOrder={renderOrder} />
      <OrderGroup title="Завершённые" orders={finishedOrders} renderOrder={renderOrder} />
      <OrderGroup title="Отменённые" orders={canceledOrders} renderOrder={renderOrder} />
      {reviewMessage && <p className="form-success">{reviewMessage}</p>}
      {orders.length === 0 && <EmptyState title="Заказов пока нет" linkTo="/restaurants" linkText="Выбрать ресторан" />}
    </>
  );
}

function OrderGroup({
  title,
  orders,
  renderOrder
}: {
  title: string;
  orders: ClientOrder[];
  renderOrder: (order: ClientOrder) => ReactNode;
}) {
  if (orders.length === 0) return null;

  return (
    <section className="plain-section">
      <h2>{title}</h2>
      <div className="order-list">{orders.map(renderOrder)}</div>
    </section>
  );
}

function FavoritesPage({ snapshot }: { snapshot: ClientPlatformSnapshot }) {
  const favoriteRestaurantIds = useClientPlatformStore((state) => state.favoriteRestaurantIds);
  const favoriteDishIds = useClientPlatformStore((state) => state.favoriteDishIds);
  const restaurants = snapshot.restaurants.filter((restaurant) => favoriteRestaurantIds.includes(restaurant.id));
  const dishes = snapshot.dishes.filter((dish) => favoriteDishIds.includes(dish.id));

  return (
    <>
      <PageHeader title="Избранное" backTo="/profile" />
      <section className="plain-section">
        <h2>Любимые рестораны</h2>
        <div className="restaurant-grid">
          {restaurants.map((restaurant) => (
            <RestaurantCard restaurant={restaurant} categories={snapshot.categories} key={restaurant.id} />
          ))}
        </div>
      </section>
      <section className="plain-section">
        <h2>Любимые блюда</h2>
        <div className="favorite-dish-list">
          {dishes.map((dish) => (
            <Link to={`/${dish.restaurantSlug}`} key={dish.id}>
              <img src={dish.imageUrl} alt="" />
              <span>
                <strong>{dish.name}</strong>
                <small>{formatPrice(dish.price)}</small>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function AddressesPage() {
  const addresses = useClientPlatformStore((state) => state.addresses);
  const addAddress = useClientPlatformStore((state) => state.addAddress);
  const [addressLine, setAddressLine] = useState('');

  return (
    <>
      <PageHeader title="Мои адреса" backTo="/profile" />
      <div className="address-list">
        {addresses.map((address) => (
          <article className="address-card" key={address.id}>
            <span>
              <strong>{address.title}</strong>
              <small>{address.addressLine}</small>
            </span>
            <div className="address-actions">
              {address.isDefault && <Check />}
              <a href={buildYandexMapsUrl(address)} target="_blank" rel="noreferrer" aria-label="Открыть адрес в Яндекс Картах">
                <ExternalLink />
                Яндекс
              </a>
            </div>
          </article>
        ))}
      </div>
      <section className="plain-section">
        <label className="field-label">
          <span>Новый адрес</span>
          <input value={addressLine} onChange={(event) => setAddressLine(event.target.value)} placeholder="Улица, дом, квартира" />
        </label>
        <button
          className="wide-action"
          type="button"
          onClick={() => {
            if (!addressLine.trim()) return;
            addAddress({
              id: `address-${Date.now().toString(36)}`,
              title: 'Новый адрес',
              addressLine: addressLine.trim(),
              lat: 43.3184,
              lng: 45.6927,
              accuracyM: 15,
              entrance: '',
              floor: '',
              apartment: '',
              intercomCode: '',
              landmark: '',
              comment: '',
              isDefault: true
            });
            setAddressLine('');
          }}
        >
          <Plus />
          Добавить адрес
        </button>
        <a
          className="wide-action wide-action--secondary"
          href={buildYandexMapsUrl({ addressLine: addressLine.trim(), lat: Number.NaN, lng: Number.NaN })}
          target="_blank"
          rel="noreferrer"
        >
          <MapPin />
          Открыть Яндекс Карты
        </a>
      </section>
    </>
  );
}

function ProfilePaymentsPage() {
  return (
    <>
      <PageHeader title="Способы оплаты" backTo="/profile" />
      <div className="payment-method-list">
        <article className="payment-method is-active">
          <QrCode />
          <span>
            <strong>QR-код</strong>
            <small>Оплата по QR-коду ресторана</small>
          </span>
        </article>
        <article className="payment-method">
          <Building2 />
          <span>
            <strong>Банковский перевод</strong>
            <small>Перевод по реквизитам ресторана</small>
          </span>
        </article>
        <article className="payment-method">
          <Banknote />
          <span>
            <strong>Наличными</strong>
            <small>Если ресторан разрешил этот способ</small>
          </span>
        </article>
      </div>
    </>
  );
}

function PlatformCartPage({ snapshot }: { snapshot: ClientPlatformSnapshot }) {
  const carts = useClientPlatformStore((state) => state.carts);
  const activeCarts = Object.entries(carts).filter(([, lines]) => lines.length > 0);

  return (
    <>
      <PageHeader title="Корзина" />
      {activeCarts.length === 0 ? (
        <EmptyState title="Корзина пуста" linkTo="/restaurants" linkText="Выбрать ресторан" />
      ) : (
        <div className="order-list">
          {activeCarts.map(([restaurantSlug, lines]) => {
            const restaurant = getRestaurantBySlug(snapshot, restaurantSlug);
            const dishes = getRestaurantDishes(snapshot, restaurantSlug);
            const summary = calculateCartSummary(lines, dishes, 0);
            if (!restaurant) return null;

            return (
              <Link className="order-card order-card--link" to={`/r/${restaurantSlug}/cart`} key={restaurantSlug}>
                <span>
                  <strong>{restaurant.name}</strong>
                  <small>{summary.quantity} товара · {formatPrice(summary.total)}</small>
                  <em>Корзина хранится отдельно</em>
                </span>
                <ChevronRight />
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

function EmptyState({ title, linkTo, linkText }: { title: string; linkTo: string; linkText: string }) {
  return (
    <section className="empty-state">
      <Store />
      <strong>{title}</strong>
      <Link to={linkTo}>{linkText}</Link>
    </section>
  );
}
