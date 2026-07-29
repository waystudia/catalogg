import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Download,
  Filter,
  MapPin,
  Plus,
  Search,
  ShoppingBag,
  UserRound,
  Users,
  WalletCards,
  X
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { createClientSignup, getPlatformUserDirectory } from '../../shared/api/clientsApi';
import type { PlatformUserDirectoryItem } from '../../shared/api/platformTypes';
import { downloadCsv, downloadXlsx, type ExportCell } from '../../shared/exportTable';
import './platform-users.css';

const formatMoney = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString('ru-RU') : 'Нет заказов';

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

function PlatformUserDetails({ user, onClose }: { user: PlatformUserDirectoryItem; onClose: () => void }) {
  return (
    <div className="platform-user-modal" role="dialog" aria-modal="true" aria-labelledby="platform-user-title">
      <button type="button" className="platform-user-modal__backdrop" onClick={onClose} aria-label="Закрыть карточку пользователя" />
      <section>
        <header>
          <div>
            <small>Карточка клиента</small>
            <h2 id="platform-user-title">{user.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть"><X /></button>
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
      </section>
    </div>
  );
}

export function PlatformUsersPage() {
  const queryClient = useQueryClient();
  const directoryQuery = useQuery({
    queryKey: ['platform-user-directory'],
    queryFn: getPlatformUserDirectory,
    staleTime: 15_000
  });
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settlement, setSettlement] = useState('all');
  const [restaurantId, setRestaurantId] = useState('all');
  const [orderState, setOrderState] = useState('all');
  const [period, setPeriod] = useState('all');
  const [minimumSpent, setMinimumSpent] = useState('');
  const [maximumSpent, setMaximumSpent] = useState('');
  const [selectedUser, setSelectedUser] = useState<PlatformUserDirectoryItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const directory = directoryQuery.data;

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
    const now = Date.now();
    return (directory?.users ?? []).filter((user) => {
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
  }, [directory, maximumSpent, minimumSpent, orderState, period, restaurantId, search, settlement]);

  const exportRows = makeExportRows(filteredUsers);
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

  return (
    <main className="platform-page platform-users-page">
      <header className="platform-page-head">
        <div>
          <h1>Пользователи</h1>
          <p>Клиентская база · {directory?.users.length ?? 0} пользователей</p>
        </div>
        <button type="button" onClick={() => setAddOpen(true)}>
          <Plus />Добавить
        </button>
      </header>

      <section className="platform-user-stats">
        <article><span><Users /></span><small>Пользователи</small><strong>{directory?.users.length ?? 0}</strong></article>
        <article><span><ShoppingBag /></span><small>Заказы</small><strong>{directory?.totalOrders ?? 0}</strong></article>
        <article><span><WalletCards /></span><small>Выручка</small><strong>{formatMoney(directory?.totalRevenue ?? 0)}</strong></article>
      </section>

      <section className="platform-user-toolbar">
        <label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, телефон или email" /></label>
        <button type="button" className={filtersOpen ? 'is-active' : ''} onClick={() => setFiltersOpen((value) => !value)}><Filter /><span>Фильтр</span></button>
        <div className="platform-user-export">
          <button type="button" onClick={() => downloadCsv('waycatalog-users', exportHeaders, exportRows)}><Download /><span>CSV</span></button>
          <button type="button" onClick={() => void downloadXlsx('waycatalog-users', 'Пользователи', exportHeaders, exportRows)}><span>XLSX</span></button>
        </div>
      </section>

      {filtersOpen && (
        <section className="platform-user-filters">
          <label>Населённый пункт<select value={settlement} onChange={(event) => setSettlement(event.target.value)}><option value="all">Все</option>{directory?.settlements.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
          <label>Ресторан<select value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)}><option value="all">Все</option>{directory?.restaurants.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Заказы<select value={orderState} onChange={(event) => setOrderState(event.target.value)}><option value="all">Все</option><option value="with-orders">Есть заказы</option><option value="without-orders">Нет заказов</option></select></label>
          <label>Последний заказ<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">За всё время</option><option value="30">30 дней</option><option value="90">90 дней</option><option value="365">Год</option></select></label>
          <label>Сумма от<input type="number" min="0" value={minimumSpent} onChange={(event) => setMinimumSpent(event.target.value)} /></label>
          <label>Сумма до<input type="number" min="0" value={maximumSpent} onChange={(event) => setMaximumSpent(event.target.value)} /></label>
        </section>
      )}

      {directoryQuery.isLoading && <div className="platform-state">Загружаем клиентскую базу…</div>}
      {directoryQuery.isError && <div className="platform-state">Не удалось загрузить пользователей.<button type="button" onClick={() => void directoryQuery.refetch()}>Повторить</button></div>}
      {!directoryQuery.isLoading && !directoryQuery.isError && (
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

      {selectedUser && <PlatformUserDetails user={selectedUser} onClose={() => setSelectedUser(null)} />}
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
    </main>
  );
}
