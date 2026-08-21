import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bike,
  ChevronRight,
  Download,
  Filter,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  UserRound,
  Users,
  WalletCards,
  X
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { createClientSignup, getClients, getPlatformUserDirectory } from '../../shared/api/clientsApi';
import { getDrivers } from '../../shared/api/driversApi';
import {
  deletePlatformUser,
  getPlatformLegalConsentHistory,
  type PlatformLegalConsentRecord,
  type PlatformLegalConsentSubject,
  type PlatformUserDeletionTarget
} from '../../shared/api/platformUsersApi';
import type { PlatformClient, PlatformDriver, PlatformUserDirectoryItem } from '../../shared/api/platformTypes';
import { downloadCsv, downloadXlsx, type ExportCell } from '../../shared/exportTable';
import './platform-users.css';

const formatMoney = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString('ru-RU') : 'Нет заказов';
const formatDateTime = (value: string | null) => value
  ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
  : 'Не зафиксировано';
type UserGroup = 'restaurants' | 'drivers' | 'clients';

const legalDocumentLabels: Record<string, string> = {
  user_agreement: 'Пользовательское соглашение',
  client_consent: 'Согласие на обработку персональных данных',
  advertising_consent: 'Согласие на рекламные сообщения',
  order_transfer_consent: 'Передача данных бизнесу и водителю',
  restaurant_consent: 'Согласие представителя бизнеса',
  restaurant_offer: 'Оферта для бизнеса',
  driver_consent: 'Согласие водителя',
  driver_offer: 'Оферта для водителя'
};

const legalSourceLabels: Record<string, string> = {
  client_registration: 'Регистрация',
  checkout_current_version: 'Оформление заказа',
  order_checkout: 'Первое оформление заказа',
  restaurant_activation: 'Активация бизнеса',
  driver_activation: 'Активация водителя'
};

const exportHeaders = [
  'Имя',
  'Телефон',
  'Email',
  'Населённый пункт',
  'Источник',
  'Дата регистрации',
  'Заказы',
  'Потрачено',
  'Средний чек',
  'Последний заказ',
  'Любимый ресторан'
];

const makeExportRows = (users: PlatformUserDirectoryItem[]): ExportCell[][] => users.map((user) => [
  user.name,
  user.phone,
  user.email,
  user.cityName,
  user.source,
  formatDate(user.createdAt),
  user.ordersCount,
  user.totalSpent,
  user.averageCheck,
  formatDate(user.lastOrderAt),
  user.favoriteRestaurant
]);

type PlatformAccountListItem = {
  id: string;
  legalSubjectId: string;
  kind: 'restaurant' | 'driver';
  name: string;
  contact: string;
  location: string;
  status: string;
  createdAt: string;
};

const mapRestaurantAccount = (restaurant: PlatformClient): PlatformAccountListItem => ({
  id: restaurant.id,
  legalSubjectId: restaurant.catalogId,
  kind: 'restaurant',
  name: restaurant.companyName,
  contact: restaurant.phone || restaurant.email || 'Контакт не указан',
  location: restaurant.primaryCity,
  status: restaurant.status,
  createdAt: restaurant.createdAt
});

const mapDriverAccount = (driver: PlatformDriver): PlatformAccountListItem => ({
  id: driver.id,
  legalSubjectId: driver.id,
  kind: 'driver',
  name: driver.name,
  contact: driver.phone || driver.email || 'Контакт не указан',
  location: driver.cityName,
  status: driver.isActive ? 'Активен' : 'Отключён',
  createdAt: driver.createdAt
});

