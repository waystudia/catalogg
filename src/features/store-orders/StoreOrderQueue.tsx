import {
  ChevronRight,
  CircleCheck,
  Filter,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Package,
  RefreshCw,
  Search,
  Store,
  Truck
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RestaurantOrder, RestaurantOrderStatus } from '../../shared/api/restaurantOrdersApi';
import { getVisibleAdminOrderComment, isGroceryStorePosOrder } from '../restaurant-admin/orderPresentation';
import './store-orders.css';

type StoreQueueTab = 'new' | 'accepted' | 'completed' | 'cancelled';
type FulfillmentFilter = 'all' | 'delivery' | 'takeaway';

const tabs: ReadonlyArray<{ id: StoreQueueTab; label: string }> = [
  { id: 'new', label: 'Новые' },
  { id: 'accepted', label: 'Принятые' },
  { id: 'completed', label: 'Выполненные' },
  { id: 'cancelled', label: 'Отменённые' }
];

const completedStatuses = new Set<RestaurantOrderStatus>(['delivered', 'completed']);
const cancelledStatuses = new Set<RestaurantOrderStatus>(['cancelled', 'canceled']);
const newStatuses = new Set<RestaurantOrderStatus>(['new', 'waiting_payment_confirmation', 'payment_confirmed']);

const getTab = (status: RestaurantOrderStatus): StoreQueueTab => {
  if (newStatuses.has(status)) return 'new';
  if (completedStatuses.has(status)) return 'completed';
  if (cancelledStatuses.has(status)) return 'cancelled';
  return 'accepted';
};

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const formatTime = (value: string) => new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit'
}).format(new Date(value));

function CompactMapPreview() {
  return (
    <svg className="store-order-map-preview" role="img" aria-label="Маршрут доставки" viewBox="0 0 132 92">
      <rect width="132" height="92" rx="14" fill="#f5f3ff" />
      <path d="M-4 21 136 48M14 99 53-7M82 99 112-7" stroke="#e8e5f6" strokeWidth="8" />
      <path d="M28 61c15-31 42 14 73-27" fill="none" stroke="#6c45ff" strokeDasharray="3 4" strokeLinecap="round" strokeWidth="2.5" />
      <circle cx="28" cy="61" r="7" fill="#6c45ff" />
      <circle cx="28" cy="61" r="3" fill="white" />
      <circle cx="101" cy="34" r="7" fill="#12a366" />
      <circle cx="101" cy="34" r="3" fill="white" />
    </svg>
  );
}

function IncomingOrderCard({
  order,
  onSelect,
  onOpenChat,
  onAccept
}: {
  order: RestaurantOrder;
  onSelect: () => void;
  onOpenChat: () => void;
  onAccept: () => Promise<void>;
}) {
  const [accepting, setAccepting] = useState(false);
  const comment = getVisibleAdminOrderComment(order.comment);
  const isDelivery = order.fulfillmentType === 'delivery';
  const isNew = getTab(order.status) === 'new';
  const address = isDelivery
    ? order.deliveryAddress || order.deliverySettlement || order.deliveryCity || 'Адрес уточняется'
    : 'Самовывоз';

  const accept = async () => {
    if (accepting) return;
    setAccepting(true);
    try {
      await onAccept();
    } finally {
      setAccepting(false);
    }
  };

  return (
    <article className="store-order-card" data-channel={isDelivery ? 'delivery' : 'takeaway'}>
      <div className="store-order-card__head">
        <span className="store-order-status-badge">{isNew ? 'Новый заказ' : 'Заказ'}</span>
        <strong>#{order.orderNumber}</strong>
        <span className="store-order-card__time">
          <time dateTime={order.createdAt}>{formatTime(order.createdAt)}</time>
          <small>{order.items.length} поз.</small>
        </span>
      </div>

      <div className="store-order-card__body">
        <div className="store-order-card__facts">
          <strong className="store-order-card__price">{formatPrice(order.total)}</strong>
          <span>{isDelivery ? <Truck /> : <Store />}{isDelivery ? 'Доставка' : 'Самовывоз'}</span>
          <span><MapPin />{address}</span>
          {comment && <span className="store-order-card__comment"><MessageSquareText />{comment}</span>}
        </div>
        {isDelivery && <CompactMapPreview />}
        <button className="store-order-card__chevron" type="button" aria-label={`Подробнее о заказе ${order.orderNumber}`} onClick={onSelect}>
          <ChevronRight />
        </button>
      </div>

      <div className="store-order-card__actions">
        <button type="button" onClick={onSelect}>Подробнее</button>
        <button type="button" aria-label={`Чат заказа ${order.orderNumber}`} onClick={onOpenChat}><MessageCircle /> Чат</button>
        {isNew ? (
          <button type="button" disabled={accepting} aria-label={`Принять заказ ${order.orderNumber}`} onClick={() => void accept()}>
            <CircleCheck /> {accepting ? 'Принимаем…' : 'Принять заказ'}
          </button>
        ) : (
          <button type="button" onClick={onSelect}><Package /> Открыть заказ</button>
        )}
      </div>
    </article>
  );
}

