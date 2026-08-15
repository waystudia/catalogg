import {
  Bell,
  CakeSlice,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Flower2,
  Gift,
  Heart,
  House,
  MapPin,
  PawPrint,
  Search,
  ShoppingBasket,
  SlidersHorizontal,
  Star,
  Store,
  Utensils,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BUSINESS_CATEGORIES,
  getBusinessCategoryForType,
  selectBusinessesForDiscovery,
  type BusinessCategory,
  type BusinessCategoryIcon
} from '../../features/client-platform/businessCategories';
import { buildCityPickerPath } from '../../features/client-platform/clientPlatformNavigation';
import { buildRestaurantPublicPath } from '../../features/client-platform/clientPlatformLogic';
import { useClientPlatformStore } from '../../features/client-platform/store';
import type { ClientDish, ClientPlatformSnapshot, ClientRestaurant } from '../../features/client-platform/types';
import { SafeImage } from '../../shared/SafeImage';
import './client-platform.css';

type CategoriesScreenProps = {
  snapshot: ClientPlatformSnapshot;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
};

const categoryIcons: Record<BusinessCategoryIcon, typeof Utensils> = {
  utensils: Utensils,
  basket: ShoppingBasket,
  cake: CakeSlice,
  flower: Flower2,
  home: House,
  pharmacy: CirclePlus,
  pet: PawPrint,
  gift: Gift
};

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

const getBusinessDiscount = (business: ClientRestaurant, dishes: readonly ClientDish[]) =>
  dishes
    .filter((dish) => dish.restaurantSlug === business.slug && dish.oldPrice && dish.oldPrice > dish.price)
    .reduce((maximum, dish) => Math.max(
      maximum,
      Math.round((((dish.oldPrice ?? dish.price) - dish.price) / (dish.oldPrice ?? dish.price)) * 100)
    ), 0);

function DiscoveryHeader({ cityName }: { cityName: string }) {
  return (
    <header className="home-topbar categories-topbar">
      <Link
        className="city-pill"
        to={buildCityPickerPath('/categories')}
        aria-label={`Выбрать населённый пункт, сейчас ${cityName}`}
      >
        <MapPin aria-hidden="true" />
        <span>{cityName}</span>
        <ChevronDown aria-hidden="true" />
      </Link>
      <button className="icon-button notification-button has-unread" type="button" aria-label="Уведомления">
        <Bell aria-hidden="true" />
      </button>
    </header>
  );
}

function BusinessCard({
  business,
  dishes,
  isFavorite,
  onToggleFavorite
}: {
  business: ClientRestaurant;
  dishes: readonly ClientDish[];
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const discount = getBusinessDiscount(business, dishes);
  const category = getBusinessCategoryForType(business.businessType);
  const subtitle = business.description.trim() || category?.description || 'Каталог бизнеса';
  const hasDelivery = business.orderTypes.includes('delivery') &&
    business.deliveryProvider !== 'pickup' && business.deliveryProvider !== 'dine_in';

  return (
    <article className="business-discovery-card" role="listitem">
      <Link
        className="business-discovery-card__link"
        to={buildRestaurantPublicPath(business)}
        aria-label={`Открыть ${business.name}`}
      >
        <span className="business-discovery-card__media">
          <SafeImage src={business.coverUrl} alt="" width={320} height={220} />
          {discount > 0 && <b className="business-discovery-card__discount">-{discount}%</b>}
        </span>
        <span className="business-discovery-card__body">
          <strong>{business.name}</strong>
          <small>{subtitle}</small>
          <span className="business-discovery-card__rating">
            <Star aria-hidden="true" fill="currentColor" />
            {business.rating.toFixed(1)}
          </span>
          <span className="business-discovery-card__terms">
            {business.deliveryTimeFrom}–{business.deliveryTimeTo} мин · от {formatPrice(business.minOrderAmount)}
          </span>
          {hasDelivery && business.freeDeliveryFrom > 0 && (
            <em>Бесплатно от {formatPrice(business.freeDeliveryFrom)}</em>
          )}
        </span>
      </Link>
      <button
        className={isFavorite
          ? 'business-discovery-card__favorite is-active'
          : 'business-discovery-card__favorite'}
        type="button"
        onClick={onToggleFavorite}
        aria-label={isFavorite
          ? `Убрать ${business.name} из избранного`
          : `Добавить ${business.name} в избранное`}
        aria-pressed={isFavorite}
      >
        <Heart aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
}

function BusinessCarouselSkeleton() {
  return (
    <div
      className="business-discovery-carousel business-discovery-carousel--skeleton"
      role="status"
      aria-label="Загрузка популярных бизнесов"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span className="business-discovery-card-skeleton" key={index} />
      ))}
    </div>
  );
}

