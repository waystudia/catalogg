import { zodResolver } from '@hookform/resolvers/zod';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Database,
  Eye,
  Filter,
  Home,
  KeyRound,
  LockKeyhole,
  LayoutTemplate,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Store,
  Trash2,
  Truck,
  UserRound,
  Users,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { Toaster, toast } from 'sonner';
import {
  createClient,
  deleteClientSignup,
  deletePlatformBanner,
  getClientSignups,
  getClients,
  getPlatformBanners,
  getPlatformGlobalSettings,
  getPlatformStats,
  savePlatformBanner,
  savePlatformGlobalSettings,
  updateClient
} from '../../shared/api/clientsApi';
import { createDriver, getDrivers } from '../../shared/api/driversApi';
import { getPlatformAdminAccess, signInPlatformAdmin, signOutPlatformAdmin } from '../../shared/api/platformAdminApi';
import type {
  ClientSignup,
  PlatformDriver,
  PlatformBannerAdmin,
  PlatformClient,
  PlatformStats,
  PlatformTemplateOption
} from '../../shared/api/platformTypes';
import { createRestaurantTemplate, getTemplateOptions } from '../../shared/api/templatesApi';
import { copyText, getCatalogAdminUrl, getCatalogPublicUrl } from '../../shared/platformUrls';
import {
  createClientSchema,
  createSlug,
  generateSecurePassword,
  type CreateClientFormValues
} from '../../shared/validation/clientCredentials';
import './platform-admin.css';

type PlatformRoute =
  | 'dashboard'
  | 'clients'
  | 'client-signups'
  | 'drivers'
  | 'catalogs'
  | 'templates'
  | 'import-export'
  | 'subscriptions'
  | 'settings'
  | 'audit-log';

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

const platformQueryClient = new QueryClient();

const navItems: Array<{ route: PlatformRoute; label: string; detail: string; Icon: typeof Home }> = [
  { route: 'dashboard', label: 'Главная', detail: 'Дашборд', Icon: Home },
  { route: 'clients', label: 'Клиенты', detail: 'Список клиентов', Icon: Users },
  { route: 'client-signups', label: 'Пользователи', detail: 'Клиенты приложения', Icon: UserRound },
  { route: 'drivers', label: 'Водители', detail: 'Доступы и статусы', Icon: Truck },
  { route: 'catalogs', label: 'Каталоги', detail: 'Управление каталогами', Icon: Store },
  { route: 'templates', label: 'Шаблоны', detail: 'Управление шаблонами', Icon: LayoutTemplate },
  { route: 'import-export', label: 'Импорт / Экспорт', detail: 'Данные и каталоги', Icon: Database },
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
  cafe: 'Кафе',
  salon: 'Салон красоты',
  barbershop: 'Барбершоп',
  shop: 'Магазин',
  fashion: 'Магазин',
  fitness: 'Фитнес'
};

const formatMoney = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

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
  if (path.includes('/admin/drivers')) return 'drivers';
  if (path.includes('/admin/templates')) return 'templates';
  if (path.includes('/admin/import-export')) return 'import-export';
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
      <button className="platform-sidebar__logout" type="button" onClick={() => void signOutPlatformAdmin()}>
        <LogOut />
        <span>Выйти</span>
      </button>
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
            <button type="button" onClick={() => void signOutPlatformAdmin()}>
              <LogOut />
              Выйти
            </button>
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
              className={route === itemRoute ? 'is-active' : ''}
              type="button"
              key={itemRoute}
              onClick={() => onNavigate(itemRoute)}
            >
              <Icon />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => setMoreOpen(true)}>
          <MoreHorizontal />
          <span>Ещё</span>
        </button>
      </nav>
    </>
  );
}

