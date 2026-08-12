import { Bell, Check, MessageCircle, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getSubstitutionAmountEffect, type SubstitutionDecision } from '../../entities/orderSubstitution';
import {
  emptyOrderConversation,
  getOrderConversation,
  resolveOrderSubstitution,
  sendOrderMessage,
  subscribeOrderConversation,
  type OrderConversation
} from '../../shared/api/orderConversationApi';
import { requestRestaurantOrderNotificationPermission } from '../../shared/restaurantOrderNotifications';
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

export function OrderConversationPanel({
  orderId,
  catalogId,
  expectedViewer,
  initialConversation,
  api = defaultApi,
  onChanged
}: {
  orderId: string;
  catalogId: string;
  expectedViewer: 'client' | 'staff';
  initialConversation?: OrderConversation;
  api?: ConversationApi;
  onChanged?: () => void;
}) {
  const [conversation, setConversation] = useState<OrderConversation>(() =>
    initialConversation ?? emptyOrderConversation(expectedViewer)
  );
  const [loading, setLoading] = useState(initialConversation === undefined);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api.load(orderId, catalogId, expectedViewer === 'client');
      setConversation(next);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось открыть чат заказа');
    } finally {
      setLoading(false);
    }
  }, [api, catalogId, expectedViewer, orderId]);

  useEffect(() => {
    if (initialConversation) return;
    void refresh();
    return api.subscribe(orderId, () => void refresh());
  }, [api, initialConversation, orderId, refresh]);

  useEffect(() => {
    if (initialConversation || expectedViewer !== 'client') return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 12_000);
    return () => window.clearInterval(interval);
  }, [expectedViewer, initialConversation, refresh]);

  const pending = useMemo(
    () => conversation.substitutions.filter((request) => request.state === 'pending'),
    [conversation.substitutions]
  );

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

  const submitMessage = async () => {
    const body = message.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await api.send(orderId, catalogId, body, expectedViewer === 'client');
      setMessage('');
      await refresh();
      onChanged?.();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Не удалось отправить сообщение');
    } finally {
      setSending(false);
    }
  };

  const enableClientPush = async () => {
    const state = await requestRestaurantOrderNotificationPermission({ role: 'client', orderId });
    if (state === 'granted') toast.success('Уведомления по заказу включены');
    else if (state === 'denied') toast.error('Уведомления заблокированы в настройках браузера');
  };

  return (
    <section id="order-conversation" className="order-conversation" aria-label="Чат заказа">
      <header>
        <div>
          <h3><MessageCircle /> Чат по заказу</h3>
          <p>{expectedViewer === 'client' ? 'Здесь магазин предложит замену и уточнит сборку.' : 'Ответьте клиенту и зафиксируйте договорённость.'}</p>
        </div>
        <button type="button" className="order-conversation__icon" aria-label="Обновить чат" onClick={() => void refresh()}>
          <RefreshCw />
        </button>
      </header>

      {expectedViewer === 'client' && (
        <button type="button" className="order-conversation__push" onClick={() => void enableClientPush()}>
          <Bell /> Получать уведомления о заменах
        </button>
      )}

      {loading && <p className="order-conversation__hint">Загружаем сообщения...</p>}
      {error && <p className="order-conversation__error">{error}</p>}

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

      <div className="order-conversation__messages" aria-live="polite">
        {conversation.messages.length === 0 && !loading ? (
          <p className="order-conversation__hint">Сообщений пока нет.</p>
        ) : conversation.messages.map((item) => (
          <article data-sender={item.senderKind} key={item.id}>
            <small>{item.senderKind === 'client' ? 'Клиент' : item.senderKind === 'staff' ? 'Магазин' : 'Система'}</small>
            <p>{item.body}</p>
          </article>
        ))}
      </div>

      {conversation.adjustments.some((item) => item.state === 'pending') && (
        <div className="order-conversation__adjustments">
          <strong>Изменение суммы</strong>
          {conversation.adjustments.filter((item) => item.state === 'pending').map((item) => (
            <span key={item.id}>{item.kind === 'additional_charge' ? 'К доплате' : 'К возврату'}: {formatAmount(Math.abs(item.amountDelta))}</span>
          ))}
        </div>
      )}

      <form onSubmit={(event) => { event.preventDefault(); void submitMessage(); }}>
        <label htmlFor={`order-message-${orderId}`}>Сообщение</label>
        <textarea
          id={`order-message-${orderId}`}
          value={message}
          maxLength={2000}
          placeholder="Напишите сообщение по заказу"
          onChange={(event) => setMessage(event.target.value)}
        />
        <button type="submit" disabled={!message.trim() || sending}>{sending ? 'Отправляем...' : 'Отправить'}</button>
      </form>
    </section>
  );
}
