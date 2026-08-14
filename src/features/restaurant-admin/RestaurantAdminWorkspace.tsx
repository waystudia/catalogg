import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight, Bell, Calculator, ClipboardList, CreditCard, Home, Info, Package,
  Paintbrush, Plus, QrCode, RefreshCcw, Settings, Store, Tags, Trash2, Utensils
} from 'lucide-react';
import type { Cabin, Category, Product, Restaurant } from '../../entities/models';
import { getBusinessOrderCapabilities } from '../../entities/businessOrderCapabilities';
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
import { getCurrentBillingDebtStatus } from '../../shared/api/billingDebtApi';
import { calculateRestaurantFinance } from './restaurantFinance';
import { getBusinessTerms } from '../../shared/businessTerminology';
import { confirmRoleSignOut } from '../../shared/roleSessionSafety';
import {
  adminOrderStatusFilters, adminOrderStatusTones, getAdminOrderFulfillmentLabel,
  getAdminOrderItemsCount, getAdminOrderLocationLabel, getAdminOrderStatusLabel, groupAdminOrdersByMonth,
  playRestaurantAdminOrderSound, type AdminOrderFilter
} from './orderPresentation';
import { RestaurantPosPage, type RestaurantPosOrderDraft } from '../restaurant-pos/RestaurantPosPage';
import type { RestaurantAdminModuleAccess } from '../platform-admin-modules/restaurantModuleAccess';
import { DebtControlBanner } from '../restaurant-billing/DebtControlBanner';
import { getCatalogAdminAccess } from '../../shared/api/catalogAdminApi';

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
  const orderCapabilities = getBusinessOrderCapabilities(restaurant.business_type);
  const [tab, setTab] = useState<RestaurantAdminTab>(() =>
    routeSection === 'order'
      ? 'orders'
      : routeSection === 'orders' || routeSection === 'dishes' || routeSection === 'settings' || routeSection === 'scanner' || routeSection === 'pos'
        ? routeSection
      : 'home'
  );
  const [filter, setFilter] = useState<AdminOrderFilter>('all');
  const [settingsView, setSettingsView] = useState<'home' | 'delivery'>('home');
  const [selectedOrder, setSelectedOrder] = useState<RestaurantOrder | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [recentOrderIds, setRecentOrderIds] = useState<Set<string>>(() => new Set());
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedOrdersRef = useRef(false);
  const hasAutoOpenedOrderRef = useRef(false);
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
  const { data: billingDebtStatus = null } = useQuery({
    queryKey: ['billing-debt-status', 'restaurant', catalogSlug],
    queryFn: getCurrentBillingDebtStatus,
    refetchInterval: 10_000,
    retry: false
  });
  const { data: catalogAdminAccess = null } = useQuery({
    queryKey: ['catalog-admin-access', catalogSlug],
    queryFn: () => getCatalogAdminAccess(catalogSlug),
    staleTime: 60_000,
    retry: false
  });
  const canDeletePreactivationOrders = Boolean(
    catalogAdminAccess?.legalActivationStatus && catalogAdminAccess.legalActivationStatus !== 'active'
  );
  const {
    grossRevenue: monthRevenue,
    platformDebt: restaurantDebt,
    courierExpense,
    netRevenue
  } = calculateRestaurantFinance(monthOrders, billingTariff);
  const displayedRestaurantDebt = billingDebtStatus?.accountType === 'restaurant'
    ? billingDebtStatus.debtAmount
    : restaurantDebt;
  const activeFilter = adminOrderStatusFilters.find((item) => item.status === filter);
  const filteredOrders =
    filter === 'all'
      ? orders
      : orders.filter((order) => activeFilter?.orderStatuses.includes(order.status));
  const selectedVisibleOrder = selectedOrder
    ? filteredOrders.find((order) => order.id === selectedOrder.id) ?? null
    : null;
  const orderGroups = useMemo(() => groupAdminOrdersByMonth(filteredOrders), [filteredOrders]);
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
    if (routeSection === 'orders' || routeSection === 'dishes' || routeSection === 'settings' || routeSection === 'scanner') {
      setTab(routeSection);
    }
  }, [moduleAccess.pos, routeSection]);

  useEffect(() => {
    if (!routeOrderId) return;
    const order = orders.find((item) => item.id === routeOrderId);
    if (order) {
      setSelectedOrder(order);
      setFilter('all');
    }
  }, [orders, routeOrderId]);

  useEffect(() => {
    if (hasAutoOpenedOrderRef.current || tab !== 'orders' || filteredOrders.length === 0) return;
    hasAutoOpenedOrderRef.current = true;
    setSelectedOrder(filteredOrders[0]);
  }, [filteredOrders, tab]);

  useEffect(() => {
    const knownIds = knownOrderIdsRef.current;
    const newOrderIds = hasLoadedOrdersRef.current
      ? orders.filter((order) => order.status === 'new' && !knownIds.has(order.id)).map((order) => order.id)
      : [];

    if (newOrderIds.length > 0) {
      const newOrders = orders.filter((order) => newOrderIds.includes(order.id));
      if (tab === 'orders' && newOrders[0]) {
        setFilter('new');
        setSelectedOrder(newOrders[0]);
      }
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
    <main className={tab === 'pos' ? 'restaurant-admin restaurant-admin--pos' : 'restaurant-admin'}>
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
            <DebtControlBanner status={billingDebtStatus} accountLabel="ресторана" />
            <section className="admin-finance-summary">
              <header>
                <h2>Финансы</h2>
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
                <article data-tone={displayedRestaurantDebt > 0 ? 'debt' : 'ok'}>
                  <span>Долг платформе</span>
                  <strong>{formatPrice(displayedRestaurantDebt)}</strong>
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

        {tab === 'orders' && (
          <section className="restaurant-admin__content">
            <div className="admin-order-filters">
              {adminOrderStatusFilters.map((item) => (
                <button
                  className={filter === item.status ? 'is-active' : ''}
                  type="button"
                  key={item.status}
                  onClick={() => setFilter(item.status)}
                >
                  {item.status === 'preparing' && orderCapabilities.supportsPicking ? 'Собираются' : item.label}
                </button>
              ))}
            </div>
            <div className="admin-orders-layout">
              {selectedVisibleOrder && (
                <OrderDetailsPanel
                  order={selectedVisibleOrder}
                  catalogSlug={catalogSlug}
                  businessType={restaurant.business_type}
                  products={products}
                  paymentSettings={paymentSettings}
                  onClose={closeOrderDetails}
                  onStatus={async (status, reason) => {
                    await onOrderStatus(selectedVisibleOrder, status, reason);
                    setSelectedOrder((current) => (current ? { ...current, status } : current));
                  }}
                  onRefreshOrders={onRefreshOrders}
                  onOrderChanged={onRefreshOrders}
                  canDeleteOrder={selectedVisibleOrder.isTestOrder || canDeletePreactivationOrders}
                  onDelete={() => deleteOrder(selectedVisibleOrder)}
                />
              )}
              <div className="admin-order-list">
                {filteredOrders.length === 0 && (
                  <section className="admin-empty-orders">
                    <ClipboardList />
                    <strong>Заказов пока нет</strong>
                    <span>Новые заказы появятся здесь автоматически.</span>
                  </section>
                )}
                {orderGroups.map((group, index) => (
                  <section className="admin-order-group" key={group.key}>
                    <details open={index === 0}>
                      <summary>
                        <span>{group.label}</span>
                        <b>{group.orders.length} заказов</b>
                      </summary>
                      <div>
                        {group.orders.map((order) => (
                          <div className="admin-order-card-shell" key={order.id}>
                            <button
                              className="admin-order-card"
                              data-active={selectedVisibleOrder?.id === order.id}
                              data-highlighted={recentOrderIds.has(order.id)}
                              type="button"
                              onClick={() => openOrderFromList(order)}
                            >
                              <span className="admin-order-card__head">
                                <strong>#{order.orderNumber}</strong>
                                <time dateTime={order.createdAt}>{formatOrderTime(order.createdAt)}</time>
                              </span>
                              <span className="admin-order-card__meta">
                                {getAdminOrderFulfillmentLabel(order, restaurant.business_type)} · {getAdminOrderItemsCount(order)} поз.
                              </span>
                              <span className="admin-order-card__address">{getAdminOrderLocationLabel(order)}</span>
                              <span className="admin-order-card__foot">
                                <b>{formatPrice(order.total)}</b>
                                <i data-tone={adminOrderStatusTones[order.status]}>
                                  {order.status === 'new' && <span aria-hidden="true" />}
                                  {getAdminOrderStatusLabel(order.status, restaurant.business_type)}
                                </i>
                              </span>
                            </button>
                            {(order.isTestOrder || canDeletePreactivationOrders) && (
                              <button
                                className="admin-order-card__delete"
                                type="button"
                                aria-label={`Удалить заказ ${order.orderNumber}`}
                                title="Удалить заказ до активации"
                                disabled={deletingOrderId === order.id}
                                onClick={() => {
                                  if (window.confirm(`Удалить заказ #${order.orderNumber} безвозвратно?`)) {
                                    void deleteOrder(order);
                                  }
                                }}
                              >
                                <Trash2 aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  </section>
                ))}
              </div>
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <section className="restaurant-admin__content">
            {settingsView === 'home' ? (
              <SettingsHub
                businessType={restaurant.business_type}
                onProfile={() => onOpenScreen('settings-profile')}
                onDesign={() => onOpenScreen('settings-design')}
                onCategories={() => onOpenScreen('settings-categories')}
                onSeating={onOpenSeating}
                onPayments={() => onOpenScreen('settings-payments')}
                onImport={() => onOpenScreen('settings-backup')}
                onDelivery={() => setSettingsView('delivery')}
                onActivate={() => navigate('/restaurant/activation')}
                activationStatus={catalogAdminAccess?.legalActivationStatus ?? null}
                onLogout={() => {
                  if (confirmRoleSignOut('заведения')) void logout();
                }}
              />
            ) : (
              <DeliverySettingsCard
                businessType={restaurant.business_type}
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
