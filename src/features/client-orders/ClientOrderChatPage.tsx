import { ArrowLeft, Clock3, ReceiptText } from 'lucide-react';
import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { OrderConversationPanel } from '../order-conversation/OrderConversationPanel';
import { markClientOrderChatRead } from '../../shared/api/orderConversationApi';
import type { ClientOrder, ClientRestaurant } from '../client-platform/types';
import { formatClientOrderDate, OrderStatusBadge } from './ClientOrders';
import './client-order-chat-page.css';

export function ClientOrderChatPage({
  order,
  restaurant,
  orderNumber,
  statusLabel,
  detailsPath,
  onRead
}: {
  order: ClientOrder;
  restaurant?: ClientRestaurant;
  orderNumber: string;
  statusLabel: string;
  detailsPath: string;
  onRead?: () => void;
}) {
  const catalogId = order.catalogId || restaurant?.id || '';
  const markRead = useCallback(() => {
    if (!catalogId) return;
    void markClientOrderChatRead(order.id, catalogId)
      .then(() => onRead?.())
      .catch(() => undefined);
  }, [catalogId, onRead, order.id]);

  return (
    <main className="client-order-chat-page">
      <header className="client-order-chat-header">
        <Link to="/profile/orders" aria-label="Вернуться к заказам"><ArrowLeft /></Link>
        <span className="client-order-chat-header__logo" aria-hidden="true">
          {restaurant?.logoUrl
            ? <img src={restaurant.logoUrl} alt="" />
            : order.restaurantName.trim().slice(0, 1).toLocaleUpperCase('ru-RU')}
        </span>
        <span>
          <strong>{order.restaurantName}</strong>
          <small>Заказ №{orderNumber}</small>
        </span>
      </header>

      <section className="client-order-chat-context" aria-label="Информация о заказе">
        <header>
          <span>
            <strong>Заказ №{orderNumber}</strong>
            <small><Clock3 /> {formatClientOrderDate(order.createdAt)}</small>
          </span>
          <b>{new Intl.NumberFormat('ru-RU').format(order.totalAmount)} ₽</b>
        </header>
        <div>
          <OrderStatusBadge status={order.status} label={statusLabel} />
          <Link to={detailsPath}><ReceiptText /> Детали заказа</Link>
        </div>
      </section>

      {catalogId ? (
        <OrderConversationPanel
          orderId={order.id}
          catalogId={catalogId}
          expectedViewer="client"
          merchantLabel={order.restaurantName}
          orderStatus={order.status}
          estimatedMinutes={order.estimatedTimeMin}
          presentation="messenger"
          onConversationLoaded={markRead}
          onChanged={onRead}
          panelId="client-order-chat"
        />
      ) : (
        <section className="client-order-chat-page__error">
          <strong>Не удалось открыть чат</strong>
          <p>У заказа не найден продавец. Вернитесь к списку и попробуйте снова.</p>
          <Link to="/profile/orders">К моим заказам</Link>
        </section>
      )}
    </main>
  );
}
