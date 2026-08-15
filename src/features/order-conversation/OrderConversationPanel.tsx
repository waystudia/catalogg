import { Bell, Check, MessageCircle, RefreshCw, RotateCcw, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getSubstitutionAmountEffect, type SubstitutionDecision } from '../../entities/orderSubstitution';
import {
  emptyOrderConversation,
  getOrderConversation,
  resolveOrderSubstitution,
  sendOrderMessage,
  subscribeOrderConversation,
  type OrderConversation,
  type OrderMessage,
  type OrderConversationViewer
} from '../../shared/api/orderConversationApi';
import { requestRestaurantOrderNotificationPermission } from '../../shared/restaurantOrderNotifications';
import { getOrderConversationQuickReplies } from './orderConversationQuickReplies';
import './order-conversation.css';

type ConversationApi = {
  load: typeof getOrderConversation;
  resolve: typeof resolveOrderSubstitution;
  send: typeof sendOrderMessage;
  subscribe: typeof subscribeOrderConversation;
};

const defaultApi: ConversationApi = {
  load: getOrderConversation,
  resolve: resolveOrderSubstitution,
  send: sendOrderMessage,
  subscribe: subscribeOrderConversation
};

const formatAmount = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;
const formatMessageTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};
const formatMessageDay = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Сегодня';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date);
};

type OptimisticOrderMessage = OrderMessage & { deliveryState: 'sending' | 'failed' };

