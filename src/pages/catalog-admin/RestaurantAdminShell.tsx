import {
  ArrowRight,
  Bell,
  Calculator,
  ClipboardList,
  ClipboardPlus,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  Home,
  Info,
  KeyRound,
  MapPin,
  Menu,
  MessageCircle,
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
  Truck,
  Trash2,
  Upload,
  User,
  Users,
  UtensilsCrossed,
  WalletCards
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Cabin, CatalogTag, Category, Product, Restaurant, ThemeSettings } from '../../entities/models';
import { cabins as demoCabins, categories as demoCategories, products as demoProducts, restaurant as demoRestaurant, themeSettings as demoTheme } from '../../data/catalog';
import { groceryCategories, groceryProducts, groceryRestaurant, groceryTheme } from '../../data/groceryCatalog';
import { completeGroceryPosOrder, deleteRestaurantTestOrder, getCombinedOrderDispatchReadiness, getRestaurantDeliverySettings, getRestaurantOrders, createRestaurantOrderFromCart, saveRestaurantDeliverySettings, subscribeToRestaurantOrdersRealtime, updateRestaurantOrderPaymentStatus, updateRestaurantOrderStatus, type RestaurantDeliverySettings, type RestaurantOrder, type RestaurantOrderStatus } from '../../shared/api/restaurantOrdersApi';
import { buildYandexMapsRouteUrl } from '../../features/order/orderLifecycle';
import { DeliveryTrackingMap } from '../../shared/DeliveryTrackingMap';
import type { PaymentStatus as RestaurantPaymentStatus } from '../../features/order/orderLifecycle';
import { getCatalogPublicUrl } from '../../shared/platformUrls';
import { loadCatalog, replaceCatalogInSupabase, saveProductToSupabase, savePhotoQualityToSupabase } from '../../shared/supabase';
import { saveRestaurantPayments } from '../../shared/api/restaurantPaymentsApi';
import type { RestaurantPaymentSettings } from '../../shared/paymentSettings';
import { DEFAULT_PHOTO_QUALITY_SETTINGS, type PhotoQualitySettings } from '../../shared/photoQuality';
import { changeCatalogAdminPassword, type CatalogAdminAccess } from '../../shared/api/catalogAdminApi';
import { getRestaurantOrderNotificationPermission, requestRestaurantOrderNotificationPermission, restoreRestaurantOrderNotificationSubscription, showRestaurantOrderNotification } from '../../shared/restaurantOrderNotifications';
import { formatAdminOrderItemQuantity, formatAdminPaymentSummary, getAdminOrderFulfillmentLabel, getAdminOrderLocationLabel, getAdminOrderPhoneHref, getAdminOrderStatusLabel, getAdminOrderWhatsAppHref, getBusinessPaymentStatusLabel, getOrderPaymentMethod, getVisibleAdminOrderComment, isGroceryStorePosOrder, playRestaurantAdminOrderSound } from '../../features/restaurant-admin/orderPresentation';
import { getRestaurantModuleEntitlementByCatalog } from '../../shared/api/restaurantModulesApi';
import { getRestaurantAdminModuleAccess, type RestaurantAdminModuleAccess } from '../../features/platform-admin-modules/restaurantModuleAccess';
import { RestaurantPosPage, type RestaurantPosOrderDraft } from '../../features/restaurant-pos/RestaurantPosPage';
import { RestaurantWarehousePage } from '../../features/restaurant-pos/RestaurantWarehousePage';
import { RestaurantOrdersBoard } from '../../features/restaurant-admin/RestaurantOrdersBoard';
import { ExistingRestaurantSettingsPage, type ExistingRestaurantSettingsView } from '../../features/restaurant-admin/ExistingRestaurantSettingsPage';
import { defaultRestaurantDeliverySettings } from '../../features/restaurant-settings';
import type { CatalogBackupPayload } from '../../features/restaurant-settings/catalogAdminModel';
import { getBusinessTerms, type BusinessTerms } from '../../shared/businessTerminology';
import { getCatalogWorkspaceAccess, getVisibleAssignedOrderIds, type CatalogOrderWorkAssignment } from '../../entities/catalogStaff';
import { acceptCatalogOrderAssignment, escalateCatalogOrderAssignments, getCatalogOrderAssignments, updateCatalogAssignedOrderStatus } from '../../shared/api/catalogStaffApi';
import { CatalogTeamPage } from '../../features/catalog-staff/CatalogTeamPage';
import { GroceryPickingPanel } from '../../features/order-picking/GroceryPickingPanel';
import { StoreOrderQueue } from '../../features/store-orders/StoreOrderQueue';
import { StoreOrderPickingPage } from '../../features/store-orders/StoreOrderPickingPage';
import { OrderConversationInbox, type OrderConversationInboxItem } from '../../features/order-conversation/OrderConversationInbox';
import { OrderConversationPanel } from '../../features/order-conversation/OrderConversationPanel';
import { loadGroceryInventory, postGroceryReceiving, saveGroceryInventoryItem, type GroceryInventoryMovement, type GroceryReceivingLineInput } from '../../shared/api/groceryInventoryApi';
import { GroceryProductsPage } from '../../features/grocery-operations/GroceryProductsPage';
import { GroceryReceivingPage } from '../../features/grocery-operations/GroceryReceivingPage';
import { GroceryWarehousePage } from '../../features/grocery-operations/GroceryWarehousePage';
import { GroceryPosPage, type GroceryPosLine } from '../../features/grocery-operations/GroceryPosPage';
import { formatGroceryPosOrderComment, type GroceryPosPayment } from '../../features/grocery-operations/groceryPosModel';
import { GroceryProductEditor } from '../../features/grocery-operations/GroceryProductEditor';
import { applyReceivingLines } from '../../features/grocery-operations/inventoryModel';
import '../../features/grocery-operations/grocery-operations.css';
import { SharedProductCatalogPage } from '../../features/shared-product-catalog/SharedProductCatalogPage';
import { SharedBarcodeScanner } from '../../features/shared-product-catalog/SharedBarcodeScanner';
import { preloadProductPhotoBackgroundRemoval } from '../../features/shared-product-catalog/productPhotoBackground';
import { prepareBarcodeScanSound } from '../../features/grocery-operations/barcodeScanFeedback';
import { BrandLogo } from '../../shared/BrandLogo';
import { getBusinessOrderCapabilities } from '../../entities/businessOrderCapabilities';
import {
  MerchantReadyEstimatePicker,
  type MerchantReadyMinutes
} from '../../features/restaurant-admin/MerchantReadyEstimatePicker';
import { getCombinedDispatchReadinessMessage } from '../../features/combined-order/dispatchReadiness';

type AdminSection = 'home' | 'pos' | 'catalog' | 'dishes' | 'shared-products' | 'receiving' | 'orders' | 'chats' | 'warehouse' | 'stocks' | 'team' | 'settings';
type SettingsSection =
  | 'hub'
  | 'profile'
  | 'taxonomy'
  | 'design'
  | 'catalog'
  | 'delivery'
  | 'hours'
  | 'payments'
  | 'password'
  | 'import'
  | 'backups'
  | 'danger';

const businessAdminSettingsSections = new Set<SettingsSection>([
  'profile',
  'taxonomy',
  'design',
  'catalog',
  'delivery',
  'hours',
  'payments',
  'password',
  'import',
  'backups',
  'danger'
]);

function resolveBusinessAdminRoutePath(routePath = ''): {
  section: AdminSection;
  settingsSection: SettingsSection;
} {
  const [rawSection = '', rawSettingsSection = ''] = routePath.split('/').filter(Boolean);
  const routeSections: Readonly<Record<string, AdminSection>> = {
    pos: 'pos',
    catalog: 'catalog',
    products: 'dishes',
    'shared-products': 'shared-products',
    receiving: 'receiving',
    orders: 'orders',
    chats: 'chats',
    warehouse: 'warehouse',
    stocks: 'stocks',
    team: 'team',
    settings: 'settings'
  };
  const section = routeSections[rawSection] ?? 'home';
  const settingsSection = section === 'settings' && businessAdminSettingsSections.has(rawSettingsSection as SettingsSection)
    ? rawSettingsSection as SettingsSection
    : 'hub';
  return { section, settingsSection };
}

