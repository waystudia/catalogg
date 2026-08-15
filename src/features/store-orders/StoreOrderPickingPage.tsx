import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Ellipsis,
  Map as MapIcon,
  MessageCircle,
  PackageCheck,
  Phone,
  ScanLine,
  ShoppingBag,
  Store,
  Truck,
  X
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Product } from '../../entities/models';
import {
  assignRestaurantOrderDriver,
  getCombinedOrderDispatchReadiness,
  getRestaurantDispatchDrivers,
  sendRestaurantOrderToDriverPool,
  type RestaurantDispatchDriver,
  type RestaurantOrder,
  type RestaurantOrderStatus
} from '../../shared/api/restaurantOrdersApi';
import { scanCatalogOrderItem } from '../../shared/api/orderConversationApi';
import { driverHasCapacity } from '../../shared/driverCapacity';
import { DeliveryTrackingMap, type DeliveryRouteSummary } from '../../shared/DeliveryTrackingMap';
import { getCombinedDispatchReadinessMessage } from '../combined-order/dispatchReadiness';
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
  if (order.status === 'waiting_driver') return 'Ждёт водителя';
  if (['driver_assigned', 'assigned_driver'].includes(order.status)) return 'Водитель назначен';
  if (order.status === 'picked_up') return 'Передан водителю';
  if (order.status === 'on_the_way') return 'В пути';
  if (order.status === 'delivered') return 'Доставлен';
  if (order.status === 'completed') return 'Завершён';
  if (['cancelled', 'canceled'].includes(order.status)) return 'Отменён';
  if (activePickingStatuses.has(order.status)) return 'Идёт сборка';
  if (order.status === 'ready') return order.fulfillmentType === 'delivery' ? 'Сборка завершена' : 'Готов к самовывозу';
  if (order.status === 'accepted' || order.status === 'confirmed') return 'Заказ принят';
  return 'Новый заказ';
};

function StoreDeliveryDispatchPanel({ order, onChanged }: { order: RestaurantOrder; onChanged: () => void }) {
  const [assigningDriverId, setAssigningDriverId] = useState('');
  const [isSearchingDriver, setIsSearchingDriver] = useState(false);
  const visible =
    order.fulfillmentType === 'delivery' &&
    ['waiting_driver', 'assigned_driver', 'driver_assigned'].includes(order.status);
  const driversQuery = useQuery({
    queryKey: ['store-dispatch-drivers', order.id, order.catalogId, order.deliveryCity, order.deliverySettlement],
    queryFn: () => getRestaurantDispatchDrivers(order),
    enabled: visible && !order.driverName,
    staleTime: 20_000
  });
  const drivers = driversQuery.data ?? [];
  const ownDrivers = drivers.filter((driver) => driver.scope === 'restaurant');
  const onlineDrivers = drivers.filter((driver) => driver.isOnline && driver.servesOrder);

  if (!visible) return null;

  const canAssign = (driver: RestaurantDispatchDriver) =>
    Boolean(order.deliveryId) &&
    driver.isOnline &&
    driver.servesOrder &&
    driverHasCapacity(driver.activeDeliveries, driver.maxActiveDeliveries);

  const assignDriver = async (driver: RestaurantDispatchDriver) => {
    if (!canAssign(driver) || assigningDriverId) return;
    setAssigningDriverId(driver.id);
    try {
      await assignRestaurantOrderDriver(order, driver.id);
      toast.success(`Заказ отправлен водителю: ${driver.name}`);
      onChanged();
      void driversQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось назначить водителя');
    } finally {
      setAssigningDriverId('');
    }
  };

  const searchDriverPool = async () => {
    if (isSearchingDriver || !order.deliveryId) return;
    setIsSearchingDriver(true);
    try {
      await sendRestaurantOrderToDriverPool(order);
      toast.success(
        onlineDrivers.length > 0
          ? `Заказ опубликован для ${onlineDrivers.length} онлайн-водителей`
          : 'Заказ опубликован. Он появится у водителей, когда они выйдут онлайн.'
      );
      onChanged();
      void driversQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось вызвать водителей');
    } finally {
      setIsSearchingDriver(false);
    }
  };

  return (
    <section className="store-delivery-dispatch" aria-label="Выбор курьера">
      <header>
        <span><Truck /></span>
        <div><strong>Курьер для доставки</strong><small>В сети: {onlineDrivers.length}</small></div>
        <button type="button" onClick={() => void driversQuery.refetch()} disabled={driversQuery.isFetching}>Обновить</button>
      </header>
      {order.driverName ? (
        <div className="store-delivery-dispatch__assigned">
          <span>Назначен водитель</span>
          <strong>{order.driverName}</strong>
          {order.driverVehicleInfo && <small>{order.driverVehicleInfo}{order.driverCarNumber ? ` · ${order.driverCarNumber}` : ''}</small>}
          {order.driverPhone && <a href={`tel:${order.driverPhone.replace(/[^\d+]/g, '')}`}><Phone /> {order.driverPhone}</a>}
        </div>
      ) : (
        <>
          {!order.deliveryId && <p>Создаём задачу доставки…</p>}
          {ownDrivers.length > 0 ? (
            <div className="store-delivery-dispatch__drivers">
              {ownDrivers.map((driver) => (
                <button
                  type="button"
                  key={driver.id}
                  disabled={!canAssign(driver) || Boolean(assigningDriverId)}
                  data-online={driver.isOnline || undefined}
                  onClick={() => void assignDriver(driver)}
                >
                  <span><strong>{driver.name}{driver.isPrimary ? ' · Основной' : ''}</strong><small>{driver.vehicleInfo || 'Штатный курьер'} · заказов {driver.activeDeliveries}/{driver.maxActiveDeliveries}</small></span>
                  <b>{!driver.isOnline ? 'Не в сети' : canAssign(driver) ? 'Назначить' : 'Занят'}</b>
                </button>
              ))}
            </div>
          ) : (
            <p>Штатных курьеров нет в списке. Можно вызвать водителей платформы.</p>
          )}
          <button className="store-delivery-dispatch__pool" type="button" disabled={isSearchingDriver || !order.deliveryId} onClick={() => void searchDriverPool()}>
            <Truck /> {isSearchingDriver ? 'Ищем водителей…' : 'Вызвать таксистов'}
          </button>
        </>
      )}
    </section>
  );
}