function LegalConsentHistory({
  subject,
  getHistory
}: {
  subject: PlatformLegalConsentSubject;
  getHistory: (subject: PlatformLegalConsentSubject) => Promise<PlatformLegalConsentRecord[]>;
}) {
  const historyQuery = useQuery({
    queryKey: ['platform-legal-consent-history', subject],
    queryFn: () => getHistory(subject),
    staleTime: 15_000
  });

  return (
    <article className="platform-user-history platform-user-legal-history">
      <h3><ShieldCheck /> История согласий</h3>
      {historyQuery.isLoading && <p>Загружаем историю…</p>}
      {historyQuery.isError && <p>Не удалось загрузить историю согласий.</p>}
      {!historyQuery.isLoading && !historyQuery.isError && (historyQuery.data?.length ?? 0) === 0 && (
        <p>Серверные подтверждения для этого пользователя не зафиксированы.</p>
      )}
      {historyQuery.data?.map((record) => (
        <div key={record.id}>
          <span>
            <b>{legalDocumentLabels[record.documentCode] ?? record.documentCode}</b>
            <small>
              Версия {record.documentVersion} · {legalSourceLabels[record.source] ?? record.source}
              {record.orderId ? ` · заказ ${record.orderId.slice(0, 8)}` : ''}
            </small>
            <small>SHA-256: {record.documentSha256.slice(0, 12)}…</small>
          </span>
          <strong className={record.granted && !record.revokedAt ? 'is-current' : 'is-revoked'}>
            {record.revokedAt ? `Отозвано ${formatDateTime(record.revokedAt)}` : record.granted ? `Принято ${formatDateTime(record.grantedAt ?? record.createdAt)}` : `Отклонено ${formatDateTime(record.createdAt)}`}
          </strong>
        </div>
      ))}
    </article>
  );
}

function LegalConsentHistoryDialog({
  title,
  subject,
  getHistory,
  onClose
}: {
  title: string;
  subject: PlatformLegalConsentSubject;
  getHistory: (subject: PlatformLegalConsentSubject) => Promise<PlatformLegalConsentRecord[]>;
  onClose: () => void;
}) {
  return (
    <div className="platform-user-modal" role="dialog" aria-modal="true" aria-labelledby="platform-legal-history-title">
      <button type="button" className="platform-user-modal__backdrop" onClick={onClose} aria-label="Закрыть историю согласий" />
      <section>
        <header>
          <div><small>Юридические подтверждения</small><h2 id="platform-legal-history-title">{title}</h2></div>
          <button type="button" onClick={onClose} aria-label="Закрыть"><X /></button>
        </header>
        <LegalConsentHistory subject={subject} getHistory={getHistory} />
      </section>
    </div>
  );
}

function PlatformAccountList({
  accounts,
  onDelete,
  onOpenLegal
}: {
  accounts: PlatformAccountListItem[];
  onDelete: (account: PlatformAccountListItem) => void;
  onOpenLegal: (account: PlatformAccountListItem) => void;
}) {
  return (
    <section className="platform-user-list platform-account-list">
      <header><span>Пользователь</span><span>Местоположение</span><span>Статус</span><span>Регистрация</span></header>
      {accounts.map((account) => (
        <article key={account.id}>
          <span className="platform-user-identity">
            <i><UserRound /></i>
            <span><b>{account.name}</b><small>{account.contact}</small></span>
          </span>
          <span>{account.location || 'Не указано'}</span>
          <strong>{account.status}</strong>
          <span>{formatDate(account.createdAt)}</span>
          <span className="platform-account-list__actions">
            <button type="button" onClick={() => onOpenLegal(account)} aria-label={`История согласий ${account.name}`}><ShieldCheck /></button>
            <button type="button" onClick={() => onDelete(account)} aria-label={`Удалить пользователя ${account.name}`}><Trash2 /></button>
          </span>
        </article>
      ))}
      {accounts.length === 0 && <p>В этой группе пользователи не найдены.</p>}
    </section>
  );
}

