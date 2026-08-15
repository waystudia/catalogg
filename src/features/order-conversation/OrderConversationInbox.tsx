import { ArrowLeft, ClipboardList, MessageCircle, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OrderConversationPanel } from './OrderConversationPanel';
import {
  getStaffOrderConversationSummaries,
  subscribeStaffOrderConversationInbox,
  type OrderConversationSummary,
  type OrderConversationViewer
} from '../../shared/api/orderConversationApi';
import { useBrowserBackedState } from '../../shared/useBrowserBackedState';
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

type ConversationSummaryApi = {
  load: (items: OrderConversationInboxItem[], viewer: OrderConversationViewer) => Promise<OrderConversationSummary[]>;
  subscribe: (items: OrderConversationInboxItem[], viewer: OrderConversationViewer, onChange: () => void) => () => void;
};

const defaultSummaryApi: ConversationSummaryApi = {
  load: async (items, viewer) => {
    if (viewer !== 'staff') return [];
    const orderIdsByCatalog = new Map<string, string[]>();
    items.forEach((item) => {
      orderIdsByCatalog.set(item.catalogId, [...(orderIdsByCatalog.get(item.catalogId) ?? []), item.orderId]);
    });
    return (await Promise.all(Array.from(orderIdsByCatalog, ([catalogId, orderIds]) =>
      getStaffOrderConversationSummaries(orderIds, catalogId)
    ))).flat();
  },
  subscribe: (items, viewer, onChange) => {
    if (viewer !== 'staff') return () => undefined;
    const cleanups = Array.from(new Set(items.map((item) => item.catalogId)))
      .map((catalogId) => subscribeStaffOrderConversationInbox(catalogId, onChange));
    return () => cleanups.forEach((cleanup) => cleanup());
  }
};

const formatConversationDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
};

const activityTime = (value: string) => {
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : 0;
};

