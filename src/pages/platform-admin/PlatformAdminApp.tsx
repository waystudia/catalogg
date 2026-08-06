import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  BadgePercent,
  BookOpen,
  Boxes,
  CakeSlice,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Coffee,
  CreditCard,
  Database,
  Eye,
  FileText,
  Filter,
  GripVertical,
  Headphones,
  Home,
  Image as ImageIcon,
  KeyRound,
  LayoutTemplate,
  LogOut,
  MapPin,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCcw,
  Route,
  Search,
  Save,
  Settings,
  ShieldAlert,
  Store,
  Trash2,
  Trophy,
  Ticket,
  Truck,
  Upload,
  UserRound,
  Users,
  WalletCards,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import {
  createClient,
  deletePlatformContestTicket,
  deletePlatformBanner,
  getClients,
  getPlatformContestTickets,
  getPlatformAnalytics,
  getPlatformBanners,
  getPlatformGlobalSettings,
  getPlatformStats,
  savePlatformBanner,
  savePlatformGlobalSettings,
  uploadPlatformBannerMedia,
  updateClient
} from '../../shared/api/clientsApi';
import { createDriver, getDrivers, updateDriverProfile, updateDriverServiceSettlements } from '../../shared/api/driversApi';
import { legalDocumentReleases, legalDocuments } from '../../shared/legalDocuments';
import { getDeliverySettlements } from '../../shared/api/settlementsApi';
import {
  getDeliveryPriceRequests,
  getDeliveryPricingRules,
  reviewDeliveryPriceRequest,
  saveDeliveryPricingRule
} from '../../shared/api/deliveryPricingApi';
import {
  getPlatformBillingSettings,
  getPlatformCustomTariffs,
  getSubscriptions,
  savePlatformBillingSettings,
  savePlatformCustomTariff
} from '../../shared/api/subscriptionsApi';
import {
  deletePlatformContentPage,
  getContentPageClientPath,
  getPlatformContentPages,
  savePlatformContentPage
} from '../../shared/api/platformContentApi';
import { getPlatformAdminAccess, signOutPlatformAdmin } from '../../shared/api/platformAdminApi';
import type {
  PlatformDriver,
  PlatformBannerAdmin,
  PlatformClient,
  PlatformBillingSettings,
  PlatformContestTicket,
  PlatformAnalytics,
  PlatformStats,
  PlatformTemplateOption,
  PlatformContentBlock,
  PlatformContentBlockType,
  PlatformContentPage,
  PlatformGlobalSettings,
  SubscriptionRow
} from '../../shared/api/platformTypes';
import {
  getPlatformContentPath,
  normalizeContentSlug,
  validatePlatformBannerTarget
} from '../../shared/platformContent';
import { PlatformGeographyPage } from '../../features/platform-admin-geography/PlatformGeographyPage';
import { PlatformUsersPage } from '../../features/platform-admin-users/PlatformUsersPage';
import { PlatformDriversPage } from '../../features/platform-admin-drivers/PlatformDriversPage';
import { PlatformContestsPage } from '../../features/platform-admin-contests/PlatformContestsPage';
import { PlatformTemplatesPage } from '../../features/platform-admin-templates/PlatformTemplatesPage';
import { PlatformAsphaltRoadsPage } from '../../features/platform-admin-roads/PlatformAsphaltRoadsPage';
import { PlatformReviewsRoute } from '../../features/platform-admin-reviews/PlatformReviewsPage';
import { PlatformRestaurantModulesPage } from '../../features/platform-admin-modules/PlatformRestaurantModulesPage';
import {
  getRestaurantModuleEntitlementByCatalog,
  saveRestaurantModuleEntitlement,
  type RestaurantModuleEntitlement
} from '../../shared/api/restaurantModulesApi';
import { getTemplateOptions } from '../../shared/api/templatesApi';
import { copyText, getCatalogAdminUrl, getCatalogPublicUrl } from '../../shared/platformUrls';
import {
  getRestaurantOrderNotificationPermission,
  requestRestaurantOrderNotificationPermission,
  restoreRestaurantOrderNotificationSubscription
} from '../../shared/restaurantOrderNotifications';
import { redirectToClientHome } from '../../shared/appNavigation';
import { confirmRoleSignOut } from '../../shared/roleSessionSafety';
import {
  createClientSchema,
  createSlug,
  generateSecurePassword,
  normalizeSlugInput,
  type CreateClientFormValues
} from '../../shared/validation/clientCredentials';
import './platform-admin.css';

type PlatformRoute =
  | 'dashboard'
  | 'clients'
  | 'client-signups'
  | 'settlements'
  | 'roads'
  | 'drivers'
  | 'reviews'
  | 'catalogs'
  | 'templates'
  | 'import-export'
  | 'contests'
  | 'subscriptions'
  | 'settings'
  | 'audit-log'
  | 'analytics';

type CreateClientSuccess = {
  email: string;
  password: string;
  publicUrl: string;
  adminUrl: string;
};

type CreateDriverSuccess = {
  email: string;
  password: string;
  driverId: string;
};

const platformQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always'
    }
  }
});

const navItems: Array<{ route: PlatformRoute; label: string; detail: string; Icon: typeof Home }> = [
  { route: 'dashboard', label: 'Главная', detail: 'Дашборд', Icon: Home },
  { route: 'clients', label: 'Клиенты', detail: 'Список клиентов', Icon: Users },
  { route: 'client-signups', label: 'Пользователи', detail: 'Клиенты приложения', Icon: UserRound },
  { route: 'analytics', label: 'Статистика', detail: 'Аудитория и заказы', Icon: BarChart3 },
  { route: 'settlements', label: 'География', detail: 'Сёла и заявки', Icon: MapPin },
  { route: 'roads', label: 'Асфальт', detail: 'Хорошие дороги', Icon: Route },
  { route: 'drivers', label: 'Водители', detail: 'Доступы и статусы', Icon: Truck },
  { route: 'reviews', label: 'Отзывы', detail: 'Рестораны и водители', Icon: MessageCircle },
  { route: 'catalogs', label: 'Каталоги', detail: 'Управление каталогами', Icon: Store },
  { route: 'templates', label: 'Шаблоны', detail: 'Управление шаблонами', Icon: LayoutTemplate },
  { route: 'import-export', label: 'Импорт / Экспорт', detail: 'Данные и каталоги', Icon: Database },
  { route: 'contests', label: 'Акции', detail: 'Конкурсы и билеты', Icon: Trophy },
  { route: 'subscriptions', label: 'Подписки и платежи', detail: 'Управление оплатами', Icon: CreditCard },
  { route: 'settings', label: 'Настройки', detail: 'Система и дизайн', Icon: Settings },
  { route: 'audit-log', label: 'Журнал действий', detail: 'История изменений', Icon: Activity }
];

const mobilePrimaryRoutes: PlatformRoute[] = ['dashboard', 'clients', 'catalogs', 'templates'];

const statusLabels: Record<PlatformClient['status'], string> = {
  active: 'Активен',
  inactive: 'Неактивен',
  blocked: 'Заблокирован',
  pending: 'Ожидает активации'
};

const businessTypeLabels: Record<string, string> = {
  restaurant: 'Ресторан',
  coffee_shop: 'Кофейня',
  confectionery: 'Кондитерская',
  cafe: 'Кофейня',
  salon: 'Салон красоты',
  barbershop: 'Барбершоп',
  shop: 'Магазин',
  fashion: 'Магазин',
  fitness: 'Фитнес'
};

const formatMoney = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const formatCount = (value: number, forms: [string, string, string]) => {
  const lastTwoDigits = value % 100;
  const lastDigit = value % 10;
  const form = lastTwoDigits >= 11 && lastTwoDigits <= 14
    ? forms[2]
    : lastDigit === 1
      ? forms[0]
      : lastDigit >= 2 && lastDigit <= 4
        ? forms[1]
        : forms[2];
  return `${value} ${form}`;
};
const isVideoMediaUrl = (url: string) => /\.(mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(url.trim());

const parseSettlementsInput = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

const formatSettlementsInput = (values: string[]) => values.join('\n');

const getCurrentPlatformPath = () => {
  if (window.location.hash.startsWith('#/')) {
    return window.location.hash.slice(1);
  }
  return window.location.pathname.replace(import.meta.env.BASE_URL, '/');
};

const readRouteFromLocation = (): PlatformRoute => {
  const path = getCurrentPlatformPath();
  if (path.includes('/admin/catalogs')) return 'catalogs';
  if (path.includes('/admin/client-signups')) return 'client-signups';
  if (path.includes('/admin/analytics')) return 'analytics';
  if (path.includes('/admin/settlements')) return 'settlements';
  if (path.includes('/admin/roads')) return 'roads';
  if (path.includes('/admin/drivers')) return 'drivers';
  if (path.includes('/admin/reviews')) return 'reviews';
  if (path.includes('/admin/templates')) return 'templates';
  if (path.includes('/admin/import-export')) return 'import-export';
  if (path.includes('/admin/contests')) return 'contests';
  if (path.includes('/admin/subscriptions')) return 'subscriptions';
  if (path.includes('/admin/settings')) return 'settings';
  if (path.includes('/admin/audit-log')) return 'audit-log';
  if (path.includes('/admin/clients')) return 'clients';
  return 'dashboard';
};

const routeToPath = (route: PlatformRoute) => {
  const segment = route === 'dashboard' ? 'dashboard' : route;
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}#/admin/${segment}`;
};