function StatsCards({ stats }: { stats?: PlatformStats }) {
  const items = [
    { label: 'Всего клиентов', value: stats?.totalClients ?? 0, Icon: Users },
    { label: 'Активные каталоги', value: stats?.activeCatalogs ?? 0, Icon: Store },
    { label: 'Выручка ресторанов', value: formatMoney(stats?.monthlyRevenue ?? 0), Icon: CreditCard },
    { label: 'Долг клиентов', value: stats?.totalDebt ?? 0, Icon: ShieldAlert },
    { label: 'Заказов всего', value: stats?.totalOrders ?? 0, Icon: Activity },
    { label: 'Доставки водителей', value: stats?.driverDeliveries ?? 0, Icon: Store }
  ];

  return (
    <section className="platform-stats">
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

function RestaurantStatsTable({ stats }: { stats?: PlatformStats }) {
  const restaurants = stats?.restaurantStats ?? [];

  if (restaurants.length === 0) {
    return null;
  }

  return (
    <section className="restaurant-stats-table">
      <header>
        <h2>Рестораны по выручке</h2>
        <p>Выручка, долг, заказы и доставки водителями платформы отдельно по каждому ресторану.</p>
      </header>
      <div>
        {restaurants.map((restaurant) => (
          <article key={restaurant.id}>
            <span>
              <strong>{restaurant.name}</strong>
              {restaurant.slug && <small>/{restaurant.slug}</small>}
            </span>
            <b>{formatMoney(restaurant.revenue)}</b>
            <small>Долг: {restaurant.debt}</small>
            <small>Заказы: {restaurant.ordersCount}</small>
            <small>Водители: {restaurant.driverDeliveries}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function DashboardPage() {
  const statsQuery = useQuery({ queryKey: ['platform-stats'], queryFn: getPlatformStats });

  return (
    <main className="platform-page">
      <header className="platform-page-head">
        <div>
          <h1>Главная</h1>
          <p>Общая статистика WayCatalog, ресторанов и доставок</p>
        </div>
      </header>
      <StatsCards stats={statsQuery.data} />
      <RestaurantStatsTable stats={statsQuery.data} />
    </main>
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

function ClientCards({ clients, onEdit }: { clients: PlatformClient[]; onEdit: (client: PlatformClient) => void }) {
  return (
    <section className="client-card-list">
      {clients.map((client) => {
        const publicUrl = getCatalogPublicUrl(client.catalogSlug);
        return (
          <article className="client-card" key={client.id}>
            <div className="client-card__head">
              <ClientAvatar client={client} />
              <div>
                <strong>{client.companyName}</strong>
                <small>{client.catalogSlug}</small>
              </div>
              <button type="button" aria-label="Действия" onClick={() => onEdit(client)}>
                <MoreHorizontal />
              </button>
            </div>
            <div className="client-card__meta">
              <span>{client.email}</span>
              <span>Шаблон: {businessTypeLabels[client.businessType] ?? client.businessType}</span>
              <StatusBadge status={client.status} />
              <PublicationBadge status={client.catalogStatus} />
            </div>
            <div className="client-card__link">
              <span>{publicUrl}</span>
              <button
                type="button"
                onClick={() => {
                  void copyText(publicUrl).then(() => toast.success('Ссылка скопирована'));
                }}
              >
                <Copy />
              </button>
            </div>
            <button
              className="client-card__open"
              type="button"
              onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')}
            >
              <Eye />
              Открыть каталог
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
  return (
    <section className="client-filters">
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
      <button type="button">
        <Filter />
        Фильтры
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
      businessType: firstTemplate?.businessType ?? 'restaurant',
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
  const adminConsentConfirmed = watch('adminConsentConfirmed');

  useEffect(() => {
    if (!slug && name) {
      setValue('slug', createSlug(name), { shouldValidate: true });
    }
  }, [name, setValue, slug]);

  useEffect(() => {
    if (!templateVersionId && firstTemplate) {
      setValue('templateVersionId', firstTemplate.templateVersionId, { shouldValidate: true });
      setValue('businessType', firstTemplate.businessType);
    }
  }, [firstTemplate, setValue, templateVersionId]);

  const selectedTemplate = templates.find((template) => template.templateVersionId === templateVersionId);

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
                Slug (для ссылки) <b>*</b>
              </span>
              <input {...register('slug')} placeholder="my-restaurant" aria-invalid={Boolean(errors.slug)} />
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
            <label>
              <span>
                Шаблон <b>*</b>
              </span>
              <select
                {...register('templateVersionId')}
                aria-invalid={Boolean(errors.templateVersionId)}
                onChange={(event) => {
                  const template = templates.find((item) => item.templateVersionId === event.target.value);
                  setValue('templateVersionId', event.target.value, { shouldValidate: true });
                  setValue('businessType', template?.businessType ?? 'restaurant');
                }}
              >
                {templates.map((template) => (
                  <option value={template.templateVersionId} key={template.templateVersionId}>
                    {template.templateName} v{template.version}
                  </option>
                ))}
              </select>
              {selectedTemplate && (
                <em>
                  {businessTypeLabels[selectedTemplate.businessType] ?? selectedTemplate.businessType}: {selectedTemplate.description}
                </em>
              )}
              {errors.templateVersionId && <small>{errors.templateVersionId.message}</small>}
            </label>
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
              <input {...register('primaryCity')} placeholder="Например: Грозный" />
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
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState(client.status);
  const [planId, setPlanId] = useState(client.planCode || 'trial');
  const [subscriptionStatus, setSubscriptionStatus] = useState(client.subscriptionStatus);
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState(client.subscriptionEndsAt?.slice(0, 10) ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
        password: password || undefined,
        status,
        planId,
        subscriptionStatus,
        subscriptionEndsAt: subscriptionEndsAt || null
      });
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
              <input value={primaryCity} onChange={(event) => setPrimaryCity(event.target.value)} />
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

        <footer className="client-form-footer">
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" disabled={isSubmitting}>
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

  const templatesQuery = useQuery({ queryKey: ['platform-templates'], queryFn: getTemplateOptions });
  const statsQuery = useQuery({ queryKey: ['platform-stats'], queryFn: getPlatformStats });
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

  const clients = clientsQuery.data?.data ?? [];
  const total = clientsQuery.data?.count ?? 0;

  return (
    <main className="platform-page clients-page">
      <header className="platform-page-head">
        <div>
          <h1>Клиенты</h1>
          <p>Управляйте клиентами и их каталогами</p>
        </div>
        <button type="button" onClick={onCreate}>
          <Plus />
          Добавить клиента
        </button>
      </header>
      <StatsCards stats={statsQuery.data} />
      <RestaurantStatsTable stats={statsQuery.data} />
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
          <ClientTable clients={clients} onEdit={onEdit} />
          <ClientCards clients={clients} onEdit={onEdit} />
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

function TemplatesPage({ templates }: { templates: PlatformTemplateOption[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!slug && name) {
      setSlug(createSlug(name));
    }
  }, [name, slug]);

  const onCreateTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !slug.trim()) {
      toast.error('Укажите название и slug шаблона');
      return;
    }

    setIsSubmitting(true);
    try {
      await createRestaurantTemplate({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        templateName: slug.trim().toLowerCase()
      });
      toast.success('Шаблон создан');
      setName('');
      setSlug('');
      void queryClient.invalidateQueries({ queryKey: ['platform-templates'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось создать шаблон');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="platform-page">
      <header className="platform-page-head">
        <div>
          <h1>Шаблоны</h1>
          <p>Создавайте ресторанные шаблоны и настраивайте их как обычные каталоги</p>
        </div>
      </header>

      <form className="platform-template-create" onSubmit={onCreateTemplate}>
        <label>
          Название шаблона
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Шаблон: Шашлычная"
            required
          />
        </label>
        <label>
          Slug шаблона
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="shashlik-base"
            required
          />
        </label>
        <button type="submit" disabled={isSubmitting}>
          <Plus />
          {isSubmitting ? 'Создаём...' : 'Создать шаблон'}
        </button>
      </form>

      <section className="platform-template-list">
        {templates.length === 0 && (
          <div className="platform-placeholder">
            <LayoutTemplate />
            <h2>Шаблонов пока нет</h2>
            <p>Создайте первый шаблон, затем откройте его админку и наполните каталог.</p>
          </div>
        )}
        {templates.map((template) => (
          <article className="platform-template-card" key={template.templateVersionId}>
            <div>
              <span className="platform-template-badge">TEMPLATE</span>
              <h2>{template.templateName}</h2>
              <p>{template.description}</p>
              {template.templateCatalogSlug && <small>#/{template.templateCatalogSlug}</small>}
            </div>
            {template.templateCatalogSlug && (
              <a href={getCatalogAdminUrl(template.templateCatalogSlug)}>
                <Settings />
                Настроить
              </a>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}

function ClientSignupsPage() {
  const queryClient = useQueryClient();
  const signupsQuery = useQuery({ queryKey: ['client-signups'], queryFn: getClientSignups });
  const signups = signupsQuery.data ?? [];

  const renderSignup = (signup: ClientSignup) => (
    <article className="client-signup-card" key={signup.id}>
      <span className="client-signup-card__avatar">
        <UserRound />
      </span>
      <div>
        <strong>{signup.name || 'Без имени'}</strong>
        <small>{signup.phone || 'Телефон не указан'}</small>
      </div>
      <span className="client-signup-card__meta">
        <small>{signup.source}</small>
        <b>{new Date(signup.createdAt).toLocaleDateString('ru-RU')}</b>
      </span>
      <button
        type="button"
        onClick={() => {
          void deleteClientSignup(signup.id).then(() => {
            void queryClient.invalidateQueries({ queryKey: ['client-signups'] });
          });
        }}
      >
        <Trash2 />
      </button>
    </article>
  );

  return (
    <main className="platform-page">
      <header className="platform-page-head">
        <div>
          <h1>Пользователи</h1>
          <p>Клиенты, которые вошли или оставили телефон в клиентской платформе</p>
        </div>
      </header>

      {signupsQuery.isLoading && <div className="platform-state">Загружаем пользователей...</div>}
      {signupsQuery.isError && (
        <div className="platform-state">
          Не удалось загрузить пользователей.
          <button type="button" onClick={() => void signupsQuery.refetch()}>
            Повторить
          </button>
        </div>
      )}
      {!signupsQuery.isLoading && !signupsQuery.isError && signups.length === 0 && (
        <section className="platform-placeholder">
          <UserRound />
          <h2>Пользователей пока нет</h2>
          <p>Когда клиент сохранит имя и телефон в профиле, запись появится здесь.</p>
        </section>
      )}
      {signups.length > 0 && <section className="client-signup-list">{signups.map(renderSignup)}</section>}
    </main>
  );
}

function DriversPage() {
  const queryClient = useQueryClient();
  const driversQuery = useQuery({ queryKey: ['platform-drivers'], queryFn: getDrivers });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cityName, setCityName] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [password, setPassword] = useState(generateSecurePassword());
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<CreateDriverSuccess | null>(null);

  const driverLoginUrl = `${window.location.origin}${import.meta.env.BASE_URL}#/driver`;

  const createNewDriver = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await createDriver({
        name,
        email,
        phone,
        cityName,
        vehicleInfo,
        carNumber,
        password
      });
      setSuccess({ email: result.email, password, driverId: result.driverId });
      setName('');
      setEmail('');
      setPhone('');
      setCityName('');
      setVehicleInfo('');
      setCarNumber('');
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
              <input value={cityName} onChange={(event) => setCityName(event.target.value)} placeholder="Грозный" />
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
        <footer className="client-form-footer">
          <button type="submit" disabled={isSubmitting}>
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
            <article className="driver-admin-card" key={driver.id}>
              <span className={driver.isOnline ? 'is-online' : ''}>{driver.isOnline ? 'Онлайн' : 'Оффлайн'}</span>
              <div>
                <strong>{driver.name}</strong>
                <small>{driver.email || driver.phone}</small>
              </div>
              <div>
                <strong>{driver.vehicleInfo || 'Транспорт не указан'}</strong>
                <small>{driver.carNumber || driver.cityName || 'Город не указан'}</small>
              </div>
              <b>{driver.rating.toFixed(1)}</b>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

function PlatformSettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['platform-global-settings'], queryFn: getPlatformGlobalSettings });
  const bannersQuery = useQuery({ queryKey: ['platform-banners'], queryFn: getPlatformBanners });
  const [supportWhatsapp, setSupportWhatsapp] = useState('');
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerSubtitle, setBannerSubtitle] = useState('');
  const [bannerKind, setBannerKind] = useState<PlatformBannerAdmin['kind']>('promo');
  const [bannerLink, setBannerLink] = useState('/restaurants');
  const [bannerImage, setBannerImage] = useState('');

  useEffect(() => {
    if (settingsQuery.data) {
      setSupportWhatsapp(settingsQuery.data.supportWhatsapp);
    }
  }, [settingsQuery.data]);

  const saveSupport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await savePlatformGlobalSettings({ supportWhatsapp });
      toast.success('Номер поддержки сохранён');
      void queryClient.invalidateQueries({ queryKey: ['platform-global-settings'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить настройки');
    }
  };

  const createBanner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await savePlatformBanner({
        title: bannerTitle,
        subtitle: bannerSubtitle,
        kind: bannerKind,
        imageUrl: bannerImage,
        linkUrl: bannerLink,
        sortOrder: bannersQuery.data?.length ?? 0,
        isActive: true
      });
      setBannerTitle('');
      setBannerSubtitle('');
      setBannerImage('');
      setBannerLink('/restaurants');
      toast.success('Баннер сохранён');
      void queryClient.invalidateQueries({ queryKey: ['platform-banners'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить баннер');
    }
  };

  return (
    <main className="platform-page">
      <header className="platform-page-head">
        <div>
          <h1>Настройки</h1>
          <p>Баннеры главной, новости, акции и поддержка клиентов</p>
        </div>
      </header>

      <form className="platform-settings-form" onSubmit={saveSupport}>
        <label>
          WhatsApp поддержки
          <input value={supportWhatsapp} onChange={(event) => setSupportWhatsapp(event.target.value)} placeholder="79990000000" />
        </label>
        <button type="submit">Сохранить поддержку</button>
      </form>

      <form className="platform-settings-form platform-settings-form--banner" onSubmit={createBanner}>
        <label>
          Заголовок
          <input value={bannerTitle} onChange={(event) => setBannerTitle(event.target.value)} required />
        </label>
        <label>
          Текст
          <input value={bannerSubtitle} onChange={(event) => setBannerSubtitle(event.target.value)} required />
        </label>
        <label>
          Тип
          <select value={bannerKind} onChange={(event) => setBannerKind(event.target.value as PlatformBannerAdmin['kind'])}>
            <option value="promo">Акция</option>
            <option value="contest">Конкурс</option>
            <option value="news">Новость</option>
          </select>
        </label>
        <label>
          Ссылка
          <input value={bannerLink} onChange={(event) => setBannerLink(event.target.value)} />
        </label>
        <label>
          Фото
          <input value={bannerImage} onChange={(event) => setBannerImage(event.target.value)} placeholder="https://..." />
        </label>
        <button type="submit">
          <Plus />
          Добавить баннер
        </button>
      </form>

      <section className="platform-banner-list">
        {(bannersQuery.data ?? []).map((banner) => (
          <article className="platform-banner-card" key={banner.id}>
            <span>{banner.kind}</span>
            <strong>{banner.title}</strong>
            <small>{banner.subtitle}</small>
            <button
              type="button"
              onClick={() => {
                void deletePlatformBanner(banner.id).then(() => {
                  void queryClient.invalidateQueries({ queryKey: ['platform-banners'] });
                });
              }}
            >
              <Trash2 />
            </button>
          </article>
        ))}
      </section>
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

function PlatformLoginState({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('studiacatalog@outlook.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const access = await signInPlatformAdmin(email, password);
      if (!access.isPlatformAdmin) {
        toast.error('Пользователь вошёл, но не найден в platform_admins');
        return;
      }
      toast.success('Вход выполнен');
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось войти');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="platform-login">
      <Toaster richColors position="top-center" />
      <form className="platform-login__card" onSubmit={onSubmit}>
        <span className="platform-login__icon">
          <LockKeyhole />
        </span>
        <h1>Вход суперадмина</h1>
        <p>Введите email и пароль пользователя, который добавлен в таблицу platform_admins.</p>
        <label>
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
            required
          />
        </label>
        <label>
          Пароль
          <span className="platform-login__password">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Показать пароль">
              <Eye />
            </button>
          </span>
        </label>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Проверяем...' : 'Войти'}
        </button>
      </form>
    </main>
  );
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
    queryFn: getPlatformAdminAccess
  });
  const templatesQuery = useQuery({ queryKey: ['platform-templates'], queryFn: getTemplateOptions });

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
      return <TemplatesPage templates={templatesQuery.data ?? []} />;
    }
    if (route === 'client-signups') {
      return <ClientSignupsPage />;
    }
    if (route === 'drivers') {
      return <DriversPage />;
    }
    if (route === 'settings') {
      return <PlatformSettingsPage />;
    }
    return <PlaceholderPage route={route} />;
  }, [route, templatesQuery.data]);

  if (platformAdminQuery.isLoading) {
    return <main className="platform-state platform-state--full">Проверяем права доступа...</main>;
  }

  if (!platformAdminQuery.data?.hasSession) {
    return <PlatformLoginState onSuccess={() => void platformAdminQuery.refetch()} />;
  }

  if (!platformAdminQuery.data.isPlatformAdmin) {
    return (
      <ForbiddenState
        email={platformAdminQuery.data.email}
        onSignOut={() => {
          void signOutPlatformAdmin().then(() => {
            void platformAdminQuery.refetch();
          });
        }}
      />
    );
  }

  return (
    <div className="platform-admin-shell">
      <Toaster richColors position="top-center" />
      <PlatformSidebar route={route} onNavigate={(nextRoute) => navigateToRoute(nextRoute, setRoute)} />
      <section className="platform-workspace">
        <header className="platform-topbar">
          <button type="button" aria-label="Меню">
            <MoreHorizontal />
          </button>
          <div>
            <span>Администратор</span>
            <small>{platformAdminQuery.data.email ?? 'admin@catalog.app'}</small>
          </div>
        </header>
        {content}
      </section>
      <PlatformMobileNav route={route} onNavigate={(nextRoute) => navigateToRoute(nextRoute, setRoute)} />
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