function PlatformUserDetails({
  user,
  getHistory,
  onClose,
  onDelete
}: {
  user: PlatformUserDirectoryItem;
  getHistory: (subject: PlatformLegalConsentSubject) => Promise<PlatformLegalConsentRecord[]>;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="platform-user-modal" role="dialog" aria-modal="true" aria-labelledby="platform-user-title">
      <button type="button" className="platform-user-modal__backdrop" onClick={onClose} aria-label="Закрыть карточку пользователя" />
      <section>
        <header>
          <div>
            <small>Карточка клиента</small>
            <h2 id="platform-user-title">{user.name}</h2>
          </div>
          <div className="platform-user-modal__actions">
            {!user.id.startsWith('order-user-') && <button type="button" onClick={onDelete} aria-label={`Удалить пользователя ${user.name}`}><Trash2 /></button>}
            <button type="button" onClick={onClose} aria-label="Закрыть"><X /></button>
          </div>
        </header>
        <div className="platform-user-details-grid">
          <article>
            <h3>Данные</h3>
            <dl>
              <div><dt>Телефон</dt><dd>{user.phone || 'Не указан'}</dd></div>
              <div><dt>Email</dt><dd>{user.email || 'Не указан'}</dd></div>
              <div><dt>Населённый пункт</dt><dd>{user.cityName || 'Не указан'}</dd></div>
              <div><dt>Регистрация</dt><dd>{formatDate(user.createdAt)}</dd></div>
              <div><dt>Источник</dt><dd>{user.source || 'Не указан'}</dd></div>
            </dl>
          </article>
          <article>
            <h3>Статистика</h3>
            <dl>
              <div><dt>Заказы</dt><dd>{user.ordersCount}</dd></div>
              <div><dt>Покупки</dt><dd>{formatMoney(user.totalSpent)}</dd></div>
              <div><dt>Средний чек</dt><dd>{formatMoney(user.averageCheck)}</dd></div>
              <div><dt>Последний заказ</dt><dd>{formatDate(user.lastOrderAt)}</dd></div>
              <div><dt>Любимый ресторан</dt><dd>{user.favoriteRestaurant || 'Нет данных'}</dd></div>
            </dl>
          </article>
        </div>
        <article className="platform-user-history">
          <h3>История заказов</h3>
          {user.orders.length === 0 ? (
            <p>Заказов пока нет.</p>
          ) : (
            user.orders.map((order) => (
              <div key={order.id}>
                <span><b>{order.restaurantName}</b><small>{formatDate(order.createdAt)} · {order.status || 'Без статуса'}</small></span>
                <strong>{formatMoney(order.amount)}</strong>
              </div>
            ))
          )}
        </article>
        <LegalConsentHistory subject={{ kind: 'client', phone: user.phone }} getHistory={getHistory} />
      </section>
    </div>
  );
}

type PendingUserDeletion = PlatformUserDeletionTarget & {
  name: string;
};

const deletionLabels = {
  restaurant: { title: 'Удалить ресторан?', noun: 'ресторана' },
  driver: { title: 'Удалить водителя?', noun: 'водителя' },
  client: { title: 'Удалить клиента?', noun: 'клиента' }
} as const;