const privacyPolicyPath = () => {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}privacy`;
};

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function getInitials(name: string) {
  const letters = name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');
  return letters || 'C';
}

function navigateToRoute(route: PlatformRoute, setRoute: (route: PlatformRoute) => void) {
  window.history.pushState(null, '', routeToPath(route));
  setRoute(route);
}

function PlatformSidebar({
  route,
  onNavigate
}: {
  route: PlatformRoute;
  onNavigate: (route: PlatformRoute) => void;
}) {
  return (
    <aside className="platform-sidebar">
      <div className="platform-brand">
        <span>C</span>
        <div>
          <strong>Catalog Manager</strong>
          <small>Управление каталогами</small>
        </div>
      </div>
      <nav className="platform-sidebar__nav" aria-label="Суперадмин меню">
        {navItems.map(({ route: itemRoute, label, detail, Icon }) => (
          <button
            className={route === itemRoute ? 'is-active' : ''}
            type="button"
            key={itemRoute}
            onClick={() => onNavigate(itemRoute)}
          >
            <Icon />
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function PlatformMobileNav({
  route,
  onNavigate
}: {
  route: PlatformRoute;
  onNavigate: (route: PlatformRoute) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreItems = navItems.filter((item) => !mobilePrimaryRoutes.includes(item.route));
  const activePrimaryRoute = route === 'client-signups' ? 'clients' : route;
  const isMoreActive = !mobilePrimaryRoutes.includes(route) && route !== 'client-signups';

  return (
    <>
      {moreOpen && (
        <div className="platform-more-sheet">
          <div className="platform-more-sheet__panel">
            <div className="platform-sheet-head">
              <strong>Ещё</strong>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Закрыть">
                <X />
              </button>
            </div>
            {moreItems.map(({ route: itemRoute, label, Icon }) => (
              <button
                type="button"
                key={itemRoute}
                onClick={() => {
                  onNavigate(itemRoute);
                  setMoreOpen(false);
                }}
              >
                <Icon />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <nav className="platform-mobile-nav" aria-label="Мобильное меню">
        {mobilePrimaryRoutes.map((itemRoute) => {
          const item = navItems.find((nav) => nav.route === itemRoute);
          if (!item) return null;
          const Icon = item.Icon;
          return (
            <button
              className={activePrimaryRoute === itemRoute ? 'is-active' : ''}
              type="button"
              key={itemRoute}
              onClick={() => onNavigate(itemRoute)}
            >
              <Icon />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button className={isMoreActive ? 'is-active' : ''} type="button" onClick={() => setMoreOpen(true)}>
          <MoreHorizontal />
          <span>Ещё</span>
        </button>
      </nav>
    </>
  );
}

function StatsCards({ stats, variant = 'clients' }: { stats?: PlatformStats; variant?: 'clients' | 'dashboard' }) {
  const items = variant === 'dashboard'
    ? [
        { label: 'Всего клиентов', value: stats?.totalClients ?? 0, Icon: Users },
        { label: 'Активные каталоги', value: stats?.activeCatalogs ?? 0, Icon: Store },
        { label: 'Выручка ресторанов', value: formatMoney(stats?.monthlyRevenue ?? 0), Icon: CreditCard },
        { label: 'Долг клиентов', value: formatMoney(stats?.totalDebt ?? 0), Icon: ShieldAlert },
        { label: 'Заказов всего', value: stats?.totalOrders ?? 0, Icon: Activity },
        { label: 'Доставки водителей', value: stats?.driverDeliveries ?? 0, Icon: Truck }
      ]
    : [
        { label: 'Клиенты', value: stats?.totalClients ?? 0, Icon: Users },
        { label: 'Каталоги', value: stats?.activeCatalogs ?? 0, Icon: Store },
        { label: 'Выручка', value: formatMoney(stats?.monthlyRevenue ?? 0), Icon: CreditCard },
        { label: 'Дни', value: stats?.daysActive ?? 0, Icon: Activity },
        { label: 'Заказы', value: stats?.totalOrders ?? 0, Icon: Ticket },
        { label: 'Доставки', value: stats?.driverDeliveries ?? 0, Icon: Truck }
      ];

  return (
    <section className={variant === 'dashboard' ? 'platform-stats platform-stats--dashboard' : 'platform-stats'}>
      {items.map(({ label, value, Icon }) => (
        <article className="platform-stat" key={label}>
          <span>
            <Icon />
          </span>
          <div>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        </article>
      ))}
    </section>
  );
}

function RestaurantRevenueSummary({ stats }: { stats?: PlatformStats }) {
  const restaurants = stats?.restaurantStats ?? [];
  return (
    <section className="restaurant-revenue-summary">
      <header>
        <h2>Заведения по выручке</h2>
        <strong>{formatMoney(stats?.monthlyRevenue ?? 0)}</strong>
      </header>
      <div>
        {restaurants.map((restaurant, index) => (
          <span key={restaurant.id}>
            <i style={{ '--legend-index': index } as CSSProperties} />
            {restaurant.name}
            <small>{formatMoney(restaurant.revenue)}</small>
          </span>
        ))}
        {restaurants.length === 0 && <small>Данные появятся после первого заказа</small>}
      </div>
    </section>
  );
}

function DashboardPage() {
  const statsQuery = useQuery({
    queryKey: ['platform-stats'],
    queryFn: getPlatformStats,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 15_000
  });

  return (
    <main className="platform-page platform-dashboard-page">
      <header className="platform-page-head">
        <div>
          <h1>Главная</h1>
          <p>Общая статистика WayYaam, ресторанов и доставок</p>
        </div>
        <button type="button" onClick={() => void statsQuery.refetch()} disabled={statsQuery.isFetching}>
          <RefreshCcw />
          Обновить
        </button>
      </header>
      <StatsCards stats={statsQuery.data} variant="dashboard" />
      <DebtControlPanel stats={statsQuery.data} />
      <RestaurantRevenueSummary stats={statsQuery.data} />
    </main>
  );
}

function DebtControlPanel({ stats }: { stats?: PlatformStats }) {
  const debtors = (stats?.restaurantStats ?? []).filter((restaurant) => restaurant.debt > 0);

  return (
    <section className="platform-debt-panel">
      <header>
        <span><ShieldAlert /></span>
        <div>
          <h2>Долги и ограничения</h2>
          <p>Комиссия платформы по заказам ресторанов. Блокировка ресторана выполняется в таблице ниже.</p>
        </div>
        <strong>{formatMoney(stats?.totalDebt ?? 0)}</strong>
      </header>
      {debtors.length === 0 ? (
        <small>Активных долгов нет</small>
      ) : (
        <div>
          {debtors.slice(0, 4).map((restaurant) => (
            <span key={restaurant.id}>
              <b>{restaurant.name}</b>
              <em>{formatMoney(restaurant.debt)}</em>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function ClientAvatar({ client }: { client: PlatformClient }) {
  return client.logoUrl ? (
    <img className="client-avatar" src={client.logoUrl} alt="" />
  ) : (
    <span className="client-avatar client-avatar--fallback">{getInitials(client.companyName)}</span>
  );
}

function StatusBadge({ status }: { status: PlatformClient['status'] }) {
  return <span className={`status-badge status-badge--${status}`}>{statusLabels[status]}</span>;
}

function PublicationBadge({ status }: { status: PlatformClient['catalogStatus'] }) {
  const published = status === 'published';
  return (
    <span className={published ? 'publish-badge is-published' : 'publish-badge'}>
      <span />
      {published ? 'Опубликован' : 'Не опубликован'}
    </span>
  );
}

function ClientActions({ client, onEdit }: { client: PlatformClient; onEdit: (client: PlatformClient) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const publicUrl = getCatalogPublicUrl(client.catalogSlug);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const closeMenu = () => setMenuOpen(false);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    return () => {
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [menuOpen]);

  return (
    <div className="client-actions">
      <button type="button" onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')}>
        <Eye />
        Открыть
      </button>
      <button
        type="button"
        onClick={() => {
          void copyText(publicUrl).then(() => toast.success('Ссылка скопирована'));
        }}
        aria-label="Копировать ссылку"
      >
        <Copy />
        Копировать
      </button>
      <div className="client-actions-menu">
        <button
          type="button"
          aria-label="Ещё"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const panelWidth = 220;
            const panelHeight = 176;
            const left = Math.min(Math.max(12, rect.right - panelWidth), window.innerWidth - panelWidth - 12);
            const hasSpaceBelow = rect.bottom + panelHeight + 12 < window.innerHeight;
            const top = hasSpaceBelow ? rect.bottom + 8 : Math.max(12, rect.top - panelHeight - 8);
            setMenuPosition({ top, left });
            setMenuOpen((value) => !value);
          }}
        >
          <MoreHorizontal />
        </button>
        {menuOpen && (
          <div
            className="client-actions-menu__panel"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onEdit(client);
              }}
            >
              Редактировать
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onEdit(client);
              }}
            >
              Сменить email / пароль
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onEdit(client);
              }}
            >
              Изменить оплату
            </button>
            <button
              className="is-danger"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onEdit(client);
              }}
            >
              Деактивировать
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ClientTable({ clients, onEdit }: { clients: PlatformClient[]; onEdit: (client: PlatformClient) => void }) {
  return (
    <div className="clients-table-wrap">
      <table className="clients-table">
        <colgroup>
          <col className="clients-table__client" />
          <col className="clients-table__contacts" />
          <col className="clients-table__template" />
          <col className="clients-table__catalog" />
          <col className="clients-table__status" />
          <col className="clients-table__link" />
          <col className="clients-table__actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Контакты</th>
            <th>Шаблон</th>
            <th>Каталог</th>
            <th>Статус</th>
            <th>Ссылка на каталог</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => {
            const publicUrl = getCatalogPublicUrl(client.catalogSlug);
            return (
              <tr key={client.id}>
                <td>
                  <div className="client-cell">
                    <ClientAvatar client={client} />
                    <span>
                      <strong>{client.companyName}</strong>
                      <small>{client.catalogSlug}</small>
                      {client.ownerName && <small>{client.ownerName}</small>}
                    </span>
                  </div>
                </td>
                <td>
                  <div className="stacked-cell">
                    <span>{client.email}</span>
                    <small>{client.phone || 'Телефон не указан'}</small>
                  </div>
                </td>
                <td>
                  <div className="template-cell">
                    <LayoutTemplate />
                    <span>
                      {client.templateName} v{client.templateVersion}
                      <small>{businessTypeLabels[client.businessType] ?? client.businessType}</small>
                    </span>
                  </div>
                </td>
                <td>
                  <div className="stacked-cell">
                    <span>{client.catalogSlug}</span>
                    <PublicationBadge status={client.catalogStatus} />
                  </div>
                </td>
                <td>
                  <StatusBadge status={client.status} />
                </td>
                <td>
                  <div className="link-cell">
                    <span>{publicUrl}</span>
                    <button
                      type="button"
                      onClick={() => {
                        void copyText(publicUrl).then(() => toast.success('Ссылка скопирована'));
                      }}
                      aria-label="Копировать ссылку"
                    >
                      <Copy />
                    </button>
                  </div>
                </td>
                <td>
                  <ClientActions client={client} onEdit={onEdit} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClientTableSkeleton() {
  return (
    <div className="clients-table-wrap clients-table-wrap--skeleton" aria-label="Загрузка клиентов">
      {Array.from({ length: 4 }, (_, index) => (
        <div className="client-skeleton-row" key={index}>
          <span />
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function ClientEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="platform-empty-state">
      <Users />
      <h2>У вас пока нет клиентов</h2>
      <p>Создайте первый каталог и выдайте владельцу доступ.</p>
      <button type="button" onClick={onCreate}>
        <Plus />
        Создать первый каталог
      </button>
    </div>
  );
}

function ClientCards({
  clients,
  stats,
  onEdit
}: {
  clients: PlatformClient[];
  stats?: PlatformStats;
  onEdit: (client: PlatformClient) => void;
}) {
  return (
    <section className="client-card-list">
      {clients.map((client) => {
        const publicUrl = getCatalogPublicUrl(client.catalogSlug);
        const clientStats = stats?.restaurantStats.find((restaurant) => restaurant.id === client.catalogId);
        return (
          <article className="client-card" key={client.id}>
            <div className="client-card__head">
              <ClientAvatar client={client} />
              <div>
                <strong>{client.companyName}</strong>
                <small>{client.email}</small>
              </div>
              <button type="button" aria-label="Действия" onClick={() => onEdit(client)}>
                <MoreHorizontal />
              </button>
            </div>
            <div className="client-card__meta">
              <StatusBadge status={client.status} />
              <PublicationBadge status={client.catalogStatus} />
            </div>
            <div className="client-card__numbers">
              <span><strong>{formatMoney(clientStats?.revenue ?? 0)}</strong><small>Выручка</small></span>
              <span><strong>{clientStats?.ordersCount ?? 0}</strong><small>Заказы</small></span>
            </div>
            <button
              className="client-card__open"
              type="button"
              onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')}
            >
              Открыть
            </button>
          </article>
        );
      })}
    </section>
  );
}

function ClientFilters({
  search,
  status,
  payment,
  templateId,
  templates,
  onSearch,
  onStatus,
  onPayment,
  onTemplate
}: {
  search: string;
  status: string;
  payment: string;
  templateId: string;
  templates: PlatformTemplateOption[];
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onPayment: (value: string) => void;
  onTemplate: (value: string) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  return (
    <section className={`client-filters ${filtersOpen ? 'is-open' : ''}`}>
      <label className="search-field">
        <Search />
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Поиск клиентов..." />
      </label>
      <select value={status} onChange={(event) => onStatus(event.target.value)} aria-label="Фильтр статуса">
        <option value="all">Все статусы</option>
        <option value="active">Активные</option>
        <option value="inactive">Неактивные</option>
        <option value="blocked">Заблокированные</option>
        <option value="pending">Ожидают активации</option>
      </select>
      <select value={templateId} onChange={(event) => onTemplate(event.target.value)} aria-label="Фильтр шаблона">
        <option value="all">Все шаблоны</option>
        {templates.map((template) => (
          <option value={template.templateKey} key={`${template.templateKey}-${template.version}`}>
            {businessTypeLabels[template.businessType] ?? template.templateName}
          </option>
        ))}
      </select>
      <select value={payment} onChange={(event) => onPayment(event.target.value)} aria-label="Фильтр оплаты">
        <option value="all">Все оплаты</option>
        <option value="active">Оплачено</option>
        <option value="trial">Пробный период</option>
        <option value="past_due">Просрочено</option>
      </select>
      <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
        <Filter />
        <span>Фильтры</span>
      </button>
    </section>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <footer className="platform-pagination">
      <span>Всего клиентов: {total}</span>
      <label>
        На странице
        <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>
      </label>
      <div>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft />
        </button>
        <strong>{page}</strong>
        <span>/ {pageCount}</span>
        <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          <ChevronRight />
        </button>
      </div>
    </footer>
  );
}

function CreateClientForm({
  templates,
  onClose,
  onSuccess
}: {
  templates: PlatformTemplateOption[];
  onClose: () => void;
  onSuccess: (result: CreateClientSuccess) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const settlementsQuery = useQuery({ queryKey: ['delivery-settlements'], queryFn: getDeliverySettlements });
  const cityOptions = Array.from(new Set((settlementsQuery.data ?? []).map((settlement) => settlement.cityName.trim()).filter(Boolean)));
  const settlementOptions = Array.from(new Set((settlementsQuery.data ?? []).map((settlement) => settlement.settlementName.trim()).filter(Boolean)));
  const firstTemplate = templates[0];
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors }
  } = useForm<CreateClientFormValues>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      name: '',
      slug: '',
      ownerName: '',
      email: '',
      phone: '',
      primaryCity: '',
      serviceSettlementsText: '',
      password: generateSecurePassword(),
      templateVersionId: firstTemplate?.templateVersionId ?? '',
      businessType: 'restaurant',
      templateType: 'restaurant',
      seedDemoMenu: false,
      planId: 'trial',
      subscriptionStatus: 'trial',
      status: 'active',
      sendEmail: false,
      adminConsentConfirmed: false
    }
  });

  const name = watch('name');
  const password = watch('password');
  const slug = watch('slug');
  const templateVersionId = watch('templateVersionId');
  const businessType = watch('businessType');
  const adminConsentConfirmed = watch('adminConsentConfirmed');
  const selectedTemplate = templates.find((template) => template.templateVersionId === templateVersionId);

  const [lastAutoSlug, setLastAutoSlug] = useState('');
  useEffect(() => {
    if ((!slug || slug === lastAutoSlug) && name) {
      const nextSlug = createSlug(name);
      setValue('slug', nextSlug, { shouldValidate: true });
      setLastAutoSlug(nextSlug);
    }
  }, [lastAutoSlug, name, setValue, slug]);

  useEffect(() => {
    setValue('templateType', businessType, { shouldValidate: true });
    if (businessType === 'restaurant') setValue('seedDemoMenu', false);
    const compatibleTemplate = templates.find((template) => template.businessType === businessType);
    if (compatibleTemplate && selectedTemplate?.businessType !== businessType) {
      setValue('templateVersionId', compatibleTemplate.templateVersionId, { shouldValidate: true });
    }
  }, [businessType, selectedTemplate?.businessType, setValue, templates]);

  useEffect(() => {
    if (!templateVersionId && firstTemplate) {
      setValue('templateVersionId', firstTemplate.templateVersionId, { shouldValidate: true });
    }
  }, [firstTemplate, setValue, templateVersionId]);

  const onSubmit = handleSubmit(async (values) => {
    if (!values.adminConsentConfirmed) {
      alert('Необходимо подтвердить согласие клиента');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createClient({
        name: values.name,
        slug: values.slug,
        ownerName: values.ownerName,
        email: values.email,
        phone: values.phone,
        primaryCity: values.primaryCity,
        serviceSettlements: parseSettlementsInput(values.serviceSettlementsText ?? ''),
        password: values.password,
        templateVersionId: values.templateVersionId,
        businessType: values.businessType,
        templateType: values.templateType,
        seedDemoMenu: values.seedDemoMenu,
        planId: values.planId,
        subscriptionEndsAt: values.subscriptionEndsAt,
        status: values.status,
        subscriptionStatus: values.subscriptionStatus,
        adminConsentConfirmed: values.adminConsentConfirmed
      });
      onSuccess({
        email: result.email,
        password: values.password,
        publicUrl: getCatalogPublicUrl(result.slug),
        adminUrl: getCatalogAdminUrl(result.slug)
      });
      toast.success('Клиент создан');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось создать клиента');
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="client-form-shell">
      <div className="platform-sheet-head">
        <div>
          <strong id="create-client-title">Добавить нового клиента</strong>
          <small>Создание аккаунта, каталога и подписки</small>
        </div>
        <button type="button" onClick={onClose} aria-label="Закрыть">
          <X />
        </button>
      </div>
      <form className="client-form" onSubmit={onSubmit}>
        <section className="client-form-section">
          <h3>Информация о клиенте</h3>
          <div className="client-form-grid">
            <label>
              <span>
                Название клиента <b>*</b>
              </span>
              <input {...register('name')} placeholder="Например: Мой ресторан" aria-invalid={Boolean(errors.name)} />
              {errors.name && <small>{errors.name.message}</small>}
            </label>
            <label>
              <span>
                Адрес каталога <b>*</b>
              </span>
              <input {...register('slug', { onBlur: (event) => setValue('slug', normalizeSlugInput(event.target.value), { shouldValidate: true }) })} placeholder="my-coffee-shop" aria-invalid={Boolean(errors.slug)} />
              <em>Будет доступно по ссылке: {getCatalogPublicUrl(slug || 'your-slug')}</em>
              {errors.slug && <small>{errors.slug.message}</small>}
            </label>
            <label>
              <span>
                Email <b>*</b>
              </span>
              <input
                {...register('email')}
                type="email"
                placeholder="client@example.com"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && <small>{errors.email.message}</small>}
            </label>
            <label>
              <span>
                Временный пароль <b>*</b>
              </span>
              <span className="password-field">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.password)}
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Показать пароль">
                  <Eye />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextPassword = generateSecurePassword();
                    setValue('password', nextPassword, { shouldValidate: true });
                  }}
                  aria-label="Сгенерировать пароль"
                >
                  <KeyRound />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void copyText(password).then(() => toast.success('Пароль скопирован'));
                  }}
                  aria-label="Скопировать пароль"
                >
                  <Copy />
                </button>
              </span>
              {errors.password && <small>{errors.password.message}</small>}
            </label>
          </div>
        </section>

        <section className="client-form-section">
          <h3>Каталог и шаблон</h3>
          <div className="client-form-grid">
            <fieldset className="client-template-picker">
              <legend>Шаблон <b>*</b></legend>
              <input type="hidden" {...register('templateVersionId')} />
              <div className="client-template-picker__grid" role="radiogroup" aria-label="Шаблон каталога">
                {templates.map((template) => {
                  const Icon = template.businessType === 'coffee_shop'
                    ? Coffee
                    : template.businessType === 'confectionery'
                      ? CakeSlice
                      : Store;
                  const selected = template.templateVersionId === templateVersionId;
                  return (
                    <button
                      className={selected ? 'client-template-card is-selected' : 'client-template-card'}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      key={template.templateVersionId}
                      onClick={() => {
                        setValue('templateVersionId', template.templateVersionId, { shouldValidate: true });
                        setValue('businessType', template.businessType, { shouldValidate: true });
                        setValue('templateType', template.businessType, { shouldValidate: true });
                      }}
                    >
                      <span className="client-template-card__preview">
                        {template.previewImage
                          ? <img src={template.previewImage} alt="" width="480" height="320" loading="lazy" />
                          : <Icon aria-hidden="true" />}
                      </span>
                      <span className="client-template-card__content">
                        <i><Icon aria-hidden="true" /></i>
                        <strong>{businessTypeLabels[template.businessType] ?? template.templateName}</strong>
                        <small>{template.description}</small>
                        <b>{selected ? 'Выбрано' : 'Выбрать'}</b>
                      </span>
                    </button>
                  );
                })}
              </div>
              {errors.templateVersionId && <small>{errors.templateVersionId.message}</small>}
            </fieldset>
            <label>
              <span>
                Тип заведения <b>*</b>
              </span>
              <select {...register('businessType')} aria-invalid={Boolean(errors.businessType)}>
                <option value="restaurant">🍽 Ресторан</option>
                <option value="coffee_shop">☕ Кофейня</option>
                <option value="confectionery">🍰 Кондитерская</option>
              </select>
              <em>Тип можно изменить позже без потери меню, заказов и статистики.</em>
              {errors.businessType && <small>{errors.businessType.message}</small>}
            </label>
            <input type="hidden" {...register('templateType')} />
            {(businessType === 'coffee_shop' || businessType === 'confectionery') && (
              <label className="client-form__disabled-option">
                <input {...register('seedDemoMenu')} type="checkbox" />
                <span>Заполнить демонстрационным меню</span>
                <em>Добавим категории, позиции, описания, цены, модификаторы и локальные изображения выбранного шаблона.</em>
              </label>
            )}
            <label>
              Имя владельца
              <input {...register('ownerName')} placeholder="Имя владельца" />
            </label>
          </div>
        </section>

        <section className="client-form-section">
          <h3>Контакты и тариф</h3>
          <div className="client-form-grid client-form-grid--three">
            <label>
              Телефон
              <input {...register('phone')} placeholder="+7 999 000-00-00" inputMode="tel" />
            </label>
            <label>
              Основной город
              <input {...register('primaryCity')} placeholder="Например: Грозный" list="client-city-options" />
              <datalist id="client-city-options">
                {cityOptions.map((city) => <option value={city} key={city} />)}
              </datalist>
            </label>
            <label>
              <span>
                Тариф <b>*</b>
              </span>
              <select {...register('planId')}>
                <option value="trial">Пробный</option>
                <option value="basic">Базовый</option>
                <option value="business">Про</option>
              </select>
            </label>
            <label>
              <span>
                Статус оплаты <b>*</b>
              </span>
              <select {...register('subscriptionStatus')}>
                <option value="trial">Пробный период</option>
                <option value="active">Оплачен</option>
                <option value="past_due">Просрочен</option>
              </select>
            </label>
            <label>
              Дата окончания
              <input {...register('subscriptionEndsAt')} type="date" />
            </label>
            <label>
              <span>
                Статус клиента <b>*</b>
              </span>
              <select {...register('status')}>
                <option value="active">Активен</option>
                <option value="blocked">Заблокирован</option>
              </select>
            </label>
          </div>
          <label>
            Села и районы обслуживания
            <textarea
              {...register('serviceSettlementsText')}
              rows={4}
              placeholder={'Одно село на строку\nЧерноречье\nБеркат-Юрт'}
            />
            <em>Эти населенные пункты можно будет использовать для маршрутизации заказов водителям.</em>
            {settlementOptions.length > 0 && <em>Справочник: {settlementOptions.slice(0, 8).join(', ')}</em>}
          </label>
        </section>

        <section className="client-form-section">
          <h3>Дополнительно</h3>
          <label className="client-form__consent-option">
            <input {...register('adminConsentConfirmed')} type="checkbox" />
            <span>Клиент дал согласие на обработку персональных данных</span>
            <a href={privacyPolicyPath()} target="_blank" rel="noreferrer">
              <BookOpen />
              Прочитать политику
            </a>
            {errors.adminConsentConfirmed && <small>{errors.adminConsentConfirmed.message}</small>}
          </label>
          <label className="client-form__disabled-option">
            <input {...register('sendEmail')} type="checkbox" disabled />
            <span>Отправить данные клиенту на email</span>
            <em>Будет доступно после настройки SMTP</em>
          </label>
        </section>

        <footer className="client-form-footer">
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" disabled={isSubmitting || templates.length === 0 || !adminConsentConfirmed}>
            <Plus />
            {isSubmitting ? 'Создаём...' : 'Создать клиента'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function EditClientForm({
  client,
  onClose,
  onSuccess
}: {
  client: PlatformClient;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [companyName, setCompanyName] = useState(client.companyName);
  const [ownerName, setOwnerName] = useState(client.ownerName);
  const [email, setEmail] = useState(client.email);
  const [phone, setPhone] = useState(client.phone);
  const [primaryCity, setPrimaryCity] = useState(client.primaryCity);
  const [serviceSettlementsText, setServiceSettlementsText] = useState(formatSettlementsInput(client.serviceSettlements));
  const [businessType, setBusinessType] = useState(client.businessType);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(client.status);
  const [planId, setPlanId] = useState(client.planCode || 'trial');
  const [subscriptionStatus, setSubscriptionStatus] = useState(client.subscriptionStatus);
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState(client.subscriptionEndsAt?.slice(0, 10) ?? '');
  const [moduleDraft, setModuleDraft] = useState<RestaurantModuleEntitlement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const settlementsQuery = useQuery({ queryKey: ['delivery-settlements'], queryFn: getDeliverySettlements });
  const modulesQuery = useQuery({
    queryKey: ['restaurant-module-entitlement', client.catalogId],
    queryFn: () => getRestaurantModuleEntitlementByCatalog(client.catalogId)
  });
  const cityOptions = Array.from(new Set((settlementsQuery.data ?? []).map((settlement) => settlement.cityName.trim()).filter(Boolean)));
  const settlementOptions = Array.from(new Set((settlementsQuery.data ?? []).map((settlement) => settlement.settlementName.trim()).filter(Boolean)));

  useEffect(() => {
    if (moduleDraft || !modulesQuery.data) return;
    setModuleDraft(modulesQuery.data);
  }, [moduleDraft, modulesQuery.data]);

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (businessType !== client.businessType) {
      const nextType = businessTypeLabels[businessType] ?? 'Ресторан';
      if (!window.confirm(`Изменить тип заведения на «${nextType}»? Существующие категории и позиции сохранятся.`)) return;
    }
    setIsSubmitting(true);
    try {
      await updateClient({
        clientId: client.id,
        companyName,
        ownerName,
        email,
        phone,
        primaryCity,
        serviceSettlements: parseSettlementsInput(serviceSettlementsText),
        businessType,
        templateType: businessType,
        password: password || undefined,
        status,
        planId,
        subscriptionStatus,
        subscriptionEndsAt: subscriptionEndsAt || null
      });
      if (moduleDraft) {
        await saveRestaurantModuleEntitlement(moduleDraft);
      }
      toast.success('Клиент обновлён');
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось обновить клиента');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="client-form-shell">
      <div className="platform-sheet-head">
        <div>
          <strong id="edit-client-title">Редактировать клиента</strong>
          <small>{client.catalogSlug}</small>
        </div>
        <button type="button" onClick={onClose} aria-label="Закрыть">
          <X />
        </button>
      </div>
      <form className="client-form" onSubmit={handleEditSubmit}>
        <section className="client-form-section">
          <h3>Данные клиента</h3>
          <div className="client-form-grid">
            <label>
              Тип заведения
              <select value={businessType} onChange={(event) => setBusinessType(event.target.value as PlatformClient['businessType'])}>
                <option value="restaurant">🍽 Ресторан</option>
                <option value="coffee_shop">☕ Кофейня</option>
                <option value="confectionery">🍰 Кондитерская</option>
              </select>
              <em>Тексты интерфейса обновятся автоматически, данные сохранятся.</em>
            </label>
            <label>
              Название клиента
              <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required />
            </label>
            <label>
              Имя владельца
              <input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} />
            </label>
            <label>
              Email для входа
              <input
                value={email}
                type="email"
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Телефон
              <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" />
            </label>
            <label>
              Основной город
              <input value={primaryCity} onChange={(event) => setPrimaryCity(event.target.value)} list="edit-client-city-options" />
              <datalist id="edit-client-city-options">
                {cityOptions.map((city) => <option value={city} key={city} />)}
              </datalist>
            </label>
          </div>
          <label>
            Села и районы обслуживания
            <textarea
              value={serviceSettlementsText}
              onChange={(event) => setServiceSettlementsText(event.target.value)}
              rows={4}
              placeholder={'Одно село на строку\nЧерноречье\nБеркат-Юрт'}
            />
            {settlementOptions.length > 0 && <em>Справочник: {settlementOptions.slice(0, 8).join(', ')}</em>}
          </label>
        </section>

        <section className="client-form-section">
          <h3>Доступ</h3>
          <div className="client-form-grid">
            <label>
              Новый пароль
              <span className="password-field">
                <input
                  value={password}
                  type={showPassword ? 'text' : 'password'}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Оставьте пустым, если менять не нужно"
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Показать пароль">
                  <Eye />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPassword(generateSecurePassword());
                  }}
                  aria-label="Сгенерировать пароль"
                >
                  <KeyRound />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!password) {
                      toast.error('Сначала задайте пароль');
                      return;
                    }
                    void copyText(password).then(() => toast.success('Пароль скопирован'));
                  }}
                  aria-label="Скопировать пароль"
                >
                  <Copy />
                </button>
              </span>
            </label>
            <label>
              Статус клиента
              <select value={status} onChange={(event) => setStatus(event.target.value as PlatformClient['status'])}>
                <option value="active">Активен</option>
                <option value="inactive">Неактивен</option>
                <option value="blocked">Заблокирован</option>
                <option value="pending">Ожидает активации</option>
              </select>
            </label>
          </div>
        </section>

        <section className="client-form-section">
          <h3>Подписка и оплата</h3>
          <div className="client-form-grid client-form-grid--three">
            <label>
              Тариф
              <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
                <option value="trial">Пробный</option>
                <option value="basic">Базовый</option>
                <option value="business">Про</option>
              </select>
            </label>
            <label>
              Статус оплаты
              <select
                value={subscriptionStatus}
                onChange={(event) => setSubscriptionStatus(event.target.value as PlatformClient['subscriptionStatus'])}
              >
                <option value="trial">Пробный период</option>
                <option value="active">Оплачен</option>
                <option value="past_due">Просрочен</option>
                <option value="expired">Истекла</option>
                <option value="cancelled">Отменена</option>
              </select>
            </label>
            <label>
              Дата окончания
              <input
                value={subscriptionEndsAt}
                type="date"
                onChange={(event) => setSubscriptionEndsAt(event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="client-form-section client-module-access">
          <h3>Дополнительные модули ресторана</h3>
          <p>Включаются только для «{client.companyName}». Существующие блюда, категории, клиенты и заказы сохраняются.</p>
          {modulesQuery.isLoading && <em>Загружаем текущие права…</em>}
          {modulesQuery.isError && (
            <div className="client-module-access__error">
              Не удалось загрузить текущие права. Сохранение временно отключено.
              <button type="button" onClick={() => void modulesQuery.refetch()}>Повторить</button>
            </div>
          )}
          {moduleDraft && (
            <div className="client-module-access__options">
              <label>
                <input
                  type="checkbox"
                  checked={moduleDraft.posEnabled}
                  onChange={(event) => setModuleDraft({ ...moduleDraft, posEnabled: event.target.checked })}
                />
                <span><strong>Включить POS-кассу</strong><em>Касса, зал, столы и кабинки на базе действующего меню.</em></span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={moduleDraft.warehouseEnabled}
                  onChange={(event) => setModuleDraft({ ...moduleDraft, warehouseEnabled: event.target.checked })}
                />
                <span><strong>Включить склад</strong><em>Отдельный модуль учёта без изменения текущих остатков.</em></span>
              </label>
            </div>
          )}
        </section>

        <footer className="client-form-footer">
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" disabled={isSubmitting || modulesQuery.isLoading || modulesQuery.isError}>
            {isSubmitting ? 'Сохраняем...' : 'Сохранить изменения'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function SuccessPanel({ success, onClose }: { success: CreateClientSuccess; onClose: () => void }) {
  const allText = `Email: ${success.email}\nВременный пароль: ${success.password}\nАдминка: ${success.adminUrl}\nКаталог: ${success.publicUrl}`;

  return (
    <div className="client-success">
      <CheckCircle2 />
      <h2>Клиент успешно создан</h2>
      <dl>
        <div>
          <dt>Email</dt>
          <dd>{success.email}</dd>
          <button type="button" onClick={() => void copyText(success.email).then(() => toast.success('Email скопирован'))}>
            <Copy />
          </button>
        </div>
        <div>
          <dt>Временный пароль</dt>
          <dd>{success.password}</dd>
          <button type="button" onClick={() => void copyText(success.password).then(() => toast.success('Пароль скопирован'))}>
            <Copy />
          </button>
        </div>
        <div>
          <dt>Ссылка на админку</dt>
          <dd>{success.adminUrl}</dd>
          <button type="button" onClick={() => void copyText(success.adminUrl).then(() => toast.success('Ссылка скопирована'))}>
            <Copy />
          </button>
        </div>
        <div>
          <dt>Ссылка на каталог</dt>
          <dd>{success.publicUrl}</dd>
          <button type="button" onClick={() => void copyText(success.publicUrl).then(() => toast.success('Ссылка скопирована'))}>
            <Copy />
          </button>
        </div>
      </dl>
      <button type="button" onClick={() => void copyText(allText).then(() => toast.success('Данные скопированы'))}>
        <Copy />
        Копировать всё
      </button>
      <button type="button" onClick={onClose}>
        Закрыть
      </button>
    </div>
  );
}

function ClientsPage({
  onCreate,
  onEdit
}: {
  onCreate: () => void;
  onEdit: (client: PlatformClient) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [payment, setPayment] = useState('all');
  const [templateId, setTemplateId] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const debouncedSearch = useDebouncedValue(search);

  const templatesQuery = useQuery({
    queryKey: ['platform-templates'],
    queryFn: getTemplateOptions
  });
  const statsQuery = useQuery({
    queryKey: ['platform-stats'],
    queryFn: getPlatformStats,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 15_000
  });
  const clientsQuery = useQuery({
    queryKey: ['platform-clients', debouncedSearch, status, payment, templateId, page, pageSize],
    queryFn: () =>
      getClients({
        search: debouncedSearch,
        status,
        payment,
        templateId,
        page,
        pageSize
      })
  });

  const clients = [...(clientsQuery.data?.data ?? [])].sort(
    (left, right) => Number(right.status === 'active') - Number(left.status === 'active')
  );
  const total = clientsQuery.data?.count ?? 0;

  return (
    <main className="platform-page clients-page">
      <header className="platform-page-head">
        <div>
          <h1>Клиенты</h1>
          <p>Управляйте клиентами и их статусами</p>
        </div>
        <button type="button" onClick={onCreate}>
          <Plus />
          <span>Добавить клиента</span>
        </button>
      </header>
      <StatsCards stats={statsQuery.data} />
      <RestaurantRevenueSummary stats={statsQuery.data} />
      <ClientFilters
        search={search}
        status={status}
        payment={payment}
        templateId={templateId}
        templates={templatesQuery.data ?? []}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        onStatus={(value) => {
          setStatus(value);
          setPage(1);
        }}
        onPayment={(value) => {
          setPayment(value);
          setPage(1);
        }}
        onTemplate={(value) => {
          setTemplateId(value);
          setPage(1);
        }}
      />
      {clientsQuery.isLoading && <ClientTableSkeleton />}
      {clientsQuery.isError && (
        <div className="platform-state">
          Не удалось загрузить клиентов.
          <button type="button" onClick={() => void clientsQuery.refetch()}>
            Повторить
          </button>
        </div>
      )}
      {!clientsQuery.isLoading && clients.length === 0 && <ClientEmptyState onCreate={onCreate} />}
      {clients.length > 0 && (
        <>
          <header className="clients-list-head">
            <strong>Клиенты <span>{total}</span></strong>
            <small>Сначала активные</small>
          </header>
          <ClientTable clients={clients} onEdit={onEdit} />
          <ClientCards clients={clients} stats={statsQuery.data} onEdit={onEdit} />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPage={setPage}
            onPageSize={(value) => {
              setPageSize(value);
              setPage(1);
            }}
          />
        </>
      )}
      <button className="mobile-create-client" type="button" onClick={onCreate}>
        <Plus />
        Добавить клиента
      </button>
    </main>
  );
}

export function LegacyDriversPage() {
  const queryClient = useQueryClient();
  const driversQuery = useQuery({ queryKey: ['platform-drivers'], queryFn: getDrivers });
  const settlementsQuery = useQuery({ queryKey: ['delivery-settlements'], queryFn: getDeliverySettlements });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cityName, setCityName] = useState('');
  const [serviceSettlementsText, setServiceSettlementsText] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [password, setPassword] = useState(generateSecurePassword());
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [driverConsentConfirmed, setDriverConsentConfirmed] = useState(false);
  const [success, setSuccess] = useState<CreateDriverSuccess | null>(null);

  const driverLoginUrl = `${window.location.origin}${import.meta.env.BASE_URL}#/driver`;

  const createNewDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!driverConsentConfirmed) {
      toast.error('Нужно подтвердить получение отдельного согласия и акцепта оферты водителем');
      return;
    }
    setIsSubmitting(true);
    try {
      const serviceSettlements = parseSettlementsInput(serviceSettlementsText);
      const result = await createDriver({
        name,
        email,
        phone,
        cityName,
        serviceSettlements,
        vehicleInfo,
        carNumber,
        password
      });
      if (serviceSettlements.length > 0) {
        await updateDriverServiceSettlements(result.driverId, serviceSettlements);
      }
      setSuccess({ email: result.email, password, driverId: result.driverId });
      setName('');
      setEmail('');
      setPhone('');
      setCityName('');
      setServiceSettlementsText('');
      setVehicleInfo('');
      setCarNumber('');
      setDriverConsentConfirmed(false);
      setPassword(generateSecurePassword());
      toast.success('Водитель создан');
      void queryClient.invalidateQueries({ queryKey: ['platform-drivers'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось создать водителя');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyDriverAccess = (driver: CreateDriverSuccess) => {
    const text = `Email: ${driver.email}\nВременный пароль: ${driver.password}\nКабинет водителя: ${driverLoginUrl}`;
    void copyText(text).then(() => toast.success('Данные водителя скопированы'));
  };

  const drivers = driversQuery.data ?? [];
  const settlementOptions = settlementsQuery.data ?? [];
  const settlementNames = Array.from(new Set(settlementOptions.map((settlement) => settlement.settlementName.trim()).filter(Boolean)));
  const placeNames = Array.from(new Set(settlementOptions.flatMap((settlement) => [settlement.cityName.trim(), settlement.settlementName.trim()]).filter(Boolean)));

  return (
    <main className="platform-page">
      <header className="platform-page-head">
        <div>
          <h1>Водители</h1>
          <p>Создавайте доступы водителям и отслеживайте их онлайн-статус</p>
        </div>
      </header>

      {success && (
        <section className="driver-access-panel">
          <CheckCircle2 />
          <span>
            <strong>Водитель создан</strong>
            <small>{success.email}</small>
          </span>
          <button type="button" onClick={() => copyDriverAccess(success)}>
            <Copy />
            Скопировать доступ
          </button>
          <button type="button" onClick={() => setSuccess(null)} aria-label="Закрыть">
            <X />
          </button>
        </section>
      )}

      <form className="client-form driver-create-panel" onSubmit={createNewDriver}>
        <datalist id="driver-city-options">
          {placeNames.map((place) => <option value={place} key={place} />)}
        </datalist>
        <datalist id="driver-settlement-options">
          {settlementNames.map((settlement) => <option value={settlement} key={settlement} />)}
        </datalist>
        <section className="client-form-section">
          <h3>Новый водитель</h3>
          <div className="client-form-grid client-form-grid--three">
            <label>
              Имя
              <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
            </label>
            <label>
              Email для входа
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                required
              />
            </label>
            <label>
              Телефон
              <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" />
            </label>
            <label>
              Город
              <input value={cityName} onChange={(event) => setCityName(event.target.value)} placeholder="Грозный" list="driver-city-options" />
            </label>
            <label>
              Населённые пункты работы
              <select
                multiple
                size={Math.min(5, Math.max(2, settlementNames.length))}
                value={parseSettlementsInput(serviceSettlementsText)}
                onChange={(event) => setServiceSettlementsText(formatSettlementsInput(Array.from(event.target.selectedOptions, (option) => option.value)))}
              >
                {settlementNames.map((settlement) => <option value={settlement} key={settlement}>{settlement}</option>)}
              </select>
              {settlementNames.length === 0 && <em>Сначала добавьте населённый пункт в разделе «География».</em>}
            </label>
            <label>
              Транспорт
              <input value={vehicleInfo} onChange={(event) => setVehicleInfo(event.target.value)} placeholder="Hyundai Solaris" />
            </label>
            <label>
              Госномер
              <input value={carNumber} onChange={(event) => setCarNumber(event.target.value)} placeholder="A123BC 95" />
            </label>
          </div>
          <label>
            Временный пароль
            <span className="password-field">
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Показать пароль">
                <Eye />
              </button>
              <button type="button" onClick={() => setPassword(generateSecurePassword())} aria-label="Сгенерировать пароль">
                <KeyRound />
              </button>
              <button type="button" onClick={() => void copyText(password).then(() => toast.success('Пароль скопирован'))} aria-label="Скопировать пароль">
                <Copy />
              </button>
            </span>
          </label>
        </section>
        <label className="legal-checkbox">
          <input type="checkbox" checked={driverConsentConfirmed} onChange={(event) => setDriverConsentConfirmed(event.target.checked)} required />
          <span>Подтверждаю, что водитель сам принял <a href={legalDocuments.driverOffer} target="_blank" rel="noreferrer">оферту редакции {legalDocumentReleases.driver_offer.version}</a> и дал отдельное <a href={legalDocuments.driverConsent} target="_blank" rel="noreferrer">согласие на обработку данных и геолокацию</a>. Подтверждение администратора не заменяет серверную фиксацию действия водителя.</span>
        </label>
        <footer className="client-form-footer">
          <button type="submit" disabled={isSubmitting || !driverConsentConfirmed}>
            <Plus />
            {isSubmitting ? 'Создаём...' : 'Создать водителя'}
          </button>
        </footer>
      </form>

      {driversQuery.isLoading && <div className="platform-state">Загружаем водителей...</div>}
      {driversQuery.isError && (
        <div className="platform-state">
          Не удалось загрузить водителей.
          <button type="button" onClick={() => void driversQuery.refetch()}>
            Повторить
          </button>
        </div>
      )}
      {!driversQuery.isLoading && !driversQuery.isError && drivers.length === 0 && (
        <section className="platform-placeholder">
          <Truck />
          <h2>Водителей пока нет</h2>
          <p>Создайте первого водителя и передайте ему email, пароль и ссылку на кабинет.</p>
        </section>
      )}
      {drivers.length > 0 && (
        <section className="driver-admin-list">
          {drivers.map((driver: PlatformDriver) => (
            <DriverAdminCard
              driver={driver}
              settlementOptions={settlementNames}
              placeOptions={placeNames}
              key={driver.id}
              onSaved={() => void queryClient.invalidateQueries({ queryKey: ['platform-drivers'] })}
            />
          ))}
        </section>
      )}
    </main>
  );
}

function DriverAdminCard({
  driver,
  settlementOptions,
  placeOptions,
  onSaved
}: {
  driver: PlatformDriver;
  settlementOptions: string[];
  placeOptions: string[];
  onSaved: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(driver.name);
  const [phone, setPhone] = useState(driver.phone);
  const [cityName, setCityName] = useState(driver.cityName);
  const [vehicleInfo, setVehicleInfo] = useState(driver.vehicleInfo);
  const [carNumber, setCarNumber] = useState(driver.carNumber);
  const [serviceSettlementsText, setServiceSettlementsText] = useState(formatSettlementsInput(driver.serviceSettlements));
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isEditing) return;
    setName(driver.name);
    setPhone(driver.phone);
    setCityName(driver.cityName);
    setVehicleInfo(driver.vehicleInfo);
    setCarNumber(driver.carNumber);
    setServiceSettlementsText(formatSettlementsInput(driver.serviceSettlements));
    setNewPassword('');
  }, [driver, isEditing]);

  const saveDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await updateDriverProfile({
        driverId: driver.id,
        userId: driver.userId,
        name,
        phone,
        cityName,
        vehicleInfo,
        carNumber,
        serviceSettlements: parseSettlementsInput(serviceSettlementsText),
        password: newPassword.trim() || undefined
      });
      toast.success('Водитель обновлён');
      setNewPassword('');
      setIsEditing(false);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось обновить водителя');
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <form className="driver-admin-card driver-admin-card--edit" onSubmit={saveDriver}>
        <div className="driver-admin-edit-grid">
          <label>
            Имя
            <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
          </label>
          <label>
            Телефон
            <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" />
          </label>
          <label>
            Город
            <select value={cityName} onChange={(event) => setCityName(event.target.value)}>
              <option value="">Выберите село или город</option>
              {placeOptions.map((place) => <option value={place} key={place}>{place}</option>)}
            </select>
          </label>
          <label>
            Транспорт
            <input value={vehicleInfo} onChange={(event) => setVehicleInfo(event.target.value)} placeholder="Hyundai Solaris" />
          </label>
          <label>
            Госномер
            <input value={carNumber} onChange={(event) => setCarNumber(event.target.value)} placeholder="A123BC 95" />
          </label>
          <label>
            Населённые пункты работы
            <select
              multiple
              size={Math.min(5, Math.max(2, settlementOptions.length))}
              value={parseSettlementsInput(serviceSettlementsText)}
              onChange={(event) => setServiceSettlementsText(formatSettlementsInput(Array.from(event.target.selectedOptions, (option) => option.value)))}
            >
              {settlementOptions.map((settlement) => <option value={settlement} key={settlement}>{settlement}</option>)}
            </select>
            {settlementOptions.length === 0 && <em>Сначала добавьте населённый пункт в разделе «География».</em>}
          </label>
          <label>
            Новый пароль
            <span className="driver-admin-password-field">
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                autoComplete="new-password"
                minLength={10}
                placeholder="Оставьте пустым, если не менять"
              />
              <button type="button" onClick={() => setNewPassword(generateSecurePassword())} aria-label="Сгенерировать пароль">
                <KeyRound />
              </button>
              <button type="button" onClick={() => void copyText(newPassword).then(() => toast.success('Пароль скопирован'))} aria-label="Скопировать пароль" disabled={!newPassword}>
                <Copy />
              </button>
            </span>
          </label>
        </div>
        <footer className="driver-admin-actions">
          <button type="button" onClick={() => setIsEditing(false)}>
            Отмена
          </button>
          <button type="submit" disabled={isSaving}>
            {isSaving ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </footer>
      </form>
    );
  }

  return (
    <article className="driver-admin-card">
      <span className={driver.isOnline ? 'is-online' : ''}>{driver.isOnline ? 'Онлайн' : 'Оффлайн'}</span>
      <div>
        <strong>{driver.name}</strong>
        <small>{driver.email || driver.phone}</small>
      </div>
      <div>
        <strong>{driver.vehicleInfo || 'Транспорт не указан'}</strong>
        <small>
          {driver.serviceSettlements.length > 0
            ? driver.serviceSettlements.join(', ')
            : driver.carNumber || driver.cityName || 'Город не указан'}
        </small>
      </div>
      <div>
        <strong>{formatMoney(driver.debt)}</strong>
        <small>Долг водителя</small>
      </div>
      <b>{driver.rating.toFixed(1)}</b>
      <button type="button" onClick={() => setIsEditing(true)}>
        Редактировать
      </button>
    </article>
  );
}

