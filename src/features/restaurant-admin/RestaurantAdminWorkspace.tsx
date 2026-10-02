import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight, Bell, Calculator, CalendarDays, ClipboardList, CreditCard, Home, Info, Package,
  Paintbrush, Plus, QrCode, RefreshCcw, Settings, Store, Tags, Trash2, Utensils
} from 'lucide-react';
import type { Cabin, Category, Product, Restaurant } from '../../entities/models';
import { useAuthStore } from '../stores';
import { getCurrentStock } from '../restaurant-settings/catalogAdminModel';
import { DeliverySettingsCard, SettingsHub, defaultRestaurantDeliverySettings } from '../restaurant-settings';
import { ScannerPage } from '../../pages/scanner/ScannerPage';
import type { RestaurantPaymentSettings } from '../../shared/paymentSettings';
import {
  createRestaurantOrderFromCart,
  deleteRestaurantTestOrder,
  type RestaurantDeliverySettings,
  type RestaurantOrder,
  type RestaurantOrderStatus
} from '../../shared/api/restaurantOrdersApi';
import { formatOrderTime } from '../../shared/orderListGroups';
import {
  getRestaurantOrderNotificationPermission, requestRestaurantOrderNotificationPermission,
  restoreRestaurantOrderNotificationSubscription, showRestaurantOrderNotification
} from '../../shared/restaurantOrderNotifications';
import { buildRestaurantAdminTabPath, type RestaurantAdminTab } from '../../shared/pwaSession';
import { BrandLogo } from '../../shared/BrandLogo';
import { SafeImage } from '../../shared/SafeImage';
import { OrderDetailsPanel } from './OrderDetailsPanel';
import { getCurrentRestaurantBillingTariff } from '../../shared/api/subscriptionsApi';
import { calculateRestaurantFinance } from './restaurantFinance';
import { getBusinessTerms } from '../../shared/businessTerminology';
import { confirmRoleSignOut } from '../../shared/roleSessionSafety';
import {
  adminOrderStatusLabels, adminOrderStatusTones, fulfillmentLabels,
  getAdminOrderItemsCount, getAdminOrderLocationLabel, playRestaurantAdminOrderSound
} from './orderPresentation';
import { getRestaurantOrderBoardColumnId, getRestaurantOrderBoardColumns } from './orderBoard';
import { RestaurantPosPage, type RestaurantPosOrderDraft } from '../restaurant-pos/RestaurantPosPage';
import type { RestaurantAdminModuleAccess } from '../platform-admin-modules/restaurantModuleAccess';

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

export type RestaurantAdminSettingsScreen =
  | 'settings-profile' | 'settings-design' | 'settings-categories' | 'settings-payments'
  | 'settings-backup' | 'settings-stock';