function buildBusinessAdminRoutePath(slug: string, section: AdminSection, settingsSection: SettingsSection) {
  const sectionPath = section === 'home' ? '' : section === 'dishes' ? 'products' : section;
  const settingsPath = section === 'settings' && settingsSection !== 'hub' ? `/${settingsSection}` : '';
  return `/business/${slug}${sectionPath ? `/${sectionPath}` : ''}${settingsPath}`;
}
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

const baseNavItems: Array<{
  id: AdminSection;
  label: string;
  icon: typeof Home;
}> = [
  { id: 'home', label: 'Главная', icon: Home },
  { id: 'catalog', label: 'Каталог', icon: Store },
  { id: 'dishes', label: 'Блюда', icon: UtensilsCrossed },
  { id: 'orders', label: 'Заказы', icon: ShoppingBag },
  { id: 'stocks', label: 'Остатки', icon: Package },
  { id: 'settings', label: 'Настройки', icon: Settings }
];

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
  bankName: 'Банк получателя',
  lastName: 'Исаев',
  firstName: 'Магомед',
  middleName: '',
  displayName: 'Исаев Магомед',
  comment: 'Оплата заказа WayYaam',
  qrUrl: '',
  allowCash: true,
  allowTransfer: true,
  requireConfirmation: true,
  clientHint: 'Переведите сумму заведению и после оплаты нажмите "Я оплатил".'
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

function SectionButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Home; label: string; onClick: () => void }) {
  return (
    <button className="restaurant-admin-nav__item" type="button" data-active={active} onClick={onClick}>
      <Icon />
      <span>{label}</span>
    </button>
  );
}

