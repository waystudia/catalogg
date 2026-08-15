import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Ellipsis,
  Map as MapIcon,
  MessageCircle,
  PackageCheck,
  Phone,
  ScanLine,
  ShoppingBag,
  Store,
  X
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Product } from '../../entities/models';
import type { RestaurantOrder, RestaurantOrderStatus } from '../../shared/api/restaurantOrdersApi';
import { scanCatalogOrderItem } from '../../shared/api/orderConversationApi';
import { DeliveryTrackingMap, type DeliveryRouteSummary } from '../../shared/DeliveryTrackingMap';
import { GroceryPickingPanel } from '../order-picking/GroceryPickingPanel';
import { OrderConversationPanel } from '../order-conversation/OrderConversationPanel';
import { getVisibleAdminOrderComment } from '../restaurant-admin/orderPresentation';
import { SharedBarcodeScanner } from '../shared-product-catalog/SharedBarcodeScanner';
import './store-orders.css';

const resolvedItemStates = new Set(['picked', 'substituted', 'removed']);
const activePickingStatuses = new Set<RestaurantOrderStatus>(['preparing', 'cooking']);
const newOrderStatuses = new Set<RestaurantOrderStatus>(['new', 'waiting_payment_confirmation', 'payment_confirmed']);
const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const formatDistance = (distanceM: number) => `${new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
}).format(distanceM / 1000)} км`;

const getStatusLabel = (order: RestaurantOrder) => {
  if (order.fulfillmentType === 'delivery' && ['ready', 'waiting_driver'].includes(order.status)) return 'Ждёт водителя';
  if (['driver_assigned', 'assigned_driver'].includes(order.status)) return 'Водитель назначен';
  if (activePickingStatuses.has(order.status)) return 'Идёт сборка';
  if (order.status === 'ready') return order.fulfillmentType === 'delivery' ? 'Ждёт водителя' : 'Готов к самовывозу';
  if (order.status === 'accepted' || order.status === 'confirmed') return 'Заказ принят';
  return 'Новый заказ';
};

const getRemainingLabel = (estimatedReadyAt?: string | null) => {
  if (!estimatedReadyAt) return '';
  const remainingMs = new Date(estimatedReadyAt).getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'Время вышло';
  const totalMinutes = Math.ceil(remainingMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} мин`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} ч ${minutes} мин`;
};