export function RestaurantAdminWorkspace({
  catalogSlug,
  restaurant,
  categories,
  cabins,
  products,
  orders,
  routeSection,
  routeOrderId,
  paymentSettings,
  deliverySettings,
  moduleAccess,
  onOpenScreen,
  onOpenSeating,
  onOpenCatalog,
  onAddDish,
  onOrderStatus,
  onRefreshOrders,
  onSaveDeliverySettings
}: {
  catalogSlug: string;
  restaurant: Restaurant;
  categories: Category[];
  cabins: Cabin[];
  products: Product[];
  orders: RestaurantOrder[];
  routeSection?: string;
  routeOrderId?: string;
  paymentSettings: RestaurantPaymentSettings;
  deliverySettings: RestaurantDeliverySettings | null;
  moduleAccess: RestaurantAdminModuleAccess;
  onOpenScreen: (screen: RestaurantAdminSettingsScreen) => void;
  onOpenSeating: () => void;
  onOpenCatalog: () => void;
  onAddDish: () => void;
  onOrderStatus: (order: RestaurantOrder, status: RestaurantOrderStatus, reason?: string) => Promise<void>;
  onRefreshOrders: () => void;
  onSaveDeliverySettings: (settings: RestaurantDeliverySettings) => void;
}) {
  const navigate = useNavigate();
  const terms = getBusinessTerms(restaurant.business_type);
  const [tab, setTab] = useState<RestaurantAdminTab>(() =>
    routeSection === 'order'
      ? 'orders'
      : routeSection === 'orders' || routeSection === 'dishes' || routeSection === 'finance' || routeSection === 'settings' || routeSection === 'scanner' || routeSection === 'pos'
        ? routeSection
      : 'home'
  );
  const [financePeriod, setFinancePeriod] = useState<'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'>('month');
  const [financeRangeStart, setFinanceRangeStart] = useState('');
  const [financeRangeEnd, setFinanceRangeEnd] = useState('');
  const [settingsView, setSettingsView] = useState<'home' | 'delivery'>('home');
  const [selectedOrder, setSelectedOrder] = useState<RestaurantOrder | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [recentOrderIds, setRecentOrderIds] = useState<Set<string>>(() => new Set());
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedOrdersRef = useRef(false);
  const orderListScrollPositionRef = useRef(0);
  const [notificationPermission, setNotificationPermission] = useState(() => getRestaurantOrderNotificationPermission());
  const logout = useAuthStore((state) => state.logout);
  const today = new Date().toDateString();
  const currentMonth = new Date();
  const todayOrders = orders.filter((order) => new Date(order.createdAt).toDateString() === today);
  const todayRevenue = todayOrders
    .filter((order) => !['cancelled'].includes(order.status))
    .reduce((total, order) => total + order.total, 0);
  const monthOrders = orders.filter((order) => {
    const created = new Date(order.createdAt);
    return created.getFullYear() === currentMonth.getFullYear() && created.getMonth() === currentMonth.getMonth();
  });
  const { data: billingTariff = null } = useQuery({
    queryKey: ['restaurant-billing-tariff', catalogSlug],
    queryFn: () => getCurrentRestaurantBillingTariff(catalogSlug),
    staleTime: 60_000
  });
  const {
    grossRevenue: monthRevenue,
    platformDebt: restaurantDebt,
    courierExpense,
    netRevenue
  } = calculateRestaurantFinance(monthOrders, billingTariff);
  const financeOrders = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    let end: Date | null = null;
    if (financePeriod === 'today') start.setHours(0, 0, 0, 0);
    if (financePeriod === 'week') start.setDate(now.getDate() - 6);
    if (financePeriod === 'month') start.setDate(1);
    if (financePeriod === 'quarter') start.setMonth(now.getMonth() - 2, 1);
    if (financePeriod === 'year') start.setMonth(0, 1);
    if (financePeriod === 'custom') {
      const customStart = financeRangeStart ? new Date(`${financeRangeStart}T00:00:00`) : null;
      const customEnd = financeRangeEnd ? new Date(`${financeRangeEnd}T23:59:59.999`) : null;
      if (customStart && !Number.isNaN(customStart.getTime())) start.setTime(customStart.getTime());
      if (customEnd && !Number.isNaN(customEnd.getTime())) end = customEnd;
    }
    if (financePeriod !== 'today' && financePeriod !== 'custom') start.setHours(0, 0, 0, 0);
    return orders.filter((order) => {
      const createdAt = new Date(order.createdAt);
      return createdAt >= start && (!end || createdAt <= end);
    });
  }, [financePeriod, financeRangeEnd, financeRangeStart, orders]);
  const finance = useMemo(() => calculateRestaurantFinance(financeOrders, billingTariff), [billingTariff, financeOrders]);
  const orderBoardColumns = useMemo(() => getRestaurantOrderBoardColumns(), []);
  const orderBoard = useMemo(
    () => orderBoardColumns.map((column) => ({
      ...column,
      orders: orders.filter((order) => getRestaurantOrderBoardColumnId(order.status) === column.id)
    })),
    [orderBoardColumns, orders]
  );
  const nextPosGuestNumber = useMemo(() => orders.reduce((highest, order) => {
    const match = order.clientName.match(/^Гость\s*№\s*(\d+)$/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1, [orders]);
  const activeOrders = orders.filter((order) => !['completed', 'delivered', 'cancelled', 'canceled'].includes(order.status));
  const openTab = (nextTab: RestaurantAdminTab) => {
    setTab(nextTab);
    if (nextTab !== 'settings') setSettingsView('home');
    navigate(buildRestaurantAdminTabPath(catalogSlug, nextTab));
  };
  const openOrderFromList = (order: RestaurantOrder) => {
    orderListScrollPositionRef.current = window.scrollY;
    setSelectedOrder(order);
    window.requestAnimationFrame(() => {
      document
        .querySelector('.admin-order-details-panel')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  const closeOrderDetails = () => {
    setSelectedOrder(null);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: orderListScrollPositionRef.current, left: 0, behavior: 'auto' });
    });
  };
  const moveOrderToBoardColumn = (order: RestaurantOrder, status: RestaurantOrderStatus) => {
    setSelectedOrder(null);
    window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-order-board-column="${getRestaurantOrderBoardColumnId(status)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  };
  const deleteOrder = async (order: RestaurantOrder) => {
    if (deletingOrderId) return;
    setDeletingOrderId(order.id);
    try {
      const deleted = await deleteRestaurantTestOrder(order);
      if (!deleted) throw new Error('Заказ уже удалён или не найден');
      if (selectedOrder?.id === order.id) setSelectedOrder(null);
      toast.success(`Заказ #${order.orderNumber} удалён`);
      onRefreshOrders();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить заказ');
    } finally {
      setDeletingOrderId(null);
    }
  };
  const enableOrderNotifications = () => {
    void requestRestaurantOrderNotificationPermission({ role: 'restaurant', catalogSlug }).then(setNotificationPermission);
  };

  const submitPosOrder = async (draft: RestaurantPosOrderDraft) => {
    const cartItems = draft.items.flatMap((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      return product ? [{ product, quantity: item.quantity }] : [];
    });
    if (cartItems.length !== draft.items.length) {
      throw new Error('Одно из блюд больше недоступно в текущем каталоге');
    }
    const paymentLabel = draft.paymentMethod === 'cash' ? 'Наличные' : 'Перевод';
    await createRestaurantOrderFromCart({
      slug: catalogSlug,
      items: cartItems,
      fulfillmentType: draft.fulfillmentType,
      cabinLabel: draft.tableLabel,
      deliveryAddress: draft.deliveryAddress,
      customerName: draft.customerName,
      customerPhone: draft.customerPhone,
      comment: [
        `POS: ${paymentLabel}`,
        draft.paymentMethod === 'cash' && draft.cashReceived > 0
          ? `Получено: ${draft.cashReceived.toLocaleString('ru-RU')} ₽ · Сдача: ${draft.cashChange.toLocaleString('ru-RU')} ₽`
          : '',
        draft.cabinPrice > 0 ? `Цена кабинки: ${draft.cabinPrice.toLocaleString('ru-RU')} ₽` : '',
        draft.comment
      ].filter(Boolean).join(' · ')
    });
    onRefreshOrders();
    toast.success('POS-заказ добавлен в общий список заказов');
  };

  useEffect(() => {
    if (notificationPermission !== 'granted' || !catalogSlug) return;
    void restoreRestaurantOrderNotificationSubscription({ role: 'restaurant', catalogSlug }).then(setNotificationPermission);
  }, [catalogSlug, notificationPermission]);

  useEffect(() => {
    if (routeSection === 'order') {
      setTab('orders');
      return;
    }
    if (routeSection === 'dashboard') {
      setTab('home');
      return;
    }
    if (routeSection === 'pos') {
      setTab(moduleAccess.pos === 'disabled' ? 'home' : 'pos');
      return;
    }
    if (routeSection === 'orders' || routeSection === 'dishes' || routeSection === 'finance' || routeSection === 'settings' || routeSection === 'scanner') {
      setTab(routeSection);
    }
  }, [moduleAccess.pos, routeSection]);

  useEffect(() => {
    if (!routeOrderId) return;
    const order = orders.find((item) => item.id === routeOrderId);
    if (order) {
      setSelectedOrder(order);
    }
  }, [orders, routeOrderId]);

  useEffect(() => {
    const knownIds = knownOrderIdsRef.current;
    const newOrderIds = hasLoadedOrdersRef.current
      ? orders.filter((order) => order.status === 'new' && !knownIds.has(order.id)).map((order) => order.id)
      : [];

    if (newOrderIds.length > 0) {
      const newOrders = orders.filter((order) => newOrderIds.includes(order.id));
      setRecentOrderIds((current) => new Set([...current, ...newOrderIds]));
      toast.success(newOrderIds.length === 1 ? 'Новый заказ' : `Новых заказов: ${newOrderIds.length}`);
      playRestaurantAdminOrderSound();
      newOrders.slice(0, 3).forEach((order) => {
        void showRestaurantOrderNotification({
          title: `Новый заказ #${order.orderNumber}`,
          body: `${order.clientName || 'Клиент'} · ${formatPrice(order.total)}`,
          tag: `restaurant-order-${order.id}`,
          url: `${window.location.origin}${window.location.pathname}${window.location.search}#/${catalogSlug}/orders`
        });
      });
      window.setTimeout(() => {
        setRecentOrderIds((current) => {
          const next = new Set(current);
          newOrderIds.forEach((id) => next.delete(id));
          return next;
        });
      }, 9000);
    }

    knownOrderIdsRef.current = new Set(orders.map((order) => order.id));
    hasLoadedOrdersRef.current = true;
  }, [catalogSlug, orders, tab]);

  return (
    <main className="restaurant-admin">
      <aside className="restaurant-admin-sidebar">
        <BrandLogo compact />
        <nav aria-label="Разделы админки">
          <button className={tab === 'home' ? 'is-active' : ''} type="button" onClick={() => openTab('home')}><Home />Главная</button>
          <button className={tab === 'dishes' ? 'is-active' : ''} type="button" onClick={() => openTab('dishes')}><Utensils />Каталог</button>
          <button className={tab === 'orders' ? 'is-active' : ''} type="button" onClick={() => openTab('orders')}><ClipboardList />Заказы</button>
          <button className={tab === 'scanner' ? 'is-active' : ''} type="button" onClick={() => openTab('scanner')}><QrCode />Сканер</button>
          {moduleAccess.pos !== 'disabled' && <button className={tab === 'pos' ? 'is-active' : ''} type="button" onClick={() => openTab('pos')}><Calculator />POS-касса</button>}
          <button className={tab === 'settings' ? 'is-active' : ''} type="button" onClick={() => openTab('settings')}><Settings />Настройки</button>
        </nav>
      </aside>

      <div className="restaurant-admin__workspace">
        <section className={tab === 'pos' ? 'restaurant-admin__hero restaurant-admin__hero--compact' : 'restaurant-admin__hero'}>
          <div>
            <span>Панель: {terms.placeLower}</span>
            <h1>{restaurant.name || terms.place}</h1>
            <p>{restaurant.subtitle || 'Управляйте меню, заказами и доставкой'}</p>
          </div>
          <div className="restaurant-admin__hero-actions">
            <div className="restaurant-admin__logo">
              {restaurant.logo_url ? <img src={restaurant.logo_url} alt="" /> : <Store />}
            </div>
            <button className="restaurant-admin__notification-button" type="button" onClick={onRefreshOrders}>
              <RefreshCcw />
              Обновить
            </button>
            {notificationPermission === 'default' && (
              <button
                className="restaurant-admin__notification-button restaurant-admin__notification-button--icon"
                type="button"
                onClick={enableOrderNotifications}
                aria-label="Включить уведомления"
                title="Включить уведомления"
              >
                <Bell />
              </button>
            )}
          </div>
        </section>

        {tab === 'home' && (
          <section className="restaurant-admin__content">
            <section className="admin-finance-summary">
              <header>
                <button className="admin-finance-summary__open" type="button" onClick={() => openTab('finance')}><h2>Финансы</h2><ArrowRight /></button>
                <small>{formatPrice(monthRevenue)} за месяц <Info /></small>
              </header>
              <div>
                <article>
                  <span>Получено {terms.placeInstrumental}</span>
                  <strong>{formatPrice(monthRevenue)}</strong>
                  <ArrowRight />
                </article>
                <article>
                  <span>Заказов за месяц</span>
                  <strong>{monthOrders.length}</strong>
                  <ClipboardList />
                </article>
                <article data-tone={restaurantDebt > 0 ? 'debt' : 'ok'}>
                  <span>Долг платформе</span>
                  <strong>{formatPrice(restaurantDebt)}</strong>
                  <CreditCard />
                </article>
              </div>
              <p className="admin-finance-summary__net">
                Курьерам: {formatPrice(courierExpense)} · После курьеров и тарифа: {formatPrice(netRevenue)}
              </p>
            </section>
            <section className="admin-today-card">
              <div>
                <span>Сегодня</span>
                <strong>{formatPrice(todayRevenue)}</strong>
                <small>• {todayOrders.length} заказов сегодня</small>
                <small>• {activeOrders.length} активных</small>
              </div>
              <button type="button" onClick={() => openTab('orders')}>
                <ClipboardList />
                Заказы
                <ArrowRight />
              </button>
            </section>
            <section className="admin-quick-actions" aria-label="Быстрые действия">
              <button type="button" onClick={onAddDish}><Plus />{terms.addItem}</button>
                <button type="button" onClick={() => onOpenScreen('settings-stock')}><Package />Остатки</button>
                <button type="button" onClick={() => openTab('orders')}><ClipboardList />Заказы</button>
                <button type="button" onClick={() => openTab('scanner')}><QrCode />Сканер</button>
                {moduleAccess.pos !== 'disabled' && <button type="button" onClick={() => openTab('pos')}><Calculator />POS-касса</button>}
              </section>
          </section>
        )}

        {tab === 'dishes' && (
          <section className="restaurant-admin__content">
            <section className="admin-section-card">
              <h2>Каталог</h2>
              <p>Откройте клиентский каталог в режиме заведения: карточки можно редактировать, скрывать и менять остатки.</p>
              <div className="admin-quick-actions">
                <button type="button" onClick={onOpenCatalog}><Utensils />Открыть каталог</button>
                <button type="button" onClick={onAddDish}><Plus />{terms.addItem}</button>
                <button type="button" onClick={() => onOpenScreen('settings-categories')}><Tags />Категории</button>
                <button type="button" onClick={() => onOpenScreen('settings-stock')}><RefreshCcw />Остатки</button>
                <button type="button" onClick={() => onOpenScreen('settings-design')}><Paintbrush />Дизайн</button>
              </div>
            </section>
            <div className="admin-menu-preview">
              {products.slice(0, 8).map((product) => (
                <article key={product.id}>
                  <SafeImage src={product.image_url} alt={product.title} />
                  <div>
                    <strong>{product.title}</strong>
                    <small>{formatPrice(product.price)} · остаток {getCurrentStock(product)}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'finance' && (
          <section className="restaurant-admin__content admin-finance-page">
            <header className="admin-finance-page__header">
              <div>
                <span>Финансовый отчёт</span>
                <h2>Деньги заведения</h2>
                <p>В расчёт входят все неотменённые заказы за выбранный период.</p>
              </div>
              <CalendarDays />
            </header>
            <div className="admin-finance-page__periods" role="group" aria-label="Период отчёта">
              {([['today', 'Сегодня'], ['week', '7 дней'], ['month', 'Месяц'], ['quarter', 'Квартал'], ['year', 'Год'], ['custom', 'Период']] as const).map(([period, label]) => (
                <button className={financePeriod === period ? 'is-active' : ''} key={period} type="button" onClick={() => setFinancePeriod(period)}>{label}</button>
              ))}
            </div>
            {financePeriod === 'custom' && (
              <div className="admin-finance-page__custom-range">
                <label>С <input type="date" value={financeRangeStart} onChange={(event) => setFinanceRangeStart(event.target.value)} /></label>
                <label>По <input type="date" value={financeRangeEnd} min={financeRangeStart || undefined} onChange={(event) => setFinanceRangeEnd(event.target.value)} /></label>
              </div>
            )}
            <div className="admin-finance-page__metrics">
              <article><span>Выручка</span><strong>{formatPrice(finance.grossRevenue)}</strong><small>{financeOrders.length} заказов</small></article>
              <article><span>Комиссия платформы</span><strong>{formatPrice(finance.platformDebt)}</strong><small>{billingTariff ? 'По действующему тарифу' : 'Тариф не задан'}</small></article>
              <article><span>Курьерам</span><strong>{formatPrice(finance.courierExpense)}</strong><small>Выплаты за доставки</small></article>
              <article data-tone="net"><span>К получению</span><strong>{formatPrice(finance.netRevenue)}</strong><small>Выручка после удержаний</small></article>
            </div>
            <section className="admin-finance-page__orders">
              <header><h3>Заказы в отчёте</h3><button type="button" onClick={() => openTab('orders')}>Все заказы <ArrowRight /></button></header>
              {financeOrders.length > 0 ? financeOrders.slice(0, 12).map((order) => (
                <article key={order.id}>
                  <span><strong>#{order.orderNumber}</strong><small>{formatOrderTime(order.createdAt)} · {adminOrderStatusLabels[order.status] ?? order.status}</small></span>
                  <strong>{formatPrice(order.total)}</strong>
                </article>
              )) : <p className="admin-finance-page__empty">За выбранный период пока нет заказов.</p>}
            </section>
          </section>
        )}

        {tab === 'orders' && (
          <section className="restaurant-admin__content">
            <div className="admin-orders-layout">
              {selectedOrder && (
                <OrderDetailsPanel
                  order={selectedOrder}
                  catalogSlug={catalogSlug}
                  businessType={restaurant.business_type}
                  paymentSettings={paymentSettings}
                  onClose={closeOrderDetails}
                  onStatus={async (status, reason) => {
                    await onOrderStatus(selectedOrder, status, reason);
                    moveOrderToBoardColumn(selectedOrder, status);
                  }}
                  onRefreshOrders={onRefreshOrders}
                  onDelete={() => deleteOrder(selectedOrder)}
                />
              )}
              <section className="admin-order-board" aria-label="Воронка заказов">
                <header className="admin-order-board__header">
                  <div><span>Все заказы</span><strong>{orders.length}</strong></div>
                  <small>Карточка переходит в следующий этап после действия.</small>
                </header>
                {orders.length === 0 && (
                  <section className="admin-empty-orders">
                    <ClipboardList />
                    <strong>Заказов пока нет</strong>
                    <span>Новые заказы появятся здесь автоматически.</span>
                  </section>
                )}
                {orders.length > 0 && <div className="admin-order-board__columns">
                  {orderBoard.map((column) => (
                    <section className="admin-order-board__column" data-order-board-column={column.id} key={column.id}>
                      <header><strong>{column.label}</strong><b>{column.orders.length}</b></header>
                      <div>
                        {column.orders.map((order) => (
                          <div className="admin-order-card-shell" key={order.id}>
                            <button
                              className="admin-order-card"
                              data-active={selectedOrder?.id === order.id}
                              data-highlighted={recentOrderIds.has(order.id)}
                              type="button"
                              onClick={() => openOrderFromList(order)}
                            >
                              <span className="admin-order-card__head">
                                <strong>#{order.orderNumber}</strong>
                                <time dateTime={order.createdAt}>{formatOrderTime(order.createdAt)}</time>
                              </span>
                              <span className="admin-order-card__meta">
                                {fulfillmentLabels[order.fulfillmentType]} · {getAdminOrderItemsCount(order)} поз.
                              </span>
                              <span className="admin-order-card__client">
                                {order.clientName || 'Клиент'}{order.clientPhone ? ` · ${order.clientPhone}` : ''}
                              </span>
                              <span className="admin-order-card__address">{getAdminOrderLocationLabel(order)}</span>
                              <span className="admin-order-card__foot">
                                <b>{formatPrice(order.total)}</b>
                                <i data-tone={adminOrderStatusTones[order.status]}>
                                  {order.status === 'new' && <span aria-hidden="true" />}
                                  {adminOrderStatusLabels[order.status]}
                                </i>
                              </span>
                            </button>
                            <button
                              className="admin-order-card__delete"
                              type="button"
                              aria-label={`Удалить заказ ${order.orderNumber}`}
                              title="Удалить заказ"
                              disabled={deletingOrderId === order.id}
                              onClick={() => {
                                if (window.confirm(`Удалить заказ #${order.orderNumber} безвозвратно?`)) {
                                  void deleteOrder(order);
                                }
                              }}
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                        {column.orders.length === 0 && <p className="admin-order-board__empty">Нет заказов</p>}
                      </div>
                    </section>
                  ))}
                </div>}
              </section>
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className="restaurant-admin__content">
            {settingsView === 'home' ? (
              <SettingsHub
                onProfile={() => onOpenScreen('settings-profile')}
                onDesign={() => onOpenScreen('settings-design')}
                onCategories={() => onOpenScreen('settings-categories')}
                onSeating={onOpenSeating}
                onPayments={() => onOpenScreen('settings-payments')}
                onImport={() => onOpenScreen('settings-backup')}
                onDelivery={() => setSettingsView('delivery')}
                onLogout={() => {
                  if (confirmRoleSignOut('заведения')) void logout();
                }}
              />
            ) : (
              <DeliverySettingsCard
                catalogSlug={catalogSlug}
                settings={deliverySettings ?? defaultRestaurantDeliverySettings}
                onSave={onSaveDeliverySettings}
                onOpenBackup={() => onOpenScreen('settings-backup')}
                onBack={() => setSettingsView('home')}
              />
            )}
          </section>
        )}

        {tab === 'scanner' && (
          <section className="restaurant-admin__content">
            <ScannerPage
              embedded
              onBack={() => openTab('home')}
              onConfirmed={(orderId) => {
                navigate(`/${catalogSlug}/order/${encodeURIComponent(orderId)}`, { replace: true });
              }}
            />
          </section>
        )}

        {tab === 'pos' && moduleAccess.pos !== 'disabled' && (
          <section className="restaurant-admin__content">
            <RestaurantPosPage
              restaurantName={restaurant.name}
              categories={categories}
              cabins={cabins}
              products={products}
              accessMode={moduleAccess.pos}
              nextGuestNumber={nextPosGuestNumber}
              onSubmitOrder={submitPosOrder}
            />
          </section>
        )}
      </div>

      <nav className="restaurant-admin-nav" aria-label={`Панель заведения: ${terms.place}`}>
        <button className={tab === 'home' ? 'is-active' : ''} type="button" onClick={() => openTab('home')}><Home />Главная</button>
        <button className={tab === 'dishes' ? 'is-active' : ''} type="button" onClick={() => openTab('dishes')}><Utensils />Каталог</button>
        <button className={tab === 'orders' ? 'is-active' : ''} type="button" onClick={() => openTab('orders')}><ClipboardList />Заказы</button>
        <button className={tab === 'scanner' ? 'is-active' : ''} type="button" onClick={() => openTab('scanner')}><QrCode />Сканер</button>
        <button className={tab === 'settings' ? 'is-active' : ''} type="button" onClick={() => openTab('settings')}><Settings />Настройки</button>
      </nav>
    </main>
  );
}
