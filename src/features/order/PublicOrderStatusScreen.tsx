import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getPublicRestaurantOrderStatus, type PublicRestaurantOrderStatus, type RestaurantOrderStatus } from '../../shared/api/restaurantOrdersApi';

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
  orderId
}: {
  catalogSlug: string;
  orderId: string;
}) {
  const navigate = useNavigate();
  const statusQuery = useQuery({
    queryKey: ['public-order-status', orderId],
    queryFn: () => getPublicRestaurantOrderStatus(orderId),
    refetchInterval: 15_000
  });
  const order = statusQuery.data;
  const renderOrder = (value: PublicRestaurantOrderStatus) => (
    <>
      <section className="checkout-summary public-order-status order-confirmation-animate">
        <div>
          <span>Заказ №{value.id.slice(0, 8).toUpperCase()}</span>
          <p>Заказ отправлен в ресторан</p>
          <h2>{publicOrderStatusLabels[value.status] ?? value.status}</h2>
          {!['canceled', 'cancelled'].includes(value.status) && <div className="public-order-status__progress" aria-label="Этапы заказа">
            {['Отправлен', 'Готовится', 'Готов', 'Завершён'].map((label, index) => {
              const current = ['completed', 'delivered'].includes(value.status) ? 3 : ['ready', 'waiting_driver', 'driver_assigned', 'assigned_driver', 'picked_up', 'on_the_way'].includes(value.status) ? 2 : ['accepted', 'confirmed', 'preparing', 'cooking'].includes(value.status) ? 1 : 0;
              return <span className={index <= current ? 'is-active' : ''} key={label}><i /><small>{label}</small></span>;
            })}
          </div>}
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
        {value.fulfillmentType === 'delivery' && value.driverName && (
          <div className="checkout-summary__total">
            <span>Доставка</span>
            <strong>Водитель выполняет заказ</strong>
          </div>
        )}
        <div className="checkout-summary__total">
          <span>Итого</span>
          <strong>{formatPrice(value.total)}</strong>
        </div>
      </section>
      <button className="ghost-wide" type="button" onClick={() => navigate(`/${catalogSlug}`)}>
        Вернуться в ресторан
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