export function OrderConversationPanel({
  orderId,
  catalogId,
  expectedViewer,
  merchantLabel = 'Заведение',
  orderStatus,
  estimatedMinutes,
  initialConversation,
  api = defaultApi,
  onChanged,
  onConversationLoaded,
  presentation = 'embedded',
  panelId = 'order-conversation'
}: {
  orderId: string;
  catalogId: string;
  expectedViewer: OrderConversationViewer;
  merchantLabel?: string;
  orderStatus?: string;
  estimatedMinutes?: number | null;
  initialConversation?: OrderConversation;
  api?: ConversationApi;
  onChanged?: () => void;
  onConversationLoaded?: (conversation: OrderConversation) => void;
  presentation?: 'embedded' | 'messenger';
  panelId?: string;
}) {
  const [conversation, setConversation] = useState<OrderConversation>(() =>
    initialConversation ?? emptyOrderConversation(expectedViewer)
  );
  const [loading, setLoading] = useState(initialConversation === undefined);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticOrderMessage[]>([]);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.load(orderId, catalogId, expectedViewer);
      setConversation(next);
      onConversationLoaded?.(next);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось открыть чат заказа');
    } finally {
      setLoading(false);
    }
  }, [api, catalogId, expectedViewer, onConversationLoaded, orderId]);

  useEffect(() => {
    if (initialConversation) return;
    void refresh();
    return api.subscribe(orderId, () => void refresh());
  }, [api, initialConversation, orderId, refresh]);

  useEffect(() => {
    if (initialConversation || expectedViewer === 'staff') return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 12_000);
    return () => window.clearInterval(interval);
  }, [expectedViewer, initialConversation, refresh]);

  const pending = useMemo(
    () => conversation.substitutions.filter((request) => request.state === 'pending'),
    [conversation.substitutions]
  );
  const quickReplies = useMemo(
    () => getOrderConversationQuickReplies({ viewer: expectedViewer, orderStatus, estimatedMinutes }),
    [estimatedMinutes, expectedViewer, orderStatus]
  );

  useEffect(() => {
    const element = messagesRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [conversation.messages.length, optimisticMessages.length]);

  const decide = async (requestId: string, version: number, decision: SubstitutionDecision) => {
    if (busyId) return;
    setBusyId(requestId);
    try {
      await api.resolve({ requestId, decision, expectedVersion: version });
      await refresh();
      onChanged?.();
      toast.success(decision === 'accepted' ? 'Замена принята' : decision === 'removed' ? 'Товар убран' : 'Запросили другой вариант');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Не удалось сохранить решение');
    } finally {
      setBusyId(null);
    }
  };

  const submitMessage = async (requestedBody?: string) => {
    const body = (requestedBody ?? message).trim();
    if (!body || sending) return;
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    const optimistic: OptimisticOrderMessage = {
      id: optimisticId,
      senderKind: expectedViewer,
      messageType: 'text',
      body,
      substitutionRequestId: null,
      createdAt: new Date().toISOString(),
      deliveryState: 'sending'
    };
    setSending(true);
    setMessage('');
    setOptimisticMessages((current) => [...current.filter((item) => item.body !== body || item.deliveryState !== 'failed'), optimistic]);
    try {
      await api.send(orderId, catalogId, body, expectedViewer);
      setOptimisticMessages((current) => current.filter((item) => item.id !== optimisticId));
      await refresh();
      onChanged?.();
    } catch (caught) {
      setOptimisticMessages((current) => current.map((item) => item.id === optimisticId
        ? { ...item, deliveryState: 'failed' }
        : item));
      toast.error(caught instanceof Error ? caught.message : 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  };

  const renderedMessages = [...conversation.messages, ...optimisticMessages];

  const enableClientPush = async () => {
    const state = await requestRestaurantOrderNotificationPermission({ role: 'client', orderId });
    if (state === 'granted') toast.success('Уведомления по заказу включены');
    else if (state === 'denied') toast.error('Уведомления заблокированы в настройках браузера');
  };

  return (
    <section id={panelId} className="order-conversation" data-presentation={presentation} aria-label="Чат заказа">
      {presentation === 'embedded' && <header>
        <div>
          <h3><MessageCircle /> Чат по заказу</h3>
          <p>{expectedViewer === 'client'
            ? `Здесь ${merchantLabel.toLocaleLowerCase('ru-RU')} и курьер уточнят детали заказа.`
            : expectedViewer === 'driver'
              ? 'Напишите клиенту или заведению по текущей доставке.'
              : 'Ответьте клиенту и курьеру, зафиксируйте договорённость.'}</p>
        </div>
        <button type="button" className="order-conversation__icon" aria-label="Обновить чат" onClick={() => void refresh()}>
          <RefreshCw />
        </button>
      </header>}

      {expectedViewer === 'client' && (
        <button type="button" className="order-conversation__push" onClick={() => void enableClientPush()}>
          <Bell /> Получать уведомления о сообщениях
        </button>
      )}

      {loading && presentation === 'embedded' && <p className="order-conversation__hint">Загружаем сообщения...</p>}
      {loading && presentation === 'messenger' && (
        <div className="order-conversation__bubble-skeletons" aria-label="Загружаем сообщения">
          <span /><span /><span />
        </div>
      )}
      {error && (
        <div className="order-conversation__error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>Повторить</button>
        </div>
      )}

      {expectedViewer === 'client' && pending.map((request) => {
        const effect = getSubstitutionAmountEffect(request.originalLineTotal, request.proposedLineTotal);
        return (
          <article className="order-substitution-card" key={request.id}>
            <strong>Товара нет в наличии</strong>
            <p><s>{request.originalTitle}</s> → <b>{request.proposedTitle}</b></p>
            <span data-tone={effect.delta > 0 ? 'warning' : 'positive'}>{effect.label}</span>
            {request.note && <small>{request.note}</small>}
            <div>
              <button type="button" disabled={busyId === request.id} onClick={() => void decide(request.id, request.version, 'accepted')}>
                <Check /> Заменить
              </button>
              <button type="button" disabled={busyId === request.id} onClick={() => void decide(request.id, request.version, 'alternative_requested')}>
                <RotateCcw /> Другой вариант
              </button>
              <button type="button" disabled={busyId === request.id} onClick={() => void decide(request.id, request.version, 'removed')}>
                <Trash2 /> Убрать товар
              </button>
            </div>
          </article>
        );
      })}

      <div className="order-conversation__messages" aria-live="polite" ref={messagesRef}>
        {renderedMessages.length === 0 && !loading ? (
          <p className="order-conversation__hint">Сообщений пока нет.</p>
        ) : renderedMessages.map((item, index) => {
          const previous = renderedMessages[index - 1];
          const startsNewDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(item.createdAt).toDateString();
          const isSystem = item.senderKind === 'system';
          const deliveryState = 'deliveryState' in item ? item.deliveryState : 'saved';
          return (
            <div className="order-conversation__message-row" data-sender={item.senderKind} key={item.id}>
              {presentation === 'messenger' && startsNewDay && <time className="order-conversation__day">{formatMessageDay(item.createdAt)}</time>}
              {isSystem && presentation === 'messenger' ? (
                <p className="order-conversation__system-message">{item.body} · {formatMessageTime(item.createdAt)}</p>
              ) : (
                <article data-sender={item.senderKind} data-state={deliveryState}>
                  {item.senderKind !== expectedViewer && presentation === 'messenger' && (
                    <small>{item.senderKind === 'staff' ? merchantLabel : item.senderKind === 'driver' ? 'Курьер' : 'Система'}</small>
                  )}
                  {presentation === 'embedded' && (
                    <small>{item.senderKind === 'client' ? 'Клиент' : item.senderKind === 'staff' ? merchantLabel : item.senderKind === 'driver' ? 'Курьер' : 'Система'}</small>
                  )}
                  <p>{item.body}</p>
                  <footer>
                    <time dateTime={item.createdAt}>{formatMessageTime(item.createdAt)}</time>
                    {item.senderKind === expectedViewer && deliveryState !== 'failed' && <span>{deliveryState === 'sending' ? '…' : '✓'}</span>}
                  </footer>
                  {deliveryState === 'failed' && (
                    <button type="button" className="order-conversation__retry" onClick={() => void submitMessage(item.body)}>
                      Не отправлено · повторить
                    </button>
                  )}
                </article>
              )}
            </div>
          );
        })}
      </div>

      {expectedViewer !== 'driver' && conversation.adjustments.some((item) => item.state === 'pending') && (
        <div className="order-conversation__adjustments">
          <strong>Изменение суммы</strong>
          {conversation.adjustments.filter((item) => item.state === 'pending').map((item) => (
            <span key={item.id}>{item.kind === 'additional_charge' ? 'К доплате' : 'К возврату'}: {formatAmount(Math.abs(item.amountDelta))}</span>
          ))}
        </div>
      )}

      <form className="order-conversation__composer" onSubmit={(event) => { event.preventDefault(); void submitMessage(); }}>
        <div className="order-conversation__quick-replies" aria-label="Готовые сообщения">
          {quickReplies.map((reply) => (
            <button type="button" key={reply} onClick={() => setMessage(reply)}>{reply}</button>
          ))}
        </div>
        <label className="order-conversation__composer-label" htmlFor={`order-message-${orderId}`}>Сообщение</label>
        <textarea
          id={`order-message-${orderId}`}
          value={message}
          maxLength={2000}
          rows={presentation === 'messenger' ? 1 : undefined}
          placeholder="Напишите сообщение..."
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (presentation !== 'messenger' || event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            void submitMessage();
          }}
        />
        <button type="submit" aria-label="Отправить" disabled={!message.trim() || sending}>
          {presentation === 'messenger' ? <Send /> : sending ? 'Отправляем...' : 'Отправить'}
        </button>
      </form>
    </section>
  );
}