function DeleteUserDialog({
  target,
  deleting,
  onCancel,
  onConfirm
}: {
  target: PendingUserDeletion;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const label = deletionLabels[target.kind];
  return (
    <div className="platform-user-modal platform-user-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="platform-user-delete-title">
      <button type="button" className="platform-user-modal__backdrop" onClick={onCancel} aria-label="Отменить удаление" />
      <section>
        <header>
          <div><small>Подтверждение удаления</small><h2 id="platform-user-delete-title">{label.title}</h2></div>
          <button type="button" onClick={onCancel} aria-label="Закрыть"><X /></button>
        </header>
        <div className="platform-user-delete-modal__warning"><Trash2 /><div><strong>{target.name}</strong><p>Доступ {label.noun} будет удалён. Заказы и история сохранятся.</p></div></div>
        <footer>
          <button type="button" onClick={onCancel} disabled={deleting}>Отмена</button>
          <button type="button" className="is-danger" onClick={onConfirm} disabled={deleting}>{deleting ? 'Удаляем…' : 'Удалить пользователя'}</button>
        </footer>
      </section>
    </div>
  );
}

export function PlatformUsersPage({
  deleteUser = deletePlatformUser,
  getLegalHistory = getPlatformLegalConsentHistory
}: {
  deleteUser?: (target: PlatformUserDeletionTarget) => Promise<void>;
  getLegalHistory?: (subject: PlatformLegalConsentSubject) => Promise<PlatformLegalConsentRecord[]>;
} = {}) {
  const queryClient = useQueryClient();
  const restaurantsQuery = useQuery({
    queryKey: ['platform-user-restaurants'],
    queryFn: () => getClients({ page: 1, pageSize: 1000, status: 'all', payment: 'all', templateId: 'all' }),
    staleTime: 15_000
  });
  const driversQuery = useQuery({
    queryKey: ['platform-user-drivers'],
    queryFn: getDrivers,
    staleTime: 15_000
  });
  const directoryQuery = useQuery({
    queryKey: ['platform-user-directory'],
    queryFn: getPlatformUserDirectory,
    staleTime: 15_000
  });
  const [activeGroup, setActiveGroup] = useState<UserGroup>('restaurants');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settlement, setSettlement] = useState('all');
  const [restaurantId, setRestaurantId] = useState('all');
  const [orderState, setOrderState] = useState('all');
  const [period, setPeriod] = useState('all');
  const [minimumSpent, setMinimumSpent] = useState('');
  const [maximumSpent, setMaximumSpent] = useState('');
  const [selectedUser, setSelectedUser] = useState<PlatformUserDirectoryItem | null>(null);
  const [selectedLegalAccount, setSelectedLegalAccount] = useState<PlatformAccountListItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<PendingUserDeletion | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const directory = directoryQuery.data;
  const clientAccounts = useMemo(
    () => (directory?.users ?? []).filter((user) => !user.id.startsWith('order-user-')),
    [directory]
  );

  const filteredRestaurants = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
    return (restaurantsQuery.data?.data ?? []).filter((restaurant) => !normalizedSearch || [
      restaurant.companyName,
      restaurant.ownerName,
      restaurant.phone,
      restaurant.email,
      restaurant.primaryCity
    ].join(' ').toLocaleLowerCase('ru-RU').includes(normalizedSearch));
  }, [restaurantsQuery.data, search]);

  const filteredDrivers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
    return (driversQuery.data ?? []).filter((driver) => !normalizedSearch || [
      driver.name,
      driver.phone,
      driver.email,
      driver.cityName,
      driver.carNumber
    ].join(' ').toLocaleLowerCase('ru-RU').includes(normalizedSearch));
  }, [driversQuery.data, search]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
    const now = Date.now();
    return clientAccounts.filter((user) => {
      if (normalizedSearch && ![user.name, user.phone, user.email, user.cityName]
        .join(' ')
        .toLocaleLowerCase('ru-RU')
        .includes(normalizedSearch)) return false;
      if (settlement !== 'all' && user.cityName !== settlement) return false;
      if (restaurantId !== 'all' && !user.orders.some((order) => order.restaurantId === restaurantId)) return false;
      if (orderState === 'with-orders' && user.ordersCount === 0) return false;
      if (orderState === 'without-orders' && user.ordersCount > 0) return false;
      if (minimumSpent && user.totalSpent < Number(minimumSpent)) return false;
      if (maximumSpent && user.totalSpent > Number(maximumSpent)) return false;
      if (period !== 'all') {
        if (!user.lastOrderAt) return false;
        const days = Number(period);
        if (now - Date.parse(user.lastOrderAt) > days * 86_400_000) return false;
      }
      return true;
    });
  }, [clientAccounts, maximumSpent, minimumSpent, orderState, period, restaurantId, search, settlement]);

  const exportRows = makeExportRows(filteredUsers);
  const totalUsers = (restaurantsQuery.data?.count ?? 0) + (driversQuery.data?.length ?? 0) + clientAccounts.length;
  const activeQuery = activeGroup === 'restaurants'
    ? restaurantsQuery
    : activeGroup === 'drivers'
      ? driversQuery
      : directoryQuery;
  const addUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingUser(true);
    try {
      await createClientSignup({ name: newName, phone: newPhone });
      setNewName('');
      setNewPhone('');
      setAddOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['platform-user-directory'] });
      toast.success('Пользователь добавлен');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось добавить пользователя');
    } finally {
      setSavingUser(false);
    }
  };
  const confirmDeleteUser = async () => {
    if (!pendingDeletion || deletingUser) return;
    setDeletingUser(true);
    try {
      await deleteUser({ kind: pendingDeletion.kind, id: pendingDeletion.id });
      setSelectedUser(null);
      setPendingDeletion(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['platform-user-restaurants'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-user-drivers'] }),
        queryClient.invalidateQueries({ queryKey: ['platform-user-directory'] })
      ]);
      toast.success('Пользователь удалён');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось удалить пользователя');
    } finally {
      setDeletingUser(false);
    }
  };

  return (
    <main className="platform-page platform-users-page">
      <header className="platform-page-head">
        <div>
          <h1>Пользователи</h1>
          <p>Рестораны, водители и клиенты · {totalUsers} пользователей</p>
        </div>
        {activeGroup === 'clients' && (
          <button type="button" onClick={() => setAddOpen(true)}>
            <Plus />Добавить
          </button>
        )}
      </header>

      <section className="platform-user-groups" role="tablist" aria-label="Группы пользователей">
        <button type="button" role="tab" aria-selected={activeGroup === 'restaurants'} onClick={() => setActiveGroup('restaurants')}>
          <span><Store /></span><small>Рестораны</small><strong>{restaurantsQuery.data?.count ?? 0}</strong>
        </button>
        <button type="button" role="tab" aria-selected={activeGroup === 'drivers'} onClick={() => setActiveGroup('drivers')}>
          <span><Bike /></span><small>Водители</small><strong>{driversQuery.data?.length ?? 0}</strong>
        </button>
        <button type="button" role="tab" aria-selected={activeGroup === 'clients'} onClick={() => setActiveGroup('clients')}>
          <span><Users /></span><small>Клиенты</small><strong>{clientAccounts.length}</strong>
        </button>
      </section>

      {activeGroup === 'clients' && (
        <section className="platform-user-stats platform-user-stats--analytics">
          <article><span><ShoppingBag /></span><small>Заказы</small><strong>{directory?.totalOrders ?? 0}</strong></article>
          <article><span><WalletCards /></span><small>Выручка</small><strong>{formatMoney(directory?.totalRevenue ?? 0)}</strong></article>
        </section>
      )}

      <section className={`platform-user-toolbar${activeGroup === 'clients' ? '' : ' platform-user-toolbar--search-only'}`}>
        <label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, телефон или email" /></label>
        {activeGroup === 'clients' && <button type="button" className={filtersOpen ? 'is-active' : ''} onClick={() => setFiltersOpen((value) => !value)}><Filter /><span>Фильтр</span></button>}
        {activeGroup === 'clients' && (
          <div className="platform-user-export">
            <button type="button" onClick={() => downloadCsv('waycatalog-users', exportHeaders, exportRows)}><Download /><span>CSV</span></button>
            <button type="button" onClick={() => void downloadXlsx('waycatalog-users', 'Пользователи', exportHeaders, exportRows)}><span>XLSX</span></button>
          </div>
        )}
      </section>

      {activeGroup === 'clients' && filtersOpen && (
        <section className="platform-user-filters">
          <label>Населённый пункт<select value={settlement} onChange={(event) => setSettlement(event.target.value)}><option value="all">Все</option>{directory?.settlements.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
          <label>Ресторан<select value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)}><option value="all">Все</option>{directory?.restaurants.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Заказы<select value={orderState} onChange={(event) => setOrderState(event.target.value)}><option value="all">Все</option><option value="with-orders">Есть заказы</option><option value="without-orders">Нет заказов</option></select></label>
          <label>Последний заказ<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">За всё время</option><option value="30">30 дней</option><option value="90">90 дней</option><option value="365">Год</option></select></label>
          <label>Сумма от<input type="number" min="0" value={minimumSpent} onChange={(event) => setMinimumSpent(event.target.value)} /></label>
          <label>Сумма до<input type="number" min="0" value={maximumSpent} onChange={(event) => setMaximumSpent(event.target.value)} /></label>
        </section>
      )}

      {activeQuery.isLoading && <div className="platform-state">Загружаем пользователей…</div>}
      {activeQuery.isError && <div className="platform-state">Не удалось загрузить пользователей.<button type="button" onClick={() => void activeQuery.refetch()}>Повторить</button></div>}
      {activeGroup === 'clients' && !directoryQuery.isLoading && !directoryQuery.isError && (
        <section className="platform-user-list">
          <header><span>Пользователь</span><span>Заказы</span><span>Потрачено</span><span>Последний заказ</span></header>
          {filteredUsers.map((user) => (
            <button type="button" key={user.id} onClick={() => setSelectedUser(user)}>
              <span className="platform-user-identity">
                <i><UserRound /></i>
                <span><b>{user.name}</b><small>{user.phone || user.email || 'Контакт не указан'}</small>{user.cityName && <em><MapPin />{user.cityName}</em>}</span>
              </span>
              <span><b>{user.ordersCount}</b><small>{user.ordersCount === 1 ? 'заказ' : 'заказов'}</small></span>
              <strong>{formatMoney(user.totalSpent)}</strong>
              <span className={user.lastOrderAt ? 'has-order' : ''}><b>{formatDate(user.lastOrderAt)}</b><small>{user.lastOrderAt ? new Date(user.lastOrderAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'Нет заказов'}</small></span>
              <ChevronRight />
            </button>
          ))}
          {filteredUsers.length === 0 && <p>По выбранным условиям пользователи не найдены.</p>}
        </section>
      )}
      {activeGroup === 'restaurants' && !restaurantsQuery.isLoading && !restaurantsQuery.isError && (
        <PlatformAccountList
          accounts={filteredRestaurants.map(mapRestaurantAccount)}
          onDelete={(account) => setPendingDeletion({ kind: account.kind, id: account.id, name: account.name })}
          onOpenLegal={setSelectedLegalAccount}
        />
      )}
      {activeGroup === 'drivers' && !driversQuery.isLoading && !driversQuery.isError && (
        <PlatformAccountList
          accounts={filteredDrivers.map(mapDriverAccount)}
          onDelete={(account) => setPendingDeletion({ kind: account.kind, id: account.id, name: account.name })}
          onOpenLegal={setSelectedLegalAccount}
        />
      )}

      {selectedUser && <PlatformUserDetails user={selectedUser} getHistory={getLegalHistory} onClose={() => setSelectedUser(null)} onDelete={() => setPendingDeletion({ kind: 'client', id: selectedUser.id, name: selectedUser.name })} />}
      {selectedLegalAccount && (
        <LegalConsentHistoryDialog
          title={selectedLegalAccount.name}
          subject={selectedLegalAccount.kind === 'restaurant'
            ? { kind: 'restaurant', id: selectedLegalAccount.legalSubjectId }
            : { kind: 'driver', id: selectedLegalAccount.legalSubjectId }}
          getHistory={getLegalHistory}
          onClose={() => setSelectedLegalAccount(null)}
        />
      )}
      {addOpen && (
        <div className="platform-user-modal platform-user-add-modal" role="dialog" aria-modal="true" aria-labelledby="platform-user-add-title">
          <button type="button" className="platform-user-modal__backdrop" onClick={() => setAddOpen(false)} aria-label="Закрыть" />
          <section>
            <header>
              <div><small>Клиентская база</small><h2 id="platform-user-add-title">Добавить пользователя</h2></div>
              <button type="button" onClick={() => setAddOpen(false)} aria-label="Закрыть"><X /></button>
            </header>
            <form onSubmit={(event) => void addUser(event)}>
              <label>Имя<input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Имя пользователя" required /></label>
              <label>Телефон<input value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="+7 (___) ___-__-__" inputMode="tel" required /></label>
              <button type="submit" disabled={savingUser}>{savingUser ? 'Добавляем…' : 'Добавить'}</button>
            </form>
          </section>
        </div>
      )}
      {pendingDeletion && <DeleteUserDialog target={pendingDeletion} deleting={deletingUser} onCancel={() => setPendingDeletion(null)} onConfirm={() => void confirmDeleteUser()} />}
    </main>
  );
}
