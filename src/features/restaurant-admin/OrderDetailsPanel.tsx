import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Truck,
  User
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  assignRestaurantOrderDriver,
  confirmRestaurantCashPayment,
  getRestaurantDispatchDrivers,
  sendRestaurantOrderToDriverPool,
  type RestaurantDispatchDriver,
  type RestaurantOrder,
  type RestaurantOrderStatus
} from '../../shared/api/restaurantOrdersApi';
import { driverHasCapacity } from '../../shared/driverCapacity';
import { DeliveryTrackingMap } from '../../shared/DeliveryTrackingMap';
import {
  loadPaymentStatus,
  savePaymentStatus,
  type PaymentStatus,
  type RestaurantPaymentSettings
} from '../../shared/paymentSettings';
import {
  adminOrderStatusLabels,
  adminOrderStatusTones,
  fulfillmentLabels,
  getAdminOrderItemsCount,
  getAdminOrderLocationLabel,
  getAdminOrderPhoneHref,
  getAdminOrderRouteHref,
  getAdminOrderWhatsAppHref,
  getOrderPaymentMethod,
  getVisibleAdminOrderComment,
  orderPaymentMethodLabels,
  paymentStatusLabels
} from './orderPresentation';

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

export function OrderDetailsPanel({
  order,
  catalogSlug,
  paymentSettings,
  onClose,
  onStatus,
  onRefreshOrders,
  onDelete
}: {
  order: RestaurantOrder;
  catalogSlug: string;
  paymentSettings: RestaurantPaymentSettings;
  onClose: () => void;
  onStatus: (status: RestaurantOrderStatus, reason?: string) => Promise<void>;
  onRefreshOrders: () => void;
  onDelete: () => void;
}) {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(() => loadPaymentStatus(catalogSlug, order.id));
  const [assigningDriverId, setAssigningDriverId] = useState('');
  const [isSearchingDriver, setIsSearchingDriver] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isConfirmingCash, setIsConfirmingCash] = useState(false);
  const showDriverDispatch =
    order.fulfillmentType === 'delivery' &&
    !order.driverName &&
    ['waiting_driver', 'assigned_driver', 'driver_assigned'].includes(order.status);
  const dispatchDriversQuery = useQuery({
    queryKey: ['restaurant-dispatch-drivers', order.id, order.catalogId, order.deliveryCity, order.deliverySettlement, order.driverName],
    queryFn: () => getRestaurantDispatchDrivers(order),
    enabled: showDriverDispatch,
    staleTime: 20_000
  });
  const dispatchDrivers = dispatchDriversQuery.data ?? [];
  const onlineDrivers = dispatchDrivers.filter((driver) => driver.isOnline && driver.servesOrder);
  const ownDrivers = dispatchDrivers.filter((driver) => driver.scope === 'restaurant');
  const ownOnlineDrivers = ownDrivers.filter(
    (driver) =>
      driver.isOnline &&
      driver.servesOrder &&
      driverHasCapacity(driver.activeDeliveries, driver.maxActiveDeliveries)
  );
  const updatePaymentStatus = (status: PaymentStatus) => {
    savePaymentStatus(catalogSlug, order.id, status);
    setPaymentStatus(status);
  };

  useEffect(() => {
    setPaymentStatus(loadPaymentStatus(catalogSlug, order.id));
  }, [catalogSlug, order.id]);
  const refreshDriverDispatch = () => {
    onRefreshOrders();
    void dispatchDriversQuery.refetch();
  };
  const assignDriver = (driver: RestaurantDispatchDriver) => {
    if (!order.deliveryId) {
      toast.error('Сначала нажмите «Вызвать доставку», чтобы создать задачу для водителя.');
      return;
    }

    setAssigningDriverId(driver.id);
    assignRestaurantOrderDriver(order, driver.id)
      .then(() => {
        toast.success(`Заказ отправлен водителю: ${driver.name}`);
        refreshDriverDispatch();
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Не удалось назначить водителя');
      })
      .finally(() => setAssigningDriverId(''));
  };
  const searchDriverPool = () => {
    setIsSearchingDriver(true);
    sendRestaurantOrderToDriverPool(order)
      .then(() => {
        toast.success('Заказ отправлен всем доступным водителям');
        refreshDriverDispatch();
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Не удалось отправить заказ водителям');
      })
      .finally(() => setIsSearchingDriver(false));
  };
  const phoneHref = getAdminOrderPhoneHref(order.clientPhone);
  const whatsappHref = getAdminOrderWhatsAppHref(order.clientPhone);
  const routeHref = getAdminOrderRouteHref(order);
  const orderAddress = getAdminOrderLocationLabel(order);
  const visibleComment = getVisibleAdminOrderComment(order.comment);
  const orderPaymentMethod = order.comment.includes('[payment_method:')
    ? getOrderPaymentMethod(order.comment)
    : paymentSettings.transferEnabled && paymentStatus !== 'unpaid'
      ? 'bank_transfer'
      : 'cash';
  const orderDate = new Date(order.createdAt);
  const orderItemsCount = getAdminOrderItemsCount(order);
  const orderIsFinished = ['cancelled', 'canceled', 'completed', 'delivered'].includes(order.status);
  const waitingForPayment = ['waiting_confirmation', 'rejected'].includes(order.paymentStatus);
  const driverAtRestaurant = order.deliveryStatus === 'arrived_to_restaurant';
  const cashHandover = orderPaymentMethod === 'cash' && driverAtRestaurant;
  const cashPaymentConfirmed = Boolean(order.restaurantPaymentConfirmedAt);
  const pickupQrConfirmed = Boolean(order.pickupQrConfirmedAt);
  const rejectOrder = async () => {
    if (isRejecting) return;
    setIsRejecting(true);
    try {
      await onStatus('canceled', 'restaurant_rejected');
      toast.success('Заказ отклонён');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось отклонить заказ');
    } finally {
      setIsRejecting(false);
    }
  };
  const confirmCashPayment = async () => {
    if (isConfirmingCash) return;
    setIsConfirmingCash(true);
    try {
      const confirmed = await confirmRestaurantCashPayment(order);
      if (!confirmed) throw new Error('Не удалось подтвердить оплату');
      toast.success('Оплата водителем подтверждена');
      onRefreshOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось подтвердить оплату');
    } finally {
      setIsConfirmingCash(false);
    }
  };
  const nextStatusAction:
    | { label: string; status: RestaurantOrderStatus; disabled?: boolean }
    | null =
    order.status === 'new'
      ? { label: 'Принять заказ', status: 'accepted' }
      : ['accepted', 'confirmed'].includes(order.status)
        ? { label: 'Начать готовить', status: 'preparing' }
        : order.status === 'preparing'
          ? { label: 'Заказ готов', status: 'ready' }
          : order.status === 'ready' && order.fulfillmentType === 'delivery'
            ? { label: 'Вызвать доставку', status: 'waiting_driver', disabled: waitingForPayment }
            : order.status === 'ready'
              ? { label: 'Завершить заказ', status: 'completed' }
              : order.status === 'on_the_way'
                  ? { label: 'Заказ доставлен', status: 'delivered' }
                  : null;

  return (
    <aside className="admin-order-details-panel">
      <section className="admin-order-work-card">
        <header className="admin-order-work-card__header">
          <button type="button" onClick={onClose} aria-label="Назад к списку заказов"><ArrowLeft /></button>
          <div>
            <span>Заказ #{order.orderNumber}</span>
            <strong>{adminOrderStatusLabels[order.status]}</strong>
            <i data-tone={adminOrderStatusTones[order.status]}>
              <span aria-hidden="true" />
              {adminOrderStatusLabels[order.status]}
            </i>
          </div>
          <div className="admin-order-work-card__total">
            <strong>{formatPrice(order.total)}</strong>
            <small>{orderItemsCount} позиций</small>
          </div>
          <details className="admin-order-more">
            <summary aria-label="Дополнительные действия"><MoreHorizontal /></summary>
            <div>
              <span>Оплата</span>
              <button type="button" onClick={() => updatePaymentStatus('awaiting')}>Ожидает подтверждения</button>
              <button type="button" onClick={() => updatePaymentStatus('confirmed')}>Подтвердить оплату</button>
              <button type="button" onClick={() => updatePaymentStatus('declined')}>Отклонить оплату</button>
              {!orderIsFinished && order.status !== 'new' && (
                <button type="button" data-danger="true" onClick={() => onStatus('cancelled', 'restaurant_rejected')}>
                  Отменить заказ
                </button>
              )}
              {!orderIsFinished && (
                <button
                  type="button"
                  data-danger="true"
                  onClick={() => {
                    if (window.confirm('Удалить заказ? Это действие нельзя отменить.')) {
                      onDelete();
                    }
                  }}
                >
                  Удалить заказ
                </button>
              )}
            </div>
          </details>
        </header>

        <section className="admin-order-facts">
          <article>
            <Truck />
            <span>{fulfillmentLabels[order.fulfillmentType]}</span>
            <strong>{order.fulfillmentType === 'delivery' ? order.deliverySettlement || order.deliveryCity || 'Доставка' : order.cabinLabel || fulfillmentLabels[order.fulfillmentType]}</strong>
            <small>{orderDate.toLocaleDateString('ru-RU')} · {orderDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>
          </article>
          <article>
            <User />
            <span>Клиент</span>
            <strong>{order.clientName || 'Клиент'}</strong>
            <small>{order.clientPhone || 'Телефон не указан'}</small>
          </article>
          <article>
            <MapPin />
            <span>Адрес</span>
            <strong>{orderAddress}</strong>
            {routeHref ? (
              <a href={routeHref} target="_blank" rel="noreferrer">Маршрут <ArrowRight /></a>
            ) : (
              <small>Маршрут недоступен</small>
            )}
          </article>
        </section>

        {visibleComment && <p className="admin-order-comment">{visibleComment}</p>}

        {order.restaurantLat !== null && order.restaurantLng !== null && order.deliveryLat !== null && order.deliveryLng !== null && (
          <details className="admin-order-map-details">
            <summary>Карта доставки</summary>
            <DeliveryTrackingMap
              restaurant={{ lat: order.restaurantLat, lng: order.restaurantLng, label: 'Ресторан', address: order.restaurantAddress }}
              client={{ lat: order.deliveryLat, lng: order.deliveryLng, label: order.clientName || 'Клиент', address: orderAddress }}
              driver={order.driverLat !== null && order.driverLng !== null
                ? { lat: order.driverLat, lng: order.driverLng, label: order.driverName || 'Водитель' }
                : null}
            />
          </details>
        )}

        <section className="admin-order-composition">
        <h2>Состав заказа</h2>
        <div className="admin-order-items">
          {order.items.map((item) => (
            <div key={item.id}>
              <span>{item.title}</span>
              <small>×{item.quantity}</small>
              <strong>{formatPrice(item.lineTotal)}</strong>
            </div>
          ))}
        </div>
        <div className="admin-order-total">
          <span>Итого</span>
          <strong>{formatPrice(order.total)}</strong>
        </div>
        </section>

        <section className="admin-order-status-grid">
          <article>
            <span>Оплата</span>
            <strong>{paymentStatusLabels[paymentStatus]}</strong>
            <small>{orderPaymentMethodLabels[orderPaymentMethod]}</small>
          </article>
          <article>
            <span>{order.verificationCode ? 'Код подтверждения' : 'Подтверждение доставки'}</span>
            <strong>{order.verificationCode ?? (order.qrToken ? 'QR включен' : 'Не требуется')}</strong>
          </article>
        </section>

        {cashHandover && (
          <section className="admin-cash-handover">
            <strong>Выдача наличного заказа</strong>
            {!cashPaymentConfirmed ? (
              <>
                <p>Получите от водителя {formatPrice(order.subtotal)} за заказ. Без подтверждения QR не активируется.</p>
                <button type="button" disabled={isConfirmingCash} onClick={() => void confirmCashPayment()}>
                  {isConfirmingCash ? 'Подтверждаем...' : 'Подтверждаю оплату'}
                </button>
              </>
            ) : !pickupQrConfirmed ? (
              <p data-complete="true">Оплата подтверждена — отсканируйте QR водителя во вкладке «Сканер».</p>
            ) : (
              <p data-complete="true">Оплата и QR подтверждены. Водитель может нажать «Забрал заказ».</p>
            )}
          </section>
        )}

        {order.driverName && (
          <section className="admin-order-driver-card">
            <span className="admin-order-driver-card__icon"><Truck /></span>
            <span>
              <small>Заказ принял водитель</small>
              <strong>{order.driverName}</strong>
              {order.driverLocationAt && (
                <small>Был в сети: {new Date(order.driverLocationAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>
              )}
            </span>
            {order.driverPhone && <a href={`tel:${order.driverPhone}`}><Phone />Позвонить</a>}
          </section>
        )}

        <div className="admin-order-contact-actions">
          {phoneHref && <a href={phoneHref}><Phone />Позвонить</a>}
          {whatsappHref && <a href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle />WhatsApp</a>}
        </div>

        <footer className="admin-order-primary-actions">
        {order.status === 'new' && (
          <button className="admin-order-primary-actions__reject" type="button" disabled={isRejecting} onClick={() => void rejectOrder()}>
            {isRejecting ? 'Отклоняем...' : 'Отклонить'}
          </button>
        )}
        {nextStatusAction && (
          <button
            className="admin-order-primary-actions__main"
            type="button"
            disabled={nextStatusAction.disabled}
            onClick={() => onStatus(nextStatusAction.status)}
          >
            {nextStatusAction.label}
          </button>
        )}
        {orderIsFinished && (
          <p className="admin-order-primary-actions__complete">
            <Check /> {adminOrderStatusLabels[order.status]}
          </p>
        )}
        {showDriverDispatch && (
          <section className="admin-driver-dispatch">
            <header>
              <div>
                <strong>{ownDrivers.length > 0 ? 'Курьеры ресторана' : 'Водители'}</strong>
                <span>В сети: {onlineDrivers.length}</span>
              </div>
              <button type="button" onClick={() => void dispatchDriversQuery.refetch()} disabled={dispatchDriversQuery.isFetching}>
                Обновить
              </button>
            </header>

            {order.driverName ? (
              <div className="admin-driver-dispatch__assigned">
                <span>Назначен водитель</span>
                <strong>{order.driverName}</strong>
                {order.driverPhone && <a href={`tel:${order.driverPhone}`}>{order.driverPhone}</a>}
                {order.driverLocationAt && <small>Был в сети: {new Date(order.driverLocationAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>}
              </div>
            ) : (
              <>
                {ownDrivers.length > 0 ? (
                  <div className="admin-driver-list">
                    {ownDrivers.map((driver) => {
                      const canAssign =
                        driver.isOnline &&
                        driver.servesOrder &&
                        driverHasCapacity(driver.activeDeliveries, driver.maxActiveDeliveries) &&
                        assigningDriverId !== driver.id;
                      return (
                        <button
                          type="button"
                          key={driver.id}
                          onClick={() => assignDriver(driver)}
                          disabled={!canAssign || Boolean(assigningDriverId)}
                          data-online={driver.isOnline}
                        >
                          <span>
                            <strong>{driver.name}{driver.isPrimary ? ' · Основной курьер' : ''}</strong>
                            <small>{driver.vehicleInfo || 'Курьер'}{driver.carNumber ? ` · ${driver.carNumber}` : ''}</small>
                            <small>Заказов: {driver.activeDeliveries} из {driver.maxActiveDeliveries}</small>
                          </span>
                          <b>
                            {!driver.isOnline
                              ? 'Не в сети'
                              : !driverHasCapacity(driver.activeDeliveries, driver.maxActiveDeliveries)
                                ? 'Занят'
                                : 'Отправить'}
                          </b>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p>Свободных курьеров ресторана нет. Можно вызвать водителей платформы.</p>
                )}

                <button className="admin-driver-dispatch__search" type="button" onClick={searchDriverPool} disabled={isSearchingDriver}>
                  {isSearchingDriver ? 'Ищем водителей...' : 'Вызвать таксистов'}
                </button>
                {ownOnlineDrivers.length === 0 && <small>Заказ увидят все подходящие онлайн-водители.</small>}
              </>
            )}
          </section>
        )}
        </footer>
      </section>
    </aside>
  );
}