export function StoreOrderPickingPage({
  order,
  products,
  storeName,
  canPick,
  onBack,
  onStatusChange,
  onPickingChanged,
  onOpenChat
}: {
  order: RestaurantOrder;
  products: Product[];
  storeName: string;
  canPick: boolean;
  onBack: () => void;
  onStatusChange: (status: RestaurantOrderStatus) => Promise<void>;
  onPickingChanged: () => void;
  onOpenChat?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<RestaurantOrderStatus | null>(null);
  const [routeSummary, setRouteSummary] = useState<DeliveryRouteSummary | null>(null);
  const isPicking = activePickingStatuses.has(order.status);
  const isNewOrder = newOrderStatuses.has(order.status);
  const resolvedCount = order.items.filter((item) => resolvedItemStates.has(item.fulfillmentState ?? 'pending')).length;
  const allResolved = order.items.length > 0 && resolvedCount === order.items.length;
  const remainingLabel = getRemainingLabel(order.estimatedReadyAt);
  const visibleComment = getVisibleAdminOrderComment(order.comment);

  const openChat = () => {
    setMenuOpen(false);
    if (onOpenChat) onOpenChat();
    else setChatOpen(true);
  };

  const changeStatus = async (status: RestaurantOrderStatus) => {
    if (busyAction) return;
    setBusyAction(status);
    try {
      await onStatusChange(status);
    } finally {
      setBusyAction(null);
    }
  };

  const handleBarcode = async (barcode: string) => {
    setScannerOpen(false);
    const product = products.find((candidate) => candidate.barcode === barcode);
    const item = product ? order.items.find((candidate) => candidate.productId === product.id) : null;
    if (!item) {
      toast.error(`Не тот товар. Этот товар не входит в заказ #${order.orderNumber}`);
      return;
    }
    if (resolvedItemStates.has(item.fulfillmentState ?? 'pending')) {
      toast.info('Товар уже собран');
      return;
    }
    if (item.saleUnit === 'weight') {
      toast.info(`${item.title}: укажите фактический вес и подтвердите вручную`);
      return;
    }
    try {
      const result = await scanCatalogOrderItem(item.id);
      toast.success(result.state === 'picked'
        ? `${item.title}: собрано`
        : `${item.title}: ${result.fulfilledQuantity} из ${result.requestedQuantity}`);
      onPickingChanged();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось подтвердить товар';
      toast.error(message.includes('already_resolved') ? 'Товар уже собран' : message);
    }
  };

  return (
    <article className="store-picking-page">
      <header className="store-picking-page__header">
        <button type="button" aria-label="Назад к заказам" onClick={onBack}><ArrowLeft /></button>
        <div>
          <h1>Сборка заказа</h1>
          <span>Заказ #{order.orderNumber}</span>
        </div>
        <button type="button" aria-label="Действия с заказом" aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}><Ellipsis /></button>
        {menuOpen && (
          <div className="store-picking-page__menu">
            {order.clientPhone && <a href={`tel:${order.clientPhone.replace(/[^\d+]/g, '')}`} aria-label="Позвонить клиенту"><Phone /> Позвонить клиенту</a>}
            <button type="button" aria-label="Открыть чат заказа" onClick={openChat}><MessageCircle /> Открыть чат</button>
            {!['ready', 'completed', 'delivered', 'cancelled', 'canceled'].includes(order.status) && (
              <button type="button" aria-label="Отменить или сообщить о проблеме" onClick={() => void changeStatus('cancelled')}>
                Отменить или сообщить о проблеме
              </button>
            )}
          </div>
        )}
      </header>

      <div className="store-picking-status">
        <span><i />{getStatusLabel(order)}</span>
        {remainingLabel && <span><Clock3 />Осталось: <strong>{remainingLabel}</strong></span>}
      </div>

      {order.fulfillmentType === 'delivery' && order.restaurantLat !== null && order.restaurantLng !== null && order.deliveryLat !== null && order.deliveryLng !== null ? (
        <section className="store-order-route-block">
          <button
            className="store-order-route-toggle"
            type="button"
            aria-label={mapOpen ? 'Скрыть карту доставки' : 'Показать карту доставки'}
            aria-expanded={mapOpen}
            aria-controls="store-order-delivery-map"
            onClick={() => setMapOpen((current) => !current)}
          >
            <MapIcon />
            <span><small>Адрес доставки</small><strong>{order.deliveryAddress || 'Адрес уточняется'}</strong></span>
            <span>{mapOpen ? 'Скрыть карту' : 'Показать карту'}<ChevronDown /></span>
          </button>
          {mapOpen && (
            <section className="store-order-route-card" id="store-order-delivery-map">
              <DeliveryTrackingMap
                className="store-order-route-card__map"
                restaurant={{ lat: order.restaurantLat, lng: order.restaurantLng, label: storeName, address: order.restaurantAddress }}
                client={{ lat: order.deliveryLat, lng: order.deliveryLng, label: order.clientName || 'Клиент', address: order.deliveryAddress }}
                enableFullscreen={false}
                onRouteSummaryChange={setRouteSummary}
              />
              <div className="store-order-route-card__summary">
                <span><small>Магазин</small><strong>{storeName}</strong><small>{order.restaurantAddress || 'Адрес магазина'}</small></span>
                <span className="store-order-route-card__distance">→<small>{routeSummary ? formatDistance(routeSummary.distanceM) : 'маршрут'}</small></span>
                <span><small>Доставка</small><strong>{order.deliveryAddress || 'Адрес уточняется'}</strong><small>{order.deliverySettlement || order.deliveryCity}</small></span>
              </div>
            </section>
          )}
        </section>
      ) : (
        <section className="store-pickup-card">
          <Store />
          <div><strong>Самовывоз</strong><span>{visibleComment || 'Клиент заберёт заказ в магазине'}</span></div>
        </section>
      )}

      {isNewOrder && (
        <button className="store-picking-primary" type="button" disabled={Boolean(busyAction)} onClick={() => void changeStatus('accepted')}>
          <CheckCircle2 />{busyAction === 'accepted' ? 'Принимаем…' : 'Принять заказ'}
        </button>
      )}

      {['accepted', 'confirmed'].includes(order.status) && (
        <button className="store-picking-primary" type="button" disabled={Boolean(busyAction) || !canPick} onClick={() => void changeStatus('preparing')}>
          <ShoppingBag />{busyAction === 'preparing' ? 'Начинаем…' : 'Приступить к сборке'}
        </button>
      )}

      <button className="store-picking-scan" type="button" disabled={!isPicking || !canPick} onClick={() => setScannerOpen(true)}>
        <ScanLine /> Сканировать товар
      </button>

      <section className="store-picking-progress" aria-label="Прогресс сборки">
        <span><ShoppingBag /><small>Товаров</small><strong>{order.items.length} позиций</strong></span>
        <span><PackageCheck /><small>Собрано</small><strong>{resolvedCount} / {order.items.length}</strong></span>
        <span><CheckCircle2 /><small>Сумма</small><strong>{formatPrice(order.total)}</strong></span>
        <div><i style={{ width: `${order.items.length ? (resolvedCount / order.items.length) * 100 : 0}%` }} /></div>
        <p>Собрано {resolvedCount} / {order.items.length}</p>
      </section>

      <section className="store-picking-items">
        <h2>Список товаров</h2>
        <GroceryPickingPanel
          items={order.items}
          products={products}
          canPick={isPicking && canPick}
          onChanged={onPickingChanged}
          onContactClient={openChat}
        />
      </section>

      <button className="store-picking-finish" type="button" disabled={!isPicking || !allResolved || Boolean(busyAction)} onClick={() => void changeStatus('ready')}>
        <CheckCircle2 /> {busyAction === 'ready' ? 'Завершаем…' : 'Завершить сборку'}
      </button>

      {scannerOpen && <SharedBarcodeScanner onDetected={(barcode) => void handleBarcode(barcode)} onClose={() => setScannerOpen(false)} />}
      {chatOpen && (
        <div className="store-order-chat-sheet" role="dialog" aria-modal="true" aria-label={`Чат заказа ${order.orderNumber}`}>
          <header>
            <strong>Заказ #{order.orderNumber}</strong>
            <button type="button" aria-label="Закрыть чат заказа" onClick={() => setChatOpen(false)}><X /></button>
          </header>
          <OrderConversationPanel
            orderId={order.id}
            catalogId={order.catalogId}
            expectedViewer="staff"
            merchantLabel={storeName}
            orderStatus={order.status}
            onChanged={onPickingChanged}
          />
        </div>
      )}
    </article>
  );
}
