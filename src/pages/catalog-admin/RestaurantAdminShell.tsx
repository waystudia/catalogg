import {
  Bell,
  Clock,
  Copy,
  CreditCard,
  DatabaseBackup,
  Eye,
  EyeOff,
  FileDown,
  Home,
  ImagePlus,
  LayoutGrid,
  MapPin,
  LogOut,
  Menu,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Tags,
  Trash2,
  Truck,
  Upload,
  UtensilsCrossed,
  WalletCards
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import type { CatalogTag, Category, Product, Restaurant, ThemeSettings } from '../../entities/models';
import { categories as demoCategories, products as demoProducts, restaurant as demoRestaurant, themeSettings as demoTheme } from '../../data/catalog';
import {
  getRestaurantOrders,
  subscribeToRestaurantOrdersRealtime,
  updateRestaurantOrderPaymentStatus,
  updateRestaurantOrderStatus,
  type RestaurantOrder,
  type RestaurantOrderStatus
} from '../../shared/api/restaurantOrdersApi';
import { formatOrderTime, groupOrdersByDate } from '../../shared/orderListGroups';
import { buildYandexMapsRouteUrl } from '../../features/order/orderLifecycle';
import { DeliveryTrackingMap } from '../../shared/DeliveryTrackingMap';
import type { PaymentStatus as RestaurantPaymentStatus } from '../../features/order/orderLifecycle';
import { copyText, getCatalogPublicUrl } from '../../shared/platformUrls';
import { loadCatalog } from '../../shared/supabase';
import type { CatalogAdminAccess } from '../../shared/api/catalogAdminApi';
import {
  getRestaurantOrderNotificationPermission,
  requestRestaurantOrderNotificationPermission,
  restoreRestaurantOrderNotificationSubscription,
  showRestaurantOrderNotification
} from '../../shared/restaurantOrderNotifications';

type AdminSection = 'home' | 'catalog' | 'dishes' | 'orders' | 'stocks' | 'settings';
type SettingsSection =
  | 'hub'
  | 'profile'
  | 'taxonomy'
  | 'design'
  | 'catalog'
  | 'delivery'
  | 'hours'
  | 'payments'
  | 'import'
  | 'backups'
  | 'danger';
type PaymentStatus = 'not_required' | 'cash_on_delivery' | 'awaiting_transfer' | 'client_marked_paid' | 'confirmed' | 'declined';

type CatalogData = {
  restaurant: Restaurant;
  categories: Category[];
  products: Product[];
  tags: CatalogTag[];
  theme: ThemeSettings;
};

type PaymentSettings = {
  enabled: boolean;
  requisiteType: 'phone' | 'card' | 'account';
  transferNumber: string;
  bankName: string;
  lastName: string;
  firstName: string;
  middleName: string;
  displayName: string;
  comment: string;
  qrUrl: string;
  allowCash: boolean;
  allowTransfer: boolean;
  requireConfirmation: boolean;
  clientHint: string;
};

const navItems: Array<{ id: AdminSection; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Главная', icon: Home },
  { id: 'catalog', label: 'Каталог', icon: Store },
  { id: 'dishes', label: 'Блюда', icon: UtensilsCrossed },
  { id: 'orders', label: 'Заказы', icon: ShoppingBag },
  { id: 'stocks', label: 'Остатки', icon: Package },
  { id: 'settings', label: 'Настройки', icon: Settings }
];

const orderTabs: Array<{ id: 'all' | RestaurantOrderStatus; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'preparing', label: 'Готовятся' },
  { id: 'on_the_way', label: 'В пути' },
  { id: 'completed', label: 'Завершённые' },
  { id: 'cancelled', label: 'Отменённые' }
];

const orderStatusLabels: Record<RestaurantOrderStatus, string> = {
  new: 'Новый',
  waiting_payment_confirmation: 'Ждёт оплату',
  payment_confirmed: 'Оплата подтверждена',
  accepted: 'Принят',
  confirmed: 'Подтверждён',
  preparing: 'Готовится',
  cooking: 'Готовится',
  ready: 'Готов',
  waiting_driver: 'Ждёт курьера',
  driver_assigned: 'Курьер назначен',
  assigned_driver: 'Курьер назначен',
  picked_up: 'Выдан курьеру',
  on_the_way: 'В пути',
  delivered: 'Доставлен',
  completed: 'Завершён',
  cancelled: 'Отменён',
  canceled: 'Отменён'
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  not_required: 'Не требуется',
  cash_on_delivery: 'Наличными при получении',
  awaiting_transfer: 'Ждёт перевода',
  client_marked_paid: 'Клиент нажал "Я оплатил"',
  confirmed: 'Подтверждён рестораном',
  declined: 'Отклонён'
};

const orderPaymentStatusLabels: Record<RestaurantPaymentStatus, string> = {
  unpaid: 'Не оплачен',
  waiting_confirmation: 'Ждёт подтверждения ресторана',
  confirmed: 'Подтверждён рестораном',
  rejected: 'Отклонён'
};

const fulfillmentTypeLabels: Record<RestaurantOrder['fulfillmentType'], string> = {
  delivery: 'Доставка',
  takeaway: 'На вынос',
  hall: 'В зале'
};

const orderStatusTones: Record<RestaurantOrderStatus, 'new' | 'work' | 'ready' | 'delivery' | 'done'> = {
  new: 'new',
  waiting_payment_confirmation: 'work',
  payment_confirmed: 'work',
  accepted: 'work',
  confirmed: 'work',
  preparing: 'work',
  cooking: 'work',
  ready: 'ready',
  waiting_driver: 'delivery',
  driver_assigned: 'delivery',
  assigned_driver: 'delivery',
  picked_up: 'delivery',
  on_the_way: 'delivery',
  delivered: 'done',
  completed: 'done',
  cancelled: 'done',
  canceled: 'done'
};

const toLocalPaymentStatus = (status: RestaurantPaymentStatus): PaymentStatus => {
  if (status === 'confirmed') return 'confirmed';
  if (status === 'rejected') return 'declined';
  if (status === 'waiting_confirmation') return 'client_marked_paid';
  return 'awaiting_transfer';
};

const toRestaurantPaymentStatus = (status: PaymentStatus): RestaurantPaymentStatus => {
  if (status === 'confirmed') return 'confirmed';
  if (status === 'declined') return 'rejected';
  if (status === 'client_marked_paid' || status === 'awaiting_transfer') return 'waiting_confirmation';
  return 'unpaid';
};

