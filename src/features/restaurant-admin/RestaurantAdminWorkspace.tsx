import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowRight, Bell, ClipboardList, CreditCard, Home, Info, LogOut, Package,
  Paintbrush, Plus, QrCode, RefreshCcw, Settings, Store, Tags, Utensils
} from 'lucide-react';
import type { Category, Product, Restaurant } from '../../entities/models';
import { useAuthStore } from '../stores';
import { getCurrentStock } from '../restaurant-settings/catalogAdminModel';
import { DeliverySettingsCard, SettingsHub, defaultRestaurantDeliverySettings } from '../restaurant-settings';
import { ScannerPage } from '../../pages/scanner/ScannerPage';
import type { RestaurantPaymentSettings } from '../../shared/paymentSettings';
import type { RestaurantDeliverySettings, RestaurantOrder, RestaurantOrderStatus } from '../../shared/api/restaurantOrdersApi';
import { formatOrderTime } from '../../shared/orderListGroups';
import {
  getRestaurantOrderNotificationPermission, requestRestaurantOrderNotificationPermission,
  restoreRestaurantOrderNotificationSubscription, showRestaurantOrderNotification
} from '../../shared/restaurantOrderNotifications';
import { buildRestaurantAdminTabPath, type RestaurantAdminTab } from '../../shared/pwaSession';
import { BrandLogo } from '../../shared/BrandLogo';
import { SafeImage } from '../../shared/SafeImage';
import { OrderDetailsPanel } from './OrderDetailsPanel';
import {
  adminOrderStatusFilters, adminOrderStatusLabels, adminOrderStatusTones, fulfillmentLabels,
  getAdminOrderItemsCount, getAdminOrderLocationLabel, groupAdminOrdersByMonth,
  playRestaurantAdminOrderSound, type AdminOrderFilter
} from './orderPresentation';

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

export type RestaurantAdminSettingsScreen =
  | 'settings-profile' | 'settings-design' | 'settings-categories' | 'settings-payments'
  | 'settings-backup' | 'settings-stock';

