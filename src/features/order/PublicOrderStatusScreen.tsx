import { useExactBack, useHistoryViewState } from '../../shared/ExactBackNavigation';
import { OrderDetailActions } from './OrderDetailActions';
import { getOrderStage, getOrderPlaceName } from './orderDetailPresentation';
import { resolveClientOrderRealtimeStatus } from '../client-platform/clientPlatformLogic';
import type { ClientOrder } from '../client-platform/types';
import type { Product } from '../../entities/models';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { buildClientAuthPath, getStoredClientSessionToken } from '../../shared/api/clientAccountApi';
import { getClientDeliveryChat, sendClientDeliveryChat, getClientOrderConversation, sendClientOrderConversation, type DeliveryChatMessage, type OrderConversationMessage } from '../../shared/api/deliveryChatApi';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, Phone, MessageCircle, Store, UserRound, ChefHat, Truck, PackageCheck, Clock3, WifiOff, X } from 'lucide-react';
import { useClientPlatformStore } from '../client-platform/store';
import { getPublicRestaurantOrderStatus, type PublicRestaurantOrderStatus, type RestaurantOrderStatus } from '../../shared/api/restaurantOrdersApi';
import { SafeImage } from '../../shared/SafeImage';

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
  restaurantId = '',
  businessType = 'restaurant',
  restaurantAddress = '',
  restaurantLat,
  restaurantLng,
  chatTarget,
  onWhatsappRedirect = redirectToWhatsapp,
  products = []
}: {
  catalogSlug: string;
  orderId: string;
  restaurantWhatsapp?: string;
  restaurantName?: string;
  restaurantId?: string;
  businessType?: string;
  restaurantAddress?: string;
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  chatTarget?: string;
  onWhatsappRedirect?: (href: string) => void;
  products?: Array<Pick<Product, 'id' | 'title' | 'image_url'> & Partial<Product>>;
}) {
  const navigate = useNavigate();
  const backToOrder = useExactBack(`/${catalogSlug}/order/${orderId}`);
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
    refetchInterval: 5_000
  });
  const order = statusQuery.data;
  const syncOrderPatch = useClientPlatformStore(state => state.syncOrderPatch);
  const hasCreatedOrder = Boolean(createdOrder);
  useEffect(() => {
    if (!order || !hasCreatedOrder) return;
    syncOrderPatch(orderId, { status: resolveClientOrderRealtimeStatus(order.status, order.deliveryStatus), paymentStatus: order.paymentStatus, driverName: order.driverName, driverPhone: order.driverPhone });
  }, [order, orderId, hasCreatedOrder, syncOrderPatch]);

  const imageFor = (name: string, id?: string) => products.find((product) => product.id === id || product.title.trim().toLocaleLowerCase('ru-RU') === name.trim().toLocaleLowerCase('ru-RU'))?.image_url;
  if (chatTarget === 'restaurant') return <RestaurantOrderChatScreen orderId={orderId} restaurantName={restaurantName || catalogSlug} onBack={backToOrder} />;
  const renderOrder = (value: PublicRestaurantOrderStatus) => (
    <OrderLiveDetail
      name={value.restaurantName || createdOrder?.restaurantName || restaurantName || catalogSlug}
      total={value.total}
      orderType={value.fulfillmentType === 'delivery' ? 'Доставка' : value.fulfillmentType === 'takeaway' ? 'Самовывоз' : 'Заказ в зале'}
      address={value.deliveryAddress}
      status={resolveClientOrderRealtimeStatus(value.status, value.deliveryStatus) || value.status}
      items={value.items.map((item) => ({ id: item.id, name: item.title, imageUrl: imageFor(item.title), quantity: item.quantity, price: item.unitPrice, total: item.lineTotal }))}
      savedOrder={createdOrder} stale={statusQuery.isError} restaurantId={restaurantId} businessType={businessType} products={products} restaurantAddress={value.restaurantAddress || restaurantAddress} restaurantLat={value.restaurantLat ?? restaurantLat} restaurantLng={value.restaurantLng ?? restaurantLng} refreshing={statusQuery.isFetching} onRefresh={() => void statusQuery.refetch()}
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
      address={createdOrder.addressLine} status={createdOrder.status} savedOrder={createdOrder} restaurantId={restaurantId} stale businessType={businessType} products={products} restaurantAddress={restaurantAddress} restaurantLat={restaurantLat} restaurantLng={restaurantLng} refreshing={statusQuery.isFetching} onRefresh={() => void statusQuery.refetch()}
      items={createdOrder.items.map((item, index) => ({ id: `${item.dishId}-${index}`, name: item.name, imageUrl: item.imageUrl || imageFor(item.name, item.dishId), quantity: item.quantity, price: item.price, total: item.price * item.quantity }))}
      catalogSlug={catalogSlug} orderId={orderId} restaurantWhatsapp={restaurantWhatsapp} isDelivery={createdOrder.orderType === 'delivery'}
    /></main>;
  }

  return (
    <main className="screen checkout-screen">
      {statusQuery.isLoading ? (
        <section className="live-order-skeleton" aria-label="Загрузка заказа" aria-busy="true">
          <span className="live-order-skeleton__circle" /><span className="live-order-skeleton__title" /><span className="live-order-skeleton__hint" /><span className="live-order-skeleton__card" />
        </section>
      ) : order ? (
        renderOrder(order)
      ) : statusQuery.error ? (
        <section className="checkout-summary">
          <div>
            <span>Статус заказа</span>
            <h2>Не удалось загрузить заказ</h2>
            <p>Не удалось получить статус. Проверьте интернет и попробуйте снова.</p>
            <button type="button" className="ghost-wide" onClick={() => void statusQuery.refetch()}>Повторить</button>
          </div>
        </section>
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
function OrderLiveDetail({ name, total, orderType, address, status, items, savedOrder, restaurantId, businessType, products, restaurantAddress, restaurantLat, restaurantLng, stale = false, refreshing, onRefresh, catalogSlug, orderId, restaurantWhatsapp, driverName, driverPhone, isDelivery }: {
  name: string; total: number; orderType: string; address: string; status: RestaurantOrderStatus | null;
  items: LiveDetailItem[]; savedOrder?: ClientOrder; restaurantId: string; businessType: string; products: Array<Pick<Product, 'id' | 'title' | 'image_url'> & Partial<Product>>;
  restaurantAddress?: string; restaurantLat?: number | null; restaurantLng?: number | null; stale?: boolean; refreshing: boolean; onRefresh: () => void;
  catalogSlug: string; orderId: string; restaurantWhatsapp: string; driverName?: string; driverPhone?: string; isDelivery: boolean;
}) {
  const [showAllItems, setShowAllItems] = useState(false);
  const cancelled = status === 'canceled' || status === 'cancelled';
  const progress = getOrderStage(status, isDelivery);
  const steps = isDelivery ? ['Отправлен', 'Принят', 'Готовится', 'В пути', 'Доставлен'] : ['Отправлен', 'Принят', 'Готовится', 'Готов'];
  const courierAssigned = Boolean(!stale && status && ['driver_assigned', 'assigned_driver', 'picked_up', 'on_the_way', 'delivered', 'completed'].includes(status) && (driverName || driverPhone));
  const statusText = status ? publicOrderStatusLabels[status] ?? status : 'Статус ещё не получен';
  const placeName = getOrderPlaceName(name, businessType);
  const StatusIcon = stale ? WifiOff : cancelled ? X : progress === 4 || (!isDelivery && progress === 3) ? PackageCheck : progress === 3 ? Truck : progress === 2 ? ChefHat : progress === 1 ? Clock3 : Check;
  return <section className="live-order">
    <div key={`${stale}-${status}`} className={`live-order__hero${cancelled ? ' is-cancelled' : ''}${stale ? ' is-stale' : ''}`} aria-hidden="true"><span className="live-order__orbit" /><span className="live-order__spark live-order__spark--one" /><span className="live-order__spark live-order__spark--two" /><span className="live-order__hero-icon"><StatusIcon /></span></div>
    <h2 aria-live="polite">{stale ? 'Сохранённый заказ' : cancelled ? 'Заказ отменён' : status === 'new' ? 'Заказ отправлен' : statusText}</h2>
    <p className="live-order__hint">{stale ? refreshing ? 'Проверяем актуальный статус…' : 'Показан последний известный статус. Для обновления нужен интернет и доступ к заказу.' : status === 'new' ? 'Заведение скоро подтвердит заказ' : 'Статус обновляется автоматически'}</p>
    {stale && !getStoredClientSessionToken() && <Link className="live-order__manage" to={buildClientAuthPath(`/${catalogSlug}/order/${orderId}`)}>Войти для обновления</Link>}
    <article className="live-order__card">
      <div className="live-order__restaurant"><span><strong>{placeName}</strong><small>{orderType}{address ? ` · ${address}` : ''}</small></span><b>{formatPrice(total)}</b></div>
      <div className="live-order__status"><div className="live-order__status-title"><strong>{stale ? `Последний известный статус: ${statusText}` : statusText}</strong><button type="button" disabled={refreshing} onClick={onRefresh}>{refreshing ? 'Обновляем…' : 'Обновить статус'}</button></div>{!cancelled && <ol className="live-order__steps" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Этапы заказа">{steps.map((label, index) => <li key={label} aria-current={index === progress ? 'step' : undefined}><i className={index <= progress ? 'is-active' : ''} /><small>{label}</small></li>)}</ol>}</div>
      <div className="live-order__items-heading"><h3>Состав заказа · {items.length} {items.length === 1 ? 'позиция' : items.length >= 2 && items.length <= 4 ? 'позиции' : 'позиций'}</h3>{items.length > 2 && <button type="button" aria-expanded={showAllItems} onClick={() => setShowAllItems(!showAllItems)}>{showAllItems ? 'Свернуть' : 'Показать все'}</button>}</div>
      {(showAllItems ? items : items.slice(0, 2)).map((item) => <div className="live-order__item" key={item.id}><SafeImage src={item.imageUrl || ''} alt="" width={100} height={80} /><span><strong>{item.name}</strong><small>{item.quantity} × {formatPrice(item.price)}</small></span><b>{formatPrice(item.total)}</b></div>)}
      <OrderContacts catalogSlug={catalogSlug} restaurantName={placeName} restaurantTypeLabel={getOrderPlaceName('', businessType).trim()} orderId={orderId} restaurantWhatsapp={restaurantWhatsapp} courierAssigned={courierAssigned} driverName={driverName} driverPhone={driverPhone} />
      <OrderDetailActions restaurantId={restaurantId} order={savedOrder} catalogSlug={catalogSlug} products={products} address={restaurantAddress} lat={restaurantLat} lng={restaurantLng} />
      <Link className="live-order__manage" to="/profile/orders">Все заказы</Link>
    </article>
  </section>;
}

function OrderContacts({ catalogSlug, restaurantName, restaurantTypeLabel, orderId, restaurantWhatsapp, courierAssigned, driverName, driverPhone }: { catalogSlug: string; restaurantName: string; restaurantTypeLabel: string; orderId: string; restaurantWhatsapp: string; courierAssigned: boolean; driverName?: string; driverPhone?: string }) {
  const navigate = useNavigate();
  const [tab, setTab, replaceTab] = useHistoryViewState<'restaurant' | 'courier'>('order.contact.tab', 'restaurant');
  const [chatOpen, setChatOpen, replaceChatOpen] = useHistoryViewState('order.contact.chatOpen', false);
  const [messages, setMessages] = useState<DeliveryChatMessage[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const token = getStoredClientSessionToken();
  useEffect(() => { if (!courierAssigned) { replaceTab('restaurant'); replaceChatOpen(false); } }, [courierAssigned, replaceTab, replaceChatOpen]);
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
    <div className="live-order__contact-person"><span>{tab === 'restaurant' ? <Store /> : <UserRound />}</span><div><strong>{tab === 'restaurant' ? restaurantName : driverName || 'Курьер'}</strong><small>{tab === 'restaurant' ? restaurantTypeLabel : 'Курьер'}</small></div></div>
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
