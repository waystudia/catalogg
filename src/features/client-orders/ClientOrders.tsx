import {
  Bike,
  ChevronRight,
  CheckCircle2,
  MessageCircle,
  PackageCheck,
  Store
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ClientOrder, ClientOrderStatus, ClientRestaurant } from '../client-platform/types';
import { SafeImage } from '../../shared/SafeImage';
import './client-orders.css';

export type ClientOrderFilter = 'all' | 'current' | 'completed' | 'canceled';

const terminalStatuses = new Set<ClientOrderStatus>(['completed', 'canceled']);

export const orderIsCurrent = (order: ClientOrder) => !terminalStatuses.has(order.status);

export const getClientOrderStatusTone = (status: ClientOrderStatus) => {
  if (status === 'canceled') return 'danger';
  if (status === 'completed' || status === 'ready') return 'success';
  if (status === 'cooking' || status === 'waiting_driver') return 'warning';
  if (status === 'assigned_driver' || status === 'picked_up' || status === 'on_the_way') return 'delivery';
  return 'primary';
};

export const getClientOrderBadgeLabel = (status: ClientOrderStatus) => {
  const labels: Record<ClientOrderStatus, string> = {
    new: 'Заказ создан',
    waiting_payment_confirmation: 'Ожидает подтверждения оплаты',
    payment_confirmed: 'Оплата подтверждена',
    accepted: 'Заказ принят',
    cooking: 'Готовится',
    ready: 'Готов к выдаче',
    waiting_driver: 'Ожидает курьера',
    assigned_driver: 'Курьер назначен',
    picked_up: 'Заказ у курьера',
    on_the_way: 'Заказ у курьера',
    completed: 'Заказ завершён',
    canceled: 'Заказ отменён'
  };
  return labels[status];
};

export const formatClientOrderDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date).replace(',', ' ·');
};