export function RestaurantAdminShell({ access, routePath = '', onRefresh, onSignOut }: { access: CatalogAdminAccess; routePath?: string; onRefresh: () => void; onSignOut: () => void }) {
  const navigate = useNavigate();
  const isGrocery = access.catalog?.businessType === 'grocery';
  const workspaceAccess = getCatalogWorkspaceAccess({
    catalogRole: access.role,
    staffRole: access.staffRole
  });
  const initialRoute = resolveBusinessAdminRoutePath(routePath);
  const [section, setSection] = useState<AdminSection>(() => (
    workspaceAccess.isOrderWorker && !workspaceAccess.canSeeFullWorkspace
      ? (initialRoute.section === 'chats' ? 'chats' : 'orders')
      : initialRoute.section
  ));
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(initialRoute.settingsSection);
  const [catalogData, setCatalogData] = useState<CatalogData>({
    restaurant: isGrocery ? groceryRestaurant : demoRestaurant,
    categories: isGrocery ? groceryCategories : demoCategories,
    cabins: demoCabins,
    products: isGrocery ? groceryProducts : demoProducts,
    tags: [],
    theme: isGrocery ? groceryTheme : demoTheme,
    photoQuality: DEFAULT_PHOTO_QUALITY_SETTINGS
  });
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [orderAssignments, setOrderAssignments] = useState<CatalogOrderWorkAssignment[]>([]);
  const [moduleAccess, setModuleAccess] = useState<RestaurantAdminModuleAccess>({
    pos: 'disabled',
    warehouse: 'disabled'
  });
  const [inventoryMovements, setInventoryMovements] = useState<GroceryInventoryMovement[]>([]);
  const [productEditor, setProductEditor] = useState<{
    product: Product | null;
    barcode: string;
    intent: 'products' | 'receiving' | 'pos';
  } | null>(null);
  const [editorScannerOpen, setEditorScannerOpen] = useState(false);
  const [receivingAutoProduct, setReceivingAutoProduct] = useState<Product | null>(null);
  const [posAutoProduct, setPosAutoProduct] = useState<Product | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [ordersLoadError, setOrdersLoadError] = useState('');
  const [dishQuery, setDishQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [orderQuery, setOrderQuery] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [recentOrderIds, setRecentOrderIds] = useState<Set<string>>(() => new Set());
  const [stockDrafts, setStockDrafts] = useState<Record<string, number>>({});
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(() => readJson(paymentStorageKey(access.catalog?.slug ?? 'demo'), defaultPaymentSettings));
  const [paymentStatuses, setPaymentStatuses] = useState<Record<string, PaymentStatus>>(() => readJson(paymentStatusStorageKey(access.catalog?.slug ?? 'demo'), {}));
  const [deliverySettings, setDeliverySettings] = useState<RestaurantDeliverySettings>(defaultRestaurantDeliverySettings);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedOrdersRef = useRef(false);
  const [notificationPermission, setNotificationPermission] = useState(() => getRestaurantOrderNotificationPermission());

  const slug = access.catalog?.slug ?? 'demo';
  const terms = getBusinessTerms(access.catalog?.businessType);
  const groceryAccessMode = access.role === 'viewer' || !['active', 'trial'].includes(access.subscriptionStatus) ? 'read_only' : 'active';
  const publicUrl = useMemo(() => (access.catalog ? getCatalogPublicUrl(access.catalog.slug) : '#'), [access.catalog]);
  const navItems = useMemo(() => {
    if (!workspaceAccess.canSeeFullWorkspace) {
      return [
        {
          id: 'orders' as const,
          label: access.staffRole === 'manager' ? 'Очередь заказов' : 'Мои заказы',
          icon: ShoppingBag
        },
        { id: 'chats' as const, label: 'Чаты', icon: MessageCircle }
      ];
    }
    if (isGrocery) {
      const items: Array<{
        id: AdminSection;
        label: string;
        icon: typeof Home;
      }> = [
        { id: 'home', label: 'Главная', icon: Home },
        { id: 'pos', label: 'Касса', icon: Calculator },
        { id: 'dishes', label: 'Товары', icon: Package },
        { id: 'shared-products', label: 'База товаров', icon: Database },
        { id: 'receiving', label: 'Поступление', icon: ClipboardPlus },
        { id: 'orders', label: 'Заказы', icon: ShoppingBag },
        { id: 'chats', label: 'Чаты', icon: MessageCircle },
        { id: 'warehouse', label: 'Склад', icon: Package },
        { id: 'catalog', label: 'Витрина', icon: Store },
        { id: 'settings', label: 'Настройки', icon: Settings }
      ];
      if (workspaceAccess.canManageTeam) {
        items.splice(6, 0, { id: 'team', label: 'Команда', icon: Users });
      }
      return items;
    }
    const items = baseNavItems.map((item) => (item.id === 'dishes' ? { ...item, label: terms.items } : item));
    if (moduleAccess.pos !== 'disabled') {
      items.splice(1, 0, { id: 'pos', label: 'Касса', icon: Calculator });
    }
    if (moduleAccess.warehouse !== 'disabled') {
      const ordersIndex = items.findIndex((item) => item.id === 'orders');
      items.splice(ordersIndex + 1, 0, {
        id: 'warehouse',
        label: 'Склад',
        icon: Package
      });
    }
    const warehouseIndex = items.findIndex((item) => item.id === 'warehouse');
    const chatInsertIndex = warehouseIndex >= 0 ? warehouseIndex : items.findIndex((item) => item.id === 'stocks');
    if (workspaceAccess.canManageTeam) {
      items.splice(chatInsertIndex, 0, {
        id: 'team',
        label: 'Команда',
        icon: Users
      });
    }
    const chatIndex = items.findIndex((item) => item.id === 'warehouse');
    items.splice(chatIndex >= 0 ? chatIndex : items.findIndex((item) => item.id === 'stocks'), 0, {
      id: 'chats',
      label: 'Чаты',
      icon: MessageCircle
    });
    return items;
  }, [access.staffRole, isGrocery, moduleAccess.pos, moduleAccess.warehouse, terms.items, workspaceAccess.canManageTeam, workspaceAccess.canSeeFullWorkspace]);

  useEffect(() => {
    const nextRoute = resolveBusinessAdminRoutePath(routePath);
    if (workspaceAccess.isOrderWorker && !workspaceAccess.canSeeFullWorkspace) {
      setSection(nextRoute.section === 'chats' ? 'chats' : 'orders');
      setSettingsSection('hub');
      return;
    }
    setSection(navItems.some((item) => item.id === nextRoute.section) ? nextRoute.section : 'home');
    setSettingsSection(nextRoute.settingsSection);
  }, [navItems, routePath, workspaceAccess.canSeeFullWorkspace, workspaceAccess.isOrderWorker]);
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

  const refreshData = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setIsLoadingData(true);
        setOrdersLoadError('');
      }
      try {
        const catalogId = access.catalog?.id;
        const assignmentPromise = catalogId
          ? (async () => {
              if (workspaceAccess.canManageTeam || access.staffRole === 'manager') {
                await escalateCatalogOrderAssignments(catalogId);
              }
              return getCatalogOrderAssignments(catalogId);
            })()
          : Promise.resolve([]);
        const inventoryPromise = isGrocery && catalogId ? loadGroceryInventory(catalogId) : Promise.resolve({ items: [], movements: [] });
        const [catalog, restaurantOrders, assignments, inventory] = await Promise.all([loadCatalog(slug), getRestaurantOrders(slug), assignmentPromise, inventoryPromise]);
        const inventoryByProduct = new Map(inventory.items.map((item) => [item.productId, item]));
        const catalogMatchesBusinessType = (catalog.restaurant.business_type ?? 'restaurant') === access.catalog?.businessType;
        const useGroceryFallback = isGrocery && (access.userId === 'demo-owner' || !catalogMatchesBusinessType);
        const loadedProducts = useGroceryFallback ? groceryProducts : catalog.products.length ? catalog.products : isGrocery ? [] : demoProducts;
        setCatalogData({
          restaurant: useGroceryFallback
            ? {
                ...groceryRestaurant,
                name: access.catalog?.name || groceryRestaurant.name,
                subtitle: access.catalog?.description || groceryRestaurant.subtitle
              }
            : catalog.restaurant,
          categories: useGroceryFallback ? groceryCategories : catalog.categories.length ? catalog.categories : isGrocery ? [] : demoCategories,
          cabins: isGrocery ? [] : catalog.cabins.length ? catalog.cabins : demoCabins,
          products: loadedProducts.map((product) => {
            const inventoryItem = inventoryByProduct.get(product.id);
            return inventoryItem
              ? {
                  ...product,
                  cost_price: inventoryItem.costPrice,
                  minimum_stock: inventoryItem.minimumStock
                }
              : product;
          }),
          tags: catalog.tags,
          theme: useGroceryFallback ? groceryTheme : catalog.theme,
          photoQuality: catalog.photoQuality ?? DEFAULT_PHOTO_QUALITY_SETTINGS
        });
        setInventoryMovements(inventory.movements);
        const knownIds = knownOrderIdsRef.current;
        const newOrders = hasLoadedOrdersRef.current ? restaurantOrders.filter((order) => order.status === 'new' && !knownIds.has(order.id)) : [];
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
        setOrderAssignments(assignments);
        setSelectedOrderId((current) => current ?? (isGrocery ? null : restaurantOrders[0]?.id ?? null));
      } catch (error) {
        const message = error instanceof Error ? error.message : `Не удалось загрузить данные ${isGrocery ? 'магазина' : 'ресторана'}`;
        if (!options.silent) setOrdersLoadError(message);
        toast.error(message);
      } finally {
        setIsLoadingData(false);
      }
    },
    [access.catalog?.businessType, access.catalog?.description, access.catalog?.id, access.catalog?.name, access.staffRole, access.userId, isGrocery, slug, workspaceAccess.canManageTeam]
  );

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
    if (isGrocery) {
      setModuleAccess({ pos: groceryAccessMode, warehouse: groceryAccessMode });
      return;
    }
    if (!access.catalog?.id) return;
    let active = true;
    void getRestaurantModuleEntitlementByCatalog(access.catalog.id)
      .then((modules) => {
        if (!active) return;
        setModuleAccess(
          getRestaurantAdminModuleAccess({
            modules,
            status: access.subscriptionStatus,
            endsAt: access.subscriptionEndsAt
          })
        );
      })
      .catch((error) => {
        if (!active) return;
        setModuleAccess({ pos: 'disabled', warehouse: 'disabled' });
        toast.error(error instanceof Error ? error.message : 'Не удалось проверить доступ к POS');
      });
    return () => {
      active = false;
    };
  }, [access.catalog?.id, access.subscriptionEndsAt, access.subscriptionStatus, groceryAccessMode, isGrocery]);

  useEffect(() => subscribeToRestaurantOrdersRealtime(access.catalog?.id, () => void refreshData()), [access.catalog?.id, refreshData]);

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
  const filteredProducts = catalogData.products.filter((product) => {
    const matchesQuery = product.title.toLowerCase().includes(dishQuery.trim().toLowerCase());
    const matchesCategory = categoryFilter === 'all' || product.category_id === categoryFilter;
    return matchesQuery && matchesCategory;
  });
  const workerOrderIds = getVisibleAssignedOrderIds(orderAssignments);
  const roleVisibleOrders = access.staffRole === 'picker' ? orders.filter((order) => workerOrderIds.has(order.id)) : orders;
  const filteredOrders = roleVisibleOrders.filter((order) => {
    const text = `${order.orderNumber} ${order.clientName} ${order.clientPhone}`.toLowerCase();
    return text.includes(orderQuery.trim().toLowerCase());
  });
  const selectedOrder = roleVisibleOrders.find((order) => order.id === selectedOrderId)
    ?? (isGrocery ? null : filteredOrders[0] ?? roleVisibleOrders[0] ?? null);
  const selectedOrderAssignment = selectedOrder ? (orderAssignments.find((assignment) => assignment.orderId === selectedOrder.id && ['offered', 'accepted'].includes(assignment.state)) ?? null) : null;
  const businessChatItems = useMemo<OrderConversationInboxItem[]>(() => roleVisibleOrders.filter((order) => !isGroceryStorePosOrder(order, access.catalog?.businessType)).map((order) => ({
    orderId: order.id,
    catalogId: order.catalogId,
    orderNumber: order.orderNumber,
    merchantName: catalogData.restaurant.name || terms.place,
    merchantLabel: terms.place,
    customerName: order.clientName || 'Клиент',
    statusLabel: getAdminOrderStatusLabel(order.status, access.catalog?.businessType),
    orderStatus: order.status,
    estimatedMinutes: deliverySettings.default_preparation_minutes,
    createdAt: order.createdAt,
    totalLabel: formatPrice(order.total)
  })), [access.catalog?.businessType, catalogData.restaurant.name, deliverySettings.default_preparation_minutes, roleVisibleOrders, terms.place]);

  const goTo = (nextSection: AdminSection, nextSettingsSection: SettingsSection = 'hub') => {
    setSection(nextSection);
    setSettingsSection(nextSettingsSection);
    navigate(buildBusinessAdminRoutePath(slug, nextSection, nextSettingsSection));
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
      comment: [`POS: ${paymentLabel}`, draft.paymentMethod === 'cash' && draft.cashReceived > 0 ? `Получено: ${draft.cashReceived.toLocaleString('ru-RU')} ₽ · Сдача: ${draft.cashChange.toLocaleString('ru-RU')} ₽` : '', draft.cabinPrice > 0 ? `Цена кабинки: ${draft.cabinPrice.toLocaleString('ru-RU')} ₽` : '', draft.comment].filter(Boolean).join(' · ')
    });
    await refreshData({ silent: true });
    toast.success('POS-заказ добавлен в общий список заказов');
  };

  const openGroceryProductEditor = (intent: 'products' | 'receiving' | 'pos', product: Product | null = null, barcode = '') => {
    setProductEditor({ intent, product, barcode });
    if (!product && !barcode) {
      prepareBarcodeScanSound();
      setEditorScannerOpen(true);
    }
  };

  const saveGroceryProduct = async (product: Product) => {
    await saveProductToSupabase(product);
    if (access.catalog?.id) {
      await saveGroceryInventoryItem({
        catalogId: access.catalog.id,
        productId: product.id,
        costPrice: product.cost_price ?? 0,
        minimumStock: product.minimum_stock ?? 0
      });
    }
    setCatalogData((current) => ({
      ...current,
      products: current.products.some((item) => item.id === product.id) ? current.products.map((item) => (item.id === product.id ? product : item)) : [...current.products, product]
    }));
    if (productEditor?.intent === 'receiving') setReceivingAutoProduct(product);
    if (productEditor?.intent === 'pos') setPosAutoProduct(product);
    toast.success(productEditor?.product ? 'Карточка товара обновлена' : 'Товар добавлен');
  };

  const postReceiving = async (supplierName: string, note: string, lines: GroceryReceivingLineInput[]) => {
    if (!access.catalog?.id) throw new Error('Каталог магазина не найден');
    await postGroceryReceiving({
      catalogId: access.catalog.id,
      supplierName,
      note,
      lines
    });
    setCatalogData((current) => ({
      ...current,
      products: applyReceivingLines(current.products, lines)
    }));
    await refreshData({ silent: true });
    toast.success('Поступление проведено');
  };

  const submitGroceryPosOrder = async (lines: GroceryPosLine[], customerName: string, payment: GroceryPosPayment) => {
    const orderId = await createRestaurantOrderFromCart({
      slug,
      businessType: 'grocery',
      items: lines.map((line) =>
        line.product.sale_unit === 'weight'
          ? {
              product: line.product,
              quantity: 1,
              selected_weight: line.quantity / 1000
            }
          : { product: line.product, quantity: line.quantity }
      ),
      fulfillmentType: 'takeaway',
      customerName: customerName || 'Покупатель на кассе',
      comment: formatGroceryPosOrderComment(payment)
    });
    if (!orderId) throw new Error('Не удалось сохранить кассовую продажу');
    await completeGroceryPosOrder(orderId, slug);
    await refreshData({ silent: true });
    toast.success('Продажа сохранена в завершённых');
  };

  const updateOrderStatus = async (
    order: RestaurantOrder,
    status: RestaurantOrderStatus,
    readyMinutes?: MerchantReadyMinutes
  ) => {
    try {
      if (workspaceAccess.isOrderWorker && !workspaceAccess.canSeeFullWorkspace) {
        await updateCatalogAssignedOrderStatus({
          orderId: order.id,
          catalogId: order.catalogId,
          status
        });
      } else {
        await updateRestaurantOrderStatus(order, status, '', readyMinutes);
      }
      setOrders((current) => current.map((item) => (item.id === order.id ? {
        ...item,
        status,
        estimatedReadyAt:
          status === 'accepted' && readyMinutes
            ? new Date(Date.now() + readyMinutes * 60_000).toISOString()
            : item.estimatedReadyAt
      } : item)));
      toast.success('Статус заказа обновлён');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось обновить заказ');
    }
  };

  const acceptWorkAssignment = async (assignment: CatalogOrderWorkAssignment) => {
    try {
      const accepted = await acceptCatalogOrderAssignment(assignment.id, assignment.version);
      if (!accepted) throw new Error('Назначение уже изменилось. Обновите список заказов.');
      await refreshData({ silent: true });
      toast.success('Заказ принят в работу');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось принять заказ');
    }
  };

  const deleteOrder = async (order: RestaurantOrder) => {
    try {
      const deleted = await deleteRestaurantTestOrder(order);
      if (!deleted) throw new Error('Заказ уже удалён или не найден');
      setOrders((current) => current.filter((item) => item.id !== order.id));
      setSelectedOrderId((current) => (current === order.id ? null : current));
      setPaymentStatuses((current) => Object.fromEntries(Object.entries(current).filter(([orderId]) => orderId !== order.id)));
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
                status: restaurantPaymentStatus === 'confirmed' && item.status === 'waiting_payment_confirmation' ? 'payment_confirmed' : item.status
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
    persistCatalogChange({ restaurant }, `Профиль ${terms.placeGenitive} сохранён`);
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
    persistCatalogChange(
      {
        restaurant: payload.restaurant,
        categories: payload.categories,
        cabins: payload.cabins,
        products: payload.products,
        tags: payload.tags,
        theme: payload.theme
      },
      'Каталог импортирован'
    );
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
    <main
      className={[
        'restaurant-admin-shell',
        'business-workspace-shell',
        section === 'pos' ? 'business-workspace-shell--pos' : '',
        section === 'orders' && isGrocery ? 'business-workspace-shell--grocery-orders' : ''
      ].filter(Boolean).join(' ')}
      data-business-type={isGrocery ? 'grocery' : access.catalog?.businessType}
    >
      <aside className="restaurant-admin-sidebar business-workspace-sidebar">
        <BrandLogo compact />
        <nav aria-label="Разделы кабинета бизнеса">
          {navItems.map((item) => (
            <SectionButton key={item.id} active={section === item.id} icon={item.icon} label={item.label} onClick={() => goTo(item.id)} />
          ))}
        </nav>
      </aside>

      <div className="restaurant-admin-main business-workspace-main">
        <section className="business-workspace-hero">
          <div>
            <span>Панель: {terms.placeLower}</span>
            <h1>{catalogData.restaurant.name || terms.place}</h1>
            <p>{catalogData.restaurant.subtitle || `Управляйте ${terms.placeInstrumental}, каталогом и заказами`}</p>
          </div>
          <div className="business-workspace-hero__actions">
            <div className="business-workspace-hero__logo">
              {catalogData.restaurant.logo_url ? <img src={catalogData.restaurant.logo_url} alt="" /> : <Store />}
            </div>
            <button
              className="business-workspace-refresh"
              type="button"
              onClick={() => {
                onRefresh();
                void refreshData({ silent: true });
              }}
            >
              <RefreshCw />
              Обновить
            </button>
            {notificationPermission !== 'granted' && (
              <button className="business-workspace-notifications" type="button" onClick={enableOrderNotifications} aria-label="Включить уведомления">
                <Bell />
              </button>
            )}
          </div>
        </section>

        <section className="restaurant-admin-content business-workspace-content" aria-busy={isLoadingData}>
          {section === 'home' && <DashboardPage products={catalogData.products} categories={catalogData.categories} orders={orders} todayRevenue={revenue} terms={terms} isGrocery={isGrocery} onAddProduct={() => openGroceryProductEditor('products')} onNavigate={goTo} />}
          {section === 'pos' &&
            moduleAccess.pos !== 'disabled' &&
            (isGrocery ? (
              <GroceryPosPage storeName={catalogData.restaurant.name} categories={catalogData.categories} products={catalogData.products} paymentSettings={existingPaymentSettings} readOnly={groceryAccessMode === 'read_only'} autoAddProduct={posAutoProduct} onConsumeAutoAdd={() => setPosAutoProduct(null)} onCreateProduct={(barcode) => openGroceryProductEditor('pos', null, barcode)} onSubmit={submitGroceryPosOrder} />
            ) : (
              <RestaurantPosPage restaurantName={catalogData.restaurant.name} categories={catalogData.categories} cabins={catalogData.cabins} products={catalogData.products} accessMode={moduleAccess.pos} onSubmitOrder={submitPosOrder} />
            ))}
          {section === 'catalog' && <CatalogPreviewPage restaurant={catalogData.restaurant} categories={catalogData.categories} products={visibleProducts} theme={catalogData.theme} publicUrl={publicUrl} />}
          {section === 'dishes' &&
            (isGrocery ? (
              <GroceryProductsPage products={catalogData.products} categories={catalogData.categories} readOnly={groceryAccessMode === 'read_only'} publicUrl={publicUrl} onEdit={(product) => openGroceryProductEditor('products', product)} onCreate={(barcode) => openGroceryProductEditor('products', null, barcode)} onReceiving={() => goTo('receiving')} />
            ) : (
              <DishesPage
                products={filteredProducts}
                allProducts={catalogData.products}
                categories={catalogData.categories}
                query={dishQuery}
                categoryFilter={categoryFilter}
                terms={terms}
                onQueryChange={setDishQuery}
                onCategoryFilterChange={setCategoryFilter}
                onStocks={() => goTo('stocks')}
              />
            )
          )}
          {section === 'receiving' && isGrocery && (
            <GroceryReceivingPage
              products={catalogData.products}
              readOnly={groceryAccessMode === 'read_only'}
              autoAddProduct={receivingAutoProduct}
              onConsumeAutoAdd={() => setReceivingAutoProduct(null)}
              onCreateProduct={(barcode) => openGroceryProductEditor('receiving', null, barcode)}
              onPost={postReceiving}
            />
          )}
          {section === 'shared-products' && access.catalog?.businessType === 'grocery' && access.catalog.id && (
            <SharedProductCatalogPage mode="merchant" catalogId={access.catalog.id} />
          )}
          {section === 'orders' && (
            <OrdersPage
              orders={filteredOrders}
              products={catalogData.products}
              businessType={isGrocery ? 'grocery' : access.catalog?.businessType}
              selectedOrder={selectedOrder}
              selectedAssignment={selectedOrderAssignment}
              query={orderQuery}
              loading={isLoadingData}
              error={ordersLoadError}
              paymentSettings={paymentSettings}
              paymentStatuses={paymentStatuses}
              recentOrderIds={recentOrderIds}
              canDeleteOrders={access.legalActivationStatus !== 'active'}
              workerMode={workspaceAccess.isOrderWorker && !workspaceAccess.canSeeFullWorkspace}
              storeName={catalogData.restaurant.name || 'Магазин'}
              onQueryChange={setOrderQuery}
              onRefresh={() => void refreshData()}
              onSelectOrder={setSelectedOrderId}
              onStatusChange={updateOrderStatus}
              onPaymentStatusChange={setPaymentStatus}
              onDelete={deleteOrder}
              onAcceptAssignment={acceptWorkAssignment}
              onPickingChanged={() => void refreshData({ silent: true })}
              onOpenChat={(orderId) => {
                setSelectedOrderId(orderId);
                goTo('chats');
              }}
            />
          )}
          {section === 'chats' && (
            <OrderConversationInbox
              items={businessChatItems}
              expectedViewer="staff"
              selectedOrderId={selectedOrder?.id ?? null}
              onSelectedOrderChange={setSelectedOrderId}
              onChanged={() => void refreshData({ silent: true })}
            />
          )}
          {section === 'warehouse' && moduleAccess.warehouse !== 'disabled' && (
            isGrocery ? (
              <GroceryWarehousePage
                products={catalogData.products}
                movements={inventoryMovements}
                readOnly={groceryAccessMode === 'read_only'}
                onReceiving={() => goTo('receiving')}
                onEditProduct={(product) => openGroceryProductEditor('products', product)}
                onOpenSharedProducts={() => goTo('shared-products')}
              />
            ) : (
              <RestaurantWarehousePage
                restaurantName={catalogData.restaurant.name}
                accessMode={moduleAccess.warehouse}
              />
            )
          )}
          {section === 'stocks' && (
            <StocksPage
              products={catalogData.products}
              stockDrafts={stockDrafts}
              onStockDraftsChange={setStockDrafts}
            />
          )}
          {section === 'team' && workspaceAccess.canManageTeam && access.catalog?.id && (
            <CatalogTeamPage catalogId={access.catalog.id} />
          )}
          {section === 'settings' && (
            settingsSection === 'password' ? (
              <section className="ra-card catalog-admin-password">
                <KeyRound />
                <div>
                  <h2>Сменить пароль</h2>
                  <p>Используйте не менее 10 символов. После сохранения вход будет работать с новым паролем.</p>
                </div>
                <label>
                  Новый пароль
                  <input type="password" value={newPassword} minLength={10} autoComplete="new-password" onChange={(event) => setNewPassword(event.target.value)} />
                </label>
                <label>
                  Повторите пароль
                  <input type="password" value={confirmPassword} minLength={10} autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} />
                </label>
                <div className="catalog-admin-password__actions">
                  <button type="button" onClick={() => setSettingsSection('hub')}>
                    Назад
                  </button>
                  <button
                    type="button"
                    disabled={isSavingPassword || newPassword.length < 10 || newPassword !== confirmPassword}
                    onClick={() => {
                      setIsSavingPassword(true);
                      void changeCatalogAdminPassword(newPassword)
                        .then(() => {
                          setNewPassword('');
                          setConfirmPassword('');
                          setSettingsSection('hub');
                          toast.success('Пароль обновлён');
                        })
                        .catch((error) => toast.error(error instanceof Error ? error.message : 'Не удалось сменить пароль'))
                        .finally(() => setIsSavingPassword(false));
                    }}
                  >
                    {isSavingPassword ? 'Сохраняем...' : 'Сохранить пароль'}
                  </button>
                </div>
              </section>
            ) : (
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
                onChangePassword={() => setSettingsSection('password')}
                onActivate={() => navigate('/restaurant/activation')}
                legalActivationStatus={access.legalActivationStatus}
                businessType={access.catalog?.businessType}
              />
            ))}
        </section>
      </div>

      <nav className="restaurant-admin-bottom-nav">
        {navItems.map((item) => (
          <SectionButton key={item.id} active={section === item.id} icon={item.icon} label={item.label} onClick={() => goTo(item.id)} />
        ))}
      </nav>

      {isGrocery && productEditor && <GroceryProductEditor open product={productEditor.product} initialBarcode={productEditor.barcode} categories={catalogData.categories} barcodeExists={(barcode, exceptProductId) => catalogData.products.some((product) => product.id !== exceptProductId && product.barcode === barcode)} onRequestScan={() => {
        prepareBarcodeScanSound();
        setEditorScannerOpen(true);
      }} onClose={() => setProductEditor(null)} onSave={saveGroceryProduct} />}
      {isGrocery && editorScannerOpen && <SharedBarcodeScanner
        onClose={() => setEditorScannerOpen(false)}
        onDetected={(barcode) => {
          void preloadProductPhotoBackgroundRemoval();
          setProductEditor((current) => (current ? { ...current, barcode } : current));
          setEditorScannerOpen(false);
        }}
      />}
    </main>
  );
}

