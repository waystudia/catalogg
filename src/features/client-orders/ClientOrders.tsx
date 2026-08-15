import {
  Bike,
  CheckCircle2,
  Clock3,
  MapPin,
  MessageCircle,
  PackageCheck,
  Repeat2,
  Store
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ClientOrder, ClientOrderStatus, ClientRestaurant } from '../client-platform/types';
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
  restaurant,
  orderNumber,
  statusLabel,
  detailsPath,
  chatPath,
  trackingHref,
  unreadCount = 0,
  onRepeat
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
}) {
  const isCurrent = orderIsCurrent(order);
  const targetTime = formatClientOrderTargetTime(order);
  const merchantInitial = order.restaurantName.trim().slice(0, 1).toLocaleUpperCase('ru-RU') || 'W';
  return (
    <article className="client-order-card" data-state={isCurrent ? 'current' : order.status}>
      <header className="client-order-card__head">
        <span className="client-order-card__logo" aria-hidden="true">
          {restaurant?.logoUrl
            ? <img src={restaurant.logoUrl} alt="" loading="lazy" />
            : merchantInitial}
        </span>
        <span className="client-order-card__merchant">
          <strong>{order.restaurantName}</strong>
          <small>Заказ №{orderNumber}</small>
          <time dateTime={order.createdAt}>{formatClientOrderDate(order.createdAt)}</time>
        </span>
        <span className="client-order-card__amount">
          <strong>{new Intl.NumberFormat('ru-RU').format(order.totalAmount)} ₽</strong>
          <small>{statusLabel}</small>
        </span>
      </header>

      <div className="client-order-card__badge-row">
        <OrderStatusBadge status={order.status} label={getClientOrderBadgeLabel(order.status)} />
        {unreadCount > 0 && <span className="client-order-card__unread"><MessageCircle /> {Math.min(unreadCount, 99)}</span>}
      </div>

      <section className="client-order-card__facts">
        <span>
          <Clock3 aria-hidden="true" />
          <small>{order.status === 'completed' ? 'Заказ доставлен' : order.orderType === 'delivery' && targetTime ? `Доставка к ${targetTime}` : 'Заказ оформлен'}</small>
        </span>
        <span>
          <MapPin aria-hidden="true" />
          <small>{order.addressLine || 'Адрес не указан'}</small>
        </span>
      </section>

      {isCurrent && <DeliveryProgressCard order={order} statusLabel={statusLabel} trackingHref={trackingHref} />}

      <footer className="client-order-card__actions">
        <Link to={detailsPath}>Подробнее</Link>
        {isCurrent ? (
          <Link className="is-primary" to={chatPath}>
            <MessageCircle /> Чат с {restaurant?.businessType === 'grocery' ? 'магазином' : 'рестораном'}
            {unreadCount > 0 && <b>{Math.min(unreadCount, 99)}</b>}
          </Link>
        ) : (
          <button type="button" onClick={onRepeat}><Repeat2 /> Повторить заказ</button>
        )}
      </footer>
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
