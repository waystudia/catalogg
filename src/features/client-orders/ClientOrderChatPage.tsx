import { ArrowLeft, Clock3, ReceiptText } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { OrderConversationPanel } from '../order-conversation/OrderConversationPanel';
import { markClientOrderChatRead } from '../../shared/api/orderConversationApi';
import { navigateBackOrFallback } from '../../shared/appNavigation';
import { getBusinessTerms } from '../../shared/businessTerminology';
import type { ClientOrder, ClientRestaurant } from '../client-platform/types';
import { formatClientOrderDate } from './ClientOrders';
import './client-order-chat-page.css';

export function ClientOrderChatPage({
  order,
  restaurant,
  orderNumber,
  detailsPath,
  onRead
}: {
  order: ClientOrder;
  restaurant?: ClientRestaurant;
  orderNumber: string;
  detailsPath: string;
  onRead?: () => void;
}) {
  const navigate = useNavigate();
  const catalogId = order.catalogId || restaurant?.id || '';
  const businessTerms = getBusinessTerms(restaurant?.businessType);
  const markRead = useCallback(() => {
    if (!catalogId) return;
    void markClientOrderChatRead(order.id, catalogId)
      .then(() => onRead?.())
      .catch(() => undefined);
  }, [catalogId, onRead, order.id]);

  return (
    <main className="client-order-chat-page">
      <header className="client-order-chat-header" aria-label={`Чат с ${businessTerms.placeInstrumental}`}>
        <button
          type="button"
          onClick={() => navigateBackOrFallback(navigate, '/profile/orders')}
          aria-label="Назад"
        >
          <ArrowLeft />
        </button>
        <span className="client-order-chat-header__logo" aria-hidden="true">
          {restaurant?.logoUrl
            ? <img src={restaurant.logoUrl} alt="" />
            : order.restaurantName.trim().slice(0, 1).toLocaleUpperCase('ru-RU')}
        </span>
        <span>
          <strong>{order.restaurantName}</strong>
          <small>Чат заказа</small>
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
        <Link to={detailsPath}><ReceiptText /> Детали заказа</Link>
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