export const formatClientOrderTargetTime = (order: ClientOrder) => {
  const createdAt = new Date(order.createdAt).getTime();
  if (!Number.isFinite(createdAt)) return '';
  const minutes = Math.max(order.estimatedTimeMax, order.estimatedTimeMin, 0);
  return new Date(createdAt + minutes * 60_000).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getLiveStatus = (order: ClientOrder, statusLabel: string) => {
  if (order.status === 'on_the_way' || order.status === 'picked_up') {
    return {
      Icon: Bike,
      title: 'Курьер в пути',
      detail: `Ориентировочно ${order.estimatedTimeMin}–${order.estimatedTimeMax} мин.`
    };
  }
  if (order.status === 'assigned_driver') {
    return { Icon: Bike, title: 'Курьер назначен', detail: 'Курьер скоро заберёт заказ.' };
  }
  if (order.status === 'cooking') {
    return { Icon: Store, title: 'Заказ готовят', detail: `Ориентировочно ${order.estimatedTimeMin}–${order.estimatedTimeMax} мин.` };
  }
  if (order.status === 'ready' || order.status === 'waiting_driver') {
    return { Icon: PackageCheck, title: 'Заказ готов', detail: 'Ожидаем курьера для получения.' };
  }
  return { Icon: CheckCircle2, title: statusLabel, detail: 'Следующее обновление появится автоматически.' };
};

export function OrderStatusBadge({ status, label }: { status: ClientOrderStatus; label: string }) {
  return <span className="client-order-status" data-tone={getClientOrderStatusTone(status)}>{label}</span>;
}
export function OrderFilterChips({
  value,
  currentCount,
  onChange
}: {
  value: ClientOrderFilter;
  currentCount: number;
  onChange: (value: ClientOrderFilter) => void;
}) {
  const filters: Array<{ id: ClientOrderFilter; label: string; count?: number }> = [
    { id: 'all', label: 'Все' },
    { id: 'current', label: 'Текущие', count: currentCount },
    { id: 'completed', label: 'Завершённые' },
    { id: 'canceled', label: 'Отменённые' }
  ];
  return (
    <nav className="client-order-filters" aria-label="Фильтр заказов">
      {filters.map((filter) => (
        <button
          type="button"
          aria-pressed={value === filter.id}
          data-active={value === filter.id}
          onClick={() => onChange(filter.id)}
          key={filter.id}
        >
          {filter.label}
          {filter.count !== undefined && <b>{filter.count}</b>}
        </button>
      ))}
    </nav>
  );
}

export function DeliveryProgressCard({
  order,
  statusLabel,
  trackingHref
}: {
  order: ClientOrder;
  statusLabel: string;
  trackingHref?: string;
}) {
  const live = getLiveStatus(order, statusLabel);
  return (
    <section className="client-order-progress" aria-label={`Текущий статус: ${live.title}`}>
      <live.Icon aria-hidden="true" />
      <span>
        <strong>{live.title}</strong>
        <small>{live.detail}</small>
      </span>
      {trackingHref && (
        <a href={trackingHref} target="_blank" rel="noreferrer">Отследить</a>
      )}
    </section>
  );
}

export function ClientOrderCard({
  order,
  orderNumber,
  detailsPath,
  previewDishes = [],
  previewFallbackUrl = '',
  unreadCount = 0
}: {
  order: ClientOrder;
  restaurant?: ClientRestaurant;
  orderNumber: string;
  statusLabel: string;
  detailsPath: string;
  chatPath: string;
  trackingHref?: string;
  unreadCount?: number;
  onRepeat: () => void;
  previewDishes?: Array<Pick<ClientOrder['items'][number], 'dishId' | 'name'> & { imageUrl: string }>;
  previewFallbackUrl?: string;
}) {
  const isCurrent = orderIsCurrent(order);
  const compactDate = formatClientOrderDate(order.createdAt).split(' ·')[0];
  const fulfillmentLabel = order.orderType === 'delivery'
    ? 'Доставка'
    : order.orderType === 'pickup'
      ? 'Самовывоз'
      : 'В заведении';
  const visibleDishes = previewDishes.slice(0, 3);
  return (
    <article className="client-order-card" data-state={isCurrent ? 'current' : order.status}>
      <Link className="client-order-card__link" to={detailsPath} aria-label={`Открыть заказ ${orderNumber} в заведении ${order.restaurantName}`}>
        <span className="client-order-card__content">
          <small className="client-order-card__eyebrow">{isCurrent ? 'Текущий заказ' : 'Заказ'}</small>
          <strong>{order.restaurantName}</strong>
          <span>№{orderNumber} · {new Intl.NumberFormat('ru-RU').format(order.totalAmount)} ₽</span>
          <time dateTime={order.createdAt}>{compactDate} · {fulfillmentLabel}</time>
          <OrderStatusBadge status={order.status} label={getClientOrderBadgeLabel(order.status)} />
        </span>
        <span className="client-order-card__aside">
          {unreadCount > 0 && <span className="client-order-card__unread" aria-label={`Новых сообщений: ${Math.min(unreadCount, 99)}`}><MessageCircle /> {Math.min(unreadCount, 99)}</span>}
          <span className="client-order-card__preview" aria-hidden="true">
            {visibleDishes.length > 0 ? (
              <span className={visibleDishes.length > 1 ? 'client-order-card__dish-fan is-stacked' : 'client-order-card__dish-fan'}>
                {visibleDishes.map((dish) => (
                  <SafeImage className="client-order-card__dish-image" key={dish.dishId} src={dish.imageUrl} alt="" width={140} height={140} />
                ))}
              </span>
            ) : previewFallbackUrl ? (
              <SafeImage src={previewFallbackUrl} alt="" width={140} height={140} />
            ) : null}
            <ChevronRight />
          </span>
        </span>
      </Link>
    </article>
  );
}

export function ClientOrdersSkeleton() {
  return (
    <div className="client-order-skeletons" aria-label="Загружаем заказы">
      {Array.from({ length: 3 }, (_, index) => <span key={index} />)}
    </div>
  );
}
