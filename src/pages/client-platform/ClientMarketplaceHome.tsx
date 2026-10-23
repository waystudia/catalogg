import {
  Grid2X2,
  Heart,
  Home,
  ReceiptText,
  ShoppingCart,
  Star,
  User
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { MarketplaceItem } from '../../features/client-platform/types';
import { SafeImage } from '../../shared/SafeImage';
import { buildClientNavigationState } from '../../shared/appNavigation';
import { captureCurrentScroll, readExactScroll } from '../../shared/exactScrollState';
import './client-platform.css';

type MarketplaceNavigationTab = 'home' | 'categories' | 'cart' | 'orders' | 'profile';

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

function MarketplaceNavigationLink({
  active,
  to,
  label,
  Icon,
  badge
}: {
  active: boolean;
  to: string;
  label: string;
  Icon: typeof Home;
  badge?: number;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const originPath = `${location.pathname}${location.search}${location.hash}`;

  return (
    <Link
      className={active ? 'is-active' : ''}
      to={to}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        captureCurrentScroll();
        navigate(to, {
          state: buildClientNavigationState(location.state, originPath, readExactScroll(window.history.state))
        });
      }}
    >
      <span className="bottom-nav__icon">
        <Icon aria-hidden="true" />
        {badge && badge > 0 ? <b>{badge}</b> : null}
      </span>
      <span>{label}</span>
    </Link>
  );
}

export function MarketplaceBottomNavigation({
  active,
  cartCount,
  ordersUnreadCount = 0
}: {
  active: MarketplaceNavigationTab;
  cartCount: number;
  ordersUnreadCount?: number;
}) {
  const items = [
    { id: 'home', label: 'Главная', to: '/', Icon: Home },
    { id: 'categories', label: 'Категории', to: '/categories', Icon: Grid2X2 },
    { id: 'cart', label: 'Корзина', to: '/cart', Icon: ShoppingCart },
    { id: 'orders', label: 'Заказы', to: '/profile/orders', Icon: ReceiptText },
    { id: 'profile', label: 'Профиль', to: '/profile', Icon: User }
  ] as const;

  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {items.map(({ id, label, to, Icon }) => (
        <MarketplaceNavigationLink
          active={active === id}
          badge={id === 'cart' ? cartCount : id === 'orders' ? Math.min(ordersUnreadCount, 99) : 0}
          Icon={Icon}
          key={id}
          label={label}
          to={to}
        />
      ))}
    </nav>
  );
}

function MarketplaceProductCard({
  item,
  isFavorite,
  onToggleFavorite
}: {
  item: MarketplaceItem;
  isFavorite: boolean;
  onToggleFavorite: (itemId: string) => void;
}) {
  const linkLabel = `Открыть ${item.title} в ${item.businessName}`;

  return (
    <article className="marketplace-product-card" role="listitem">
      <Link className="marketplace-product-card__link" to={item.href} aria-label={linkLabel}>
        <span className="marketplace-product-card__media">
          <SafeImage src={item.imageUrl} alt={item.title} width={500} height={400} />
        </span>
        <span className="marketplace-product-card__body">
          <strong>{item.title}</strong>
          <small>{item.businessName}</small>
          <span className="marketplace-product-card__meta">
            <span><Star aria-hidden="true" /> {item.rating.toFixed(1)}</span>
            <span>{item.estimatedTime}</span>
          </span>
          <span className="marketplace-product-card__bottom">
            <span className="marketplace-product-card__price">
              <b>{formatPrice(item.price)}</b>
            </span>
            <span className="marketplace-product-card__action" aria-hidden="true">
              <ShoppingCart />
            </span>
          </span>
        </span>
      </Link>
      <button
        className={isFavorite ? 'marketplace-product-card__favorite is-active' : 'marketplace-product-card__favorite'}
        type="button"
        onClick={() => onToggleFavorite(item.id)}
        aria-label={isFavorite ? `Убрать ${item.title} из избранного` : `Добавить ${item.title} в избранное`}
        aria-pressed={isFavorite}
      >
        <Heart aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
}

export function MarketplaceProductGrid({
  items,
  favoriteIds,
  onToggleFavorite
}: {
  items: MarketplaceItem[];
  favoriteIds: string[];
  onToggleFavorite: (itemId: string) => void;
}) {
  return (
    <div className="marketplace-feed-grid" role="list" aria-label="Товары рядом">
      {items.map((item) => (
        <MarketplaceProductCard
          item={item}
          isFavorite={favoriteIds.includes(item.id)}
          onToggleFavorite={onToggleFavorite}
          key={`${item.businessId}:${item.id}`}
        />
      ))}
    </div>
  );
}

export function MarketplaceFeedSkeleton() {
  return (
    <div className="marketplace-feed-grid marketplace-feed-grid--skeleton" aria-label="Загрузка товаров" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <span className="marketplace-product-skeleton" key={index} />
      ))}
    </div>
  );
}
