import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildYandexMapsRouteUrl } from './orderLifecycle';
import { DeliveryTrackingMap } from '../../shared/DeliveryTrackingMap';
import { OrderConversationPanel } from '../order-conversation/OrderConversationPanel';
import {
  getCatalogIdBySlug,
  getPublicOrderTracking,
  getPublicRestaurantOrderStatus,
  type PublicRestaurantOrderStatus,
  type RestaurantOrderStatus
} from '../../shared/api/restaurantOrdersApi';
import type { BusinessType } from '../../shared/businessTerminology';

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const publicOrderStatusLabels: Record<RestaurantOrderStatus, string> = {
  new: 'Новый', waiting_payment_confirmation: 'Ожидает подтверждения оплаты', payment_confirmed: 'Оплата подтверждена',
  accepted: 'В работе', confirmed: 'В работе', preparing: 'Готовится', cooking: 'Готовится', ready: 'Готов',
  waiting_driver: 'Ожидает курьера', driver_assigned: 'Курьер назначен', assigned_driver: 'Курьер назначен',
  picked_up: 'Заказ забран', on_the_way: 'В пути', delivered: 'Доставлен', completed: 'Выполнен',
  cancelled: 'Отменён', canceled: 'Отменён'
};

export function PublicOrderStatusScreen({
  catalogSlug,
  orderId,
  businessType = 'restaurant'
}: {
  catalogSlug: string;
  orderId: string;
  businessType?: BusinessType;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const statusQuery = useQuery({
    queryKey: ['public-order-status', orderId],
    queryFn: () => getPublicRestaurantOrderStatus(orderId),
    refetchInterval: 15_000
  });
  const order = statusQuery.data;
  const trackingQuery = useQuery({
    queryKey: ['public-order-tracking', orderId],
    queryFn: () => getPublicOrderTracking(orderId),
    refetchInterval: 10_000,
    enabled: Boolean(order)
  });
  const catalogIdQuery = useQuery({
    queryKey: ['public-order-catalog-id', catalogSlug],
    queryFn: () => getCatalogIdBySlug(catalogSlug),
    enabled: businessType === 'grocery'
  });

  useEffect(() => {
    if (!catalogIdQuery.data || !new URLSearchParams(location.search).has('conversation')) return;
    window.requestAnimationFrame(() => {
      document.getElementById('order-conversation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [catalogIdQuery.data, location.search]);

  const renderOrder = (value: PublicRestaurantOrderStatus) => (
    <>
      <section className="checkout-summary public-order-status">
        <div>
          <span>Заказ №{value.id.slice(0, 8).toUpperCase()}</span>
          <h2>{publicOrderStatusLabels[value.status] ?? value.status}</h2>
          <p>
            {value.fulfillmentType === 'delivery'
              ? value.deliveryAddress || 'Адрес доставки не указан'
              : value.fulfillmentType === 'takeaway'
                ? 'Самовывоз'
                : 'Заказ в зале'}
          </p>
        </div>
        <div className="checkout-summary__list">
          {value.items.map((item) => (
            <article className="checkout-order-card" key={item.id}>
              <div className="checkout-order-card__body">
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.quantity} x {formatPrice(item.unitPrice)}</p>
                </div>
                <div className="checkout-order-card__bottom">
                  <strong>{formatPrice(item.lineTotal)}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
        {value.driverName && (
          <div className="checkout-summary__total">
            <span>Курьер</span>
            <strong>{value.driverName}</strong>
          </div>
        )}
        {trackingQuery.data?.driverName && trackingQuery.data.driverLat !== null && trackingQuery.data.driverLng !== null && (
          <div className="checkout-summary__total">
            <span>Водитель в пути</span>
            <a href={buildYandexMapsRouteUrl({
              from: { lat: trackingQuery.data.driverLat, lng: trackingQuery.data.driverLng, address: 'Водитель' },
              to: { lat: value.deliveryLat, lng: value.deliveryLng, address: value.deliveryAddress }
            })} target="_blank" rel="noreferrer">
              Открыть местоположение на Яндекс Картах
            </a>
          </div>
        )}
        {value.fulfillmentType === 'delivery' && value.restaurantLat !== null && value.restaurantLng !== null && value.deliveryLat !== null && value.deliveryLng !== null && (
          <DeliveryTrackingMap
            restaurant={{ lat: value.restaurantLat, lng: value.restaurantLng, label: value.restaurantName, address: value.restaurantAddress }}
            client={{ lat: value.deliveryLat, lng: value.deliveryLng, label: value.clientName, address: value.deliveryAddress }}
            driver={trackingQuery.data?.driverLat !== null && trackingQuery.data?.driverLat !== undefined && trackingQuery.data?.driverLng !== null && trackingQuery.data?.driverLng !== undefined
              ? { lat: trackingQuery.data.driverLat, lng: trackingQuery.data.driverLng, label: trackingQuery.data.driverName || 'Водитель' }
              : null}
          />
        )}
        <div className="checkout-summary__total">
          <span>Итого</span>
          <strong>{formatPrice(value.total)}</strong>
        </div>
      </section>
      {businessType === 'grocery' && catalogIdQuery.data && (
        <OrderConversationPanel
          orderId={orderId}
          catalogId={catalogIdQuery.data}
          expectedViewer="client"
          orderStatus={value.status}
          onChanged={() => void statusQuery.refetch()}
        />
      )}
      <button className="ghost-wide" type="button" onClick={() => navigate(`/${catalogSlug}`)}>
        {businessType === 'grocery' ? 'Вернуться в магазин' : 'Вернуться в ресторан'}
      </button>
    </>
  );

  return (
    <main className="screen checkout-screen">
      {statusQuery.isLoading ? (
        <section className="checkout-summary">
          <div>
            <span>Статус заказа</span>
            <h2>Загружаем...</h2>
          </div>
        </section>
      ) : statusQuery.error ? (
        <section className="checkout-summary">
          <div>
            <span>Статус заказа</span>
            <h2>Не удалось загрузить заказ</h2>
            <p>Проверьте ссылку или откройте ресторан заново.</p>
          </div>
        </section>
      ) : order ? (
        renderOrder(order)
      ) : (
        <section className="checkout-summary">
          <div>
            <span>Статус заказа</span>
            <h2>Заказ не найден</h2>
            <p>Проверьте ссылку или откройте ресторан заново.</p>
          </div>
        </section>
      )}
    </main>
  );
}
