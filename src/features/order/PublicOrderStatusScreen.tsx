import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { getStoredClientSessionToken } from '../../shared/api/clientAccountApi';
import { getClientDeliveryChat, sendClientDeliveryChat, getClientOrderConversation, sendClientOrderConversation, type DeliveryChatMessage, type OrderConversationMessage } from '../../shared/api/deliveryChatApi';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, Phone, MessageCircle, Store, UserRound } from 'lucide-react';
import { useClientPlatformStore } from '../client-platform/store';
import { getPublicRestaurantOrderStatus, type PublicRestaurantOrderStatus, type RestaurantOrderStatus } from '../../shared/api/restaurantOrdersApi';

const redirectToWhatsapp = (href: string) => window.location.assign(href);

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const publicOrderStatusLabels: Record<RestaurantOrderStatus, string> = {
  new: 'Ожидает принятия', waiting_payment_confirmation: 'Ожидает подтверждения оплаты', payment_confirmed: 'Оплата подтверждена',
  accepted: 'В работе', confirmed: 'В работе', preparing: 'Готовится', cooking: 'Готовится', ready: 'Готов',
  waiting_driver: 'Ожидает курьера', driver_assigned: 'Курьер назначен', assigned_driver: 'Курьер назначен',
  picked_up: 'Заказ забран', on_the_way: 'В пути', delivered: 'Доставлен', completed: 'Выполнен',
  cancelled: 'Отменён', canceled: 'Отменён'
};