type BillingDraft = PlatformBillingSettings & {
  customSubject: string;
  customTariffType: 'percent' | 'fixed';
  customTariff: number;
  customTariffFixed: number;
};

const billingDraftStorageKey = 'waycatalog-platform-billing-draft';

const readBillingDraft = (): BillingDraft => {
  const defaults: BillingDraft = {
    clientFee: 0,
    restaurantTariffType: 'percent',
    restaurantCommission: 7,
    restaurantFixedFee: 0,
    driverTariffType: 'percent',
    driverTariff: 5,
    driverFixedFee: 0,
    restaurantLimit: 5000,
    driverLimit: 3000,
    warningPercent: 80,
    customSubject: '',
    customTariffType: 'percent',
    customTariff: 0,
    customTariffFixed: 0
  };
  try {
    const raw = window.localStorage.getItem(billingDraftStorageKey);
    return raw ? { ...defaults, ...JSON.parse(raw) as Partial<BillingDraft> } : defaults;
  } catch {
    return defaults;
  }
};

type SubscriptionView =
  | 'overview'
  | 'commissions'
  | 'limits'
  | 'custom-tariff'
  | 'routes'
  | 'modules'
  | 'subscriptions'
  | 'price-requests'
  | 'payments';

const subscriptionStatusLabel: Record<SubscriptionRow['status'], string> = {
  trial: 'Пробный',
  active: 'Успешно',
  past_due: 'На удержании',
  expired: 'Истёк',
  cancelled: 'Отменён'
};