function DashboardPage({ products, categories, orders, todayRevenue, terms, isGrocery, onAddProduct, onNavigate }: { products: Product[]; categories: Category[]; orders: RestaurantOrder[]; todayRevenue: number; terms: BusinessTerms; isGrocery: boolean; onAddProduct: () => void; onNavigate: (section: AdminSection, settingsSection?: SettingsSection) => void }) {
  const currentMonth = new Date();
  const monthOrders = orders.filter((order) => {
    const createdAt = new Date(order.createdAt);
    return createdAt.getFullYear() === currentMonth.getFullYear() && createdAt.getMonth() === currentMonth.getMonth();
  });
  const completedMonthOrders = monthOrders.filter((order) => !['cancelled', 'canceled'].includes(order.status));
  const monthRevenue = completedMonthOrders.reduce((total, order) => total + order.total, 0);
  const averageOrder = completedMonthOrders.length ? Math.round(monthRevenue / completedMonthOrders.length) : 0;
  const activeOrders = orders.filter((order) => !['completed', 'delivered', 'cancelled', 'canceled'].includes(order.status));

  return (
    <div className="ra-page-stack business-dashboard">
      <section className="business-dashboard-finance">
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
          <article>
            <span>Средний чек</span>
            <strong>{formatPrice(averageOrder)}</strong>
            <CreditCard />
          </article>
        </div>
        <p>{products.length} {terms.items.toLocaleLowerCase('ru-RU')} · {categories.length} категорий</p>
      </section>
      <section className="business-dashboard-today">
        <div>
          <span>Сегодня</span>
          <strong>{formatPrice(todayRevenue)}</strong>
          <small>• {todayOrders(orders).length} заказов сегодня</small>
          <small>• {activeOrders.length} активных</small>
        </div>
        <button type="button" onClick={() => onNavigate('orders')}>
          <ClipboardList />
          Заказы
          <ArrowRight />
        </button>
      </section>
      <section className="ra-quick-actions">
        <button type="button" onClick={() => (isGrocery ? onAddProduct() : toast.info(`${terms.addItem}: форма откроется в существующем модуле`))}>
          <Plus />
          {terms.addItem}
        </button>
        <button type="button" onClick={() => onNavigate(isGrocery ? 'receiving' : 'stocks')}>
          {isGrocery ? <ClipboardPlus /> : <Package />}
          {isGrocery ? 'Новое поступление' : 'Обновить остатки'}
        </button>
        {isGrocery && (
          <button type="button" onClick={() => onNavigate('warehouse')}>
            <Package />
            Открыть склад
          </button>
        )}
        <button type="button" onClick={() => onNavigate('settings', 'profile')}>
          <Settings />
          Настройки {terms.placeGenitive}
        </button>
        <button type="button" onClick={() => onNavigate('settings', 'import')}>
          <Upload />
          Импорт / Экспорт
        </button>
      </section>
    </div>
  );
}