export function OrderConversationInbox({
  items,
  expectedViewer,
  selectedOrderId,
  onSelectedOrderChange,
  onOpenOrder,
  onChanged,
  summaryApi = defaultSummaryApi
}: {
  items: OrderConversationInboxItem[];
  expectedViewer: OrderConversationViewer;
  selectedOrderId?: string | null;
  onSelectedOrderChange?: (orderId: string | null) => void;
  onOpenOrder?: (orderId: string) => void;
  onChanged?: () => void;
  summaryApi?: ConversationSummaryApi;
}) {
  const historyScope = `order-inbox:${expectedViewer}:${Array.from(new Set(items.map((item) => item.catalogId))).sort().join(',')}`;
  const [conversationState, conversationHistory] = useBrowserBackedState(historyScope, {
    query: '',
    selectedOrderId: selectedOrderId ?? null
  });
  const { query } = conversationState;
  const [summaries, setSummaries] = useState<OrderConversationSummary[]>([]);
  const lastReportedOrderIdRef = useRef<string | null>(selectedOrderId ?? null);
  const activeOrderId = conversationState.selectedOrderId;
  const summaryByOrder = useMemo(() => new Map(summaries.map((summary) => [summary.orderId, summary])), [summaries]);
  const orderedItems = useMemo(() => [...items].sort((left, right) => {
    const leftDate = summaryByOrder.get(left.orderId)?.createdAt ?? left.createdAt;
    const rightDate = summaryByOrder.get(right.orderId)?.createdAt ?? right.createdAt;
    return activityTime(rightDate) - activityTime(leftDate);
  }), [items, summaryByOrder]);
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU');
    if (!normalized) return orderedItems;
    return orderedItems.filter((item) =>
      [
        item.orderNumber,
        item.merchantName,
        item.customerName,
        item.statusLabel,
        summaryByOrder.get(item.orderId)?.body
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('ru-RU')
        .includes(normalized)
    );
  }, [orderedItems, query, summaryByOrder]);
  const selectedItem = items.find((item) => item.orderId === activeOrderId) ?? null;

  const refreshSummaries = useCallback(async () => {
    try {
      setSummaries(await summaryApi.load(items, expectedViewer));
    } catch {
      // The inbox still works with order timestamps if a summary refresh is temporarily unavailable.
    }
  }, [expectedViewer, items, summaryApi]);

  useEffect(() => {
    void refreshSummaries();
    return summaryApi.subscribe(items, expectedViewer, () => void refreshSummaries());
  }, [expectedViewer, items, refreshSummaries, summaryApi]);

  useEffect(() => {
    if (!activeOrderId || items.some((item) => item.orderId === activeOrderId)) return;
    conversationHistory.replace((current) => ({ ...current, selectedOrderId: null }));
    lastReportedOrderIdRef.current = null;
    onSelectedOrderChange?.(null);
  }, [activeOrderId, conversationHistory, items, onSelectedOrderChange]);

  useEffect(() => {
    if (lastReportedOrderIdRef.current === conversationState.selectedOrderId) return;
    lastReportedOrderIdRef.current = conversationState.selectedOrderId;
    onSelectedOrderChange?.(conversationState.selectedOrderId);
  }, [conversationState.selectedOrderId, onSelectedOrderChange]);

  const selectConversation = (orderId: string) => {
    conversationHistory.open((current) => ({ ...current, selectedOrderId: orderId }));
    lastReportedOrderIdRef.current = orderId;
    onSelectedOrderChange?.(orderId);
  };

  const closeConversation = () => {
    conversationHistory.back();
  };

  const handleChanged = () => {
    void refreshSummaries();
    onChanged?.();
  };

  return (
    <section className="order-inbox" data-view={selectedItem ? 'conversation' : 'list'} aria-label="Чаты по заказам">
      <header className="order-inbox__header">
        <span className="order-inbox__title-icon"><MessageCircle /></span>
        <div>
          <h2>Чаты</h2>
          <p>{expectedViewer === 'client'
            ? 'Все переписки по заказам в одном месте.'
            : 'Последние сообщения клиентов всегда показываются сверху.'}</p>
        </div>
      </header>

      {items.length > 0 ? (
        <div className="order-inbox__layout">
          <aside className="order-inbox__list" aria-label="Список чатов">
            <label className="order-inbox__search">
              <Search />
              <input
                value={query}
                onChange={(event) => conversationHistory.replace((current) => ({ ...current, query: event.target.value }))}
                placeholder="Поиск"
                aria-label="Поиск чатов"
              />
            </label>
            <div className="order-inbox__threads">
              {filteredItems.map((item) => {
                const primary = expectedViewer === 'client' ? item.merchantName : (item.customerName || 'Клиент');
                const summary = summaryByOrder.get(item.orderId);
                const lastActivityAt = summary?.createdAt ?? item.createdAt;
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
                      <span className="order-inbox__thread-preview">{summary?.body || item.statusLabel}</span>
                      <em>{item.statusLabel}</em>
                    </span>
                    <time dateTime={lastActivityAt}>{formatConversationDate(lastActivityAt)}</time>
                  </button>
                );
              })}
              {filteredItems.length === 0 && <p className="order-inbox__empty-list">Чаты не найдены.</p>}
            </div>
          </aside>

          {selectedItem && (
            <div className="order-inbox__conversation">
              <header className="order-inbox__conversation-head">
                <button type="button" className="order-inbox__back" aria-label="Назад к списку чатов" onClick={closeConversation}>
                  <ArrowLeft />
                </button>
                <span className="order-inbox__avatar" aria-hidden="true">
                  {(expectedViewer === 'client' ? selectedItem.merchantName : (selectedItem.customerName || 'Клиент')).trim().slice(0, 1).toLocaleUpperCase('ru-RU') || 'W'}
                </span>
                <div>
                  <strong>{expectedViewer === 'client' ? selectedItem.merchantName : (selectedItem.customerName || 'Клиент')}</strong>
                  <small>Заказ №{selectedItem.orderNumber} · {selectedItem.statusLabel}</small>
                </div>
                {onOpenOrder ? (
                  <button type="button" className="order-inbox__order-link" aria-label={`Открыть заказ ${selectedItem.orderNumber}`} onClick={() => onOpenOrder(selectedItem.orderId)}>
                    <ClipboardList />
                  </button>
                ) : selectedItem.totalLabel ? <b>{selectedItem.totalLabel}</b> : null}
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
                onChanged={handleChanged}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="order-inbox__empty">
          <MessageCircle />
          <strong>Чатов пока нет</strong>
          <p>После оформления заказа здесь появится отдельная переписка с клиентом.</p>
        </div>
      )}
    </section>
  );
}
