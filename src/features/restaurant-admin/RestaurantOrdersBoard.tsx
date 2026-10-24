import type { RestaurantOrder } from '../../shared/api/restaurantOrdersApi';
import { Trash2 } from 'lucide-react';
import { formatOrderTime } from '../../shared/orderListGroups';
import { adminOrderStatusTones, getAdminOrderChannel, getAdminOrderFulfillmentLabel, getAdminOrderItemsCount, getAdminOrderLocationLabel, getAdminOrderStatusLabel, isGroceryStorePosOrder } from './orderPresentation';
import { getRestaurantOrderBoardColumns, getRestaurantOrderBoardColumnId } from './orderBoard';
import './restaurant-orders-board.css';

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

export function RestaurantOrdersBoard({ orders, selectedOrderId, recentOrderIds, businessType, onSelectOrder, canDeleteOrder, onDeleteOrder }: { orders: RestaurantOrder[]; selectedOrderId: string | null; recentOrderIds: Set<string>; businessType?: string; onSelectOrder: (id: string) => void; canDeleteOrder?: (order: RestaurantOrder) => boolean; onDeleteOrder?: (order: RestaurantOrder) => void }) {
  return (
    <section className="ra-order-board" role="region" aria-label="Доска заказов">
      {getRestaurantOrderBoardColumns(businessType).map((column) => {
        const columnOrders = orders.filter((order) => getRestaurantOrderBoardColumnId(isGroceryStorePosOrder(order, businessType) ? 'completed' : order.status) === column.id);

        return (
          <section className="ra-order-board__column" role="region" aria-label={`Колонка ${column.label}`} data-column={column.id} key={column.id}>
            <header>
              <h3>{column.label}</h3>
              <span>{columnOrders.length}</span>
            </header>
            <div className="ra-order-board__cards">
              {columnOrders.map((order) => (
                <div className="ra-order-board-card-shell" key={order.id}>
                  <button className="ra-order-board-card" type="button" aria-label={`Заказ №${order.orderNumber}`} data-channel={getAdminOrderChannel(order, businessType)} data-active={selectedOrderId === order.id} data-highlighted={recentOrderIds.has(order.id)} onClick={() => onSelectOrder(order.id)}>
                  <span className="ra-order-board-card__head">
                    <span className="ra-order-board-card__identity">
                      <strong>{order.clientName || 'Клиент'}</strong>
                      <small>Заказ #{order.orderNumber}</small>
                    </span>
                    <time dateTime={order.createdAt}>{formatOrderTime(order.createdAt)}</time>
                  </span>
                  <span className="ra-order-board-card__meta">
                    <b>Тип: {getAdminOrderFulfillmentLabel(order, businessType)}</b>
                    <span>{getAdminOrderItemsCount(order)} поз.</span>
                  </span>
                  <span className="ra-order-board-card__address">{getAdminOrderLocationLabel(order, businessType)}</span>
                  <span className="ra-order-board-card__foot">
                    <strong>{formatPrice(order.total)}</strong>
                    <em data-tone={adminOrderStatusTones[isGroceryStorePosOrder(order, businessType) ? 'completed' : order.status]}>{isGroceryStorePosOrder(order, businessType) ? 'Продажа завершена' : getAdminOrderStatusLabel(order.status, businessType)}</em>
                  </span>
                  </button>
                  {canDeleteOrder?.(order) && onDeleteOrder && (
                    <button className="ra-order-board-card__delete" type="button" aria-label={`Удалить заказ ${order.orderNumber}`} onClick={() => onDeleteOrder(order)}><Trash2 /></button>
                  )}
                </div>
              ))}
              {columnOrders.length === 0 && <p>Нет заказов</p>}
            </div>
          </section>
        );
      })}
    </section>
  );
}