function CatalogPreviewPage({ restaurant, categories, products, theme, publicUrl }: { restaurant: Restaurant; categories: Category[]; products: Product[]; theme: ThemeSettings; publicUrl: string }) {
  const previewStyle = {
    '--catalog-bg': theme.background_type === 'gradient' ? `linear-gradient(145deg, ${theme.background_gradient_from}, ${theme.background_gradient_to})` : theme.background_color,
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
        <a href={publicUrl} target="_blank" rel="noreferrer">
          <Eye />
          Открыть публично
        </a>
      </section>
      <section className="ra-client-preview" style={previewStyle}>
        <header>
          <button type="button" aria-label="Меню">
            <Menu />
          </button>
          <div>
            <h2>{restaurant.name}</h2>
            <p>{restaurant.subtitle}</p>
          </div>
          <button type="button" aria-label="Поиск">
            <Search />
          </button>
        </header>
        <nav>
          {categories
            .filter((category) => category.kind !== 'space')
            .slice(0, 8)
            .map((category) => (
              <button type="button" key={category.id}>
                {category.name}
              </button>
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
                <button type="button" aria-label="Редактировать">
                  <Pencil />
                </button>
                <button type="button" aria-label="Скрыть">
                  <EyeOff />
                </button>
                <button type="button" aria-label="Удалить">
                  <Trash2 />
                </button>
              </div>
              <h4>{product.title}</h4>
              <strong>{formatPrice(product.price)}</strong>
              <small>Остаток: {getProductStock(product)}</small>
              <button type="button" aria-label="Добавить">
                <Plus />
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function DishesPage({ products, allProducts, categories, query, categoryFilter, terms, onQueryChange, onCategoryFilterChange, onStocks }: { products: Product[]; allProducts: Product[]; categories: Category[]; query: string; categoryFilter: string; terms: BusinessTerms; onQueryChange: (query: string) => void; onCategoryFilterChange: (categoryId: string) => void; onStocks: () => void }) {
  return (
    <div className="ra-page-stack">
      <section className="ra-list-toolbar">
        <label>
          <Search />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={`Поиск: ${terms.items.toLowerCase()}`} />
        </label>
        <select value={categoryFilter} onChange={(event) => onCategoryFilterChange(event.target.value)}>
          <option value="all">Все категории</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <button type="button">
          <Tags />
          Все метки
        </button>
        <button type="button" onClick={() => toast.info(`${terms.addItem}: открываем существующую форму каталога`)}>
          <Plus />
          {terms.addItem}
        </button>
      </section>
      <section className="ra-table ra-dishes-table">
        <div className="ra-table__head">
          <span>{terms.item}</span>
          <span>Категория</span>
          <span>Цена</span>
          <span>Остаток</span>
          <span>Метки</span>
          <span>Действия</span>
        </div>
        {products.map((product) => (
          <article key={product.id}>
            <span>
              <img src={product.image_url} alt="" />
              <strong>{product.title}</strong>
            </span>
            <span>{getCategoryName(categories, product)}</span>
            <span>{formatPrice(product.price)}</span>
            <span>{getProductStock(product)}</span>
            <span className="ra-tags">
              {product.is_hit && <em>Хит</em>}
              {product.is_new && <em>Новинка</em>}
              {product.is_popular && <em>Популярное</em>}
            </span>
            <span>
              <button type="button" aria-label="Редактировать">
                <Pencil />
              </button>
              <button type="button" aria-label="Остаток" onClick={onStocks}>
                <Package />
              </button>
              <button type="button" aria-label="Ещё">
                <MoreVertical />
              </button>
            </span>
          </article>
        ))}
      </section>
      <small className="ra-footnote">
        Показано {products.length} из {allProducts.length}
      </small>
    </div>
  );
}

function OrdersPage({
  orders,
  products,
  businessType,
  selectedOrder,
  selectedAssignment,
  query,
  loading,
  error,
  paymentSettings,
  paymentStatuses,
  recentOrderIds,
  canDeleteOrders,
  workerMode,
  storeName,
  onQueryChange,
  onRefresh,
  onSelectOrder,
  onStatusChange,
  onPaymentStatusChange,
  onDelete,
  onAcceptAssignment,
  onPickingChanged,
  onOpenChat
}: {
  orders: RestaurantOrder[];
  products: Product[];
  businessType?: string;
  selectedOrder: RestaurantOrder | null;
  selectedAssignment: CatalogOrderWorkAssignment | null;
  query: string;
  loading: boolean;
  error: string;
  paymentSettings: PaymentSettings;
  paymentStatuses: Record<string, PaymentStatus>;
  recentOrderIds: Set<string>;
  canDeleteOrders: boolean;
  workerMode: boolean;
  storeName: string;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
  onSelectOrder: (id: string) => void;
  onStatusChange: (
    order: RestaurantOrder,
    status: RestaurantOrderStatus,
    readyMinutes?: MerchantReadyMinutes
  ) => Promise<void>;
  onPaymentStatusChange: (orderId: string, status: PaymentStatus) => void;
  onDelete: (order: RestaurantOrder) => Promise<void>;
  onAcceptAssignment: (assignment: CatalogOrderWorkAssignment) => Promise<void>;
  onPickingChanged: () => void;
  onOpenChat: (orderId: string) => void;
}) {
  if (businessType === 'grocery') {
    if (selectedOrder) {
      return (
        <StoreOrderPickingPage
          order={selectedOrder}
          products={products}
          storeName={storeName}
          canPick={!workerMode || selectedAssignment?.state === 'accepted'}
          onBack={() => onSelectOrder('')}
          onStatusChange={(status) => onStatusChange(selectedOrder, status)}
          onPickingChanged={onPickingChanged}
          onOpenChat={() => onOpenChat(selectedOrder.id)}
        />
      );
    }

    return (
      <StoreOrderQueue
        orders={orders}
        query={query}
        loading={loading}
        error={error}
        onQueryChange={onQueryChange}
        onRefresh={onRefresh}
        onSelectOrder={onSelectOrder}
        onAcceptOrder={(order) => onStatusChange(order, 'accepted', 15)}
      />
    );
  }

  return (
    <div className="ra-orders-layout">
      <section className="ra-page-stack">
        <div className="ra-list-toolbar">
          <label>
            <Search />
            <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Поиск заказа по номеру, имени или телефону" />
          </label>
        </div>
        <RestaurantOrdersBoard orders={orders} selectedOrderId={selectedOrder?.id ?? null} recentOrderIds={recentOrderIds} businessType={businessType} onSelectOrder={onSelectOrder} />
      </section>
      {selectedOrder && (
        <OrderDetails order={selectedOrder} products={products} businessType={businessType} assignment={selectedAssignment} paymentSettings={paymentSettings} paymentStatus={paymentStatuses[selectedOrder.id] ?? toLocalPaymentStatus(selectedOrder.paymentStatus)} onStatusChange={onStatusChange} onPaymentStatusChange={onPaymentStatusChange} onDelete={onDelete} canDeleteOrders={canDeleteOrders} workerMode={workerMode} onAcceptAssignment={onAcceptAssignment} onPickingChanged={onPickingChanged} onOpenChat={onOpenChat} />
      )}
    </div>
  );
}

function CombinedDeliveryDispatchAction({
  order,
  onDispatch
}: {
  order: RestaurantOrder;
  onDispatch: () => void;
}) {
  const readinessQuery = useQuery({
    queryKey: ['combined-order-dispatch-readiness', order.id, order.catalogId, order.orderGroupId],
    queryFn: () => getCombinedOrderDispatchReadiness(order),
    refetchInterval: 5_000,
    staleTime: 2_000
  });
  const readiness = readinessQuery.data;
  const blocked = readinessQuery.isLoading || readinessQuery.isError || !readiness?.canDispatch;
  const message = readiness
    ? getCombinedDispatchReadinessMessage(readiness)
    : 'Проверяем готовность всех заказов…';

  return (
    <>
      <button
        type="button"
        disabled={['waiting_confirmation', 'rejected'].includes(order.paymentStatus) || blocked}
        onClick={onDispatch}
      >
        Вызвать доставку
      </button>
      <p className="ra-order-actions__readiness" data-blocked={blocked || undefined}>
        {message}
      </p>
    </>
  );
}

export function OrderDetails({
  order,
  products,
  businessType,
  assignment,
  paymentSettings,
  paymentStatus,
  onStatusChange,
  onPaymentStatusChange,
  canDeleteOrders,
  workerMode,
  onDelete,
  onAcceptAssignment,
  onPickingChanged,
  onOpenChat
}: {
  order: RestaurantOrder;
  products: Product[];
  businessType?: string;
  assignment: CatalogOrderWorkAssignment | null;
  paymentSettings: PaymentSettings;
  paymentStatus: PaymentStatus;
  onStatusChange: (
    order: RestaurantOrder,
    status: RestaurantOrderStatus,
    readyMinutes?: MerchantReadyMinutes
  ) => Promise<void>;
  onPaymentStatusChange: (orderId: string, status: PaymentStatus) => void;
  canDeleteOrders: boolean;
  workerMode: boolean;
  onDelete: (order: RestaurantOrder) => Promise<void>;
  onAcceptAssignment: (assignment: CatalogOrderWorkAssignment) => Promise<void>;
  onPickingChanged: () => void;
  onOpenChat: (orderId: string) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [readyMinutes, setReadyMinutes] = useState<MerchantReadyMinutes>(15);
  const capabilities = getBusinessOrderCapabilities(businessType);
  const isGroceryBusiness = businessType === 'grocery';
  const storePosOrder = isGroceryStorePosOrder(order, businessType);
  const groceryCashOrder = isGroceryBusiness && getOrderPaymentMethod(order.comment) === 'cash';
  const visibleOrderComment = getVisibleAdminOrderComment(order.comment);
  const orderLocation = getAdminOrderLocationLabel(order, businessType);
  const customerPhoneHref = getAdminOrderPhoneHref(order.clientPhone);
  const customerWhatsAppHref = getAdminOrderWhatsAppHref(order.clientPhone);
  const driverPhoneHref = getAdminOrderPhoneHref(order.driverPhone ?? '');
  const driverWhatsAppHref = getAdminOrderWhatsAppHref(order.driverPhone ?? '');
  const paymentStatusLabel = storePosOrder
    ? 'Оплачено на кассе'
    : getBusinessPaymentStatusLabel(orderPaymentStatusLabels[order.paymentStatus], businessType);
  const localPaymentStatusLabel = getBusinessPaymentStatusLabel(paymentStatusLabels[paymentStatus], businessType);
  const paymentSummary = formatAdminPaymentSummary(
    storePosOrder ? 'Продажа оплачена' : groceryCashOrder ? 'Наличными на кассе' : localPaymentStatusLabel,
    paymentStatusLabel
  );
  const deleteOrder = async () => {
    if (isDeleting || !window.confirm('Удалить заказ? Это действие нельзя отменить.')) return;
    setIsDeleting(true);
    try {
      await onDelete(order);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    setIsChatOpen(false);
    setReadyMinutes(15);
  }, [order.id]);
  const orderActions =
    !storePosOrder && (!workerMode || assignment?.state === 'accepted') ? (
      <>
        {order.status === 'new' && !workerMode && (
          <MerchantReadyEstimatePicker value={readyMinutes} onChange={setReadyMinutes} />
        )}
        <div className="ra-order-actions ra-order-actions--top" aria-label="Действия с заказом">
        {order.status === 'new' && (
          <button type="button" onClick={() => onStatusChange(order, 'accepted', readyMinutes)}>
            Принять
          </button>
        )}
        {['accepted', 'confirmed'].includes(order.status) && (
          <button type="button" onClick={() => onStatusChange(order, 'preparing')}>
            {capabilities.startWorkLabel}
          </button>
        )}
        {order.status === 'preparing' && (
          <button type="button" onClick={() => onStatusChange(order, 'ready')}>
            {capabilities.readyLabel}
          </button>
        )}
        {!workerMode && order.status === 'ready' && order.fulfillmentType === 'delivery' && (
          order.orderGroupId ? (
            <CombinedDeliveryDispatchAction
              order={order}
              onDispatch={() => onStatusChange(order, 'waiting_driver')}
            />
          ) : (
            <button
              type="button"
              disabled={['waiting_confirmation', 'rejected'].includes(order.paymentStatus)}
              onClick={() => onStatusChange(order, 'waiting_driver')}
            >
              Вызвать доставку
            </button>
          )
        )}
        {order.status === 'ready' && order.fulfillmentType !== 'delivery' && (
          <button type="button" onClick={() => onStatusChange(order, 'completed')}>
            Завершить
          </button>
        )}
        {!workerMode && !order.orderGroupId && order.status === 'waiting_driver' && (
          <button type="button" onClick={() => onStatusChange(order, 'on_the_way')}>
            Передано водителю
          </button>
        )}
        {!workerMode && !order.orderGroupId && order.status === 'on_the_way' && (
          <button type="button" onClick={() => onStatusChange(order, 'delivered')}>
            Доставлен
          </button>
        )}
        {order.status === 'new' && (
          <button type="button" onClick={() => onStatusChange(order, 'cancelled')}>
            Отклонить
          </button>
        )}
        {!workerMode && (order.isTestOrder || canDeleteOrders) && (
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
      </>
    ) : null;

  return (
    <aside className="admin-order-details-panel ra-business-compact-order">
      <section className="admin-order-work-card">
        <header className="ra-business-compact-order__header">
          <div>
            <small>Заказ #{order.orderNumber}</small>
            <h2>{getAdminOrderStatusLabel(order.status, businessType)}</h2>
          </div>
          <div className="ra-business-compact-order__total">
            <strong>{formatPrice(order.total)}</strong>
            <small>{order.items.length} поз.</small>
          </div>
          <em data-tone={orderStatusTones[order.status]}>{getAdminOrderStatusLabel(order.status, businessType)}</em>
        </header>
        {storePosOrder && (
          <p className="ra-order-store-sale-note">Продажа оформлена в магазине и не требует сборки или переписки.</p>
        )}
        {!storePosOrder && assignment && (
          <section className="ra-payment-box">
            <h3>
              <Users />
              Ответственный
            </h3>
            <p>{assignment.isMine ? 'Назначено вам' : assignment.assigneeName}</p>
            {assignment.state === 'offered' && assignment.isMine && (
              <button type="button" onClick={() => void onAcceptAssignment(assignment)}>
                Принять в работу
              </button>
            )}
            {assignment.state === 'accepted' && <small>Заказ принят в работу</small>}
          </section>
        )}
        {order.estimatedReadyAt && !['completed', 'delivered', 'cancelled', 'canceled'].includes(order.status) && (
          <p className="merchant-ready-estimate__saved">
            Ожидаемая готовность: {new Date(order.estimatedReadyAt).toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        )}
        <section className="admin-order-facts">
          <article>
            <Truck />
            <span>{getAdminOrderFulfillmentLabel(order, businessType)}</span>
            <strong>{orderLocation}</strong>
            <small>
              {new Date(order.createdAt).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </small>
          </article>
          <article>
            <User />
            <span>{capabilities.customerLabel}</span>
            <strong>{order.clientName || capabilities.customerLabel}</strong>
            <small>{order.clientPhone || 'Телефон не указан'}</small>
          </article>
          <article>
            <MapPin />
            <span>Адрес</span>
            <strong>{orderLocation}</strong>
            <small>
              {order.fulfillmentType === 'delivery'
                ? 'Адрес доставки'
                : getAdminOrderFulfillmentLabel(order, businessType)}
            </small>
          </article>
        </section>

        <section className="admin-order-person-cards">
          <details className="admin-order-person-card">
            <summary>
              <span className="admin-order-person-card__avatar">
                <User />
              </span>
              <span>
                <small>Данные: {capabilities.customerLabel.toLocaleLowerCase('ru-RU')}</small>
                <strong>{order.clientName || capabilities.customerLabel}</strong>
                <small>{order.clientPhone || 'Телефон не указан'}</small>
              </span>
              <ArrowRight />
            </summary>
            <div className="admin-order-person-card__body">
              <p>
                <MapPin />
                {orderLocation}
              </p>
              <div>
                {customerPhoneHref && <a href={customerPhoneHref}>Позвонить</a>}
                {customerWhatsAppHref && (
                  <a href={customerWhatsAppHref} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          </details>
          {order.driverName ? (
            <details className="admin-order-person-card admin-order-person-card--driver">
              <summary>
                <span className="admin-order-person-card__avatar">
                  <Truck />
                </span>
                <span>
                  <small>Данные водителя</small>
                  <strong>{order.driverName}</strong>
                  <small>
                    {[order.driverVehicleInfo, order.driverCarNumber].filter(Boolean).join(' · ') ||
                      order.driverPhone ||
                      'Автомобиль не указан'}
                  </small>
                </span>
                <ArrowRight />
              </summary>
              <div className="admin-order-person-card__body">
                <p>{order.driverPhone || 'Телефон не указан'}</p>
                <div>
                  {driverPhoneHref && <a href={driverPhoneHref}>Позвонить</a>}
                  {driverWhatsAppHref && (
                    <a href={driverWhatsAppHref} target="_blank" rel="noreferrer">
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            </details>
          ) : order.fulfillmentType === 'delivery' ? (
            <article className="admin-order-person-card admin-order-person-card--empty">
              <span className="admin-order-person-card__avatar">
                <Truck />
              </span>
              <span>
                <small>Данные водителя</small>
                <strong>Водитель не назначен</strong>
                <small>Появится после назначения</small>
              </span>
            </article>
          ) : null}
        </section>

        {visibleOrderComment && <p className="admin-order-comment">{visibleOrderComment}</p>}

        <dl className="ra-business-order-meta">
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
          {order.fulfillmentType === 'delivery' &&
            order.deliveryLat !== null &&
            order.deliveryLng !== null &&
            order.restaurantLat !== null &&
            order.restaurantLng !== null && (
              <section className="ra-payment-box">
                <h3>
                  <MapPin />
                  Карта доставки
                </h3>
                <DeliveryTrackingMap
                  restaurant={{
                    lat: order.restaurantLat,
                    lng: order.restaurantLng,
                    label: isGroceryBusiness ? 'Магазин' : 'Ресторан',
                    address: order.restaurantAddress
                  }}
                  client={{
                    lat: order.deliveryLat,
                    lng: order.deliveryLng,
                    label: order.clientName || 'Клиент',
                    address: order.deliveryAddress
                  }}
                  driver={
                    order.driverLat !== null && order.driverLng !== null
                      ? {
                          lat: order.driverLat,
                          lng: order.driverLng,
                          label: order.driverName || 'Водитель'
                        }
                      : null
                  }
                />
                <a
                  className="ra-order-map-link"
                  href={buildYandexMapsRouteUrl({
                    from: {
                      lat: order.restaurantLat,
                      lng: order.restaurantLng,
                      address: order.restaurantAddress
                    },
                    to: {
                      lat: order.deliveryLat,
                      lng: order.deliveryLng,
                      address: order.deliveryAddress
                    }
                  })}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть маршрут в Яндекс Картах
                </a>
              </section>
            )}
          {order.fulfillmentType === 'delivery' && order.restaurantAddress && (
            <div>
              <dt>{isGroceryBusiness ? 'Точка магазина' : 'Точка ресторана'}</dt>
              <dd>{order.restaurantAddress}</dd>
            </div>
          )}
          <div>
            <dt>Оплата</dt>
            <dd>{paymentStatusLabel}</dd>
          </div>
          {order.fulfillmentType === 'delivery' && (
            <div>
              <dt>Доставка</dt>
              <dd>{order.deliveryStatus}</dd>
            </div>
          )}
          {order.driverName && (
            <div>
              <dt>Водитель</dt>
              <dd>
                {order.driverName} · {order.driverPhone || 'телефон не указан'}
              </dd>
            </div>
          )}
        </dl>
        <section className="admin-order-composition">
          <h2>Состав заказа</h2>
          <div className="admin-order-items">
            {order.items.map((item) => (
              <div key={item.id}>
                <span>{item.title}</span>
                <small>{formatAdminOrderItemQuantity(item, businessType)}</small>
                <strong>{formatPrice(item.lineTotal)}</strong>
              </div>
            ))}
          </div>
          <div className="admin-order-total">
            <span>Итого</span>
            <strong>{formatPrice(order.total)}</strong>
          </div>
        </section>
        {businessType === 'grocery' && !storePosOrder && (
          <GroceryPickingPanel
            items={order.items}
            products={products}
            canPick={!workerMode || assignment?.state === 'accepted'}
            onChanged={onPickingChanged}
          />
        )}
        {!storePosOrder && (
          <>
            <button
              className="admin-order-chat-toggle"
              type="button"
              aria-expanded={isChatOpen}
              aria-controls={`business-order-chat-${order.id}`}
              onClick={() => setIsChatOpen((isOpen) => !isOpen)}
            >
              <MessageCircle /> {isChatOpen ? 'Скрыть чат заказа' : 'Открыть чат заказа'}
            </button>
            {isChatOpen && (
              <div id={`business-order-chat-${order.id}`}>
                <OrderConversationPanel
                  orderId={order.id}
                  catalogId={order.catalogId}
                  expectedViewer="staff"
                  merchantLabel={capabilities.merchantLabel}
                  orderStatus={order.status}
                  onChanged={onPickingChanged}
                />
              </div>
            )}
            <button className="ra-order-chat-button" type="button" onClick={() => onOpenChat(order.id)}>
              Все чаты по заказам
            </button>
          </>
        )}
        {!workerMode && (
          <section className="ra-payment-box">
            <h3>
              <WalletCards />
              Оплата
            </h3>
            <p>{paymentSummary}</p>
            <dl>
              <div>
                <dt>Способ</dt>
                <dd>{groceryCashOrder ? 'Наличные' : `Перевод ${isGroceryBusiness ? 'магазину' : 'ресторану'}`}</dd>
              </div>
              {!groceryCashOrder && (
                <div>
                  <dt>Получатель</dt>
                  <dd>{paymentSettings.displayName}</dd>
                </div>
              )}
              {!groceryCashOrder && (
                <div>
                  <dt>Номер</dt>
                  <dd>{paymentSettings.transferNumber}</dd>
                </div>
              )}
            </dl>
            {!groceryCashOrder && (
              <div>
                <button type="button" onClick={() => onPaymentStatusChange(order.id, 'confirmed')}>
                  Подтвердить оплату
                </button>
                <button type="button" onClick={() => onPaymentStatusChange(order.id, 'declined')}>
                  Отклонить
                </button>
              </div>
            )}
          </section>
        )}
        {order.fulfillmentType === 'delivery' && (
          <section className="ra-payment-box">
            <h3>
              <QrCode />
              Выдача водителю
            </h3>
            <p>{order.driverName ? `${order.driverName} назначен на заказ` : 'Водитель ещё не назначен'}</p>
            <dl>
              <div>
                <dt>QR</dt>
                <dd>{order.qrToken ? 'Будет проверен сканером' : 'Создаётся при назначении доставки'}</dd>
              </div>
              <div>
                <dt>Статус</dt>
                <dd>{order.deliveryStatus}</dd>
              </div>
            </dl>
          </section>
        )}
        {orderActions}
      </section>
    </aside>
  );
}

function StocksPage({ products, stockDrafts, onStockDraftsChange }: { products: Product[]; stockDrafts: Record<string, number>; onStockDraftsChange: (drafts: Record<string, number>) => void }) {
  const setDraft = (product: Product, value: number) => {
    onStockDraftsChange({ ...stockDrafts, [product.id]: Math.max(0, value) });
  };

  return (
    <div className="ra-page-stack">
      <section className="ra-stock-note">
        <p>Задайте остаток на день. Кнопка -1 меняет текущий остаток, а здесь хранится дневная норма.</p>
        <button type="button" onClick={() => toast.success('Остатки обновлены полностью')}>
          Обновить полностью
        </button>
      </section>
      <section className="ra-stock-list">
        {products.map((product) => {
          const current = stockDrafts[product.id] ?? getProductStock(product);
          return (
            <article key={product.id}>
              <img src={product.image_url} alt="" />
              <div>
                <strong>{product.title}</strong>
                <small>Сейчас осталось: {getProductStock(product)}</small>
              </div>
              <label>
                Норма на день
                <input type="number" value={current} onChange={(event) => setDraft(product, Number(event.target.value))} />
              </label>
              <button type="button" onClick={() => setDraft(product, current - 1)}>
                -1
              </button>
              <button type="button" onClick={() => toast.success(`${product.title}: остаток обновлён`)}>
                Обновить
              </button>
            </article>
          );
        })}
      </section>
    </div>
  );
}
