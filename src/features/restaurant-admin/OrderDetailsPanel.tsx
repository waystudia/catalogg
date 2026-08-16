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
import type { Product } from '../../entities/models';
import { getBusinessOrderCapabilities } from '../../entities/businessOrderCapabilities';
import {
  assignRestaurantOrderDriver,
  confirmRestaurantCashPayment,
  getCombinedOrderDispatchReadiness,
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
  adminOrderStatusTones,
  formatAdminOrderItemQuantity,
  getAdminOrderFulfillmentLabel,
  getAdminOrderItemsCount,
  getAdminOrderLocationLabel,
  getAdminOrderPhoneHref,
  getAdminOrderRouteHref,
  getAdminOrderWhatsAppHref,
  getAdminOrderStatusLabel,
  getOrderPaymentMethod,
  getVisibleAdminOrderComment,
  orderPaymentMethodLabels,
  paymentStatusLabels
} from './orderPresentation';
import { calculateDriverRestaurantSettlement } from '../order/orderLifecycle';
import { GroceryPickingPanel } from '../order-picking/GroceryPickingPanel';
import { OrderConversationPanel } from '../order-conversation/OrderConversationPanel';
import type { BusinessType } from '../../shared/businessTerminology';
import {
  MerchantReadyEstimatePicker,
  type MerchantReadyMinutes
} from './MerchantReadyEstimatePicker';
import { getCombinedDispatchReadinessMessage } from '../combined-order/dispatchReadiness';

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