export function StoreOrderQueue({
  orders,
  query,
  loading = false,
  error = '',
  onQueryChange,
  onRefresh,
  onSelectOrder,
  onOpenChat,
  onAcceptOrder
}: {
  orders: RestaurantOrder[];
  query: string;
  loading?: boolean;
  error?: string;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
  onSelectOrder: (orderId: string) => void;
  onOpenChat?: (orderId: string) => void;
  onAcceptOrder: (order: RestaurantOrder) => Promise<void>;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilter>('all');
  const remoteOrders = useMemo(
    () => orders.filter((order) => !isGroceryStorePosOrder(order, 'grocery')),
    [orders]
  );
  const [activeTab, setActiveTab] = useState<StoreQueueTab>(() => (
    tabs.find((tab) => remoteOrders.some((order) => getTab(order.status) === tab.id))?.id ?? 'new'
  ));
  const counts = useMemo(() => remoteOrders.reduce<Record<StoreQueueTab, number>>((result, order) => {
    result[getTab(order.status)] += 1;
    return result;
  }, { new: 0, accepted: 0, completed: 0, cancelled: 0 }), [remoteOrders]);
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  const visibleOrders = remoteOrders.filter((order) => {
    if (getTab(order.status) !== activeTab) return false;
    if (fulfillmentFilter !== 'all' && order.fulfillmentType !== fulfillmentFilter) return false;
    if (!normalizedQuery) return true;
    return [order.orderNumber, order.clientName, order.clientPhone, order.deliveryAddress]
      .some((value) => value.toLocaleLowerCase('ru-RU').includes(normalizedQuery));
  });

  return (
    <section className="store-order-queue" aria-label="Заказы магазина">
      <header className="store-order-queue__header">
        <h1>Заказы</h1>
        <div>
          <button type="button" aria-label="Фильтры заказов" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((current) => !current)}><Filter /></button>
          <button type="button" aria-label="Обновить заказы" onClick={onRefresh}><RefreshCw /></button>
        </div>
      </header>

      {filtersOpen && (
        <div className="store-order-queue__filters" role="group" aria-label="Способ получения">
          {([
            ['all', 'Все'],
            ['delivery', 'Доставка'],
            ['takeaway', 'Самовывоз']
          ] as const).map(([value, label]) => (
            <button
              type="button"
              aria-pressed={fulfillmentFilter === value}
              key={value}
              onClick={() => {
                setFulfillmentFilter(value);
                setFiltersOpen(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <label className="store-order-queue__search">
        <Search />
        <span className="sr-only">Поиск заказа</span>
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Номер, имя или телефон" />
      </label>

      <div className="store-order-tabs" role="tablist" aria-label="Статусы заказов">
        {tabs.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label} <span>{counts[tab.id]}</span>
          </button>
        ))}
      </div>

      <div className="store-order-queue__cards">
        {loading ? (
          <div className="store-order-skeletons" role="status" aria-label="Загрузка заказов">
            {[0, 1, 2].map((index) => <i key={index} />)}
          </div>
        ) : error ? (
          <div className="store-order-queue__error" role="alert">
            <strong>Не удалось загрузить заказы</strong>
            <span>{error}</span>
            <button type="button" onClick={onRefresh}>Повторить</button>
          </div>
        ) : visibleOrders.map((order) => (
          <IncomingOrderCard
            key={order.id}
            order={order}
            onSelect={() => onSelectOrder(order.id)}
            onOpenChat={() => (onOpenChat ?? onSelectOrder)(order.id)}
            onAccept={() => onAcceptOrder(order)}
          />
        ))}
        {!loading && !error && visibleOrders.length === 0 && (
          <div className="store-order-queue__empty">
            <Package />
            <strong>Здесь пока нет заказов</strong>
            <span>Новые заказы появятся автоматически.</span>
          </div>
        )}
      </div>
    </section>
  );
}