function CategoryCard({ category }: { category: BusinessCategory }) {
  const Icon = categoryIcons[category.icon];
  const style = { '--business-category-accent': category.accentColor } as CSSProperties;

  return (
    <Link
      className="business-category-card"
      to={`/restaurants?businessCategory=${encodeURIComponent(category.slug)}`}
      style={style}
      aria-label={`${category.name}. ${category.description}`}
    >
      <SafeImage
        className="business-category-card__image"
        src={category.imageUrl}
        alt=""
        width={320}
        height={210}
      />
      <span className="business-category-card__fade" aria-hidden="true" />
      <span className="business-category-card__content">
        <span className="business-category-card__icon"><Icon aria-hidden="true" /></span>
        <strong>{category.name}</strong>
        <small>{category.description}</small>
      </span>
      <span className="business-category-card__arrow" aria-hidden="true">
        <ChevronRight />
      </span>
    </Link>
  );
}

function CategoriesGridSkeleton() {
  return (
    <div
      className="business-category-grid business-category-grid--skeleton"
      role="status"
      aria-label="Загрузка категорий бизнеса"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <span className="business-category-card-skeleton" key={index} />
      ))}
    </div>
  );
}

function BusinessFiltersSheet({
  selectedCategory,
  deliveryOnly,
  freeDeliveryOnly,
  onCategoryChange,
  onDeliveryChange,
  onFreeDeliveryChange,
  onApply,
  onClose
}: {
  selectedCategory: string;
  deliveryOnly: boolean;
  freeDeliveryOnly: boolean;
  onCategoryChange: (slug: string) => void;
  onDeliveryChange: (value: boolean) => void;
  onFreeDeliveryChange: (value: boolean) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="business-filters-backdrop" onMouseDown={onClose}>
      <section
        className="business-filters-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Фильтры бизнеса"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="business-filters-sheet__handle" aria-hidden="true" />
        <header>
          <h2>Фильтры</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть фильтры"><X /></button>
        </header>
        <fieldset>
          <legend>Категория бизнеса</legend>
          <div className="business-filters-sheet__chips">
            <button
              className={!selectedCategory ? 'is-active' : ''}
              type="button"
              onClick={() => onCategoryChange('')}
              aria-pressed={!selectedCategory}
            >
              Все
            </button>
            {BUSINESS_CATEGORIES.filter((category) => category.isActive).map((category) => (
              <button
                className={selectedCategory === category.slug ? 'is-active' : ''}
                type="button"
                onClick={() => onCategoryChange(category.slug)}
                aria-pressed={selectedCategory === category.slug}
                key={category.id}
              >
                {category.name}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="business-filters-sheet__toggle">
          <span><strong>С доставкой</strong><small>Только бизнесы, которые доставляют</small></span>
          <input
            type="checkbox"
            checked={deliveryOnly}
            onChange={(event) => onDeliveryChange(event.target.checked)}
          />
        </label>
        <label className="business-filters-sheet__toggle">
          <span><strong>Бесплатная доставка</strong><small>При выполнении условий бизнеса</small></span>
          <input
            type="checkbox"
            checked={freeDeliveryOnly}
            onChange={(event) => onFreeDeliveryChange(event.target.checked)}
          />
        </label>
        <button className="business-filters-sheet__apply" type="button" onClick={onApply}>
          Показать бизнесы
        </button>
      </section>
    </div>
  );
}

export function ClientMarketplaceCategories({
  snapshot,
  isLoading,
  isError,
  onRetry
}: CategoriesScreenProps) {
  const navigate = useNavigate();
  const selectedCityId = useClientPlatformStore((state) => state.selectedCityId);
  const favoriteRestaurantIds = useClientPlatformStore((state) => state.favoriteRestaurantIds);
  const toggleFavoriteRestaurant = useClientPlatformStore((state) => state.toggleFavoriteRestaurant);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [freeDeliveryOnly, setFreeDeliveryOnly] = useState(false);
  const city = snapshot.cities.find((item) => item.id === selectedCityId) ?? snapshot.cities[0];
  const effectiveCityId = city?.id ?? selectedCityId;
  const popularBusinesses = useMemo(() => selectBusinessesForDiscovery(snapshot.restaurants, {
    cityId: effectiveCityId,
    limit: 10
  }), [effectiveCityId, snapshot.restaurants]);
  const activeCategories = BUSINESS_CATEGORIES.filter((category) => category.isActive);

  const openBusinesses = (event?: FormEvent) => {
    event?.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('query', query.trim());
    if (selectedCategory) params.set('businessCategory', selectedCategory);
    if (deliveryOnly) params.set('delivery', '1');
    if (freeDeliveryOnly) params.set('freeDelivery', '1');
    navigate(`/restaurants${params.size > 0 ? `?${params.toString()}` : ''}`);
  };

  return (
    <div className="marketplace-categories-page">
      <DiscoveryHeader cityName={city?.name ?? 'Выбрать город'} />

      <form className="categories-search" role="search" onSubmit={openBusinesses}>
        <button className="categories-search__submit" type="submit" aria-label="Найти бизнес">
          <Search aria-hidden="true" />
        </button>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Что хотите заказать?"
          placeholder="Что хотите заказать?"
        />
        <button type="button" onClick={() => setFiltersOpen(true)} aria-label="Фильтры">
          <SlidersHorizontal aria-hidden="true" />
        </button>
      </form>

      <section className="business-discovery-section" aria-labelledby="popular-businesses-title">
        <header className="business-discovery-heading">
          <h2 id="popular-businesses-title">Популярное рядом</h2>
          <Link to="/restaurants">Смотреть все <ChevronRight aria-hidden="true" /></Link>
        </header>

        {isLoading ? (
          <BusinessCarouselSkeleton />
        ) : isError ? (
          <div className="business-discovery-message" role="alert">
            <Store aria-hidden="true" />
            <span><strong>Не удалось загрузить</strong><small>Проверьте подключение и попробуйте снова.</small></span>
            <button type="button" onClick={onRetry}>Повторить</button>
          </div>
        ) : popularBusinesses.length > 0 ? (
          <div className="business-discovery-carousel" role="list" aria-label="Популярные бизнесы рядом">
            {popularBusinesses.map((business) => (
              <BusinessCard
                business={business}
                dishes={snapshot.dishes}
                isFavorite={favoriteRestaurantIds.includes(business.id)}
                onToggleFavorite={() => toggleFavoriteRestaurant(business.id)}
                key={business.id}
              />
            ))}
          </div>
        ) : (
          <div className="business-discovery-message business-discovery-message--empty">
            <Store aria-hidden="true" />
            <span>
              <strong>Пока рядом нет доступных бизнесов</strong>
              <small>Мы подключаем новые рестораны и магазины.</small>
            </span>
          </div>
        )}
      </section>

      <section className="business-categories-section" aria-labelledby="business-categories-title">
        <h2 id="business-categories-title">Категории бизнеса</h2>
        {isLoading ? (
          <CategoriesGridSkeleton />
        ) : (
          <div className="business-category-grid" role="list" aria-label="Категории бизнеса">
            {activeCategories.map((category) => <CategoryCard category={category} key={category.id} />)}
          </div>
        )}
      </section>

      {filtersOpen && (
        <BusinessFiltersSheet
          selectedCategory={selectedCategory}
          deliveryOnly={deliveryOnly}
          freeDeliveryOnly={freeDeliveryOnly}
          onCategoryChange={setSelectedCategory}
          onDeliveryChange={setDeliveryOnly}
          onFreeDeliveryChange={(value) => {
            setFreeDeliveryOnly(value);
            if (value) setDeliveryOnly(true);
          }}
          onApply={() => openBusinesses()}
          onClose={() => setFiltersOpen(false)}
        />
      )}
    </div>
  );
}