export function StoreOrderPickingPage({
  order,
  products,
  storeName,
  canPick,
  canManageDelivery = true,
  onBack,
  onStatusChange,
  onPickingChanged,
  onOpenChat
}: {
  order: RestaurantOrder;
  products: Product[];
  storeName: string;
  canPick: boolean;
  canManageDelivery?: boolean;
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
  const visibleComment = getVisibleAdminOrderComment(order.comment);
  const dispatchReadinessQuery = useQuery({
    queryKey: ['store-combined-order-dispatch-readiness', order.id, order.catalogId, order.orderGroupId],
    queryFn: () => getCombinedOrderDispatchReadiness(order),
    enabled: Boolean(canManageDelivery && order.orderGroupId && order.status === 'ready' && order.fulfillmentType === 'delivery'),
    refetchInterval: 5_000,
    staleTime: 2_000
  });
  const dispatchReadiness = dispatchReadinessQuery.data;
  const dispatchBlocked = Boolean(
    order.orderGroupId &&
    order.status === 'ready' &&
    (dispatchReadinessQuery.isLoading || dispatchReadinessQuery.isError || !dispatchReadiness?.canDispatch)
  );
  const dispatchMessage = dispatchReadiness
    ? getCombinedDispatchReadinessMessage(dispatchReadiness)
    : order.orderGroupId && order.status === 'ready'
      ? 'Проверяем готовность всех заказов…'
      : '';

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
      onPickingChanged();
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
                driver={order.driverLat !== null && order.driverLng !== null ? { lat: order.driverLat, lng: order.driverLng, label: order.driverName || 'Водитель' } : null}
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

      {(isPicking || ['accepted', 'confirmed'].includes(order.status)) && (
        <button className="store-picking-scan" type="button" disabled={!isPicking || !canPick} onClick={() => setScannerOpen(true)}>
          <ScanLine /> Сканировать товар
        </button>
      )}

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
          showDisabledNotice={isPicking && !canPick}
          onChanged={onPickingChanged}
          onContactClient={openChat}
        />
      </section>

      {isPicking && (
        <button className="store-picking-finish" type="button" disabled={!allResolved || Boolean(busyAction)} onClick={() => void changeStatus('ready')}>
          <CheckCircle2 /> {busyAction === 'ready' ? 'Завершаем…' : 'Завершить сборку'}
        </button>
      )}

      {canManageDelivery && order.status === 'ready' && order.fulfillmentType === 'delivery' && (
        <section className="store-picking-dispatch-action" aria-label="Вызов доставки">
          <button
            className="store-picking-finish"
            type="button"
            disabled={Boolean(busyAction) || dispatchBlocked || ['waiting_confirmation', 'rejected'].includes(order.paymentStatus)}
            onClick={() => void changeStatus('waiting_driver')}
          >
            <Truck /> {busyAction === 'waiting_driver' ? 'Вызываем доставку…' : 'Вызвать доставку'}
          </button>
          {dispatchMessage && <p data-blocked={dispatchBlocked || undefined}>{dispatchMessage}</p>}
        </section>
      )}

      {order.status === 'ready' && order.fulfillmentType !== 'delivery' && (
        <button className="store-picking-finish" type="button" disabled={Boolean(busyAction)} onClick={() => void changeStatus('completed')}>
          <CheckCircle2 /> {busyAction === 'completed' ? 'Завершаем…' : 'Заказ выдан'}
        </button>
      )}

      {canManageDelivery && <StoreDeliveryDispatchPanel order={order} onChanged={onPickingChanged} />}

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
            presentation="messenger"
            onChanged={onPickingChanged}
          />
        </div>
      )}
    </article>
  );
}