const defaultPaymentSettings: PaymentSettings = {
  enabled: true,
  requisiteType: 'phone',
  transferNumber: '+7 999 000-00-00',
  bankName: 'Банк / перевод ресторану',
  lastName: 'Исаев',
  firstName: 'Магомед',
  middleName: '',
  displayName: 'Исаев Магомед',
  comment: 'Оплата заказа WayCatalog',
  qrUrl: '',
  allowCash: true,
  allowTransfer: true,
  requireConfirmation: true,
  clientHint: 'Переведите сумму ресторану и после оплаты нажмите "Я оплатил".'
};

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const paymentStorageKey = (slug: string) => `waycatalog:${slug}:payment-settings`;
const paymentStatusStorageKey = (slug: string) => `waycatalog:${slug}:payment-statuses`;

function playNewOrderSound() {
  try {
    const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = window.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextCtor) return;

    const audio = new AudioContextCtor();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.24);
    window.setTimeout(() => void audio.close(), 320);
  } catch {
    // Browsers may block audio until the first user gesture.
  }
}

function getOrderItemsCount(order: RestaurantOrder) {
  return order.items.reduce((sum, item) => sum + Math.max(1, item.quantity), 0);
}

function getOrderLocationLabel(order: RestaurantOrder) {
  return (
    order.deliverySettlement ||
    order.deliveryCity ||
    order.deliveryAddress ||
    order.cabinLabel ||
    (order.fulfillmentType === 'takeaway' ? 'Самовывоз' : 'В зале')
  );
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? ({ ...fallback, ...JSON.parse(stored) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function getProductStock(product: Product) {
  return product.current_stock ?? product.stock_count ?? 0;
}

function getCategoryName(categories: Category[], product: Product) {
  return categories.find((category) => category.id === product.category_id)?.name ?? 'Без категории';
}

function todayOrders(orders: RestaurantOrder[]) {
  const today = new Date().toDateString();
  return orders.filter((order) => new Date(order.createdAt).toDateString() === today);
}

function SectionButton({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  icon: typeof Home;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="restaurant-admin-nav__item" type="button" data-active={active} onClick={onClick}>
      <Icon />
      <span>{label}</span>
    </button>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <article className="ra-card ra-metric">
      <small>{label}</small>
      <strong>{value}</strong>
      {sub && <span>{sub}</span>}
    </article>
  );
}

export function RestaurantAdminShell({
  access,
  onRefresh,
  onSignOut,
  consentModal
}: {
  access: CatalogAdminAccess;
  onRefresh: () => void;
  onSignOut: () => void;
  consentModal?: React.ReactNode;
}) {
  const [section, setSection] = useState<AdminSection>('home');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('hub');
  const [catalogData, setCatalogData] = useState<CatalogData>({
    restaurant: demoRestaurant,
    categories: demoCategories,
    products: demoProducts,
    tags: [],
    theme: demoTheme
  });
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dishQuery, setDishQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [orderQuery, setOrderQuery] = useState('');
  const [orderTab, setOrderTab] = useState<'all' | RestaurantOrderStatus>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [recentOrderIds, setRecentOrderIds] = useState<Set<string>>(() => new Set());
  const [stockDrafts, setStockDrafts] = useState<Record<string, number>>({});
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(() =>
    readJson(paymentStorageKey(access.catalog?.slug ?? 'demo'), defaultPaymentSettings)
  );
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, PaymentStatus>>(() =>
    readJson(paymentStatusStorageKey(access.catalog?.slug ?? 'demo'), {})
  );
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedOrdersRef = useRef(false);
  const [notificationPermission, setNotificationPermission] = useState(() => getRestaurantOrderNotificationPermission());

  const slug = access.catalog?.slug ?? 'demo';
  const publicUrl = useMemo(() => (access.catalog ? getCatalogPublicUrl(access.catalog.slug) : '#'), [access.catalog]);
  const enableOrderNotifications = () => {
    void requestRestaurantOrderNotificationPermission({
      role: 'restaurant',
      catalogId: access.catalog?.id
    }).then(setNotificationPermission);
  };

  useEffect(() => {
    if (notificationPermission !== 'granted' || !access.catalog?.id) return;
    void restoreRestaurantOrderNotificationSubscription({
      role: 'restaurant',
      catalogId: access.catalog.id
    }).then(setNotificationPermission);
  }, [access.catalog?.id, notificationPermission]);

  const refreshData = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setIsLoadingData(true);
    try {
      const [catalog, restaurantOrders] = await Promise.all([loadCatalog(slug), getRestaurantOrders(slug)]);
      setCatalogData({
        restaurant: catalog.restaurant,
        categories: catalog.categories.length ? catalog.categories : demoCategories,
        products: catalog.products.length ? catalog.products : demoProducts,
        tags: catalog.tags,
        theme: catalog.theme
      });
      const knownIds = knownOrderIdsRef.current;
      const newOrders = hasLoadedOrdersRef.current
        ? restaurantOrders.filter((order) => order.status === 'new' && !knownIds.has(order.id))
        : [];
      const newOrderIds = newOrders.map((order) => order.id);
      if (newOrderIds.length > 0) {
        setRecentOrderIds((current) => new Set([...current, ...newOrderIds]));
        toast.success(newOrderIds.length === 1 ? 'Новый заказ' : `Новых заказов: ${newOrderIds.length}`);
        playNewOrderSound();
        newOrders.slice(0, 3).forEach((order) => {
          void showRestaurantOrderNotification({
            title: `Новый заказ #${order.orderNumber}`,
            body: `${order.clientName || 'Клиент'} · ${formatPrice(order.total)}`,
            tag: `restaurant-order-${order.id}`,
            url: window.location.href
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
      knownOrderIdsRef.current = new Set(restaurantOrders.map((order) => order.id));
      hasLoadedOrdersRef.current = true;
      setOrders(restaurantOrders);
      setSelectedOrderId((current) => current ?? restaurantOrders[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось загрузить данные ресторана');
    } finally {
      setIsLoadingData(false);
    }
  }, [slug]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(
    () => subscribeToRestaurantOrdersRealtime(access.catalog?.id, () => void refreshData()),
    [access.catalog?.id, refreshData]
  );

  useEffect(() => {
    const refreshSilently = () => {
      void refreshData({ silent: true });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshSilently();
      }
    };
    const intervalId = window.setInterval(refreshWhenVisible, 12_000);

    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('pageshow', refreshWhenVisible);
    window.addEventListener('online', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('pageshow', refreshWhenVisible);
      window.removeEventListener('online', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshData]);

  useEffect(() => {
    localStorage.setItem(paymentStorageKey(slug), JSON.stringify(paymentSettings));
  }, [paymentSettings, slug]);

  useEffect(() => {
    localStorage.setItem(paymentStatusStorageKey(slug), JSON.stringify(paymentStatuses));
  }, [paymentStatuses, slug]);

  const today = useMemo(() => todayOrders(orders), [orders]);
  const revenue = today.reduce((sum, order) => sum + order.total, 0);
  const visibleProducts = catalogData.products.filter((product) => !product.is_hidden);
  const popularProducts = visibleProducts.filter((product) => product.is_popular || product.is_hit).slice(0, 5);
  const filteredProducts = catalogData.products.filter((product) => {
    const matchesQuery = product.title.toLowerCase().includes(dishQuery.trim().toLowerCase());
    const matchesCategory = categoryFilter === 'all' || product.category_id === categoryFilter;
    return matchesQuery && matchesCategory;
  });
  const filteredOrders = orders.filter((order) => {
    const text = `${order.orderNumber} ${order.clientName} ${order.clientPhone}`.toLowerCase();
    const matchesQuery = text.includes(orderQuery.trim().toLowerCase());
    const matchesTab = orderTab === 'all' || order.status === orderTab;
    return matchesQuery && matchesTab;
  });
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? filteredOrders[0] ?? orders[0] ?? null;

  const goTo = (nextSection: AdminSection, nextSettingsSection: SettingsSection = 'hub') => {
    setSection(nextSection);
    setSettingsSection(nextSettingsSection);
  };

  const updatePaymentSetting = <K extends keyof PaymentSettings>(key: K, value: PaymentSettings[K]) => {
    setPaymentSettings((current) => ({ ...current, [key]: value }));
  };

  const updateOrderStatus = async (order: RestaurantOrder, status: RestaurantOrderStatus) => {
    try {
      await updateRestaurantOrderStatus(order, status);
      setOrders((current) => current.map((item) => (item.id === order.id ? { ...item, status } : item)));
      toast.success('Статус заказа обновлён');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось обновить заказ');
    }
  };

  const setPaymentStatus = async (orderId: string, status: PaymentStatus) => {
    const order = orders.find((item) => item.id === orderId);
    const restaurantPaymentStatus = toRestaurantPaymentStatus(status);

    setPaymentStatuses((current) => ({ ...current, [orderId]: status }));

    if (!order) {
      toast.success('Статус оплаты обновлён');
      return;
    }

    try {
      await updateRestaurantOrderPaymentStatus(order, restaurantPaymentStatus);
      setOrders((current) =>
        current.map((item) =>
          item.id === orderId
            ? {
                ...item,
                paymentStatus: restaurantPaymentStatus,
                status:
                  restaurantPaymentStatus === 'confirmed' && item.status === 'waiting_payment_confirmation'
                    ? 'payment_confirmed'
                    : item.status
              }
            : item
        )
      );
      toast.success('Статус оплаты обновлён');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось обновить оплату');
    }
  };

  const onQrChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updatePaymentSetting('qrUrl', String(reader.result ?? ''));
    reader.readAsDataURL(file);
  };

  return (
    <main className="restaurant-admin-shell" data-consent-blocked={Boolean(consentModal)}>
      <aside className="restaurant-admin-sidebar">
        <div className="restaurant-admin-logo">
          <span>W</span>
          <strong>WayCatalog</strong>
        </div>
        <nav>
          {navItems.map((item) => (
            <SectionButton
              key={item.id}
              active={section === item.id}
              icon={item.icon}
              label={item.label}
              onClick={() => goTo(item.id)}
            />
          ))}
        </nav>
        <div className="restaurant-admin-sidebar__restaurant">
          {catalogData.restaurant.logo_url ? <img src={catalogData.restaurant.logo_url} alt="" /> : <Store />}
          <div>
            <strong>{catalogData.restaurant.name}</strong>
            <small>{catalogData.restaurant.subtitle || access.catalog?.businessType || 'restaurant'}</small>
          </div>
        </div>
        <button className="restaurant-admin-nav__item" type="button" onClick={onSignOut}>
          <LogOut />
          <span>Выход</span>
        </button>
      </aside>

      <div className="restaurant-admin-main">
        <header className="restaurant-admin-topbar">
          <div>
            <button className="ra-icon-button" type="button" aria-label="Меню">
              <Menu />
            </button>
            <h1>{navItems.find((item) => item.id === section)?.label}</h1>
          </div>
          <div className="restaurant-admin-topbar__actions">
            <select aria-label="Ресторан" value={slug} onChange={() => toast.info('Переключение ресторанов будет подключено к доступам пользователя')}>
              <option value={slug}>{catalogData.restaurant.name}</option>
            </select>
            <button
              className="ra-icon-button"
              type="button"
              onClick={() => void refreshData({ silent: true })}
              aria-label="Обновить данные"
            >
              <RefreshCw />
            </button>
            <button
              className="ra-icon-button"
              type="button"
              onClick={enableOrderNotifications}
              aria-label={notificationPermission === 'granted' ? 'Уведомления включены' : 'Включить уведомления'}
            >
              <Bell />
              {orders.some((order) => order.status === 'new') && <span />}
            </button>
            <button className="ra-avatar" type="button" onClick={onRefresh} aria-label="Обновить доступ">
              {access.email?.slice(0, 1).toUpperCase() ?? 'A'}
            </button>
          </div>
        </header>

        <section className="restaurant-admin-content" aria-busy={isLoadingData}>
          {section === 'home' && (
            <DashboardPage
              restaurant={catalogData.restaurant}
              products={catalogData.products}
              categories={catalogData.categories}
              orders={orders}
              revenue={revenue}
              popularProducts={popularProducts}
              onNavigate={goTo}
            />
          )}
          {section === 'catalog' && (
            <CatalogPreviewPage
              restaurant={catalogData.restaurant}
              categories={catalogData.categories}
              products={visibleProducts}
              theme={catalogData.theme}
              publicUrl={publicUrl}
            />
          )}
          {section === 'dishes' && (
            <DishesPage
              products={filteredProducts}
              allProducts={catalogData.products}
              categories={catalogData.categories}
              query={dishQuery}
              categoryFilter={categoryFilter}
              onQueryChange={setDishQuery}
              onCategoryFilterChange={setCategoryFilter}
              onStocks={() => goTo('stocks')}
            />
          )}
          {section === 'orders' && (
            <OrdersPage
              orders={filteredOrders}
              selectedOrder={selectedOrder}
              query={orderQuery}
              tab={orderTab}
              paymentSettings={paymentSettings}
              paymentStatuses={paymentStatuses}
              recentOrderIds={recentOrderIds}
              onQueryChange={setOrderQuery}
              onTabChange={setOrderTab}
              onSelectOrder={setSelectedOrderId}
              onStatusChange={updateOrderStatus}
              onPaymentStatusChange={setPaymentStatus}
            />
          )}
          {section === 'stocks' && (
            <StocksPage
              products={catalogData.products}
              stockDrafts={stockDrafts}
              onStockDraftsChange={setStockDrafts}
            />
          )}
          {section === 'settings' && (
            <SettingsPage
              section={settingsSection}
              restaurant={catalogData.restaurant}
              categories={catalogData.categories}
              products={catalogData.products}
              theme={catalogData.theme}
              paymentSettings={paymentSettings}
              publicUrl={publicUrl}
              onSectionChange={setSettingsSection}
              onPaymentChange={updatePaymentSetting}
              onQrChange={onQrChange}
            />
          )}
        </section>
      </div>

      <nav className="restaurant-admin-bottom-nav">
        {navItems.map((item) => (
          <SectionButton
            key={item.id}
            active={section === item.id}
            icon={item.icon}
            label={item.label}
            onClick={() => goTo(item.id)}
          />
        ))}
      </nav>
      {consentModal}
    </main>
  );
}

function DashboardPage({
  restaurant,
  products,
  categories,
  orders,
  revenue,
  popularProducts,
  onNavigate
}: {
  restaurant: Restaurant;
  products: Product[];
  categories: Category[];
  orders: RestaurantOrder[];
  revenue: number;
  popularProducts: Product[];
  onNavigate: (section: AdminSection, settingsSection?: SettingsSection) => void;
}) {
  const counts = {
    new: orders.filter((order) => order.status === 'new').length,
    preparing: orders.filter((order) => order.status === 'preparing').length,
    onWay: orders.filter((order) => order.status === 'on_the_way').length,
    completed: orders.filter((order) => order.status === 'completed' || order.status === 'delivered').length
  };

  return (
    <div className="ra-page-stack">
      <section className="ra-welcome">
        <div>
          <span>Добро пожаловать, {restaurant.name}!</span>
          <h2>Управляйте рестораном и отслеживайте заказы</h2>
        </div>
        <button type="button" onClick={() => onNavigate('orders')}>Сегодня</button>
      </section>
      <section className="ra-metrics-grid">
        <MetricCard label="Блюд" value={String(products.length)} />
        <MetricCard label="Категорий" value={String(categories.length)} />
        <MetricCard label="Заказов сегодня" value={String(todayOrders(orders).length)} />
        <MetricCard label="Выручка" value={formatPrice(revenue)} sub="+12% к вчера" />
        <MetricCard label="Рейтинг" value="4.8" />
      </section>
      <section className="ra-dashboard-grid">
        <article className="ra-card ra-status-list">
          <h3>Заказы</h3>
          <button type="button" onClick={() => onNavigate('orders')}><span data-dot="red" />Новые<strong>{counts.new}</strong></button>
          <button type="button" onClick={() => onNavigate('orders')}><span data-dot="amber" />Готовятся<strong>{counts.preparing}</strong></button>
          <button type="button" onClick={() => onNavigate('orders')}><span data-dot="green" />В пути<strong>{counts.onWay}</strong></button>
          <button type="button" onClick={() => onNavigate('orders')}><span data-dot="violet" />Завершённые<strong>{counts.completed}</strong></button>
        </article>
        <article className="ra-card ra-revenue">
          <h3>Выручка</h3>
          <strong>{formatPrice(revenue)}</strong>
          <div aria-hidden="true">
            {[24, 36, 30, 52, 46, 70, 58, 76].map((height, index) => <span key={index} style={{ height }} />)}
          </div>
        </article>
        <article className="ra-card ra-popular">
          <h3>Популярные блюда</h3>
          {popularProducts.map((product) => (
            <button key={product.id} type="button" onClick={() => onNavigate('dishes')}>
              <img src={product.image_url} alt="" />
              <span>{product.title}<small>{getProductStock(product)} осталось</small></span>
            </button>
          ))}
        </article>
      </section>
      <section className="ra-quick-actions">
        <button type="button" onClick={() => toast.info('Форма блюда остаётся в существующем модуле и готова к подключению к этому экрану')}><Plus />Добавить блюдо</button>
        <button type="button" onClick={() => onNavigate('stocks')}><Package />Обновить остатки</button>
        <button type="button" onClick={() => onNavigate('settings', 'profile')}><Settings />Настройки ресторана</button>
        <button type="button" onClick={() => onNavigate('settings', 'import')}><Upload />Импорт / Экспорт</button>
      </section>
    </div>
  );
}

function CatalogPreviewPage({
  restaurant,
  categories,
  products,
  theme,
  publicUrl
}: {
  restaurant: Restaurant;
  categories: Category[];
  products: Product[];
  theme: ThemeSettings;
  publicUrl: string;
}) {
  const previewStyle = {
    '--catalog-bg': theme.background_type === 'gradient'
      ? `linear-gradient(145deg, ${theme.background_gradient_from}, ${theme.background_gradient_to})`
      : theme.background_color,
    '--catalog-card': theme.product_card_color ?? theme.card_color,
    '--catalog-text': theme.product_card_text_color ?? theme.text_primary,
    '--catalog-muted': theme.text_secondary,
    '--catalog-accent': theme.accent_color,
    '--catalog-radius': `${theme.card_radius}px`
  } as React.CSSProperties;

  return (
    <div className="ra-page-stack">
      <section className="ra-catalog-toolbar">
        <div>
          <h2>Каталог</h2>
          <p>Просмотр как клиент, с быстрыми админскими действиями поверх карточек.</p>
        </div>
        <a href={publicUrl} target="_blank" rel="noreferrer"><Eye />Открыть публично</a>
      </section>
      <section className="ra-client-preview" style={previewStyle}>
        <header>
          <button type="button" aria-label="Меню"><Menu /></button>
          <div>
            <h2>{restaurant.name}</h2>
            <p>{restaurant.subtitle}</p>
          </div>
          <button type="button" aria-label="Поиск"><Search /></button>
        </header>
        <nav>
          {categories.filter((category) => category.kind !== 'space').slice(0, 8).map((category) => (
            <button type="button" key={category.id}>{category.name}</button>
          ))}
        </nav>
        <div className="ra-client-preview__heading">
          <h3>Популярное</h3>
          <button type="button">Показать все</button>
        </div>
        <div className="ra-client-preview__grid">
          {products.slice(0, 8).map((product) => (
            <article key={product.id}>
              <img src={product.image_url} alt="" />
              <div className="ra-client-preview__admin-actions">
                <button type="button" aria-label="Редактировать"><Pencil /></button>
                <button type="button" aria-label="Скрыть"><EyeOff /></button>
                <button type="button" aria-label="Удалить"><Trash2 /></button>
              </div>
              <h4>{product.title}</h4>
              <strong>{formatPrice(product.price)}</strong>
              <small>Остаток: {getProductStock(product)}</small>
              <button type="button" aria-label="Добавить"><Plus /></button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function DishesPage({
  products,
  allProducts,
  categories,
  query,
  categoryFilter,
  onQueryChange,
  onCategoryFilterChange,
  onStocks
}: {
  products: Product[];
  allProducts: Product[];
  categories: Category[];
  query: string;
  categoryFilter: string;
  onQueryChange: (query: string) => void;
  onCategoryFilterChange: (categoryId: string) => void;
  onStocks: () => void;
}) {
  return (
    <div className="ra-page-stack">
      <section className="ra-list-toolbar">
        <label><Search /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Поиск блюд..." /></label>
        <select value={categoryFilter} onChange={(event) => onCategoryFilterChange(event.target.value)}>
          <option value="all">Все категории</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <button type="button"><Tags />Все метки</button>
        <button type="button" onClick={() => toast.info('Добавление блюда будет открывать существующую форму блюда')}><Plus />Добавить блюдо</button>
      </section>
      <section className="ra-table ra-dishes-table">
        <div className="ra-table__head">
          <span>Блюдо</span><span>Категория</span><span>Цена</span><span>Остаток</span><span>Метки</span><span>Действия</span>
        </div>
        {products.map((product) => (
          <article key={product.id}>
            <span><img src={product.image_url} alt="" /><strong>{product.title}</strong></span>
            <span>{getCategoryName(categories, product)}</span>
            <span>{formatPrice(product.price)}</span>
            <span>{getProductStock(product)}</span>
            <span className="ra-tags">{product.is_hit && <em>Хит</em>}{product.is_new && <em>Новинка</em>}{product.is_popular && <em>Популярное</em>}</span>
            <span>
              <button type="button" aria-label="Редактировать"><Pencil /></button>
              <button type="button" aria-label="Остаток" onClick={onStocks}><Package /></button>
              <button type="button" aria-label="Ещё"><MoreVertical /></button>
            </span>
          </article>
        ))}
      </section>
      <small className="ra-footnote">Показано {products.length} из {allProducts.length}</small>
    </div>
  );
}

function OrdersPage({
  orders,
  selectedOrder,
  query,
  tab,
  paymentSettings,
  paymentStatuses,
  recentOrderIds,
  onQueryChange,
  onTabChange,
  onSelectOrder,
  onStatusChange,
  onPaymentStatusChange
}: {
  orders: RestaurantOrder[];
  selectedOrder: RestaurantOrder | null;
  query: string;
  tab: 'all' | RestaurantOrderStatus;
  paymentSettings: PaymentSettings;
  paymentStatuses: Record<string, PaymentStatus>;
  recentOrderIds: Set<string>;
  onQueryChange: (query: string) => void;
  onTabChange: (tab: 'all' | RestaurantOrderStatus) => void;
  onSelectOrder: (id: string) => void;
  onStatusChange: (order: RestaurantOrder, status: RestaurantOrderStatus) => void;
  onPaymentStatusChange: (orderId: string, status: PaymentStatus) => void;
}) {
  const orderGroups = useMemo(() => groupOrdersByDate(orders), [orders]);

  return (
    <div className="ra-orders-layout">
      <section className="ra-page-stack">
        <div className="ra-list-toolbar">
          <label><Search /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Поиск заказа по номеру, имени или телефону" /></label>
        </div>
        <div className="ra-tabs">
          {orderTabs.map((item) => <button key={item.id} type="button" data-active={tab === item.id} onClick={() => onTabChange(item.id)}>{item.label}</button>)}
        </div>
        <section className="ra-orders-feed">
          {orderGroups.map((group) => (
            <div className="ra-order-group" key={group.key}>
              <h3>{group.label}</h3>
              <div>
                {group.orders.map((order) => (
                  <OrderSummaryCard
                    key={order.id}
                    order={order}
                    active={selectedOrder?.id === order.id}
                    highlighted={recentOrderIds.has(order.id)}
                    onSelect={onSelectOrder}
                  />
                ))}
              </div>
            </div>
          ))}
          {orders.length === 0 && (
            <section className="ra-empty-orders">
              <ShoppingBag />
              <strong>Заказов нет</strong>
            </section>
          )}
        </section>
      </section>
      {selectedOrder && (
        <OrderDetails
          order={selectedOrder}
          paymentSettings={paymentSettings}
          paymentStatus={paymentStatuses[selectedOrder.id] ?? toLocalPaymentStatus(selectedOrder.paymentStatus)}
          onStatusChange={onStatusChange}
          onPaymentStatusChange={onPaymentStatusChange}
        />
      )}
    </div>
  );
}

function OrderSummaryCard({
  order,
  active,
  highlighted,
  onSelect
}: {
  order: RestaurantOrder;
  active: boolean;
  highlighted: boolean;
  onSelect: (id: string) => void;
}) {
  const statusTone = orderStatusTones[order.status];

  return (
    <button
      className="ra-order-summary-card"
      type="button"
      data-active={active}
      data-highlighted={highlighted}
      onClick={() => onSelect(order.id)}
    >
      <span className="ra-order-summary-card__head">
        <strong>#{order.orderNumber}</strong>
        <time dateTime={order.createdAt}>{formatOrderTime(order.createdAt)}</time>
      </span>
      <span className="ra-order-summary-card__meta">
        {fulfillmentTypeLabels[order.fulfillmentType]} • {getOrderItemsCount(order)} поз.
      </span>
      <span className="ra-order-summary-card__address">{getOrderLocationLabel(order)}</span>
      <span className="ra-order-summary-card__foot">
        <strong>{formatPrice(order.total)}</strong>
        <em data-tone={statusTone}>
          {order.status === 'new' && <span aria-hidden="true" />}
          {orderStatusLabels[order.status]}
        </em>
      </span>
    </button>
  );
}

function OrderDetails({
  order,
  paymentSettings,
  paymentStatus,
  onStatusChange,
  onPaymentStatusChange
}: {
  order: RestaurantOrder;
  paymentSettings: PaymentSettings;
  paymentStatus: PaymentStatus;
  onStatusChange: (order: RestaurantOrder, status: RestaurantOrderStatus) => void;
  onPaymentStatusChange: (orderId: string, status: PaymentStatus) => void;
}) {
  return (
    <aside className="ra-card ra-order-details">
      <header>
        <div>
          <small>Заказ</small>
          <h2>#{order.orderNumber}</h2>
        </div>
        <em data-tone={orderStatusTones[order.status]}>{orderStatusLabels[order.status]}</em>
      </header>
      <dl>
        <div><dt>Клиент</dt><dd>{order.clientName}</dd></div>
        <div><dt>Телефон</dt><dd>{order.clientPhone || 'Не указан'}</dd></div>
        <div><dt>Тип</dt><dd>{order.fulfillmentType === 'delivery' ? 'Доставка' : order.fulfillmentType === 'takeaway' ? 'На вынос' : 'В зале'}</dd></div>
        <div><dt>Адрес / кабинка</dt><dd>{order.deliveryAddress || order.cabinLabel || 'Не указано'}</dd></div>
        {order.fulfillmentType === 'delivery' && (
          <div>
            <dt>Координаты клиента</dt>
            <dd>
              {order.deliveryLat !== null && order.deliveryLng !== null
                ? `${order.deliveryLat.toFixed(7)}, ${order.deliveryLng.toFixed(7)}`
                : 'Не указаны'}
            </dd>
          </div>
        )}
        {order.fulfillmentType === 'delivery' && order.deliveryLat !== null && order.deliveryLng !== null && order.restaurantLat !== null && order.restaurantLng !== null && (
          <section className="ra-payment-box">
            <h3><MapPin />Карта доставки</h3>
            <DeliveryTrackingMap
              restaurant={{ lat: order.restaurantLat, lng: order.restaurantLng, label: 'Ресторан', address: order.restaurantAddress }}
              client={{ lat: order.deliveryLat, lng: order.deliveryLng, label: order.clientName || 'Клиент', address: order.deliveryAddress }}
              driver={order.driverLat !== null && order.driverLng !== null
                ? { lat: order.driverLat, lng: order.driverLng, label: order.driverName || 'Водитель' }
                : null}
            />
            <a
              className="ra-order-map-link"
              href={buildYandexMapsRouteUrl({
                from: { lat: order.restaurantLat, lng: order.restaurantLng, address: order.restaurantAddress },
                to: { lat: order.deliveryLat, lng: order.deliveryLng, address: order.deliveryAddress }
              })}
              target="_blank"
              rel="noreferrer"
            >
              Открыть маршрут в Яндекс Картах
            </a>
          </section>
        )}
        {order.fulfillmentType === 'delivery' && order.restaurantAddress && (
          <div><dt>Точка ресторана</dt><dd>{order.restaurantAddress}</dd></div>
        )}
        <div><dt>Комментарий</dt><dd>{order.comment || 'Нет комментария'}</dd></div>
        <div><dt>Оплата</dt><dd>{orderPaymentStatusLabels[order.paymentStatus]}</dd></div>
        {order.fulfillmentType === 'delivery' && <div><dt>Доставка</dt><dd>{order.deliveryStatus}</dd></div>}
        {order.driverName && <div><dt>Водитель</dt><dd>{order.driverName} · {order.driverPhone || 'телефон не указан'}</dd></div>}
      </dl>
      <div className="ra-order-items">
        {order.items.map((item) => (
          <span key={item.id}>{item.title}<strong>{item.quantity} x {formatPrice(item.unitPrice)}</strong></span>
        ))}
      </div>
      <div className="ra-order-total"><span>Итого</span><strong>{formatPrice(order.total)}</strong></div>
      <section className="ra-payment-box">
        <h3><WalletCards />Оплата</h3>
        <p>{paymentStatusLabels[paymentStatus]} · {orderPaymentStatusLabels[order.paymentStatus]}</p>
        <dl>
          <div><dt>Способ</dt><dd>Перевод ресторану</dd></div>
          <div><dt>Получатель</dt><dd>{paymentSettings.displayName}</dd></div>
          <div><dt>Номер</dt><dd>{paymentSettings.transferNumber}</dd></div>
        </dl>
        <div>
          <button type="button" onClick={() => onPaymentStatusChange(order.id, 'confirmed')}>Подтвердить оплату</button>
          <button type="button" onClick={() => onPaymentStatusChange(order.id, 'declined')}>Отклонить</button>
        </div>
      </section>
      {order.fulfillmentType === 'delivery' && (
        <section className="ra-payment-box">
          <h3><QrCode />Выдача водителю</h3>
          <p>{order.driverName ? `${order.driverName} назначен на заказ` : 'Водитель ещё не назначен'}</p>
          <dl>
            <div><dt>QR</dt><dd>{order.qrToken ? 'Будет проверен сканером' : 'Создаётся при назначении доставки'}</dd></div>
            <div><dt>Статус</dt><dd>{order.deliveryStatus}</dd></div>
          </dl>
        </section>
      )}
      <div className="ra-order-actions">
        {order.status === 'new' && (
          <button type="button" onClick={() => onStatusChange(order, 'accepted')}>Принять</button>
        )}
        {['accepted', 'confirmed'].includes(order.status) && (
          <button type="button" onClick={() => onStatusChange(order, 'preparing')}>Готовится</button>
        )}
        {order.status === 'preparing' && (
          <button type="button" onClick={() => onStatusChange(order, 'ready')}>Готово</button>
        )}
        {order.status === 'ready' && order.fulfillmentType === 'delivery' && (
          <button
            type="button"
            disabled={['waiting_confirmation', 'rejected'].includes(order.paymentStatus)}
            onClick={() => onStatusChange(order, 'waiting_driver')}
          >
            Вызвать доставку
          </button>
        )}
        {order.status === 'ready' && order.fulfillmentType !== 'delivery' && (
          <button type="button" onClick={() => onStatusChange(order, 'completed')}>Завершить</button>
        )}
        {order.status === 'waiting_driver' && (
          <button type="button" onClick={() => onStatusChange(order, 'on_the_way')}>Передано водителю</button>
        )}
        {order.status === 'on_the_way' && (
          <button type="button" onClick={() => onStatusChange(order, 'delivered')}>Доставлен</button>
        )}
        {order.status === 'new' && <button type="button" onClick={() => onStatusChange(order, 'cancelled')}>Отклонить</button>}
        {!['cancelled', 'canceled', 'completed'].includes(order.status) && (
          <button
            className="ra-order-actions__danger"
            type="button"
            onClick={() => {
              if (window.confirm('Удалить заказ из работы ресторана?')) {
                onStatusChange(order, 'cancelled');
              }
            }}
          >
            <Trash2 />
            Удалить заказ
          </button>
        )}
      </div>
    </aside>
  );
}

function StocksPage({
  products,
  stockDrafts,
  onStockDraftsChange
}: {
  products: Product[];
  stockDrafts: Record<string, number>;
  onStockDraftsChange: (drafts: Record<string, number>) => void;
}) {
  const setDraft = (product: Product, value: number) => {
    onStockDraftsChange({ ...stockDrafts, [product.id]: Math.max(0, value) });
  };

  return (
    <div className="ra-page-stack">
      <section className="ra-stock-note">
        <p>Задайте остаток на день. Кнопка -1 меняет текущий остаток, а здесь хранится дневная норма.</p>
        <button type="button" onClick={() => toast.success('Остатки обновлены полностью')}>Обновить полностью</button>
      </section>
      <section className="ra-stock-list">
        {products.map((product) => {
          const current = stockDrafts[product.id] ?? getProductStock(product);
          return (
            <article key={product.id}>
              <img src={product.image_url} alt="" />
              <div><strong>{product.title}</strong><small>Сейчас осталось: {getProductStock(product)}</small></div>
              <label>Норма на день<input type="number" value={current} onChange={(event) => setDraft(product, Number(event.target.value))} /></label>
              <button type="button" onClick={() => setDraft(product, current - 1)}>-1</button>
              <button type="button" onClick={() => toast.success(`${product.title}: остаток обновлён`)}>Обновить</button>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function SettingsPage({
  section,
  restaurant,
  categories,
  products,
  theme,
  paymentSettings,
  publicUrl,
  onSectionChange,
  onPaymentChange,
  onQrChange
}: {
  section: SettingsSection;
  restaurant: Restaurant;
  categories: Category[];
  products: Product[];
  theme: ThemeSettings;
  paymentSettings: PaymentSettings;
  publicUrl: string;
  onSectionChange: (section: SettingsSection) => void;
  onPaymentChange: <K extends keyof PaymentSettings>(key: K, value: PaymentSettings[K]) => void;
  onQrChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  if (section === 'payments') {
    return (
      <PaymentsSettings
        settings={paymentSettings}
        onChange={onPaymentChange}
        onQrChange={onQrChange}
        onBack={() => onSectionChange('hub')}
      />
    );
  }

  if (section !== 'hub') {
    return (
      <div className="ra-page-stack">
        <button className="ra-back-button" type="button" onClick={() => onSectionChange('hub')}>Назад к настройкам</button>
        <section className="ra-card ra-settings-detail">
          <h2>{settingsTitle(section)}</h2>
          <SettingsDetail section={section} restaurant={restaurant} categories={categories} products={products} theme={theme} publicUrl={publicUrl} />
        </section>
      </div>
    );
  }

  const cards: Array<{ id: SettingsSection; title: string; text: string; icon: typeof Home; danger?: boolean }> = [
    { id: 'profile', title: 'Профиль ресторана', text: 'Название, описание, контакты, адрес', icon: Store },
    { id: 'hours', title: 'Рабочие часы', text: 'Время работы ресторана и доставки', icon: Clock },
    { id: 'taxonomy', title: 'Категории и метки', text: 'Управление категориями, метками и кабинками', icon: Tags },
    { id: 'import', title: 'Импорт / Экспорт', text: 'Импорт и экспорт данных каталога', icon: FileDown },
    { id: 'design', title: 'Дизайн каталога', text: 'Цвета, тема, внешний вид приложения', icon: SlidersHorizontal },
    { id: 'backups', title: 'Резервные копии', text: 'Создание и восстановление бэкапов', icon: DatabaseBackup },
    { id: 'catalog', title: 'Каталог', text: 'Настройки отображения каталога', icon: LayoutGrid },
    { id: 'payments', title: 'Платежи', text: 'Перевод ресторану, номер, ФИО и QR', icon: CreditCard },
    { id: 'delivery', title: 'Доставка', text: 'Параметры доставки и курьеров', icon: Truck },
    { id: 'danger', title: 'Удаление данных', text: 'Удалить каталог и все данные', icon: ShieldAlert, danger: true }
  ];

  return (
    <section className="ra-settings-grid">
      {cards.map((card) => (
        <button key={card.id} type="button" data-danger={card.danger} onClick={() => onSectionChange(card.id)}>
          <card.icon />
          <span><strong>{card.title}</strong><small>{card.text}</small></span>
        </button>
      ))}
    </section>
  );
}

function settingsTitle(section: SettingsSection) {
  const titles: Record<SettingsSection, string> = {
    hub: 'Настройки',
    profile: 'Профиль ресторана',
    taxonomy: 'Категории и метки',
    design: 'Дизайн каталога',
    catalog: 'Каталог',
    delivery: 'Доставка',
    hours: 'Рабочие часы',
    payments: 'Платежи',
    import: 'Импорт / экспорт',
    backups: 'Резервные копии',
    danger: 'Удаление данных'
  };
  return titles[section];
}

function SettingsDetail({
  section,
  restaurant,
  categories,
  products,
  theme,
  publicUrl
}: {
  section: SettingsSection;
  restaurant: Restaurant;
  categories: Category[];
  products: Product[];
  theme: ThemeSettings;
  publicUrl: string;
}) {
  if (section === 'profile') {
    return <div className="ra-detail-grid"><span>Название<strong>{restaurant.name}</strong></span><span>Описание<strong>{restaurant.subtitle}</strong></span><span>WhatsApp<strong>{restaurant.whatsapp}</strong></span><span>Instagram<strong>{restaurant.instagram_url}</strong></span><span>Адрес<strong>{restaurant.address}</strong></span><span>Карта<strong>{restaurant.mapLink}</strong></span></div>;
  }
  if (section === 'taxonomy') {
    return <div className="ra-detail-grid"><span>Категории<strong>{categories.length}</strong></span><span>Блюда<strong>{products.length}</strong></span><span>Фото категорий<strong>Подключены</strong></span><span>Кабинки<strong>В текущей сущности</strong></span></div>;
  }
  if (section === 'design') {
    return <div className="ra-detail-grid"><span>Фон<strong>{theme.background_type}</strong></span><span>Основной цвет<strong>{theme.accent_color}</strong></span><span>Карточки<strong>{theme.product_card_color ?? theme.card_color}</strong></span><span>Скругление<strong>{theme.card_radius}px</strong></span></div>;
  }
  if (section === 'catalog') {
    return <ToggleGrid labels={['Показывать рейтинг', 'Показывать время доставки', 'Бесплатная доставка от суммы', 'Показывать состав блюда', 'Показывать вес', 'Показывать остаток', 'Блок соцсетей', 'Нижний футер', 'Баннеры / акции', 'Популярное']} />;
  }
  if (section === 'delivery') {
    return <ToggleGrid labels={['Включить доставку', 'Включить самовывоз', 'Заказ в зале', 'Свой курьер', 'Платформенные водители']} />;
  }
  if (section === 'hours') {
    return <div className="ra-detail-grid"><span>Открытие<strong>09:00</strong></span><span>Закрытие<strong>22:00</strong></span><span>Вне графика<strong>Показывать предупреждение</strong></span></div>;
  }
  if (section === 'import' || section === 'backups') {
    return <div className="ra-actions-row"><button type="button"><FileDown />Экспорт каталога</button><button type="button"><Upload />Импорт каталога</button><button type="button"><DatabaseBackup />Резервная копия</button><button type="button" onClick={() => void copyText(publicUrl).then(() => toast.success('Ссылка скопирована'))}><Copy />Ссылка</button></div>;
  }
  return <div className="ra-danger-zone"><p>Опасные действия требуют отдельного подтверждения.</p><button type="button">Очистить блюда</button><button type="button">Очистить заказы</button><button type="button">Удалить каталог</button></div>;
}

function ToggleGrid({ labels }: { labels: string[] }) {
  return <div className="ra-toggle-grid">{labels.map((label) => <label key={label}><input type="checkbox" defaultChecked />{label}</label>)}</div>;
}

function PaymentsSettings({
  settings,
  onChange,
  onQrChange,
  onBack
}: {
  settings: PaymentSettings;
  onChange: <K extends keyof PaymentSettings>(key: K, value: PaymentSettings[K]) => void;
  onQrChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onBack: () => void;
}) {
  return (
    <div className="ra-payments-layout">
      <section className="ra-card ra-payment-form">
        <button className="ra-back-button" type="button" onClick={onBack}>Назад к настройкам</button>
        <h2>Реквизиты для перевода</h2>
        <label><input type="checkbox" checked={settings.enabled} onChange={(event) => onChange('enabled', event.target.checked)} />Включить оплату переводом</label>
        <div className="ra-form-grid">
          <label>Тип реквизита<select value={settings.requisiteType} onChange={(event) => onChange('requisiteType', event.target.value as PaymentSettings['requisiteType'])}><option value="phone">Номер телефона</option><option value="card">Номер карты</option><option value="account">Счёт</option></select></label>
          <label>Номер для перевода<input value={settings.transferNumber} onChange={(event) => onChange('transferNumber', event.target.value)} /></label>
          <label>Банк / способ оплаты<input value={settings.bankName} onChange={(event) => onChange('bankName', event.target.value)} /></label>
          <label>Фамилия<input value={settings.lastName} onChange={(event) => onChange('lastName', event.target.value)} /></label>
          <label>Имя<input value={settings.firstName} onChange={(event) => onChange('firstName', event.target.value)} /></label>
          <label>Отчество<input value={settings.middleName} onChange={(event) => onChange('middleName', event.target.value)} /></label>
          <label>Отображаемое полное имя<input value={settings.displayName} onChange={(event) => onChange('displayName', event.target.value)} /></label>
          <label>Комментарий к оплате<input value={settings.comment} onChange={(event) => onChange('comment', event.target.value)} /></label>
        </div>
        <label className="ra-upload-box"><ImagePlus />Загрузить или заменить QR<input type="file" accept="image/*" onChange={onQrChange} /></label>
        <div className="ra-toggle-grid">
          <label><input type="checkbox" checked={settings.allowCash} onChange={(event) => onChange('allowCash', event.target.checked)} />Разрешить наличные</label>
          <label><input type="checkbox" checked={settings.allowTransfer} onChange={(event) => onChange('allowTransfer', event.target.checked)} />Разрешить перевод</label>
          <label><input type="checkbox" checked={settings.requireConfirmation} onChange={(event) => onChange('requireConfirmation', event.target.checked)} />Требовать подтверждение рестораном</label>
        </div>
        <label>Текст подсказки клиенту<textarea value={settings.clientHint} onChange={(event) => onChange('clientHint', event.target.value)} /></label>
      </section>
      <aside className="ra-card ra-client-payment-preview">
        <h3>Как увидит клиент</h3>
        <strong>{formatPrice(1850)}</strong>
        <p>Способ оплаты: перевод ресторану</p>
        <dl>
          <div><dt>Получатель</dt><dd>{settings.displayName}</dd></div>
          <div><dt>Номер</dt><dd>{settings.transferNumber}</dd></div>
          <div><dt>Банк</dt><dd>{settings.bankName}</dd></div>
        </dl>
        <div className="ra-qr-preview">{settings.qrUrl ? <img src={settings.qrUrl} alt="QR-код для перевода" /> : <QrCode />}</div>
        <button type="button" onClick={() => void copyText(settings.transferNumber).then(() => toast.success('Номер скопирован'))}><Copy />Копировать номер</button>
        <button type="button">Я оплатил</button>
        <small>{settings.clientHint}</small>
      </aside>
    </div>
  );
}
