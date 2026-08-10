import {
  Bell,
  Calculator,
  Eye,
  EyeOff,
  Home,
  MapPin,
  Menu,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Store,
  Tags,
  Trash2,
  Upload,
  UtensilsCrossed,
  WalletCards
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Cabin, CatalogTag, Category, Product, Restaurant, ThemeSettings } from '../../entities/models';
import { cabins as demoCabins, categories as demoCategories, products as demoProducts, restaurant as demoRestaurant, themeSettings as demoTheme } from '../../data/catalog';
import {
  deleteRestaurantTestOrder,
  getRestaurantDeliverySettings,
  getRestaurantOrders,
  createRestaurantOrderFromCart,
  saveRestaurantDeliverySettings,
  subscribeToRestaurantOrdersRealtime,
  updateRestaurantOrderPaymentStatus,
  updateRestaurantOrderStatus,
  type RestaurantDeliverySettings,
  type RestaurantOrder,
  type RestaurantOrderStatus
} from '../../shared/api/restaurantOrdersApi';
import { buildYandexMapsRouteUrl } from '../../features/order/orderLifecycle';
import { DeliveryTrackingMap } from '../../shared/DeliveryTrackingMap';
import type { PaymentStatus as RestaurantPaymentStatus } from '../../features/order/orderLifecycle';
import { getCatalogPublicUrl } from '../../shared/platformUrls';
import {
  loadCatalog,
  replaceCatalogInSupabase,
  savePhotoQualityToSupabase
} from '../../shared/supabase';
import { saveRestaurantPayments } from '../../shared/api/restaurantPaymentsApi';
import type { RestaurantPaymentSettings } from '../../shared/paymentSettings';
import { DEFAULT_PHOTO_QUALITY_SETTINGS, type PhotoQualitySettings } from '../../shared/photoQuality';
import type { CatalogAdminAccess } from '../../shared/api/catalogAdminApi';
import {
  getRestaurantOrderNotificationPermission,
  requestRestaurantOrderNotificationPermission,
  restoreRestaurantOrderNotificationSubscription,
  showRestaurantOrderNotification
} from '../../shared/restaurantOrderNotifications';
import { playRestaurantAdminOrderSound } from '../../features/restaurant-admin/orderPresentation';
import {
  getRestaurantModuleEntitlementByCatalog
} from '../../shared/api/restaurantModulesApi';
import {
  getRestaurantAdminModuleAccess,
  type RestaurantAdminModuleAccess
} from '../../features/platform-admin-modules/restaurantModuleAccess';
import {
  RestaurantPosPage,
  type RestaurantPosOrderDraft
} from '../../features/restaurant-pos/RestaurantPosPage';
import { RestaurantWarehousePage } from '../../features/restaurant-pos/RestaurantWarehousePage';
import { RestaurantOrdersBoard } from '../../features/restaurant-admin/RestaurantOrdersBoard';
import {
  ExistingRestaurantSettingsPage,
  type ExistingRestaurantSettingsView
} from '../../features/restaurant-admin/ExistingRestaurantSettingsPage';
import { defaultRestaurantDeliverySettings } from '../../features/restaurant-settings';
import type { CatalogBackupPayload } from '../../features/restaurant-settings/catalogAdminModel';

type AdminSection = 'home' | 'pos' | 'catalog' | 'dishes' | 'orders' | 'warehouse' | 'stocks' | 'settings';
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

const existingSettingsViews: Partial<Record<SettingsSection, ExistingRestaurantSettingsView>> = {
  profile: 'profile',
  taxonomy: 'categories',
  design: 'design',
  payments: 'payments',
  delivery: 'delivery',
  import: 'backup',
  backups: 'backup'
};

type CatalogData = {
  restaurant: Restaurant;
  categories: Category[];
  cabins: Cabin[];
  products: Product[];
  tags: CatalogTag[];
  theme: ThemeSettings;
  photoQuality: PhotoQualitySettings;
};