const formatTariff = (type: 'percent' | 'fixed', percent: number, fixed: number) =>
  type === 'fixed' ? formatMoney(fixed) : `${percent}%`;

function PlatformInnerHeader({
  title,
  description,
  onBack,
  action
}: {
  title: string;
  description: string;
  onBack: () => void;
  action?: ReactNode;
}) {
  return (
    <header className="platform-inner-head">
      <button type="button" onClick={onBack} aria-label="Назад"><ChevronLeft /></button>
      <span>
        <h1>{title}</h1>
        <p>{description}</p>
      </span>
      {action}
    </header>
  );
}

function SubscriptionsPage() {
  const subscriptionsQuery = useQuery({ queryKey: ['platform-subscriptions'], queryFn: getSubscriptions });
  const billingSettingsQuery = useQuery({ queryKey: ['platform-billing-settings'], queryFn: getPlatformBillingSettings });
  const customTariffsQuery = useQuery({ queryKey: ['platform-custom-tariffs'], queryFn: getPlatformCustomTariffs });
  const pricingRulesQuery = useQuery({ queryKey: ['delivery-pricing-rules'], queryFn: getDeliveryPricingRules });
  const priceRequestsQuery = useQuery({ queryKey: ['delivery-price-requests'], queryFn: getDeliveryPriceRequests });
  const clientsQuery = useQuery({ queryKey: ['platform-clients-for-billing'], queryFn: () => getClients({ page: 1, pageSize: 1000, status: 'all', payment: 'all', templateId: 'all' }) });
  const driversQuery = useQuery({ queryKey: ['platform-drivers-for-billing'], queryFn: getDrivers });
  const queryClient = useQueryClient();
  const [billing, setBilling] = useState<BillingDraft>(() => readBillingDraft());
  const [fromSettlement, setFromSettlement] = useState('');
  const [toSettlement, setToSettlement] = useState('');
  const [amount, setAmount] = useState(200);
  const [view, setView] = useState<SubscriptionView>('overview');

  useEffect(() => {
    if (!billingSettingsQuery.data) return;
    setBilling((current) => ({ ...current, ...billingSettingsQuery.data }));
  }, [billingSettingsQuery.data]);

  const selectedCustomTariff = customTariffsQuery.data?.find((tariff) => `${tariff.subjectType}:${tariff.subjectId}` === billing.customSubject);

  useEffect(() => {
    if (!selectedCustomTariff) return;
    setBilling((current) => ({
      ...current,
      customTariffType: selectedCustomTariff.tariffType,
      customTariff: selectedCustomTariff.tariffPercent,
      customTariffFixed: selectedCustomTariff.tariffFixed
    }));
  }, [selectedCustomTariff]);

  const saveBilling = async () => {
    const settings: PlatformBillingSettings = {
      clientFee: billing.clientFee,
      restaurantTariffType: billing.restaurantTariffType,
      restaurantCommission: billing.restaurantCommission,
      restaurantFixedFee: billing.restaurantFixedFee,
      driverTariffType: billing.driverTariffType,
      driverTariff: billing.driverTariff,
      driverFixedFee: billing.driverFixedFee,
      restaurantLimit: billing.restaurantLimit,
      driverLimit: billing.driverLimit,
      warningPercent: billing.warningPercent
    };
    try {
      const savedRemote = await savePlatformBillingSettings(settings);
      window.localStorage.setItem(billingDraftStorageKey, JSON.stringify(billing));
      if (savedRemote) {
        toast.success('Тарифы сохранены');
      } else {
        toast.warning('Тарифы сохранены локально. Для общего сохранения примените Supabase migration.');
      }
      void queryClient.invalidateQueries({ queryKey: ['platform-billing-settings'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить тарифы');
    }
  };

  const saveCustomTariff = async () => {
    try {
      const savedRemote = await savePlatformCustomTariff({
        subject: billing.customSubject,
        tariffType: billing.customTariffType,
        tariffPercent: billing.customTariff,
        tariffFixed: billing.customTariffFixed
      });
      window.localStorage.setItem(billingDraftStorageKey, JSON.stringify(billing));
      if (savedRemote) {
        toast.success('Индивидуальный тариф сохранён');
      } else {
        toast.warning('Тариф сохранён локально. Для общего сохранения примените Supabase migration.');
      }
      void queryClient.invalidateQueries({ queryKey: ['platform-custom-tariffs'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить индивидуальный тариф');
    }
  };

  const saveRoutePrice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await saveDeliveryPricingRule({ fromSettlement, toSettlement, amount });
      setFromSettlement('');
      setToSettlement('');
      setAmount(200);
      toast.success('Тариф маршрута сохранён');
      void queryClient.invalidateQueries({ queryKey: ['delivery-pricing-rules'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить тариф');
    }
  };

  const subscriptions = subscriptionsQuery.data ?? [];
  const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'active');
  const heldPayments = subscriptions.filter((subscription) => subscription.status === 'past_due');
  const priceRequests = priceRequestsQuery.data ?? [];
  const pricingRules = pricingRulesQuery.data ?? [];
  const activePricingRules = pricingRules.filter((rule) => rule.isActive);
  const minimumRoutePrice = activePricingRules.length > 0
    ? Math.min(...activePricingRules.map((rule) => rule.amount))
    : 0;
  const monthlyFees = activeSubscriptions.reduce((sum, subscription) => sum + subscription.amount, 0);
  const warningsCount = heldPayments.length + (driversQuery.data ?? []).filter((driver) =>
    driver.debt >= billing.driverLimit * (billing.warningPercent / 100)
  ).length;

  const renderSubscriptions = (items: SubscriptionRow[]) => (
    <section className="platform-payment-list">
      {items.map((subscription) => (
        <article key={subscription.id}>
          <span className="platform-payment-list__icon"><CreditCard /></span>
          <span>
            <strong>Оплата подписки</strong>
            <small>{subscription.clientName} · {subscription.planCode}</small>
          </span>
          <span className="platform-payment-list__amount">
            <b>{formatMoney(subscription.amount)}</b>
            <small>{new Date(subscription.paidAt ?? subscription.createdAt).toLocaleDateString('ru-RU')}</small>
          </span>
          <em className={`is-${subscription.status}`}>{subscriptionStatusLabel[subscription.status]}</em>
        </article>
      ))}
      {!subscriptionsQuery.isLoading && items.length === 0 && <p className="platform-empty-copy">Операций пока нет</p>}
    </section>
  );

  if (view !== 'overview') {
    const onBack = () => setView('overview');
    if (view === 'modules') {
      return <PlatformRestaurantModulesPage onBack={onBack} />;
    }
    if (view === 'commissions') {
      return (
        <main className="platform-page platform-compact-detail">
          <PlatformInnerHeader title="Комиссии" description="Настройка комиссий для платформы" onBack={onBack} />
          <form className="platform-detail-form" onSubmit={(event) => { event.preventDefault(); void saveBilling(); }}>
            <label>Комиссия с клиента, ₽<input type="number" min="0" value={billing.clientFee} onChange={(event) => setBilling({ ...billing, clientFee: Number(event.target.value) })} /></label>
            <label>Тип тарифа ресторана
              <select value={billing.restaurantTariffType} onChange={(event) => setBilling({ ...billing, restaurantTariffType: event.target.value as 'percent' | 'fixed' })}>
                <option value="percent">Процент</option>
                <option value="fixed">Фиксированная сумма</option>
              </select>
            </label>
            {billing.restaurantTariffType === 'percent'
              ? <label>Тариф ресторана, %<input type="number" min="0" value={billing.restaurantCommission} onChange={(event) => setBilling({ ...billing, restaurantCommission: Number(event.target.value) })} /></label>
              : <label>Тариф ресторана, ₽<input type="number" min="0" value={billing.restaurantFixedFee} onChange={(event) => setBilling({ ...billing, restaurantFixedFee: Number(event.target.value) })} /></label>}
            <label>Тип тарифа водителя
              <select value={billing.driverTariffType} onChange={(event) => setBilling({ ...billing, driverTariffType: event.target.value as 'percent' | 'fixed' })}>
                <option value="percent">Процент</option>
                <option value="fixed">Фиксированная сумма</option>
              </select>
            </label>
            {billing.driverTariffType === 'percent'
              ? <label>Тариф водителя, %<input type="number" min="0" value={billing.driverTariff} onChange={(event) => setBilling({ ...billing, driverTariff: Number(event.target.value) })} /></label>
              : <label>Тариф водителя, ₽<input type="number" min="0" value={billing.driverFixedFee} onChange={(event) => setBilling({ ...billing, driverFixedFee: Number(event.target.value) })} /></label>}
            <button type="submit"><Save />Сохранить</button>
          </form>
        </main>
      );
    }
    if (view === 'limits') {
      return (
        <main className="platform-page platform-compact-detail">
          <PlatformInnerHeader title="Лимиты" description="Лимиты задолженности и порог предупреждений" onBack={onBack} />
          <form className="platform-detail-form" onSubmit={(event) => { event.preventDefault(); void saveBilling(); }}>
            <label>Лимит ресторана, ₽<input type="number" min="0" value={billing.restaurantLimit} onChange={(event) => setBilling({ ...billing, restaurantLimit: Number(event.target.value) })} /></label>
            <label>Лимит водителя, ₽<input type="number" min="0" value={billing.driverLimit} onChange={(event) => setBilling({ ...billing, driverLimit: Number(event.target.value) })} /></label>
            <label>Предупредить на, %<input type="number" min="1" max="100" value={billing.warningPercent} onChange={(event) => setBilling({ ...billing, warningPercent: Number(event.target.value) })} /></label>
            <button type="submit"><Save />Сохранить</button>
          </form>
        </main>
      );
    }
    if (view === 'custom-tariff') {
      return (
        <main className="platform-page platform-compact-detail">
          <PlatformInnerHeader title="Индивидуальный тариф" description="Персональный процент или фиксированная комиссия" onBack={onBack} />
          <form className="platform-detail-form" onSubmit={(event) => { event.preventDefault(); void saveCustomTariff(); }}>
            <label>Ресторан или водитель
              <select value={billing.customSubject} onChange={(event) => setBilling({ ...billing, customSubject: event.target.value })}>
                <option value="">Выберите получателя тарифа</option>
                {(clientsQuery.data?.data ?? []).map((client) => <option value={`restaurant:${client.id}`} key={client.id}>{client.companyName}</option>)}
                {(driversQuery.data ?? []).map((driver) => <option value={`driver:${driver.id}`} key={driver.id}>{driver.name}</option>)}
              </select>
            </label>
            <label>Тип тарифа
              <select value={billing.customTariffType} onChange={(event) => setBilling({ ...billing, customTariffType: event.target.value as 'percent' | 'fixed' })}>
                <option value="percent">Процент</option>
                <option value="fixed">Фиксированная сумма</option>
              </select>
            </label>
            {billing.customTariffType === 'percent'
              ? <label>Тариф, %<input type="number" min="0" value={billing.customTariff} onChange={(event) => setBilling({ ...billing, customTariff: Number(event.target.value) })} /></label>
              : <label>Тариф, ₽<input type="number" min="0" value={billing.customTariffFixed} onChange={(event) => setBilling({ ...billing, customTariffFixed: Number(event.target.value) })} /></label>}
            <button type="submit"><Save />Сохранить тариф</button>
          </form>
        </main>
      );
    }
    if (view === 'routes') {
      return (
        <main className="platform-page platform-compact-detail">
          <PlatformInnerHeader title="Маршруты и тарифы" description="Стоимость доставки между населёнными пунктами" onBack={onBack} />
          <form className="platform-detail-form platform-detail-form--route" onSubmit={saveRoutePrice}>
            <label>Откуда<input value={fromSettlement} onChange={(event) => setFromSettlement(event.target.value)} placeholder="Цоци-Юрт" /></label>
            <label>Куда<input value={toSettlement} onChange={(event) => setToSettlement(event.target.value)} placeholder="Курчалой" /></label>
            <label>Цена, ₽<input type="number" min="0" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>
            <button type="submit"><Plus />Добавить маршрут</button>
          </form>
          <section className="platform-simple-list">
            {pricingRules.map((rule) => (
              <article key={rule.id}><strong>{rule.fromSettlement} → {rule.toSettlement}</strong><b>{formatMoney(rule.amount)}</b><small>{rule.isActive ? 'Активен' : 'Выключен'}</small></article>
            ))}
            {!pricingRulesQuery.isLoading && pricingRules.length === 0 && <p className="platform-empty-copy">Маршрутных тарифов пока нет</p>}
          </section>
        </main>
      );
    }
    if (view === 'price-requests') {
      return (
        <main className="platform-page platform-compact-detail">
          <PlatformInnerHeader title="Согласование цен водителей" description="Запросы на изменение стоимости доставки" onBack={onBack} />
          <section className="platform-request-list">
            {priceRequests.map((request) => (
              <article key={request.id}>
                <span><strong>{request.driverName}</strong><small>{request.comment || 'Без комментария'}</small></span>
                <b>{formatMoney(request.currentAmount)} → {formatMoney(request.requestedAmount)}</b>
                <div>
                  <button type="button" onClick={() => void reviewDeliveryPriceRequest({ requestId: request.id, approved: true, amount: request.requestedAmount }).then(() => queryClient.invalidateQueries({ queryKey: ['delivery-price-requests'] }))}>Одобрить</button>
                  <button type="button" className="is-danger" onClick={() => void reviewDeliveryPriceRequest({ requestId: request.id, approved: false }).then(() => queryClient.invalidateQueries({ queryKey: ['delivery-price-requests'] }))}>Отклонить</button>
                </div>
              </article>
            ))}
            {!priceRequestsQuery.isLoading && priceRequests.length === 0 && <p className="platform-empty-copy">Новых запросов нет</p>}
          </section>
        </main>
      );
    }

    return (
      <main className="platform-page platform-compact-detail">
        <PlatformInnerHeader
          title={view === 'payments' ? 'Все платежи' : 'Текущие подписки'}
          description={view === 'payments' ? 'История операций по подпискам' : 'Список активных подписок'}
          onBack={onBack}
        />
        {renderSubscriptions(view === 'payments' ? subscriptions : activeSubscriptions)}
      </main>
    );
  }

  const menuItems: Array<{
    view: SubscriptionView;
    title: string;
    description: string;
    summary: ReactNode;
    Icon: typeof BadgePercent;
    tone: string;
  }> = [
    { view: 'modules', title: 'Модули ресторанов', description: 'POS, склад, финансы и функции по подписке', summary: <>Безопасное включение</>, Icon: Boxes, tone: 'purple' },
    { view: 'commissions', title: 'Комиссии', description: 'Настройка комиссий для платформы', summary: <>Клиент {formatMoney(billing.clientFee)} · Ресторан {formatTariff(billing.restaurantTariffType, billing.restaurantCommission, billing.restaurantFixedFee)} · Водитель {formatTariff(billing.driverTariffType, billing.driverTariff, billing.driverFixedFee)}</>, Icon: BadgePercent, tone: 'purple' },
    { view: 'limits', title: 'Лимиты', description: 'Лимиты и предупреждения', summary: <>Ресторан {formatMoney(billing.restaurantLimit)} · Водитель {formatMoney(billing.driverLimit)} · {billing.warningPercent}%</>, Icon: ShieldAlert, tone: 'violet' },
    { view: 'custom-tariff', title: 'Индивидуальный тариф', description: 'Установить тариф для ресторана или водителя', summary: <>{customTariffsQuery.data?.length ?? 0} настроено</>, Icon: UserRound, tone: 'purple' },
    { view: 'routes', title: 'Маршруты и тарифы', description: 'Управление маршрутами и стоимостью доставки', summary: <>{formatCount(activePricingRules.length, ['активный маршрут', 'активных маршрута', 'активных маршрутов'])} · от {formatMoney(minimumRoutePrice)}</>, Icon: MapPin, tone: 'purple' },
    { view: 'subscriptions', title: 'Текущие подписки', description: 'Список активных подписок', summary: <>{formatCount(activeSubscriptions.length, ['активная', 'активные', 'активных'])}</>, Icon: WalletCards, tone: 'blue' },
    { view: 'price-requests', title: 'Согласование цен водителей', description: 'Запросы на согласование и изменения', summary: <span className={priceRequests.length > 0 ? 'is-warning' : ''}>{formatCount(priceRequests.length, ['запрос', 'запроса', 'запросов'])}</span>, Icon: Users, tone: 'purple' }
  ];

  return (
    <main className="platform-page platform-subscriptions-overview">
      <header className="platform-page-head">
        <div>
          <h1>Подписки и платежи</h1>
          <p>Комиссии, тарифы, лимиты и предупреждения для ресторанов и водителей</p>
        </div>
      </header>

      <section className="platform-overview-metrics">
        <article><span className="is-purple"><BadgePercent /></span><strong>{formatMoney(monthlyFees)}</strong><small>Комиссии за месяц</small></article>
        <article><span className="is-green"><WalletCards /></span><strong>{activeSubscriptions.length}</strong><small>Активные подписки</small></article>
        <article><span className="is-orange"><ShieldAlert /></span><strong>{warningsCount}</strong><small>Предупреждения</small></article>
        <article><span className="is-blue"><CreditCard /></span><strong>{heldPayments.length}</strong><small>Платежи на удержании</small></article>
      </section>

      <section className="platform-hub-list">
        {menuItems.map(({ view: nextView, title, description, summary, Icon, tone }) => (
          <button type="button" onClick={() => setView(nextView)} key={nextView}>
            <span className={`platform-hub-list__icon is-${tone}`}><Icon /></span>
            <span><strong>{title}</strong><small>{description}</small></span>
            <b>{summary}</b>
            <ChevronRight />
          </button>
        ))}
      </section>

      <section className="platform-recent-payments">
        <header><h2>Последние платежи</h2><button type="button" onClick={() => setView('payments')}>Все платежи <ChevronRight /></button></header>
        {renderSubscriptions(subscriptions.slice(0, 3))}
      </section>
    </main>
  );
}

function AnalyticsMetric({
  label,
  value,
  detail
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function PlatformAnalyticsPage() {
  const analyticsQuery = useQuery({
    queryKey: ['platform-analytics'],
    queryFn: getPlatformAnalytics,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 15_000
  });
  const analytics: PlatformAnalytics | undefined = analyticsQuery.data;
  const maxOrderType = Math.max(1, ...(analytics?.orderTypes.map((item) => item.count) ?? [0]));
  const maxLocation = Math.max(1, ...(analytics?.locations.map((item) => item.count) ?? [0]));

  return (
    <main className="platform-page platform-analytics-page">
      <header className="platform-page-head">
        <div>
          <h1>Статистика</h1>
          <p>Аудитория, повторные заказы, география и способы получения</p>
        </div>
        <button type="button" onClick={() => void analyticsQuery.refetch()} aria-label="Обновить статистику">
          <Activity />
        </button>
      </header>

      <section className="platform-analytics-metrics">
        <AnalyticsMetric label="Пользуются" value={analytics?.uniqueCustomers ?? 0} detail="уникальных клиентов" />
        <AnalyticsMetric label="Повторные" value={analytics?.repeatCustomers ?? 0} detail={`${analytics?.repeatOrderRate ?? 0}% клиентов`} />
        <AnalyticsMetric label="Заказы" value={analytics?.totalOrders ?? 0} detail="всего в системе" />
      </section>

      <section className="platform-analytics-card">
        <header><h2>Тип заказа</h2><small>Как клиенты получают заказ</small></header>
        <div className="platform-analytics-bars">
          {(analytics?.orderTypes ?? []).map((item) => (
            <span key={item.key}>
              <label>{item.label}<strong>{item.count}</strong></label>
              <i><b style={{ width: `${(item.count / maxOrderType) * 100}%` }} /></i>
            </span>
          ))}
        </div>
      </section>

      <section className="platform-analytics-card">
        <header><h2>География</h2><small>Откуда приходит больше заказов</small></header>
        <div className="platform-analytics-bars">
          {(analytics?.locations ?? []).map((item) => (
            <span key={item.name}>
              <label>{item.name}<strong>{item.count}</strong></label>
              <i><b style={{ width: `${(item.count / maxLocation) * 100}%` }} /></i>
            </span>
          ))}
          {!analyticsQuery.isLoading && (analytics?.locations.length ?? 0) === 0 && <small>География появится после заказов с указанным городом или селом.</small>}
        </div>
      </section>
    </main>
  );
}

export function LegacyContestsPage() {
  const queryClient = useQueryClient();
  const bannersQuery = useQuery({ queryKey: ['platform-banners'], queryFn: getPlatformBanners });
  const contests = (bannersQuery.data ?? []).filter((banner) => banner.kind === 'contest');
  const [selectedContestId, setSelectedContestId] = useState('');
  const [search, setSearch] = useState('');
  const activeContestId = selectedContestId || contests[0]?.id || 'all';
  const ticketsQuery = useQuery({
    queryKey: ['platform-contest-tickets', activeContestId],
    queryFn: () => getPlatformContestTickets(activeContestId)
  });

  useEffect(() => {
    if (!selectedContestId && contests[0]?.id) setSelectedContestId(contests[0].id);
  }, [contests, selectedContestId]);

  const removeTicket = async (ticket: PlatformContestTicket) => {
    await deletePlatformContestTicket(ticket.id);
    toast.success('Билет удалён из списка');
    void queryClient.invalidateQueries({ queryKey: ['platform-contest-tickets', activeContestId] });
  };
  const tickets = ticketsQuery.data ?? [];
  const ticketCountByCustomer = tickets.reduce((counts, ticket) => {
    const key = ticket.customerPhone.replace(/\D/g, '') || ticket.customerName.trim().toLocaleLowerCase('ru-RU');
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
  const visibleTickets = tickets.filter((ticket) =>
    !normalizedSearch ||
    [
      ticket.customerName,
      ticket.customerPhone,
      ticket.restaurantName,
      ticket.deliveryCity,
      ...ticket.orderedItems
    ].some((value) => value.toLocaleLowerCase('ru-RU').includes(normalizedSearch))
  );

  return (
    <main className="platform-page">
      <header className="platform-page-head">
        <div>
          <h1>Акции и конкурсы</h1>
          <p>Конкурсы берутся из баннеров главной, один заказ создаёт один билет</p>
        </div>
      </header>

      <section className="platform-contest-toolbar">
        <Trophy />
        <select value={activeContestId} onChange={(event) => setSelectedContestId(event.target.value)}>
          {contests.length === 0 && <option value="all">Все заказы</option>}
          {contests.map((contest) => <option value={contest.id} key={contest.id}>{contest.title}</option>)}
        </select>
        <label>
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Имя, телефон, ресторан или город"
          />
        </label>
      </section>

      <section className="platform-ticket-list">
        <header className="platform-ticket-list__head">
          <strong>Билеты <span>{visibleTickets.length}</span></strong>
          <small>{ticketCountByCustomer.size} клиентов</small>
        </header>
        {visibleTickets.map((ticket) => {
          const customerKey = ticket.customerPhone.replace(/\D/g, '') || ticket.customerName.trim().toLocaleLowerCase('ru-RU');
          return (
            <details className="platform-ticket-card" key={ticket.id}>
              <summary>
                <Ticket />
                <span>
                  <strong>{ticket.customerName}</strong>
                  <small>{ticket.customerPhone || 'Телефон не указан'} · {ticket.restaurantName}</small>
                </span>
                <b>{formatMoney(ticket.totalAmount)}</b>
                <em>{ticketCountByCustomer.get(customerKey) ?? 1} бил.</em>
                <ChevronRight />
              </summary>
              <div>
                {ticket.deliveryCity && <span><MapPin />{ticket.deliveryCity}</span>}
                <p>{ticket.orderedItems.length > 0 ? ticket.orderedItems.join(', ') : 'Состав заказа не найден'}</p>
                <small>{new Date(ticket.createdAt).toLocaleString('ru-RU')}</small>
                <button type="button" onClick={() => void removeTicket(ticket)} aria-label="Удалить билет">
                  <Trash2 />
                  Удалить
                </button>
              </div>
            </details>
          );
        })}
        {!ticketsQuery.isLoading && visibleTickets.length === 0 && (
          <section className="platform-placeholder">
            <Ticket />
            <h2>{search ? 'Ничего не найдено' : 'Билетов пока нет'}</h2>
            <p>{search ? 'Измените запрос или очистите поиск.' : 'Когда клиент оформит заказ, он появится здесь как билет конкурса.'}</p>
          </section>
        )}
      </section>
    </main>
  );
}

type SettingsView = 'overview' | 'banners' | 'pages' | 'support';

const bannerKindLabel: Record<PlatformBannerAdmin['kind'], string> = {
  banner: 'Баннер',
  promo: 'Акция',
  contest: 'Конкурс',
  news: 'Новость'
};

const contentBlockLabel: Record<PlatformContentBlockType, string> = {
  heading: 'Заголовок',
  subheading: 'Подзаголовок',
  text: 'Текст',
  image: 'Фото',
  gallery: 'Несколько фото',
  video: 'Видео',
  divider: 'Разделитель',
  button: 'Кнопка',
  link: 'Ссылка'
};

const createContentBlock = (type: PlatformContentBlockType): PlatformContentBlock => ({
  id: crypto.randomUUID(),
  type,
  content: '',
  url: '',
  label: ''
});

function PlatformSettingsPage({ onSignOut }: { onSignOut: () => void }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['platform-global-settings'], queryFn: getPlatformGlobalSettings });
  const bannersQuery = useQuery({ queryKey: ['platform-banners'], queryFn: getPlatformBanners });
  const pagesQuery = useQuery({ queryKey: ['platform-content-pages'], queryFn: () => getPlatformContentPages() });
  const [view, setView] = useState<SettingsView>('overview');
  const [editingBanner, setEditingBanner] = useState<PlatformBannerAdmin | 'new' | null>(null);
  const [editingPage, setEditingPage] = useState<PlatformContentPage | 'new' | null>(null);

  const refreshBanners = () => void queryClient.invalidateQueries({ queryKey: ['platform-banners'] });
  const refreshPages = () => void queryClient.invalidateQueries({ queryKey: ['platform-content-pages'] });

  if (view === 'banners') {
    if (editingBanner) {
      return (
        <PlatformBannerEditor
          banner={editingBanner === 'new' ? undefined : editingBanner}
          pages={pagesQuery.data ?? []}
          defaultSortOrder={bannersQuery.data?.length ?? 0}
          onBack={() => setEditingBanner(null)}
          onSaved={() => {
            refreshBanners();
            setEditingBanner(null);
          }}
        />
      );
    }
    return (
      <main className="platform-page platform-compact-detail">
        <PlatformInnerHeader
          title="Баннеры"
          description="Баннеры, новости, акции и конкурсы"
          onBack={() => setView('overview')}
          action={<button className="platform-inner-head__action" type="button" onClick={() => setEditingBanner('new')}><Plus />Создать</button>}
        />
        <section className="platform-content-list">
          {(bannersQuery.data ?? []).map((banner) => (
            <article key={banner.id}>
              <span className="platform-content-list__thumb">
                {banner.imageUrl
                  ? isVideoMediaUrl(banner.imageUrl)
                    ? <video src={banner.imageUrl} muted playsInline />
                    : <img src={banner.imageUrl} alt="" />
                  : <ImageIcon />}
              </span>
              <span><strong>{banner.name || banner.title}</strong><small>{bannerKindLabel[banner.kind]} · {banner.isActive ? 'Активен' : 'Неактивен'}</small></span>
              <b>{banner.pageId ? 'Страница выбрана' : 'Без страницы'}</b>
              <button type="button" onClick={() => setEditingBanner(banner)}>Редактировать</button>
              <button
                type="button"
                className="is-danger"
                aria-label={`Удалить материал ${banner.title}`}
                onClick={() => {
                  if (!window.confirm(`Удалить материал «${banner.name || banner.title}»?`)) return;
                  void deletePlatformBanner(banner.id).then(() => {
                    toast.success('Материал удалён');
                    refreshBanners();
                  });
                }}
              ><Trash2 /></button>
            </article>
          ))}
          {!bannersQuery.isLoading && (bannersQuery.data ?? []).length === 0 && <p className="platform-empty-copy">Материалов пока нет. Создайте первый баннер.</p>}
        </section>
      </main>
    );
  }

  if (view === 'pages') {
    if (editingPage) {
      return (
        <PlatformContentPageEditor
          page={editingPage === 'new' ? undefined : editingPage}
          onBack={() => setEditingPage(null)}
          onSaved={() => {
            refreshPages();
            refreshBanners();
            setEditingPage(null);
          }}
        />
      );
    }
    return (
      <main className="platform-page platform-compact-detail">
        <PlatformInnerHeader
          title="Вспомогательные страницы"
          description="Страницы, открываемые из баннеров"
          onBack={() => setView('overview')}
          action={<button className="platform-inner-head__action" type="button" onClick={() => setEditingPage('new')}><Plus />Создать страницу</button>}
        />
        <section className="platform-content-list platform-content-list--pages">
          {(pagesQuery.data ?? []).map((page) => (
            <article key={page.id}>
              <span className="platform-content-list__thumb"><FileText /></span>
              <span><strong>{page.name}</strong><small>{getContentPageClientPath(page)}</small></span>
              <b>{page.status === 'published' ? 'Опубликована' : page.status === 'draft' ? 'Черновик' : 'Неактивна'}</b>
              <em>{page.bannerUsageCount} материалов</em>
              <button type="button" onClick={() => setEditingPage(page)}>Редактировать</button>
              <button
                type="button"
                className="is-danger"
                aria-label={`Удалить страницу ${page.name}`}
                onClick={() => {
                  const warning = page.bannerUsageCount > 0
                    ? `Эта страница используется в ${page.bannerUsageCount} материалах. Сначала измените привязку или подтвердите удаление.`
                    : `Удалить страницу «${page.name}»?`;
                  if (!window.confirm(warning)) return;
                  void deletePlatformContentPage(page).then(() => {
                    toast.success('Страница удалена');
                    refreshPages();
                    refreshBanners();
                  }).catch((error) => toast.error(error instanceof Error ? error.message : 'Не удалось удалить страницу'));
                }}
              ><Trash2 /></button>
            </article>
          ))}
          {!pagesQuery.isLoading && (pagesQuery.data ?? []).length === 0 && <p className="platform-empty-copy">Страниц пока нет. Создайте первую вспомогательную страницу.</p>}
        </section>
      </main>
    );
  }

  if (view === 'support') {
    return (
      <PlatformSupportEditor
        settings={settingsQuery.data}
        onBack={() => setView('overview')}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ['platform-global-settings'] })}
      />
    );
  }

  const supportConfigured = Boolean(
    settingsQuery.data?.supportWhatsapp
    || settingsQuery.data?.supportPhone
    || settingsQuery.data?.supportEmail
  );
  const overviewItems = [
    {
      view: 'banners' as const,
      title: 'Баннеры',
      description: 'Баннеры, новости, акции и конкурсы',
      summary: formatCount(bannersQuery.data?.length ?? 0, ['элемент', 'элемента', 'элементов']),
      Icon: ImageIcon,
      tone: 'purple'
    },
    {
      view: 'pages' as const,
      title: 'Вспомогательные страницы',
      description: 'Страницы, открываемые из баннеров',
      summary: formatCount(pagesQuery.data?.length ?? 0, ['страница', 'страницы', 'страниц']),
      Icon: FileText,
      tone: 'green'
    },
    {
      view: 'support' as const,
      title: 'Поддержка клиентов',
      description: 'Контактные данные службы поддержки',
      summary: supportConfigured ? 'Настроено' : 'Не настроено',
      Icon: Headphones,
      tone: 'blue',
      configured: supportConfigured
    }
  ];

  return (
    <main className="platform-page platform-settings-overview">
      <header className="platform-page-head">
        <div>
          <h1>Настройки</h1>
          <p>Контент, страницы и поддержка клиентского приложения</p>
        </div>
      </header>
      <section className="platform-settings-hub">
        {overviewItems.map(({ view: nextView, title, description, summary, Icon, tone, configured }) => (
          <button type="button" onClick={() => setView(nextView)} key={nextView}>
            <span className={`platform-settings-hub__icon is-${tone}`}><Icon /></span>
            <span><strong>{title}</strong><small>{description}</small></span>
            <b className={configured ? 'is-configured' : ''}>{summary}</b>
            <ChevronRight />
          </button>
        ))}
      </section>
      <button className="platform-sidebar__logout" type="button" onClick={onSignOut}>
        <LogOut />
        <span>Выйти</span>
      </button>
    </main>
  );
}

function PlatformBannerEditor({
  banner,
  pages,
  defaultSortOrder,
  onBack,
  onSaved
}: {
  banner?: PlatformBannerAdmin;
  pages: PlatformContentPage[];
  defaultSortOrder: number;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(banner?.name ?? '');
  const [title, setTitle] = useState(banner?.title ?? '');
  const [subtitle, setSubtitle] = useState(banner?.subtitle ?? '');
  const [kind, setKind] = useState<PlatformBannerAdmin['kind']>(banner?.kind ?? 'banner');
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? '');
  const [backgroundColor, setBackgroundColor] = useState(banner?.backgroundColor ?? '#5b3df4');
  const [pageId, setPageId] = useState(banner?.pageId ?? '');
  const [actionLabel, setActionLabel] = useState(banner?.actionLabel ?? 'Подробнее');
  const [contentPosition, setContentPosition] = useState<PlatformBannerAdmin['contentPosition']>(banner?.contentPosition ?? 'top-left');
  const [buttonPosition, setButtonPosition] = useState<PlatformBannerAdmin['buttonPosition']>(banner?.buttonPosition ?? 'bottom-left');
  const [startsAt, setStartsAt] = useState(banner?.startsAt?.slice(0, 10) ?? '');
  const [endsAt, setEndsAt] = useState(banner?.endsAt?.slice(0, 10) ?? '');
  const [sortOrder, setSortOrder] = useState(banner?.sortOrder ?? defaultSortOrder);
  const [isActive, setIsActive] = useState(banner?.isActive ?? true);
  const [isUploading, setIsUploading] = useState(false);

  const uploadMedia = async (file?: File) => {
    if (!file) return;
    setIsUploading(true);
    try {
      setImageUrl(await uploadPlatformBannerMedia(file));
      toast.success('Обложка загружена');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось загрузить обложку');
    } finally {
      setIsUploading(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const selectedPage = validatePlatformBannerTarget(
        pages.find((page) => page.id === pageId),
        isActive
      );
      await savePlatformBanner({
        id: banner?.id,
        name: name.trim(),
        title: title.trim(),
        subtitle: subtitle.trim(),
        kind,
        imageUrl,
        backgroundColor,
        linkUrl: getPlatformContentPath(selectedPage.slug),
        pageId: selectedPage.id,
        actionLabel: actionLabel.trim() || 'Подробнее',
        contentPosition,
        buttonPosition,
        startsAt: startsAt ? new Date(`${startsAt}T00:00:00`).toISOString() : null,
        endsAt: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
        sortOrder,
        isActive
      });
      toast.success('Материал сохранён');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить материал');
    }
  };

  return (
    <main className="platform-page platform-compact-detail">
      <PlatformInnerHeader title={banner ? 'Редактировать материал' : 'Создать материал'} description="Баннер, новость, акция или конкурс" onBack={onBack} />
      <form className="platform-content-form" onSubmit={save}>
        <label>Тип
          <select value={kind} onChange={(event) => setKind(event.target.value as PlatformBannerAdmin['kind'])}>
            <option value="banner">Баннер</option>
            <option value="news">Новость</option>
            <option value="promo">Акция</option>
            <option value="contest">Конкурс</option>
          </select>
        </label>
        <label>Название<input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Внутреннее название материала" /></label>
        <label>Заголовок<input value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
        <label className="is-wide">Краткий текст<textarea value={subtitle} onChange={(event) => setSubtitle(event.target.value)} required rows={3} /></label>
        <label className="platform-banner-media-picker is-wide">
          Изображение / обложка
          <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" onChange={(event) => void uploadMedia(event.target.files?.[0])} disabled={isUploading} />
          <span><Upload />{isUploading ? 'Загружаем…' : 'Выбрать медиа'}</span>
          <small>Горизонтальный формат 16:5. Изображение или видео заполнит баннер целиком.</small>
        </label>
        {imageUrl && (
          <div className="platform-banner-media-preview is-wide">
            {isVideoMediaUrl(imageUrl) ? <video src={imageUrl} controls playsInline /> : <img src={imageUrl} alt="Обложка" />}
            <button type="button" onClick={() => setImageUrl('')}>Удалить медиа</button>
          </div>
        )}
        <label>Текст кнопки<input value={actionLabel} onChange={(event) => setActionLabel(event.target.value)} placeholder="Подробнее" /></label>
        <label>Расположение текста
          <select value={contentPosition} onChange={(event) => setContentPosition(event.target.value as PlatformBannerAdmin['contentPosition'])}>
            <option value="top-left">Сверху слева</option>
            <option value="top-center">Сверху по центру</option>
            <option value="top-right">Сверху справа</option>
            <option value="center-left">По центру слева</option>
            <option value="center">По центру</option>
            <option value="center-right">По центру справа</option>
            <option value="bottom-left">Снизу слева</option>
            <option value="bottom-center">Снизу по центру</option>
            <option value="bottom-right">Снизу справа</option>
          </select>
        </label>
        <label>Расположение кнопки
          <select value={buttonPosition} onChange={(event) => setButtonPosition(event.target.value as PlatformBannerAdmin['buttonPosition'])}>
            <option value="top-left">Сверху слева</option>
            <option value="top-center">Сверху по центру</option>
            <option value="top-right">Сверху справа</option>
            <option value="center-left">По центру слева</option>
            <option value="center">По центру</option>
            <option value="center-right">По центру справа</option>
            <option value="bottom-left">Снизу слева</option>
            <option value="bottom-center">Снизу по центру</option>
            <option value="bottom-right">Снизу справа</option>
          </select>
        </label>
        <label>Страница при нажатии
          <select value={pageId} onChange={(event) => setPageId(event.target.value)} required>
            <option value="">Выберите вспомогательную страницу</option>
            {pages.map((page) => (
              <option
                value={page.id}
                disabled={isActive && page.status !== 'published'}
                key={page.id}
              >
                {page.name} · /pages/{page.slug}{page.status !== 'published' ? ' · сначала опубликуйте' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>Начало показа<input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label>
        <label>Окончание показа<input type="date" min={startsAt || undefined} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
        <label>Порядок показа<input type="number" min="0" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /></label>
        <label>Цвет фона<input type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} /></label>
        <label className="platform-toggle-field is-wide"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /><span>Материал активен</span></label>
        <button type="submit" disabled={isUploading}><Save />Сохранить</button>
      </form>
    </main>
  );
}

function PlatformContentPageEditor({
  page,
  onBack,
  onSaved
}: {
  page?: PlatformContentPage;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(page?.name ?? '');
  const [slug, setSlug] = useState(page?.slug ?? '');
  const [status, setStatus] = useState<PlatformContentPage['status']>(page?.status ?? 'draft');
  const [blocks, setBlocks] = useState<PlatformContentBlock[]>(page?.blocks ?? []);
  const [newBlockType, setNewBlockType] = useState<PlatformContentBlockType>('heading');
  const [isPreview, setIsPreview] = useState(false);

  const updateBlock = (id: string, patch: Partial<PlatformContentBlock>) => {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...patch } : block));
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    setBlocks((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const uploadBlockMedia = async (block: PlatformContentBlock, files: FileList | null) => {
    if (!files?.length) return;
    try {
      const urls = await Promise.all(Array.from(files).map((file) => uploadPlatformBannerMedia(file)));
      updateBlock(block.id, { url: block.type === 'gallery' ? urls.join('\n') : urls[0] });
      toast.success('Медиа загружено');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось загрузить медиа');
    }
  };

  const save = async () => {
    try {
      await savePlatformContentPage({
        id: page?.id,
        name,
        slug,
        status,
        blocks,
        bannerUsageCount: page?.bannerUsageCount ?? 0
      });
      toast.success('Страница сохранена');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить страницу');
    }
  };

  return (
    <main className="platform-page platform-compact-detail">
      <PlatformInnerHeader title={page ? 'Редактировать страницу' : 'Создать страницу'} description="Переиспользуемый контент для баннеров" onBack={onBack} />
      <section className="platform-page-builder">
        <div className="platform-page-builder__meta">
          <label>Название страницы<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Конкурс на iPhone" /></label>
          <label>Адрес / slug
            <input value={slug} onChange={(event) => setSlug(normalizeContentSlug(event.target.value))} placeholder="contest-1" />
            <small>{slug ? getPlatformContentPath(slug) : '/pages/contest-1'}</small>
          </label>
          <label>Статус
            <select value={status} onChange={(event) => setStatus(event.target.value as PlatformContentPage['status'])}>
              <option value="draft">Черновик</option>
              <option value="published">Опубликована</option>
              <option value="inactive">Неактивна</option>
            </select>
          </label>
        </div>

        {isPreview ? (
          <PlatformContentPreview name={name} blocks={blocks} />
        ) : (
          <>
            <div className="platform-block-add">
              <select value={newBlockType} onChange={(event) => setNewBlockType(event.target.value as PlatformContentBlockType)}>
                {Object.entries(contentBlockLabel).map(([type, label]) => <option value={type} key={type}>{label}</option>)}
              </select>
              <button type="button" onClick={() => setBlocks((current) => [...current, createContentBlock(newBlockType)])}><Plus />Добавить блок</button>
            </div>
            <div className="platform-block-list">
              {blocks.map((block, index) => (
                <article key={block.id}>
                  <header>
                    <GripVertical />
                    <strong>{contentBlockLabel[block.type]}</strong>
                    <button type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0} aria-label="Поднять блок"><ArrowUp /></button>
                    <button type="button" onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} aria-label="Опустить блок"><ArrowDown /></button>
                    <button type="button" className="is-danger" onClick={() => setBlocks((current) => current.filter((item) => item.id !== block.id))} aria-label="Удалить блок"><Trash2 /></button>
                  </header>
                  {block.type !== 'divider' && block.type !== 'image' && block.type !== 'gallery' && block.type !== 'video' && (
                    <label>{block.type === 'button' || block.type === 'link' ? 'Текст' : 'Содержимое'}
                      <textarea value={block.content} onChange={(event) => updateBlock(block.id, { content: event.target.value })} rows={block.type === 'text' ? 5 : 2} />
                    </label>
                  )}
                  {(block.type === 'image' || block.type === 'gallery' || block.type === 'video') && (
                    <>
                      <label>URL медиа<textarea value={block.url} onChange={(event) => updateBlock(block.id, { url: event.target.value })} rows={block.type === 'gallery' ? 4 : 2} /></label>
                      <label className="platform-banner-media-picker">Загрузить
                        <input type="file" accept={block.type === 'video' ? 'video/*' : 'image/*'} multiple={block.type === 'gallery'} onChange={(event) => void uploadBlockMedia(block, event.target.files)} />
                        <span><Upload />Выбрать {block.type === 'video' ? 'видео' : 'фото'}</span>
                      </label>
                      <label>Подпись<input value={block.content} onChange={(event) => updateBlock(block.id, { content: event.target.value })} /></label>
                    </>
                  )}
                  {(block.type === 'button' || block.type === 'link') && (
                    <label>Ссылка<input value={block.url} onChange={(event) => updateBlock(block.id, { url: event.target.value })} placeholder="https://..." /></label>
                  )}
                  {(block.type === 'button' || block.type === 'link') && (
                    <label>Текст действия<input value={block.label} onChange={(event) => updateBlock(block.id, { label: event.target.value })} /></label>
                  )}
                </article>
              ))}
              {blocks.length === 0 && <p className="platform-empty-copy">Добавьте первый блок страницы.</p>}
            </div>
          </>
        )}

        <footer>
          <button type="button" className="is-secondary" onClick={() => setIsPreview((value) => !value)}><Eye />{isPreview ? 'Вернуться к редактору' : 'Предпросмотр'}</button>
          <button type="button" onClick={() => void save()}><Save />Сохранить</button>
        </footer>
      </section>
    </main>
  );
}

function PlatformContentPreview({ name, blocks }: { name: string; blocks: PlatformContentBlock[] }) {
  return (
    <article className="platform-content-preview">
      <small>Предпросмотр страницы</small>
      <h1>{name || 'Без названия'}</h1>
      {blocks.map((block) => {
        if (block.type === 'heading') return <h2 key={block.id}>{block.content || 'Заголовок'}</h2>;
        if (block.type === 'subheading') return <h3 key={block.id}>{block.content || 'Подзаголовок'}</h3>;
        if (block.type === 'text') return <p key={block.id}>{block.content || 'Текстовый блок'}</p>;
        if (block.type === 'divider') return <hr key={block.id} />;
        if (block.type === 'image') return block.url ? <img src={block.url} alt={block.content} key={block.id} /> : <div className="platform-content-preview__placeholder" key={block.id}>Фото</div>;
        if (block.type === 'gallery') return <div className="platform-content-preview__gallery" key={block.id}>{block.url.split('\n').filter(Boolean).map((url) => <img src={url} alt="" key={url} />)}</div>;
        if (block.type === 'video') return block.url ? <video src={block.url} controls key={block.id} /> : <div className="platform-content-preview__placeholder" key={block.id}>Видео</div>;
        return <a href={block.url || '#'} key={block.id}>{block.label || block.content || 'Ссылка'}</a>;
      })}
    </article>
  );
}

function PlatformSupportEditor({
  settings,
  onBack,
  onSaved
}: {
  settings?: PlatformGlobalSettings;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [support, setSupport] = useState<PlatformGlobalSettings>(() => settings ?? {
    supportWhatsapp: '',
    supportPhone: '',
    supportEmail: '',
    supportTelegram: '',
    supportHours: '',
    supportHint: ''
  });

  useEffect(() => {
    if (settings) setSupport(settings);
  }, [settings]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await savePlatformGlobalSettings(support);
      toast.success('Контакты поддержки сохранены');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить контакты');
    }
  };

  return (
    <main className="platform-page platform-compact-detail">
      <PlatformInnerHeader title="Поддержка клиентов" description="Контактные данные службы поддержки" onBack={onBack} />
      <form className="platform-support-form" onSubmit={save}>
        <label><MessageCircle />WhatsApp<input value={support.supportWhatsapp} onChange={(event) => setSupport({ ...support, supportWhatsapp: event.target.value })} placeholder="79990000000" /></label>
        <label><Phone />Телефон<input value={support.supportPhone} onChange={(event) => setSupport({ ...support, supportPhone: event.target.value })} placeholder="+7 999 000-00-00" /></label>
        <label><Mail />E-mail<input type="email" value={support.supportEmail} onChange={(event) => setSupport({ ...support, supportEmail: event.target.value })} placeholder="support@example.ru" /></label>
        <label><MessageCircle />Telegram<input value={support.supportTelegram} onChange={(event) => setSupport({ ...support, supportTelegram: event.target.value })} placeholder="@waycatalog" /></label>
        <label className="is-wide">Время работы<input value={support.supportHours} onChange={(event) => setSupport({ ...support, supportHours: event.target.value })} placeholder="Ежедневно, 09:00–21:00" /></label>
        <label className="is-wide">Текст обращения / подсказки<textarea value={support.supportHint} onChange={(event) => setSupport({ ...support, supportHint: event.target.value })} rows={4} /></label>
        <button type="submit"><Save />Сохранить</button>
      </form>
    </main>
  );
}

function PlaceholderPage({ route }: { route: PlatformRoute }) {
  const title = navItems.find((item) => item.route === route)?.label ?? 'Раздел';
  return (
    <main className="platform-page">
      <header className="platform-page-head">
        <div>
          <h1>{title}</h1>
          <p>Раздел подготовлен для следующего этапа суперадминки.</p>
        </div>
      </header>
      <section className="platform-placeholder">
        <BookOpen />
        <h2>{title}</h2>
        <p>Здесь будет управление данными раздела. Заказы и бронирования намеренно не добавлены в меню панели.</p>
      </section>
    </main>
  );
}

function PlatformLoginState() {
  return <Navigate to="/login" replace />;
}

function ForbiddenState({ email, onSignOut }: { email: string | null; onSignOut: () => void }) {
  return (
    <main className="platform-forbidden">
      <ShieldAlert />
      <h1>403</h1>
      <p>Эта панель доступна только суперадминистратору платформы.</p>
      <p>
        Текущий пользователь: <strong>{email ?? 'не определён'}</strong>
      </p>
      <p>Проверьте, что именно этот Auth user добавлен в таблицу platform_admins, затем войдите снова.</p>
      <button type="button" onClick={onSignOut}>
        <LogOut />
        Выйти и войти другим аккаунтом
      </button>
    </main>
  );
}

function PlatformAdminContent() {
  const [route, setRoute] = useState<PlatformRoute>(() => readRouteFromLocation());
  const [createOpen, setCreateOpen] = useState(window.location.pathname.includes('/admin/clients/new'));
  const [editingClient, setEditingClient] = useState<PlatformClient | null>(null);
  const [success, setSuccess] = useState<CreateClientSuccess | null>(null);
  const queryClient = useQueryClient();

  const closeCreateModal = useCallback(() => {
    setSuccess(null);
    setCreateOpen(false);
    setEditingClient(null);
  }, []);

  const platformAdminQuery = useQuery({
    queryKey: ['platform-admin-session'],
    queryFn: () => getPlatformAdminAccess()
  });
  const signOutWithConfirmation = useCallback(() => {
    if (!confirmRoleSignOut('суперадминистратора')) return;
    void signOutPlatformAdmin().then(() => redirectToClientHome());
  }, []);
  const templatesQuery = useQuery({
    queryKey: ['platform-templates'],
    queryFn: getTemplateOptions,
    enabled: platformAdminQuery.data?.isPlatformAdmin === true
  });
  const [notificationPermission, setNotificationPermission] = useState(() => getRestaurantOrderNotificationPermission());

  useEffect(() => {
    if (!platformAdminQuery.data?.isPlatformAdmin) return;
    void restoreRestaurantOrderNotificationSubscription({ role: 'super_admin' }).then(setNotificationPermission);
  }, [platformAdminQuery.data?.isPlatformAdmin]);

  useEffect(() => {
    const onPopState = () => setRoute(readRouteFromLocation());
    const onHashChange = () => setRoute(readRouteFromLocation());
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  useEffect(() => {
    if (!createOpen && !editingClient) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeCreateModal();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeCreateModal, createOpen, editingClient]);

  const content = useMemo(() => {
    if (route === 'dashboard') {
      return <DashboardPage />;
    }
    if (route === 'clients') {
      return (
        <ClientsPage
          onCreate={() => {
            setSuccess(null);
            setEditingClient(null);
            setCreateOpen(true);
          }}
          onEdit={(client) => {
            setSuccess(null);
            setCreateOpen(false);
            setEditingClient(client);
          }}
        />
      );
    }
    if (route === 'templates') {
      return <PlatformTemplatesPage templates={templatesQuery.data ?? []} />;
    }
    if (route === 'client-signups') {
      return <PlatformUsersPage />;
    }
    if (route === 'analytics') {
      return <PlatformAnalyticsPage />;
    }
    if (route === 'settlements') {
      return <PlatformGeographyPage />;
    }
    if (route === 'roads') {
      return <PlatformAsphaltRoadsPage />;
    }
    if (route === 'drivers') {
      return <PlatformDriversPage />;
    }
    if (route === 'reviews') {
      return <PlatformReviewsRoute />;
    }
    if (route === 'contests') {
      return <PlatformContestsPage />;
    }
    if (route === 'subscriptions') {
      return <SubscriptionsPage />;
    }
    if (route === 'settings') {
      return <PlatformSettingsPage onSignOut={signOutWithConfirmation} />;
    }
    return <PlaceholderPage route={route} />;
  }, [route, signOutWithConfirmation, templatesQuery.data]);

  if (platformAdminQuery.isLoading) {
    return <main className="platform-state platform-state--full">Проверяем права доступа...</main>;
  }

  if (!platformAdminQuery.data?.hasSession) {
    return <PlatformLoginState />;
  }

  if (!platformAdminQuery.data.isPlatformAdmin) {
    return (
      <ForbiddenState
        email={platformAdminQuery.data.email}
        onSignOut={signOutWithConfirmation}
      />
    );
  }

  return (
    <div className={`platform-admin-shell${route === 'dashboard' ? ' platform-admin-shell--dashboard' : ''}`}>
      <Toaster richColors position="top-center" />
      <PlatformSidebar
        route={route}
        onNavigate={(nextRoute) => navigateToRoute(nextRoute, setRoute)}
      />
      <section className="platform-workspace">
        <header className="platform-topbar">
          <div className="platform-topbar__identity">
            <span className="platform-topbar__avatar">S</span>
            <span>
              <strong>Администратор</strong>
              <small>{platformAdminQuery.data?.email ?? 'admin@catalog.app'}</small>
            </span>
          </div>
          <div className="platform-topbar__actions">
            <button
              type="button"
              aria-label="Включить push-уведомления"
              onClick={() => void requestRestaurantOrderNotificationPermission({ role: 'super_admin' }).then(setNotificationPermission)}
              title={notificationPermission === 'granted' ? 'Push включён' : 'Включить push-уведомления'}
            >
              <Bell />
            </button>
            <button type="button" aria-label="Настройки" onClick={() => navigateToRoute('settings', setRoute)}>
              <Settings />
            </button>
          </div>
        </header>
        {content}
      </section>
      <PlatformMobileNav
        route={route}
        onNavigate={(nextRoute) => navigateToRoute(nextRoute, setRoute)}
      />
      {(createOpen || editingClient) && (
        <div
          className="platform-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateModal();
            }
          }}
        >
          <div
            className="platform-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={editingClient ? 'edit-client-title' : 'create-client-title'}
          >
            {editingClient ? (
              <EditClientForm
                client={editingClient}
                onClose={closeCreateModal}
                onSuccess={() => {
                  closeCreateModal();
                  void queryClient.invalidateQueries({ queryKey: ['platform-clients'] });
                  void queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
                }}
              />
            ) : success ? (
              <SuccessPanel
                success={success}
                onClose={() => {
                  setSuccess(null);
                  setCreateOpen(false);
                  void queryClient.invalidateQueries({ queryKey: ['platform-clients'] });
                  void queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
                }}
              />
            ) : (
              <>
                {templatesQuery.isLoading && <div className="platform-state">Загружаем шаблоны...</div>}
                {templatesQuery.isError && (
                  <div className="platform-state">
                    Не удалось загрузить шаблоны.
                    <button type="button" onClick={() => void templatesQuery.refetch()}>
                      Повторить
                    </button>
                  </div>
                )}
                {!templatesQuery.isLoading && !templatesQuery.isError && (templatesQuery.data?.length ?? 0) === 0 && (
                  <div className="platform-state">Сначала добавьте опубликованную версию шаблона в Supabase.</div>
                )}
                {!templatesQuery.isLoading && !templatesQuery.isError && (templatesQuery.data?.length ?? 0) > 0 && (
                  <CreateClientForm
                    templates={templatesQuery.data ?? []}
                    onClose={closeCreateModal}
                    onSuccess={(result) => {
                      setSuccess(result);
                      void queryClient.invalidateQueries({ queryKey: ['platform-clients'] });
                      void queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PlatformAdminApp() {
  return (
    <QueryClientProvider client={platformQueryClient}>
      <PlatformAdminContent />
    </QueryClientProvider>
  );
}