export function RestaurantAdminWorkspace({
  catalogSlug,
  restaurant,
  products,
  orders,
  routeSection,
  routeOrderId,
  paymentSettings,
  deliverySettings,
  onOpenScreen,
  onOpenCatalog,
  onAddDish,
  onOrderStatus,
  onOrderDelete,
  onRefreshOrders,
  onSaveDeliverySettings
}: {
  catalogSlug: string;
  restaurant: Restaurant;
  categories: Category[];
  products: Product[];
  orders: RestaurantOrder[];
  routeSection?: string;
  routeOrderId?: string;
  paymentSettings: RestaurantPaymentSettings;
  deliverySettings: RestaurantDeliverySettings | null;
  onOpenScreen: (screen: RestaurantAdminSettingsScreen) => void;
  onOpenCatalog: () => void;
  onAddDish: () => void;
  onOrderStatus: (order: RestaurantOrder, status: RestaurantOrderStatus, reason?: string) => void;
  onOrderDelete: (order: RestaurantOrder) => void;
  onRefreshOrders: () => void;
  onSaveDeliverySettings: (settings: RestaurantDeliverySettings) => void;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<RestaurantAdminTab>(() =>
    routeSection === 'order'
      ? 'orders'
      : routeSection === 'orders' || routeSection === 'dishes' || routeSection === 'settings' || routeSection === 'scanner'
        ? routeSection
      : 'home'
  );
  const [filter, setFilter] = useState<AdminOrderFilter>('all');
  const [settingsView, setSettingsView] = useState<'home' | 'delivery'>('home');
  const [selectedOrder, setSelectedOrder] = useState<RestaurantOrder | null>(null);
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
  const monthRevenue = monthOrders
    .filter((order) => !['cancelled', 'canceled'].includes(order.status))
    .reduce((total, order) => total + order.total, 0);
  const restaurantDebt = Math.round(monthRevenue * 0.07);
  const restaurantReceived = Math.max(0, monthRevenue - restaurantDebt);
  const activeFilter = adminOrderStatusFilters.find((item) => item.status === filter);
  const filteredOrders =
    filter === 'all'
      ? orders
      : orders.filter((order) => activeFilter?.orderStatuses.includes(order.status));
  const selectedVisibleOrder = selectedOrder
    ? filteredOrders.find((order) => order.id === selectedOrder.id) ?? null
    : null;
  const orderGroups = useMemo(() => groupAdminOrdersByMonth(filteredOrders), [filteredOrders]);
  const activeOrders = orders.filter((order) => !['completed', 'delivered', 'cancelled'].includes(order.status));
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
  const enableOrderNotifications = () => {
    void requestRestaurantOrderNotificationPermission({ role: 'restaurant', catalogSlug }).then(setNotificationPermission);
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
    if (routeSection === 'orders' || routeSection === 'dishes' || routeSection === 'settings' || routeSection === 'scanner') {
      setTab(routeSection);
    }
  }, [routeSection]);

  useEffect(() => {
    if (!routeOrderId) return;
    const order = orders.find((item) => item.id === routeOrderId);
    if (order) {
      setSelectedOrder(order);
      setFilter('all');
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
  }, [catalogSlug, orders]);

  return (
    <main className="restaurant-admin">
      <aside className="restaurant-admin-sidebar">
        <BrandLogo compact />
        <nav aria-label="Разделы админки">
          <button className={tab === 'home' ? 'is-active' : ''} type="button" onClick={() => openTab('home')}><Home />Главная</button>
          <button className={tab === 'dishes' ? 'is-active' : ''} type="button" onClick={() => openTab('dishes')}><Utensils />Каталог</button>
          <button className={tab === 'orders' ? 'is-active' : ''} type="button" onClick={() => openTab('orders')}><ClipboardList />Заказы</button>
          <button className={tab === 'scanner' ? 'is-active' : ''} type="button" onClick={() => openTab('scanner')}><QrCode />Сканер</button>
          <button className={tab === 'settings' ? 'is-active' : ''} type="button" onClick={() => openTab('settings')}><Settings />Настройки</button>
        </nav>
        <button className="restaurant-admin-sidebar__exit" type="button" onClick={logout}><LogOut />Выход</button>
      </aside>

      <div className="restaurant-admin__workspace">
        <section className="restaurant-admin__hero">
          <div>
            <span>Панель ресторана</span>
            <h1>{restaurant.name || 'Ресторан'}</h1>
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
                <h2>Финансы</h2>
                <small>{formatPrice(monthRevenue)} за месяц <Info /></small>
              </header>
              <div>
                <article>
                  <span>Получено рестораном</span>
                  <strong>{formatPrice(restaurantReceived)}</strong>
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
            <section className="admin-quick-actions">
              <button type="button" onClick={onAddDish}><Plus />Добавить блюдо</button>
                <button type="button" onClick={() => onOpenScreen('settings-stock')}><Package />Остатки</button>
                <button type="button" onClick={() => openTab('orders')}><ClipboardList />Заказы</button>
                <button type="button" onClick={() => openTab('scanner')}><QrCode />Сканер</button>
              </section>
          </section>
        )}

        {tab === 'dishes' && (
          <section className="restaurant-admin__content">
            <section className="admin-section-card">
              <h2>Каталог</h2>
              <p>Откройте клиентский каталог в режиме ресторана: карточки можно редактировать, скрывать и менять остатки.</p>
              <div className="admin-quick-actions">
                <button type="button" onClick={onOpenCatalog}><Utensils />Открыть каталог</button>
                <button type="button" onClick={onAddDish}><Plus />Добавить блюдо</button>
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
                  {item.label}
                </button>
              ))}
            </div>
            <div className="admin-orders-layout">
              {selectedVisibleOrder && (
                <OrderDetailsPanel
                  order={selectedVisibleOrder}
                  catalogSlug={catalogSlug}
                  paymentSettings={paymentSettings}
                  onClose={closeOrderDetails}
                  onStatus={(status, reason) => {
                    onOrderStatus(selectedVisibleOrder, status, reason);
                    setSelectedOrder((current) => (current ? { ...current, status } : current));
                  }}
                  onRefreshOrders={onRefreshOrders}
                  onDelete={() => {
                    onOrderDelete(selectedVisibleOrder);
                    setSelectedOrder(null);
                  }}
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
                          <button
                            className="admin-order-card"
                            data-active={selectedVisibleOrder?.id === order.id}
                            data-highlighted={recentOrderIds.has(order.id)}
                            type="button"
                            key={order.id}
                            onClick={() => openOrderFromList(order)}
                          >
                            <span className="admin-order-card__head">
                              <strong>#{order.orderNumber}</strong>
                              <time dateTime={order.createdAt}>{formatOrderTime(order.createdAt)}</time>
                            </span>
                            <span className="admin-order-card__meta">
                              {fulfillmentLabels[order.fulfillmentType]} · {getAdminOrderItemsCount(order)} поз.
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
                onProfile={() => onOpenScreen('settings-profile')}
                onDesign={() => onOpenScreen('settings-design')}
                onCategories={() => onOpenScreen('settings-categories')}
                onPayments={() => onOpenScreen('settings-payments')}
                onImport={() => onOpenScreen('settings-backup')}
                onDelivery={() => setSettingsView('delivery')}
                onLogout={logout}
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
            <ScannerPage embedded onBack={() => openTab('home')} />
          </section>
        )}
      </div>

      <nav className="restaurant-admin-nav" aria-label="Админка ресторана">
        <button className={tab === 'home' ? 'is-active' : ''} type="button" onClick={() => openTab('home')}><Home />Главная</button>
        <button className={tab === 'dishes' ? 'is-active' : ''} type="button" onClick={() => openTab('dishes')}><Utensils />Каталог</button>
        <button className={tab === 'orders' ? 'is-active' : ''} type="button" onClick={() => openTab('orders')}><ClipboardList />Заказы</button>
        <button className={tab === 'scanner' ? 'is-active' : ''} type="button" onClick={() => openTab('scanner')}><QrCode />Сканер</button>
        <button className={tab === 'settings' ? 'is-active' : ''} type="button" onClick={() => openTab('settings')}><Settings />Настройки</button>
      </nav>
    </main>
  );
}