type PaymentSettings = {
  transferEnabled: boolean;
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

const baseNavItems: Array<{ id: AdminSection; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Главная', icon: Home },
  { id: 'catalog', label: 'Каталог', icon: Store },
  { id: 'dishes', label: 'Блюда', icon: UtensilsCrossed },
  { id: 'orders', label: 'Заказы', icon: ShoppingBag },
  { id: 'stocks', label: 'Остатки', icon: Package },
  { id: 'settings', label: 'Настройки', icon: Settings }
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
  transferEnabled: true,
  enabled: true,
  requisiteType: 'phone',
  transferNumber: '+7 999 000-00-00',
  bankName: 'Банк / перевод ресторану',
  lastName: 'Исаев',
  firstName: 'Магомед',
  middleName: '',
  displayName: 'Исаев Магомед',
  comment: 'Оплата заказа WayYaam',
  qrUrl: '',
  allowCash: true,
  allowTransfer: true,
  requireConfirmation: true,
  clientHint: 'Переведите сумму ресторану и после оплаты нажмите "Я оплатил".'
};

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const paymentStorageKey = (slug: string) => `waycatalog:${slug}:payment-settings`;
const paymentStatusStorageKey = (slug: string) => `waycatalog:${slug}:payment-statuses`;

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
  const navigate = useNavigate();
  const [section, setSection] = useState<AdminSection>('home');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('hub');
  const [catalogData, setCatalogData] = useState<CatalogData>({
    restaurant: demoRestaurant,
    categories: demoCategories,
    cabins: demoCabins,
    products: demoProducts,
    tags: [],
    theme: demoTheme,
    photoQuality: DEFAULT_PHOTO_QUALITY_SETTINGS
  });
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [moduleAccess, setModuleAccess] = useState<RestaurantAdminModuleAccess>({
    pos: 'disabled',
    warehouse: 'disabled'
  });
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [dishQuery, setDishQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [orderQuery, setOrderQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [recentOrderIds, setRecentOrderIds] = useState<Set<string>>(() => new Set());
  const [stockDrafts, setStockDrafts] = useState<Record<string, number>>({});
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(() =>
    readJson(paymentStorageKey(access.catalog?.slug ?? 'demo'), defaultPaymentSettings)
  );
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, PaymentStatus>>(() =>
    readJson(paymentStatusStorageKey(access.catalog?.slug ?? 'demo'), {})
  );
  const [deliverySettings, setDeliverySettings] = useState<RestaurantDeliverySettings>(defaultRestaurantDeliverySettings);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedOrdersRef = useRef(false);
  const [notificationPermission, setNotificationPermission] = useState(() => getRestaurantOrderNotificationPermission());

  const slug = access.catalog?.slug ?? 'demo';
  const publicUrl = useMemo(() => (access.catalog ? getCatalogPublicUrl(access.catalog.slug) : '#'), [access.catalog]);
  const navItems = useMemo(() => {
    const items = [...baseNavItems];
    if (moduleAccess.pos !== 'disabled') {
      items.splice(1, 0, { id: 'pos', label: 'Касса', icon: Calculator });
    }
    if (moduleAccess.warehouse !== 'disabled') {
      const ordersIndex = items.findIndex((item) => item.id === 'orders');
      items.splice(ordersIndex + 1, 0, { id: 'warehouse', label: 'Склад', icon: Package });
    }
    return items;
  }, [moduleAccess.pos, moduleAccess.warehouse]);
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
        cabins: catalog.cabins.length ? catalog.cabins : demoCabins,
        products: catalog.products.length ? catalog.products : demoProducts,
        tags: catalog.tags,
        theme: catalog.theme,
        photoQuality: catalog.photoQuality ?? DEFAULT_PHOTO_QUALITY_SETTINGS
      });
      const knownIds = knownOrderIdsRef.current;
      const newOrders = hasLoadedOrdersRef.current
        ? restaurantOrders.filter((order) => order.status === 'new' && !knownIds.has(order.id))
        : [];
      const newOrderIds = newOrders.map((order) => order.id);
      if (newOrderIds.length > 0) {
        setRecentOrderIds((current) => new Set([...current, ...newOrderIds]));
        toast.success(newOrderIds.length === 1 ? 'Новый заказ' : `Новых заказов: ${newOrderIds.length}`);
        playRestaurantAdminOrderSound();
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

  useEffect(() => {
    let active = true;
    void getRestaurantDeliverySettings(slug)
      .then((settings) => {
        if (active) setDeliverySettings(settings);
      })
      .catch(() => {
        if (active) setDeliverySettings(defaultRestaurantDeliverySettings);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!access.catalog?.id) return;
    let active = true;
    void getRestaurantModuleEntitlementByCatalog(access.catalog.id)
      .then((modules) => {
        if (!active) return;
        setModuleAccess(getRestaurantAdminModuleAccess({
          modules,
          status: access.subscriptionStatus,
          endsAt: access.subscriptionEndsAt
        }));
      })
      .catch((error) => {
        if (!active) return;
        setModuleAccess({ pos: 'disabled', warehouse: 'disabled' });
        toast.error(error instanceof Error ? error.message : 'Не удалось проверить доступ к POS');
      });
    return () => {
      active = false;
    };
  }, [access.catalog?.id, access.subscriptionEndsAt, access.subscriptionStatus]);

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
    const intervalId = window.setInterval(refreshSilently, 10_000);

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
    return text.includes(orderQuery.trim().toLowerCase());
  });
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? filteredOrders[0] ?? orders[0] ?? null;

  const goTo = (nextSection: AdminSection, nextSettingsSection: SettingsSection = 'hub') => {
    setSection(nextSection);
    setSettingsSection(nextSettingsSection);
  };

  const submitPosOrder = async (draft: RestaurantPosOrderDraft) => {
    const cartItems = draft.items.flatMap((item) => {
      const product = catalogData.products.find((candidate) => candidate.id === item.productId);
      return product ? [{ product, quantity: item.quantity }] : [];
    });
    if (cartItems.length !== draft.items.length) {
      throw new Error('Одно из блюд больше недоступно в текущем каталоге');
    }
    const paymentLabel = draft.paymentMethod === 'cash' ? 'Наличные' : 'Перевод';
    await createRestaurantOrderFromCart({
      slug,
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
    await refreshData({ silent: true });
    toast.success('POS-заказ добавлен в общий список заказов');
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

  const deleteOrder = async (order: RestaurantOrder) => {
    try {
      const deleted = await deleteRestaurantTestOrder(order);
      if (!deleted) throw new Error('Заказ уже удалён или не найден');
      setOrders((current) => current.filter((item) => item.id !== order.id));
      setSelectedOrderId((current) => (current === order.id ? null : current));
      setPaymentStatuses((current) => Object.fromEntries(
        Object.entries(current).filter(([orderId]) => orderId !== order.id)
      ));
      knownOrderIdsRef.current.delete(order.id);
      toast.success(`Заказ #${order.orderNumber} удалён`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить заказ');
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

  const persistCatalogChange = (payload: Parameters<typeof replaceCatalogInSupabase>[0], message = 'Настройки сохранены') => {
    void replaceCatalogInSupabase(payload)
      .then(() => toast.success(message))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки'));
  };

  const saveExistingRestaurant = (restaurant: Restaurant) => {
    setCatalogData((current) => ({ ...current, restaurant }));
    persistCatalogChange({ restaurant }, 'Профиль ресторана сохранён');
  };

  const saveExistingCategories = (categories: Category[]) => {
    setCatalogData((current) => ({ ...current, categories }));
    persistCatalogChange({ categories }, 'Категории сохранены');
  };

  const saveExistingCabins = (cabins: Cabin[]) => {
    setCatalogData((current) => ({ ...current, cabins }));
    persistCatalogChange({ cabins }, 'Кабинки сохранены');
  };

  const saveExistingTags = (tags: CatalogTag[]) => {
    setCatalogData((current) => ({ ...current, tags }));
    persistCatalogChange({ tags }, 'Метки сохранены');
  };

  const saveExistingTheme = (patch: Partial<ThemeSettings>) => {
    const theme = { ...catalogData.theme, ...patch };
    setCatalogData((current) => ({ ...current, theme }));
    persistCatalogChange({ theme }, 'Дизайн сохранён');
  };

  const saveExistingPhotoQuality = async (photoQuality: PhotoQualitySettings) => {
    setCatalogData((current) => ({ ...current, photoQuality }));
    await savePhotoQualityToSupabase(slug, photoQuality);
    toast.success('Качество фотографий сохранено');
  };

  const saveExistingPayments = (settings: RestaurantPaymentSettings) => {
    setPaymentSettings((current) => ({
      ...current,
      ...settings,
      transferEnabled: settings.transferEnabled,
      enabled: settings.transferEnabled,
      allowTransfer: settings.transferEnabled
    }));
    void saveRestaurantPayments(access.catalog?.id ?? slug, slug, settings)
      .then(() => toast.success('Платежи сохранены'))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Не удалось сохранить платежи'));
  };

  const saveExistingDelivery = (settings: RestaurantDeliverySettings) => {
    setDeliverySettings(settings);
    void saveRestaurantDeliverySettings(slug, settings)
      .then(() => toast.success('Доставка сохранена'))
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Не удалось сохранить доставку'));
  };

  const importExistingSettings = (payload: CatalogBackupPayload) => {
    setCatalogData((current) => ({
      restaurant: payload.restaurant ?? current.restaurant,
      categories: payload.categories ?? current.categories,
      cabins: payload.cabins ?? current.cabins,
      products: payload.products ?? current.products,
      tags: payload.tags ?? current.tags,
      theme: payload.theme ?? current.theme,
      photoQuality: current.photoQuality
    }));
    persistCatalogChange({
      restaurant: payload.restaurant,
      categories: payload.categories,
      cabins: payload.cabins,
      products: payload.products,
      tags: payload.tags,
      theme: payload.theme
    }, 'Каталог импортирован');
  };

  const existingPaymentSettings: RestaurantPaymentSettings = {
    transferEnabled: paymentSettings.transferEnabled ?? paymentSettings.enabled,
    requisiteType: paymentSettings.requisiteType,
    transferNumber: paymentSettings.transferNumber,
    bankName: paymentSettings.bankName,
    lastName: paymentSettings.lastName,
    firstName: paymentSettings.firstName,
    middleName: paymentSettings.middleName,
    displayName: paymentSettings.displayName,
    qrUrl: paymentSettings.qrUrl,
    comment: paymentSettings.comment,
    allowCash: paymentSettings.allowCash,
    requireConfirmation: paymentSettings.requireConfirmation
  };

  return (
    <main className="restaurant-admin-shell" data-consent-blocked={Boolean(consentModal)}>
      <aside className="restaurant-admin-sidebar">
        <div className="restaurant-admin-logo">
          <span>W</span>
          <strong>WayYaam</strong>
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
          {section === 'pos' && moduleAccess.pos !== 'disabled' && (
            <RestaurantPosPage
              restaurantName={catalogData.restaurant.name}
              categories={catalogData.categories}
              cabins={catalogData.cabins}
              products={catalogData.products}
              accessMode={moduleAccess.pos}
              onSubmitOrder={submitPosOrder}
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
              paymentSettings={paymentSettings}
              paymentStatuses={paymentStatuses}
              recentOrderIds={recentOrderIds}
              canDeleteOrders={access.legalActivationStatus !== 'active'}
              onQueryChange={setOrderQuery}
              onSelectOrder={setSelectedOrderId}
              onStatusChange={updateOrderStatus}
              onPaymentStatusChange={setPaymentStatus}
              onDelete={deleteOrder}
            />
          )}
          {section === 'warehouse' && moduleAccess.warehouse !== 'disabled' && (
            <RestaurantWarehousePage
              restaurantName={catalogData.restaurant.name}
              accessMode={moduleAccess.warehouse}
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
            <ExistingRestaurantSettingsPage
              key={settingsSection}
              initialView={existingSettingsViews[settingsSection] ?? 'home'}
              catalogSlug={slug}
              restaurant={catalogData.restaurant}
              categories={catalogData.categories}
              cabins={catalogData.cabins}
              tags={catalogData.tags}
              products={catalogData.products}
              theme={catalogData.theme}
              photoQuality={catalogData.photoQuality}
              paymentSettings={existingPaymentSettings}
              deliverySettings={deliverySettings}
              onSaveRestaurant={saveExistingRestaurant}
              onSaveCategories={saveExistingCategories}
              onSaveCabins={saveExistingCabins}
              onSaveTags={saveExistingTags}
              onSaveTheme={saveExistingTheme}
              onSavePhotoQuality={saveExistingPhotoQuality}
              onSavePayments={saveExistingPayments}
              onSaveDelivery={saveExistingDelivery}
              onImport={importExistingSettings}
              onSignOut={onSignOut}
              onActivate={() => navigate('/restaurant/activation')}
              legalActivationStatus={access.legalActivationStatus}
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
  paymentSettings,
  paymentStatuses,
  recentOrderIds,
  canDeleteOrders,
  onQueryChange,
  onSelectOrder,
  onStatusChange,
  onPaymentStatusChange,
  onDelete
}: {
  orders: RestaurantOrder[];
  selectedOrder: RestaurantOrder | null;
  query: string;
  paymentSettings: PaymentSettings;
  paymentStatuses: Record<string, PaymentStatus>;
  recentOrderIds: Set<string>;
  canDeleteOrders: boolean;
  onQueryChange: (query: string) => void;
  onSelectOrder: (id: string) => void;
  onStatusChange: (order: RestaurantOrder, status: RestaurantOrderStatus) => void;
  onPaymentStatusChange: (orderId: string, status: PaymentStatus) => void;
  onDelete: (order: RestaurantOrder) => Promise<void>;
}) {
  return (
    <div className="ra-orders-layout">
      <section className="ra-page-stack">
        <div className="ra-list-toolbar">
          <label><Search /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Поиск заказа по номеру, имени или телефону" /></label>
        </div>
        <RestaurantOrdersBoard
          orders={orders}
          selectedOrderId={selectedOrder?.id ?? null}
          recentOrderIds={recentOrderIds}
          onSelectOrder={onSelectOrder}
        />
      </section>
      {selectedOrder && (
        <OrderDetails
          order={selectedOrder}
          paymentSettings={paymentSettings}
          paymentStatus={paymentStatuses[selectedOrder.id] ?? toLocalPaymentStatus(selectedOrder.paymentStatus)}
          onStatusChange={onStatusChange}
          onPaymentStatusChange={onPaymentStatusChange}
          onDelete={onDelete}
          canDeleteOrders={canDeleteOrders}
        />
      )}
    </div>
  );
}

function OrderDetails({
  order,
  paymentSettings,
  paymentStatus,
  onStatusChange,
  onPaymentStatusChange,
  canDeleteOrders,
  onDelete
}: {
  order: RestaurantOrder;
  paymentSettings: PaymentSettings;
  paymentStatus: PaymentStatus;
  onStatusChange: (order: RestaurantOrder, status: RestaurantOrderStatus) => void;
  onPaymentStatusChange: (orderId: string, status: PaymentStatus) => void;
  canDeleteOrders: boolean;
  onDelete: (order: RestaurantOrder) => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteOrder = async () => {
    if (isDeleting || !window.confirm('Удалить заказ? Это действие нельзя отменить.')) return;
    setIsDeleting(true);
    try {
      await onDelete(order);
    } finally {
      setIsDeleting(false);
    }
  };

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
        {(order.isTestOrder || canDeleteOrders) && (
          <button
            className="ra-order-actions__danger"
            type="button"
            disabled={isDeleting}
            onClick={() => void deleteOrder()}
          >
            <Trash2 />
            {isDeleting ? 'Удаляем...' : 'Удалить заказ'}
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
