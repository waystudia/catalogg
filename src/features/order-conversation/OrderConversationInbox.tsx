import { MessageCircle, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { OrderConversationPanel } from './OrderConversationPanel';
import type { OrderConversationViewer } from '../../shared/api/orderConversationApi';
import './order-conversation.css';

export type OrderConversationInboxItem = {
  orderId: string;
  catalogId: string;
  orderNumber: string;
  merchantName: string;
  merchantLabel?: string;
  customerName?: string;
  statusLabel: string;
  orderStatus?: string;
  estimatedMinutes?: number | null;
  createdAt: string;
  totalLabel?: string;
};

const formatConversationDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
};

export function OrderConversationInbox({
  items,
  expectedViewer,
  selectedOrderId,
  onSelectedOrderChange,
  onChanged
}: {
  items: OrderConversationInboxItem[];
  expectedViewer: OrderConversationViewer;
  selectedOrderId?: string | null;
  onSelectedOrderChange?: (orderId: string) => void;
  onChanged?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [localSelectedOrderId, setLocalSelectedOrderId] = useState<string | null>(selectedOrderId ?? items[0]?.orderId ?? null);
  const activeOrderId = selectedOrderId === undefined ? localSelectedOrderId : selectedOrderId;
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU');
    if (!normalized) return items;
    return items.filter((item) =>
      [item.orderNumber, item.merchantName, item.customerName, item.statusLabel]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('ru-RU')
        .includes(normalized)
    );
  }, [items, query]);
  const selectedItem = items.find((item) => item.orderId === activeOrderId) ?? filteredItems[0] ?? items[0] ?? null;

  useEffect(() => {
    if (!items.length || (activeOrderId && items.some((item) => item.orderId === activeOrderId))) return;
    const nextOrderId = items[0].orderId;
    setLocalSelectedOrderId(nextOrderId);
    onSelectedOrderChange?.(nextOrderId);
  }, [activeOrderId, items, onSelectedOrderChange]);

  const selectConversation = (orderId: string) => {
    setLocalSelectedOrderId(orderId);
    onSelectedOrderChange?.(orderId);
  };

  return (
    <section className="order-inbox" aria-label="Чаты по заказам">
      <header className="order-inbox__header">
        <span className="order-inbox__title-icon"><MessageCircle /></span>
        <div>
          <h2>Чаты по заказам</h2>
          <p>{expectedViewer === 'client'
            ? 'Каждый заказ хранит отдельную переписку только с выбранным заведением.'
            : 'Все переписки с клиентами собраны в одном месте и разделены по заказам.'}</p>
        </div>
      </header>

      {items.length > 0 ? (
        <div className="order-inbox__layout">
          <aside className="order-inbox__list" aria-label="Список чатов">
            <label className="order-inbox__search">
              <Search />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Заказ, клиент или заведение"
                aria-label="Поиск чатов"
              />
            </label>
            <div className="order-inbox__threads">
              {filteredItems.map((item) => {
                const primary = expectedViewer === 'client' ? item.merchantName : (item.customerName || 'Клиент');
                return (
                  <button
                    type="button"
                    className="order-inbox__thread"
                    data-active={selectedItem?.orderId === item.orderId}
                    onClick={() => selectConversation(item.orderId)}
                    key={item.orderId}
                  >
                    <span className="order-inbox__avatar" aria-hidden="true">{primary.trim().slice(0, 1).toLocaleUpperCase('ru-RU') || 'W'}</span>
                    <span className="order-inbox__thread-copy">
                      <strong>{primary}</strong>
                      <small>Заказ №{item.orderNumber}{item.totalLabel ? ` · ${item.totalLabel}` : ''}</small>
                      <em>{item.statusLabel}</em>
                    </span>
                    <time dateTime={item.createdAt}>{formatConversationDate(item.createdAt)}</time>
                  </button>
                );
              })}
              {filteredItems.length === 0 && <p className="order-inbox__empty-list">Чаты не найдены.</p>}
            </div>
          </aside>

          <div className="order-inbox__conversation">
            {selectedItem ? (
              <>
                <header className="order-inbox__conversation-head">
                  <div>
                    <strong>{expectedViewer === 'client' ? selectedItem.merchantName : (selectedItem.customerName || 'Клиент')}</strong>
                    <small>Заказ №{selectedItem.orderNumber} · {selectedItem.statusLabel}</small>
                  </div>
                  {selectedItem.totalLabel && <b>{selectedItem.totalLabel}</b>}
                </header>
                <OrderConversationPanel
                  key={selectedItem.orderId}
                  orderId={selectedItem.orderId}
                  catalogId={selectedItem.catalogId}
                  expectedViewer={expectedViewer}
                  merchantLabel={selectedItem.merchantLabel}
                  orderStatus={selectedItem.orderStatus}
                  estimatedMinutes={selectedItem.estimatedMinutes}
                  presentation="messenger"
                  onChanged={onChanged}
                />
              </>
            ) : (
              <div className="order-inbox__empty-conversation"><MessageCircle /><strong>Выберите чат</strong></div>
            )}
          </div>
        </div>
      ) : (
        <div className="order-inbox__empty">
          <MessageCircle />
          <strong>Чатов пока нет</strong>
          <p>После оформления заказа здесь появится отдельная переписка с заведением.</p>
        </div>
      )}
    </section>
  );
}