export function OrderDetailsPanel({
  order,
  catalogSlug,
  businessType = 'restaurant',
  products = [],
  paymentSettings,
  onClose,
  onStatus,
  onRefreshOrders,
  onOrderChanged,
  onOpenChat,
  canDeleteOrder = false,
  onDelete
}: {
  order: RestaurantOrder;
  catalogSlug: string;
  businessType?: BusinessType;
  products?: Product[];
  paymentSettings: RestaurantPaymentSettings;
  onClose: () => void;
  onStatus: (status: RestaurantOrderStatus, reason?: string, readyMinutes?: MerchantReadyMinutes) => Promise<void>;
  onRefreshOrders: () => void;
  onOrderChanged?: () => void;
  onOpenChat?: (orderId: string) => void;
  canDeleteOrder?: boolean;
  onDelete: () => Promise<void>;
}) {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(() =>
    order.restaurantPaymentConfirmedAt ? 'confirmed' : loadPaymentStatus(catalogSlug, order.id)
  );
  const [assigningDriverId, setAssigningDriverId] = useState('');
  const [isSearchingDriver, setIsSearchingDriver] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isConfirmingCash, setIsConfirmingCash] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaymentPanelOpen, setIsPaymentPanelOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [readyMinutes, setReadyMinutes] = useState<MerchantReadyMinutes>(15);
  const capabilities = getBusinessOrderCapabilities(businessType);
  const customerDetailsLabel = capabilities.customerLabel === 'Покупатель' ? 'Данные покупателя' : 'Данные клиента';
  const showDriverDispatch =
    order.fulfillmentType === 'delivery' &&
    !order.isAddon &&
    !order.driverName &&
    ['waiting_driver', 'assigned_driver', 'driver_assigned'].includes(order.status);
  const combinedDispatchReadinessQuery = useQuery({
    queryKey: ['combined-order-dispatch-readiness', order.id, order.catalogId, order.orderGroupId],
    queryFn: () => getCombinedOrderDispatchReadiness(order),
    enabled: Boolean(order.orderGroupId && order.status === 'ready' && order.fulfillmentType === 'delivery'),
    refetchInterval: 5_000,
    staleTime: 2_000
  });
  const combinedDispatchReadiness = combinedDispatchReadinessQuery.data;
  const combinedDispatchBlocked = Boolean(
    order.orderGroupId &&
    order.status === 'ready' &&
    (
      combinedDispatchReadinessQuery.isLoading ||
      combinedDispatchReadinessQuery.isError ||
      !combinedDispatchReadiness?.canDispatch
    )
  );
  const combinedDispatchMessage = combinedDispatchReadiness
    ? getCombinedDispatchReadinessMessage(combinedDispatchReadiness)
    : order.orderGroupId && order.status === 'ready'
      ? 'Проверяем готовность всех заказов…'
      : '';
  const dispatchDriversQuery = useQuery({
    queryKey: ['restaurant-dispatch-drivers', order.id, order.catalogId, order.deliveryCity, order.deliverySettlement, order.driverName],
    queryFn: () => getRestaurantDispatchDrivers(order),
    enabled: showDriverDispatch,
    staleTime: 20_000
  });
  const dispatchDrivers = dispatchDriversQuery.data ?? [];
  const onlineDrivers = dispatchDrivers.filter((driver) => driver.isOnline && driver.servesOrder);
  const availableDrivers = onlineDrivers.filter((driver) =>
    driverHasCapacity(driver.activeDeliveries, driver.maxActiveDeliveries)
  );
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
    setPaymentStatus(order.restaurantPaymentConfirmedAt ? 'confirmed' : loadPaymentStatus(catalogSlug, order.id));
    setIsPaymentPanelOpen(false);
    setReadyMinutes(15);
  }, [catalogSlug, order.id, order.restaurantPaymentConfirmedAt]);
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
        toast.success(
          availableDrivers.length > 0
            ? `Заказ опубликован для ${availableDrivers.length} доступных водителей`
            : 'Заказ опубликован. Сейчас нет доступных водителей — он появится после выхода водителя онлайн.'
        );
        refreshDriverDispatch();
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Не удалось отправить заказ водителям');
      })
      .finally(() => setIsSearchingDriver(false));
  };
  const phoneHref = getAdminOrderPhoneHref(order.clientPhone);
  const whatsappHref = getAdminOrderWhatsAppHref(order.clientPhone);
  const driverPhoneHref = getAdminOrderPhoneHref(order.driverPhone ?? '');
  const driverWhatsappHref = getAdminOrderWhatsAppHref(order.driverPhone ?? '');
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
  const cashHandover =
    orderPaymentMethod === 'cash' &&
    Boolean(order.driverName) &&
    !orderIsFinished;
  const cashPaymentConfirmed = Boolean(order.restaurantPaymentConfirmedAt);
  const pickupQrConfirmed = Boolean(order.pickupQrConfirmedAt);
  const driverOrderPaymentConfirmed = Boolean(order.driverRestaurantOrderPaymentConfirmedAt);
  const driverDeliveryPayoutReceived = Boolean(order.driverRestaurantDeliveryPayoutReceivedAt);
  const driverSettlement = calculateDriverRestaurantSettlement({
    clientTotal: order.total,
    clientDeliveryFee: order.deliveryFee,
    courierPayout: order.courierPayout
  });
  const restaurantFundsDelivery = order.restaurantFundsDelivery ?? driverSettlement.restaurantFundsDelivery;
  const restaurantDeliveryPayout =
    order.restaurantDeliveryPayoutAmount || driverSettlement.restaurantDeliveryPayout;
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
      updatePaymentStatus('confirmed');
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
        ? { label: capabilities.startWorkLabel, status: 'preparing' }
        : order.status === 'preparing'
          ? { label: capabilities.readyLabel, status: 'ready' }
          : order.status === 'ready' && order.fulfillmentType === 'delivery'
            ? { label: 'Вызвать доставку', status: 'waiting_driver', disabled: waitingForPayment || combinedDispatchBlocked }
            : order.status === 'ready'
              ? { label: 'Завершить заказ', status: 'completed' }
              : order.status === 'on_the_way'
                  ? { label: 'Заказ доставлен', status: 'delivered' }
                  : null;
  const changePrimaryStatus = async () => {
    if (!nextStatusAction || nextStatusAction.disabled || isChangingStatus) return;
    setIsChangingStatus(true);
    try {
      if (nextStatusAction.status === 'accepted') {
        await onStatus(nextStatusAction.status, undefined, readyMinutes);
      } else {
        await onStatus(nextStatusAction.status);
      }
      toast.success(`Статус: ${nextStatusAction.label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось изменить статус заказа');
    } finally {
      setIsChangingStatus(false);
    }
  };
  const deleteOrder = async () => {
    if (isDeleting || !window.confirm('Удалить заказ? Это действие нельзя отменить.')) return;
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <aside className="admin-order-details-panel">
      <section className="admin-order-work-card">
        <header className="admin-order-work-card__header">
          <button type="button" onClick={onClose} aria-label="Назад к списку заказов"><ArrowLeft /></button>
          <div>
            <span>Заказ #{order.orderNumber}</span>
            <strong>{getAdminOrderStatusLabel(order.status, businessType)}</strong>
            <i data-tone={adminOrderStatusTones[order.status]}>
              <span aria-hidden="true" />
              {getAdminOrderStatusLabel(order.status, businessType)}
            </i>
          </div>
          <div className="admin-order-work-card__total">
            <strong>{formatPrice(order.total)}</strong>
            <small>{orderItemsCount} позиций</small>
          </div>
          <details className="admin-order-more">
            <summary aria-label="Дополнительные действия"><MoreHorizontal /></summary>
            <div>
              <span>Заказ</span>
              {!orderIsFinished && order.status !== 'new' && (
                <button type="button" data-danger="true" onClick={() => onStatus('cancelled', 'restaurant_rejected')}>
                  Отменить заказ
                </button>
              )}
              {canDeleteOrder && (
                <button
                  type="button"
                  data-danger="true"
                  disabled={isDeleting}
                  onClick={() => void deleteOrder()}
                >
                  {isDeleting ? 'Удаляем...' : 'Удалить заказ'}
                </button>
              )}
            </div>
          </details>
        </header>

        <section className="admin-order-facts">
          <article>
            <Truck />
            <span>{getAdminOrderFulfillmentLabel(order, businessType)}</span>
            <strong>{order.fulfillmentType === 'delivery' ? order.deliverySettlement || order.deliveryCity || 'Доставка' : order.cabinLabel || getAdminOrderFulfillmentLabel(order, businessType)}</strong>
            <small>{orderDate.toLocaleDateString('ru-RU')} · {orderDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>
          </article>
          <article>
            <User />
            <span>{capabilities.customerLabel}</span>
            <strong>{order.clientName || capabilities.customerLabel}</strong>
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

        <section className="admin-order-person-cards">
          <details className="admin-order-person-card">
            <summary>
              <span className="admin-order-person-card__avatar"><User /></span>
              <span>
                <small>{customerDetailsLabel}</small>
                <strong>{order.clientName || capabilities.customerLabel}</strong>
                <small>{order.clientPhone || 'Телефон не указан'}</small>
              </span>
              <ArrowRight />
            </summary>
            <div className="admin-order-person-card__body">
              <p><MapPin />{orderAddress}</p>
              <div>
                {phoneHref && <a href={phoneHref}><Phone />Позвонить</a>}
                {whatsappHref && <a href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle />WhatsApp</a>}
                {routeHref && <a href={routeHref} target="_blank" rel="noreferrer"><MapPin />Маршрут</a>}
              </div>
            </div>
          </details>

          {order.driverName && (
            <details className="admin-order-person-card admin-order-person-card--driver">
              <summary>
                <span className="admin-order-person-card__avatar">
                  {order.driverPhotoUrl ? <img src={order.driverPhotoUrl} alt="" /> : <Truck />}
                </span>
                <span>
                  <small>Данные водителя</small>
                  <strong>{order.driverName}</strong>
                  <small>
                    {[order.driverVehicleInfo, order.driverCarNumber].filter(Boolean).join(' · ') || 'Автомобиль не указан'}
                  </small>
                </span>
                <ArrowRight />
              </summary>
              <div className="admin-order-person-card__body">
                <p><Phone />{order.driverPhone || 'Телефон не указан'}</p>
                {order.driverLocationAt && (
                  <p><MapPin />Был в сети: {new Date(order.driverLocationAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p>
                )}
                <div>
                  {driverPhoneHref && <a href={driverPhoneHref}><Phone />Позвонить</a>}
                  {driverWhatsappHref && <a href={driverWhatsappHref} target="_blank" rel="noreferrer"><MessageCircle />WhatsApp</a>}
                </div>
              </div>
            </details>
          )}
          {!order.driverName && order.fulfillmentType === 'delivery' && (
            <article className="admin-order-person-card admin-order-person-card--empty">
              <span className="admin-order-person-card__avatar"><Truck /></span>
              <span>
                <small>Данные водителя</small>
                <strong>Водитель не назначен</strong>
                <small>Карточка появится после принятия заказа</small>
              </span>
            </article>
          )}
        </section>

        {visibleComment && <p className="admin-order-comment">{visibleComment}</p>}

        {order.restaurantLat !== null && order.restaurantLng !== null && order.deliveryLat !== null && order.deliveryLng !== null && (
          <details className="admin-order-map-details">
            <summary>Карта доставки</summary>
            <DeliveryTrackingMap
              restaurant={{ lat: order.restaurantLat, lng: order.restaurantLng, label: capabilities.merchantLabel, address: order.restaurantAddress }}
              client={{ lat: order.deliveryLat, lng: order.deliveryLng, label: order.clientName || capabilities.customerLabel, address: orderAddress }}
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
              <small>{formatAdminOrderItemQuantity(item, businessType)}</small>
              <strong>{formatPrice(item.lineTotal)}</strong>
            </div>
          ))}
        </div>
        <div className="admin-order-total">
          <span>Итого</span>
          <strong>{formatPrice(order.total)}</strong>
        </div>
        </section>

        {capabilities.supportsPicking && products.length > 0 && (
          <GroceryPickingPanel
            items={order.items}
            products={products}
            canPick={!orderIsFinished}
            onChanged={() => {
              onOrderChanged?.();
              onRefreshOrders();
            }}
          />
        )}

        <button
          className="admin-order-chat-toggle"
          type="button"
          aria-expanded={onOpenChat ? undefined : isChatOpen}
          aria-controls={onOpenChat ? undefined : `admin-order-chat-${order.id}`}
          onClick={() => {
            if (onOpenChat) {
              onOpenChat(order.id);
            } else {
              setIsChatOpen((isOpen) => !isOpen);
            }
          }}
        >
          <MessageCircle />
          {!onOpenChat && isChatOpen ? 'Скрыть чат заказа' : 'Открыть чат заказа'}
        </button>
        {!onOpenChat && isChatOpen && (
          <div id={`admin-order-chat-${order.id}`}>
            <OrderConversationPanel
              orderId={order.id}
              catalogId={order.catalogId}
              expectedViewer="staff"
              merchantLabel={capabilities.merchantLabel}
              orderStatus={order.status}
              onChanged={onOrderChanged}
            />
          </div>
        )}

        <section className="admin-order-status-grid">
          <button
            className="admin-order-payment-card"
            type="button"
            aria-expanded={isPaymentPanelOpen}
            aria-controls="admin-order-payment-panel"
            data-attention={
              (cashHandover && !cashPaymentConfirmed)
              || (restaurantFundsDelivery && !driverDeliveryPayoutReceived)
            }
            onClick={() => setIsPaymentPanelOpen((isOpen) => !isOpen)}
          >
            <span>Оплата</span>
            <strong>{paymentStatusLabels[paymentStatus]}</strong>
            <small>{orderPaymentMethodLabels[orderPaymentMethod]}</small>
            {cashHandover && !cashPaymentConfirmed && (
              <em>
                {driverOrderPaymentConfirmed
                  ? 'Нажмите, чтобы подтвердить получение наличных'
                  : 'Водитель ещё не отметил передачу суммы заказа'}
              </em>
            )}
            <ArrowRight aria-hidden="true" />
          </button>
          <article>
            <span>Выдача заказа</span>
            <strong>
              {order.fulfillmentType !== 'delivery'
                ? 'Без QR'
                : pickupQrConfirmed
                  ? 'QR подтверждён'
                  : order.driverName
                    ? 'Ожидает QR водителя'
                    : 'После назначения водителя'}
            </strong>
          </article>
        </section>

        {restaurantFundsDelivery && order.driverName && !orderIsFinished && (
          <section
            className="admin-order-courier-settlement"
            data-complete={driverDeliveryPayoutReceived}
          >
            <strong>Оплата доставки рестораном: {formatPrice(restaurantDeliveryPayout)}</strong>
            {!driverAtRestaurant ? (
              <p>Выплатите курьеру эту сумму после его прибытия в ресторан.</p>
            ) : orderPaymentMethod === 'cash' && !driverOrderPaymentConfirmed ? (
              <p>Сначала водитель должен отметить передачу полной суммы заказа.</p>
            ) : orderPaymentMethod === 'cash' && !cashPaymentConfirmed ? (
              <p>Подтвердите получение суммы заказа, затем передайте курьеру оплату доставки.</p>
            ) : !driverDeliveryPayoutReceived ? (
              <p>
                Передайте водителю {formatPrice(restaurantDeliveryPayout)}. После получения он нажмёт
                «Я получил … за доставку». До этого QR выдачи заказа будет заблокирован.
              </p>
            ) : (
              <p>Водитель подтвердил получение {formatPrice(restaurantDeliveryPayout)}. Можно сканировать QR.</p>
            )}
          </section>
        )}

        {isPaymentPanelOpen && (
          <section id="admin-order-payment-panel" className="admin-order-payment-panel">
            <header>
              <span>Оплата</span>
              <strong>{paymentStatusLabels[paymentStatus]} · {orderPaymentMethodLabels[orderPaymentMethod]}</strong>
            </header>
            {cashHandover ? (
              !cashPaymentConfirmed ? (
                <>
                  <p>
                    Получите от водителя {formatPrice(driverSettlement.restaurantOrderAmount)} за заказ и подтвердите наличные.
                    {restaurantFundsDelivery
                      ? ` Доставка для клиента бесплатна: ${formatPrice(restaurantDeliveryPayout)} нужно выплатить водителю отдельно.`
                      : ` Водитель уже оставил себе ${formatPrice(driverSettlement.courierKeepsFromClient)} за доставку из суммы клиента.`}
                    До подтверждения водитель не сможет нажать «Забрал заказ».
                  </p>
                  {!driverAtRestaurant && (
                    <p>
                      Сначала водитель должен нажать «Я в ресторане» на своей карте. После обновления статуса здесь станет доступно подтверждение наличных.
                    </p>
                  )}
                  {!driverOrderPaymentConfirmed && driverAtRestaurant && (
                    <p>Ожидайте, пока водитель нажмёт «Я передал … за заказ».</p>
                  )}
                  <button
                    type="button"
                    disabled={!driverAtRestaurant || !driverOrderPaymentConfirmed || isConfirmingCash}
                    onClick={() => void confirmCashPayment()}
                  >
                    {isConfirmingCash ? 'Подтверждаем...' : 'Подтвердить получение наличных'}
                  </button>
                </>
              ) : restaurantFundsDelivery && !driverDeliveryPayoutReceived ? (
                <p>Сумма заказа подтверждена. Передайте водителю оплату доставки и дождитесь его подтверждения.</p>
              ) : !pickupQrConfirmed ? (
                <p data-complete="true">Оплата подтверждена — отсканируйте QR водителя во вкладке «Сканер».</p>
              ) : (
                <p data-complete="true">Оплата и QR подтверждены. Водитель может нажать «Забрал заказ».</p>
              )
            ) : orderPaymentMethod === 'cash' ? (
              <p>
                {order.driverName
                  ? 'Обновляем данные назначенной доставки. Нажмите «Обновить» и откройте оплату снова.'
                  : 'Подтверждение появится после назначения водителя на заказ.'}
              </p>
            ) : (
              <div className="admin-order-payment-panel__actions">
                <button type="button" onClick={() => updatePaymentStatus('awaiting')}>Ожидает подтверждения</button>
                <button type="button" onClick={() => updatePaymentStatus('confirmed')}>Подтвердить оплату</button>
                <button type="button" data-danger="true" onClick={() => updatePaymentStatus('declined')}>Отклонить оплату</button>
              </div>
            )}
          </section>
        )}

        {order.driverName && <p className="admin-order-driver-note">Заказ принял водитель: <strong>{order.driverName}</strong></p>}

        {order.status === 'new' && (
          <MerchantReadyEstimatePicker value={readyMinutes} onChange={setReadyMinutes} />
        )}
        {order.estimatedReadyAt && !orderIsFinished && (
          <p className="merchant-ready-estimate__saved">
            Ожидаемая готовность: {new Date(order.estimatedReadyAt).toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        )}
        {combinedDispatchMessage && (
          <p className="merchant-ready-estimate__saved" data-blocked={combinedDispatchBlocked || undefined}>
            {combinedDispatchMessage}
          </p>
        )}

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
            disabled={nextStatusAction.disabled || isChangingStatus}
            onClick={() => void changePrimaryStatus()}
          >
            {isChangingStatus ? 'Сохраняем...' : nextStatusAction.label}
          </button>
        )}
        {orderIsFinished && (
          <p className="admin-order-primary-actions__complete">
            <Check /> {getAdminOrderStatusLabel(order.status, businessType)}
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