export function PublicOrderStatusScreen({
  catalogSlug,
  orderId,
  restaurantWhatsapp = '',
  restaurantName = '',
  chatTarget,
  onWhatsappRedirect = redirectToWhatsapp
}: {
  catalogSlug: string;
  orderId: string;
  restaurantWhatsapp?: string;
  restaurantName?: string;
  chatTarget?: string;
  onWhatsappRedirect?: (href: string) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const confirmation = location.state as { confirmationOrderId?: string; whatsappHref?: string; redirectAt?: number } | null;
  const createdOrder = useClientPlatformStore((state) => state.orders.find((item) => item.id === orderId && item.restaurantSlug === catalogSlug));
  const isConfirmation = confirmation?.confirmationOrderId === orderId && Boolean(createdOrder);
  const whatsappHref = isConfirmation && confirmation?.whatsappHref?.startsWith('https://wa.me/') ? confirmation.whatsappHref : '';
  const deadline = isConfirmation && typeof confirmation?.redirectAt === 'number' ? confirmation.redirectAt : 0;
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
  const redirected = useRef(false);
  useEffect(() => {
    if (!whatsappHref || !deadline) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (!remaining && !redirected.current) {
        redirected.current = true;
        navigate(location.pathname, { replace: true, state: null });
        onWhatsappRedirect(whatsappHref);
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [deadline, whatsappHref, navigate, location.pathname, onWhatsappRedirect]);
  const statusQuery = useQuery({
    queryKey: ['public-order-status', orderId],
    queryFn: () => Promise.race([
      getPublicRestaurantOrderStatus(orderId),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('status_timeout')), 10000))
    ]),
    retry: false,
    refetchInterval: 15_000
  });
  const order = statusQuery.data;
  if (chatTarget === 'restaurant') return <RestaurantOrderChatScreen orderId={orderId} restaurantName={restaurantName || catalogSlug} onBack={() => navigate(`/${catalogSlug}/order/${orderId}`)} />;
  const renderOrder = (value: PublicRestaurantOrderStatus) => (
    <OrderLiveDetail
      name={value.restaurantName || createdOrder?.restaurantName || catalogSlug}
      total={value.total}
      orderType={value.fulfillmentType === 'delivery' ? 'Доставка' : value.fulfillmentType === 'takeaway' ? 'Самовывоз' : 'Заказ в зале'}
      address={value.deliveryAddress}
      status={value.status}
      items={value.items.map((item) => ({ id: item.id, name: item.title, quantity: item.quantity, price: item.unitPrice, total: item.lineTotal }))}
      manageOrderId={createdOrder?.id}
      catalogSlug={catalogSlug} orderId={orderId} restaurantWhatsapp={restaurantWhatsapp} driverName={value.driverName} driverPhone={value.driverPhone} isDelivery={value.fulfillmentType === 'delivery'}
    />
  );

  if (isConfirmation && createdOrder) {
    return <main className="screen checkout-screen">
      <section className="checkout-summary order-confirmation-new">
        <div className="order-confirmation-new__check" aria-hidden="true"><Check /></div>
        <h2>Заказ создан</h2>
        <p>Заказ №{createdOrder.id.slice(0, 8).toUpperCase()}</p>
        <div className="checkout-summary__list">{createdOrder.items.map((item, index) => <article className="checkout-order-card" key={`${item.dishId}-${index}`}><div className="checkout-order-card__body"><div><h3>{item.name}</h3><p>{item.quantity} × {formatPrice(item.price)}</p></div><strong>{formatPrice(item.price * item.quantity)}</strong></div></article>)}</div>
        <div className="checkout-summary__total"><span>Итого</span><strong>{formatPrice(createdOrder.totalAmount)}</strong></div>
        {whatsappHref ? <div className="order-confirmation-new__redirect">
          <div className="order-confirmation-new__count" aria-label={`До перехода ${secondsLeft} секунд`}>{secondsLeft}</div>
          <p>Для надёжности через {secondsLeft} сек. откроется WhatsApp, чтобы вы отправили заказ ресторану.</p>
          <a className="order-confirmation-new__link" href={whatsappHref} onClick={() => { redirected.current = true; navigate(location.pathname, { replace: true, state: null }); }}>Перейти сейчас</a>
        </div> : <p>WhatsApp ресторана не указан. Заказ сохранён в системе.</p>}
      </section>
    </main>;
  }

  if (!order && createdOrder) {
    return <main className="screen checkout-screen"><OrderLiveDetail
      name={createdOrder.restaurantName} total={createdOrder.totalAmount}
      orderType={createdOrder.orderType === 'delivery' ? 'Доставка' : createdOrder.orderType === 'pickup' ? 'Самовывоз' : 'Заказ в зале'}
      address={createdOrder.addressLine} status={null} manageOrderId={createdOrder.id}
      items={createdOrder.items.map((item, index) => ({ id: `${item.dishId}-${index}`, name: item.name, imageUrl: item.imageUrl, quantity: item.quantity, price: item.price, total: item.price * item.quantity }))}
      catalogSlug={catalogSlug} orderId={orderId} restaurantWhatsapp={restaurantWhatsapp} isDelivery={createdOrder.orderType === 'delivery'}
    /></main>;
  }

  return (
    <main className="screen checkout-screen">
      {statusQuery.isLoading ? (
        <section className="live-order-skeleton" aria-label="Загрузка заказа" aria-busy="true">
          <span className="live-order-skeleton__circle" /><span className="live-order-skeleton__title" /><span className="live-order-skeleton__hint" /><span className="live-order-skeleton__card" />
        </section>
      ) : statusQuery.error ? (
        <section className="checkout-summary">
          <div>
            <span>Статус заказа</span>
            <h2>Не удалось загрузить заказ</h2>
            <p>Не удалось получить статус. Проверьте интернет и попробуйте снова.</p>
            <button type="button" className="ghost-wide" onClick={() => void statusQuery.refetch()}>Повторить</button>
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

type LiveDetailItem = { id: string; name: string; imageUrl?: string; quantity: number; price: number; total: number };
function OrderLiveDetail({ name, total, orderType, address, status, items, manageOrderId, catalogSlug, orderId, restaurantWhatsapp, driverName, driverPhone, isDelivery }: {
  name: string; total: number; orderType: string; address: string; status: RestaurantOrderStatus | null;
  items: LiveDetailItem[]; manageOrderId?: string; catalogSlug: string; orderId: string; restaurantWhatsapp: string; driverName?: string; driverPhone?: string; isDelivery: boolean;
}) {
  const [showAllItems, setShowAllItems] = useState(false);
  const cancelled = status === 'canceled' || status === 'cancelled';
  const progress = !status ? -1 : ['completed', 'delivered'].includes(status) ? (isDelivery ? 4 : 3) : isDelivery && ['picked_up', 'on_the_way'].includes(status) ? 3 : ['ready', 'waiting_driver', 'driver_assigned', 'assigned_driver'].includes(status) ? (isDelivery ? 2 : 3) : ['preparing', 'cooking'].includes(status) ? 2 : ['accepted', 'confirmed', 'payment_confirmed'].includes(status) ? 1 : 0;
  const steps = isDelivery ? ['Отправлен', 'Принят', 'Готовится', 'В пути', 'Доставлен'] : ['Отправлен', 'Принят', 'Готовится', 'Готов'];
  const courierAssigned = Boolean(status && ['driver_assigned', 'assigned_driver', 'picked_up', 'on_the_way', 'delivered', 'completed'].includes(status) && (driverName || driverPhone));
  const statusText = status ? publicOrderStatusLabels[status] ?? status : 'Статус недоступен';
  return <section className="live-order">
    <div className={`live-order__check${cancelled ? ' is-cancelled' : ''}`} aria-hidden="true">{cancelled ? '×' : <Check />}</div>
    <h2>{!status ? 'Сохранённый заказ' : cancelled ? 'Заказ отменён' : status === 'new' ? 'Заказ отправлен' : statusText}</h2>
    <p className="live-order__hint">{!status ? 'Не удалось обновить статус. Показываем данные с этого устройства.' : status === 'new' ? 'Ресторан скоро подтвердит заказ' : 'Информация о вашем заказе'}</p>
    <article className="live-order__card">
      <div className="live-order__restaurant"><span><strong>{name}</strong><small>{orderType}{address ? ` · ${address}` : ''}</small></span><b>{formatPrice(total)}</b></div>
      <div className="live-order__status"><strong>{statusText}</strong>{!cancelled && <div className="live-order__steps" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Этапы заказа">{steps.map((label, index) => <span key={label}><i className={index <= progress ? 'is-active' : ''} /><small>{label}</small></span>)}</div>}</div>
      <div className="live-order__items-heading"><h3>Состав заказа · {items.length} {items.length === 1 ? 'позиция' : items.length >= 2 && items.length <= 4 ? 'позиции' : 'позиций'}</h3>{items.length > 2 && <button type="button" aria-expanded={showAllItems} onClick={() => setShowAllItems(!showAllItems)}>{showAllItems ? 'Свернуть' : 'Показать все'}</button>}</div>
      {(showAllItems ? items : items.slice(0, 2)).map((item) => <div className="live-order__item" key={item.id}>{item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" />}<span><strong>{item.name}</strong><small>{item.quantity} × {formatPrice(item.price)}</small></span><b>{formatPrice(item.total)}</b></div>)}
      <OrderContacts catalogSlug={catalogSlug} restaurantName={name} orderId={orderId} restaurantWhatsapp={restaurantWhatsapp} courierAssigned={courierAssigned} driverName={driverName} driverPhone={driverPhone} />
      {manageOrderId && <Link className="live-order__manage" to={`/profile/orders?manage=${encodeURIComponent(manageOrderId)}`}>Повторить заказ или оставить отзыв</Link>}
      <Link className="live-order__manage" to="/profile/orders">Все заказы</Link>
    </article>
  </section>;
}

function OrderContacts({ catalogSlug, restaurantName, orderId, restaurantWhatsapp, courierAssigned, driverName, driverPhone }: { catalogSlug: string; restaurantName: string; orderId: string; restaurantWhatsapp: string; courierAssigned: boolean; driverName?: string; driverPhone?: string }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'restaurant' | 'courier'>('restaurant');
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<DeliveryChatMessage[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const token = getStoredClientSessionToken();
  useEffect(() => { if (!courierAssigned) { setTab('restaurant'); setChatOpen(false); } }, [courierAssigned]);
  useEffect(() => {
    if (!chatOpen || !token || !courierAssigned) return;
    let active = true;
    const load = () => void getClientDeliveryChat(token, orderId).then((result) => { if (active) { setMessages(result); setError(''); } }).catch(() => { if (active) setError('Не удалось загрузить чат. Попробуйте позже.'); });
    load();
    const timer = window.setInterval(load, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [chatOpen, token, orderId, courierAssigned]);
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !body.trim()) return;
    try { await sendClientDeliveryChat(token, orderId, body); setBody(''); setMessages(await getClientDeliveryChat(token, orderId)); setError(''); } catch { setError('Не удалось отправить сообщение. Попробуйте ещё раз.'); }
  };
  const restaurantNumber = restaurantWhatsapp.replace(/\D/g, '');
  const courierNumber = (driverPhone || '').replace(/[^\d+]/g, '');
  return <section className="live-order__contacts" aria-label="Связь по заказу">
    <strong>Связь по заказу</strong>
    <div className="live-order__contact-tabs" role="tablist" aria-label="Контакты заказа">
      <button type="button" role="tab" aria-selected={tab === 'restaurant'} className={tab === 'restaurant' ? 'is-active' : ''} onClick={() => setTab('restaurant')}>Заведение</button>
      {courierAssigned && <button type="button" role="tab" aria-selected={tab === 'courier'} className={tab === 'courier' ? 'is-active' : ''} onClick={() => setTab('courier')}>Курьер</button>}
    </div>
    <div className="live-order__contact-person"><span>{tab === 'restaurant' ? <Store /> : <UserRound />}</span><div><strong>{tab === 'restaurant' ? restaurantName : driverName || 'Курьер'}</strong><small>{tab === 'restaurant' ? 'Ресторан' : 'Курьер'}</small></div></div>
    {tab === 'restaurant' ? <div className="live-order__contact-actions">{restaurantNumber && <a href={`tel:+${restaurantNumber}`}><Phone />Позвонить</a>}<button type="button" onClick={() => navigate(`/${catalogSlug}/order/${orderId}/chat/restaurant`)}><MessageCircle />Написать</button></div> : <><div className="live-order__contact-actions">{courierNumber && <a href={`tel:${courierNumber}`}><Phone />Позвонить</a>}<button type="button" onClick={() => setChatOpen((open) => !open)}><MessageCircle />{chatOpen ? 'Закрыть чат' : 'Написать'}</button></div>
      {chatOpen && <div className="live-order__chat"><strong>Чат с курьером</strong>{!token ? <p>Войдите в аккаунт, чтобы написать курьеру.</p> : <><div aria-live="polite">{messages.map((message) => <p key={message.id}><b>{message.senderRole === 'client' ? 'Вы' : 'Курьер'}: </b>{message.body}</p>)}</div>{error && <p role="alert">{error}</p>}<form onSubmit={send}><input aria-label="Сообщение курьеру" value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} placeholder="Сообщение" /><button type="submit" disabled={!body.trim()}>Отправить</button></form></>}</div>}
    </>}
  </section>;
}

function RestaurantOrderChatScreen({ orderId, restaurantName, onBack }: { orderId: string; restaurantName: string; onBack: () => void }) {
  const token = getStoredClientSessionToken();
  const [body, setBody] = useState('');
  const [messages, setMessages] = useState<OrderConversationMessage[]>([]);
  const [error, setError] = useState('');
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const load = useCallback(() => {
    if (!token) {
      setError('Войдите в аккаунт, чтобы написать заведению.');
      return;
    }
    void getClientOrderConversation(token, orderId)
      .then((result) => { setMessages(result); setError(''); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Не удалось открыть чат.'));
  }, [orderId, token]);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 10_000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => { lastMessageRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);
  const send = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!token || !body.trim()) return; try { await sendClientOrderConversation(token, orderId, body); setBody(''); load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось отправить сообщение.'); } };
  return <main className="order-chat-screen"><header className="order-chat-screen__header"><button type="button" aria-label="Назад к заказу" onClick={onBack}>‹</button><div><strong>{restaurantName}</strong><small>Чат по заказу</small></div></header><section className="order-chat-screen__messages" aria-label={`Переписка с ${restaurantName}`}>{messages.length ? messages.map((message) => <p data-role={message.senderRole} key={message.id}><b>{message.senderRole === 'client' ? 'Вы' : message.senderRole === 'restaurant' ? restaurantName : 'Курьер'}: </b>{message.body}</p>) : <p className="order-chat-screen__empty">Начните переписку с заведением.</p>}{error && <p className="order-chat-screen__error" role="alert">{error}</p>}<div ref={lastMessageRef} /></section><form className="order-chat-screen__composer" onSubmit={send}><input aria-label="Сообщение заведению" value={body} onChange={(event) => setBody(event.target.value)} maxLength={1000} placeholder="Сообщение" autoFocus/><button type="submit" disabled={!body.trim() || !token}>Отправить</button></form></main>;
}
