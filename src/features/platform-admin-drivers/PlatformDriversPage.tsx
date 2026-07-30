import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Filter,
  KeyRound,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Truck,
  UserRound,
  UsersRound,
  WalletCards,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createDriver,
  getDriverRestaurantAssignments,
  getDrivers,
  getPlatformDriverActivity,
  saveDriverRestaurantAssignments,
  updateDriverProfile,
  updateDriverServiceSettlements
} from '../../shared/api/driversApi';
import { getDeliverySettlements } from '../../shared/api/settlementsApi';
import type { CreateDriverResult, PlatformDriver, PlatformDriverActivity } from '../../shared/api/platformTypes';
import { downloadCsv, downloadXlsx } from '../../shared/exportTable';
import { copyText } from '../../shared/platformUrls';
import './platform-drivers.css';

type DriverFilter = 'all' | 'online' | 'offline' | 'debt';
type DriverDialog =
  | { type: 'create' }
  | { type: 'profile' | 'edit' | 'orders' | 'finance'; driver: PlatformDriver }
  | null;

const formatMoney = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const generatePassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const values = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
};

const activityFor = (items: PlatformDriverActivity[], driverId: string) =>
  items.find((item) => item.driverId === driverId) ?? {
    driverId,
    deliveryCount: 0,
    completedDeliveries: 0,
    earnedAmount: 0
  };

function Sheet({
  title,
  subtitle,
  onClose,
  children
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="platform-driver-sheet__backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="platform-driver-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <span>
            <strong>{title}</strong>
            {subtitle && <small>{subtitle}</small>}
          </span>
          <button type="button" onClick={onClose} aria-label="Закрыть"><X /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

function DriverForm({
  driver,
  cityOptions,
  settlementOptions,
  onClose,
  onSaved
}: {
  driver?: PlatformDriver;
  cityOptions: string[];
  settlementOptions: string[];
  onClose: () => void;
  onSaved: (result?: CreateDriverResult, password?: string) => void;
}) {
  const [name, setName] = useState(driver?.name ?? '');
  const [email, setEmail] = useState(driver?.email ?? '');
  const [phone, setPhone] = useState(driver?.phone ?? '');
  const [cityName, setCityName] = useState(driver?.cityName ?? '');
  const [serviceSettlements, setServiceSettlements] = useState(driver?.serviceSettlements ?? []);
  const [vehicleInfo, setVehicleInfo] = useState(driver?.vehicleInfo ?? '');
  const [carNumber, setCarNumber] = useState(driver?.carNumber ?? '');
  const [maxActiveDeliveries, setMaxActiveDeliveries] = useState(driver?.maxActiveDeliveries ?? 1);
  const [restaurantIds, setRestaurantIds] = useState<string[]>([]);
  const [primaryRestaurantId, setPrimaryRestaurantId] = useState('');
  const [password, setPassword] = useState(driver ? '' : generatePassword());
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const assignmentsQuery = useQuery({
    queryKey: ['driver-restaurant-assignments', driver?.id],
    queryFn: () => getDriverRestaurantAssignments(driver?.id ?? ''),
    enabled: Boolean(driver?.id)
  });

  useEffect(() => {
    const assignments = assignmentsQuery.data?.assignments;
    if (!assignments) return;
    setRestaurantIds(assignments.map((assignment) => assignment.restaurantId));
    setPrimaryRestaurantId(assignments.find((assignment) => assignment.isPrimary)?.restaurantId ?? '');
  }, [assignmentsQuery.data]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (driver) {
        await updateDriverProfile({
          driverId: driver.id,
          userId: driver.userId,
          name,
          phone,
          cityName,
          serviceSettlements,
          vehicleInfo,
          carNumber,
          maxActiveDeliveries,
          password: password.trim() || undefined
        });
        await saveDriverRestaurantAssignments(
          driver.id,
          restaurantIds.map((restaurantId) => ({
            restaurantId,
            isPrimary: restaurantId === primaryRestaurantId
          }))
        );
        toast.success('Данные водителя сохранены');
        onSaved();
      } else {
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
        if (serviceSettlements.length) {
          await updateDriverServiceSettlements(result.driverId, serviceSettlements);
        }
        await updateDriverProfile({
          driverId: result.driverId,
          userId: result.userId,
          maxActiveDeliveries
        });
        toast.success('Водитель создан');
        onSaved(result, password);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить водителя');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="platform-driver-form" onSubmit={submit}>
      <div className="platform-driver-form__grid">
        <label>Имя<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} /></label>
        {!driver && <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>}
        <label>Телефон<input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" /></label>
        <label>Город
          <select value={cityName} onChange={(event) => setCityName(event.target.value)}>
            <option value="">Не выбран</option>
            {cityOptions.map((city) => <option value={city} key={city}>{city}</option>)}
          </select>
        </label>
        <label>Автомобиль<input value={vehicleInfo} onChange={(event) => setVehicleInfo(event.target.value)} placeholder="Lada Granta" /></label>
        <label>Госномер<input value={carNumber} onChange={(event) => setCarNumber(event.target.value)} placeholder="А123ВС 95" /></label>
        <label>Одновременно заказов
          <select value={maxActiveDeliveries} onChange={(event) => setMaxActiveDeliveries(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
        <label className="platform-driver-form__wide">Города и сёла работы
          <select
            multiple
            value={serviceSettlements}
            size={Math.min(4, Math.max(2, settlementOptions.length))}
            onChange={(event) => setServiceSettlements(Array.from(event.target.selectedOptions, (option) => option.value))}
          >
            {settlementOptions.map((settlement) => <option value={settlement} key={settlement}>{settlement}</option>)}
          </select>
        </label>
        {driver && (
          <fieldset className="platform-driver-form__restaurants">
            <legend>Привязка к ресторанам</legend>
            <small>Сначала заказ увидят выбранные курьеры ресторана. Основной курьер отображается первым.</small>
            {assignmentsQuery.isLoading && <span>Загружаем рестораны…</span>}
            {assignmentsQuery.data?.restaurants.map((restaurant) => {
              const checked = restaurantIds.includes(restaurant.id);
              return (
                <label key={restaurant.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      setRestaurantIds((current) => event.target.checked
                        ? [...current, restaurant.id]
                        : current.filter((id) => id !== restaurant.id));
                      if (!event.target.checked && primaryRestaurantId === restaurant.id) {
                        setPrimaryRestaurantId('');
                      }
                    }}
                  />
                  <span>{restaurant.name}</span>
                  <input
                    type="radio"
                    name="primary-restaurant"
                    checked={primaryRestaurantId === restaurant.id}
                    disabled={!checked}
                    onChange={() => setPrimaryRestaurantId(restaurant.id)}
                    aria-label={`Основной курьер — ${restaurant.name}`}
                  />
                  <b>Основной курьер</b>
                </label>
              );
            })}
          </fieldset>
        )}
        <label className="platform-driver-form__wide">{driver ? 'Новый пароль (необязательно)' : 'Временный пароль'}
          <span className="platform-driver-form__password">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? 'text' : 'password'}
              minLength={10}
              required={!driver}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Показать пароль">
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
            <button type="button" onClick={() => setPassword(generatePassword())} aria-label="Создать пароль"><KeyRound /></button>
            <button type="button" onClick={() => void copyText(password).then(() => toast.success('Пароль скопирован'))} disabled={!password} aria-label="Копировать пароль"><Copy /></button>
          </span>
        </label>
      </div>
      <footer>
        <button type="button" onClick={onClose}>Отмена</button>
        <button type="submit" disabled={saving}><Check />{saving ? 'Сохраняем…' : 'Сохранить'}</button>
      </footer>
    </form>
  );
}

function DriverDetails({
  driver,
  activity,
  mode
}: {
  driver: PlatformDriver;
  activity: PlatformDriverActivity;
  mode: 'profile' | 'orders' | 'finance';
}) {
  if (mode === 'orders') {
    return (
      <div className="platform-driver-details">
        <div className="platform-driver-details__stats">
          <span><strong>{activity.deliveryCount}</strong><small>Назначено доставок</small></span>
          <span><strong>{activity.completedDeliveries}</strong><small>Завершено</small></span>
        </div>
        <p>Статистика рассчитана по реальным назначениям водителя в таблице доставок.</p>
      </div>
    );
  }
  if (mode === 'finance') {
    return (
      <div className="platform-driver-details">
        <div className="platform-driver-details__stats">
          <span><strong>{formatMoney(activity.earnedAmount)}</strong><small>Начислено</small></span>
          <span className={driver.debt > 0 ? 'is-danger' : ''}><strong>{formatMoney(driver.debt)}</strong><small>Долг</small></span>
        </div>
      </div>
    );
  }
  return (
    <div className="platform-driver-details">
      <dl>
        <div><dt>Телефон</dt><dd>{driver.phone || 'Не указан'}</dd></div>
        <div><dt>Email</dt><dd>{driver.email || 'Не указан'}</dd></div>
        <div><dt>Автомобиль</dt><dd>{driver.vehicleInfo || 'Не указан'}</dd></div>
        <div><dt>Госномер</dt><dd>{driver.carNumber || 'Не указан'}</dd></div>
        <div><dt>Город</dt><dd>{driver.cityName || 'Не указан'}</dd></div>
        <div><dt>Зоны работы</dt><dd>{driver.serviceSettlements.join(', ') || 'Не указаны'}</dd></div>
        <div><dt>Одновременно заказов</dt><dd>{driver.maxActiveDeliveries}</dd></div>
        <div><dt>Рейтинг</dt><dd>{driver.rating.toFixed(1)}</dd></div>
      </dl>
    </div>
  );
}

export function PlatformDriversPage() {
  const queryClient = useQueryClient();
  const driversQuery = useQuery({
    queryKey: ['platform-drivers'],
    queryFn: getDrivers,
    refetchInterval: 15_000
  });
  const activityQuery = useQuery({
    queryKey: ['platform-driver-activity'],
    queryFn: getPlatformDriverActivity,
    refetchInterval: 15_000
  });
  const settlementsQuery = useQuery({ queryKey: ['delivery-settlements'], queryFn: getDeliverySettlements });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DriverFilter>('all');
  const [cityFilter, setCityFilter] = useState('');
  const [dialog, setDialog] = useState<DriverDialog>(null);
  const [menuDriverId, setMenuDriverId] = useState('');
  const [createdAccess, setCreatedAccess] = useState<{ email: string; password: string } | null>(null);

  const drivers = useMemo(() => driversQuery.data ?? [], [driversQuery.data]);
  const activities = useMemo(() => activityQuery.data ?? [], [activityQuery.data]);
  const settlements = useMemo(() => settlementsQuery.data ?? [], [settlementsQuery.data]);
  const settlementOptions = useMemo(
    () => Array.from(new Set(settlements.map((item) => item.settlementName.trim()).filter(Boolean))),
    [settlements]
  );
  const cityOptions = useMemo(
    () => Array.from(new Set([
      ...settlements.flatMap((item) => [item.cityName, item.settlementName]),
      ...drivers.flatMap((driver) => [driver.cityName, ...driver.serviceSettlements])
    ].map((item) => item.trim()).filter(Boolean))),
    [drivers, settlements]
  );
  const visibleDrivers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru-RU');
    return drivers.filter((driver) => {
      if (filter === 'online' && !driver.isOnline) return false;
      if (filter === 'offline' && driver.isOnline) return false;
      if (filter === 'debt' && driver.debt <= 0) return false;
      if (cityFilter && ![driver.cityName, ...driver.serviceSettlements].includes(cityFilter)) return false;
      return !normalized || [
        driver.name,
        driver.phone,
        driver.email,
        driver.vehicleInfo,
        driver.carNumber,
        driver.cityName,
        ...driver.serviceSettlements
      ].some((value) => value.toLocaleLowerCase('ru-RU').includes(normalized));
    });
  }, [cityFilter, drivers, filter, query]);

  const totalDebt = drivers.reduce((sum, driver) => sum + driver.debt, 0);
  const onlineCount = drivers.filter((driver) => driver.isOnline).length;
  const exportHeaders = ['ФИО', 'Телефон', 'Email', 'Статус', 'Автомобиль', 'Госномер', 'Города и сёла', 'Доставок', 'Завершено', 'Начислено', 'Долг', 'Рейтинг'];
  const exportRows = drivers.map((driver) => {
    const activity = activityFor(activities, driver.id);
    return [
      driver.name,
      driver.phone,
      driver.email,
      driver.isOnline ? 'Онлайн' : 'Оффлайн',
      driver.vehicleInfo,
      driver.carNumber,
      [driver.cityName, ...driver.serviceSettlements].filter(Boolean).join(', '),
      activity.deliveryCount,
      activity.completedDeliveries,
      activity.earnedAmount,
      driver.debt,
      driver.rating
    ];
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['platform-drivers'] });
    void queryClient.invalidateQueries({ queryKey: ['platform-driver-activity'] });
  };

  const toggleBlocked = async (driver: PlatformDriver) => {
    try {
      await updateDriverProfile({ driverId: driver.id, userId: driver.userId, isActive: !driver.isActive });
      toast.success(driver.isActive ? 'Водитель заблокирован' : 'Водитель активирован');
      setMenuDriverId('');
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось изменить статус');
    }
  };

  return (
    <main className="platform-page platform-drivers-page">
      <header className="platform-page-head platform-drivers-page__head">
        <div><h1>Водители</h1><p>Управление водителями платформы</p></div>
        <button type="button" onClick={() => setDialog({ type: 'create' })}><Plus />Добавить</button>
      </header>

      <section className="platform-driver-stats" aria-label="Статистика водителей">
        <article><span><UsersRound /></span><strong>{drivers.length}</strong><small>Всего</small></article>
        <article className="is-online"><span /><strong>{onlineCount}</strong><small>Онлайн</small></article>
        <article className="is-offline"><span /><strong>{drivers.length - onlineCount}</strong><small>Оффлайн</small></article>
        <article className="is-debt"><span><WalletCards /></span><strong>{formatMoney(totalDebt)}</strong><small>Общий долг</small></article>
      </section>

      <section className="platform-driver-controls">
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск водителя, телефона…" /></label>
        <button type="button" aria-label="Фильтры"><Filter /><span>Фильтр</span></button>
      </section>

      <nav className="platform-driver-filters" aria-label="Фильтры водителей">
        {([
          ['all', 'Все'],
          ['online', 'Онлайн'],
          ['offline', 'Оффлайн'],
          ['debt', 'Есть долг']
        ] as Array<[DriverFilter, string]>).map(([value, label]) => (
          <button className={filter === value ? 'is-active' : ''} type="button" onClick={() => setFilter(value)} key={value}>
            {value !== 'all' && <i className={`is-${value}`} />}{label}
          </button>
        ))}
        <label>Город<ChevronDown />
          <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
            <option value="">Все</option>
            {cityOptions.map((city) => <option value={city} key={city}>{city}</option>)}
          </select>
        </label>
      </nav>

      {createdAccess && (
        <aside className="platform-driver-access">
          <Check />
          <span><strong>Доступ создан</strong><small>{createdAccess.email}</small></span>
          <button type="button" onClick={() => void copyText(`Email: ${createdAccess.email}\nВременный пароль: ${createdAccess.password}`).then(() => toast.success('Доступ скопирован'))}><Copy />Копировать</button>
          <button type="button" aria-label="Закрыть" onClick={() => setCreatedAccess(null)}><X /></button>
        </aside>
      )}

      <section className="platform-driver-list">
        <header>
          <span>Водителей: <strong>{visibleDrivers.length}</strong></span>
          <span className="is-online">Онлайн: <strong>{onlineCount}</strong></span>
          <div>
            <button type="button" onClick={() => downloadCsv('waycatalog-drivers', exportHeaders, exportRows)}><Download />CSV</button>
            <button type="button" onClick={() => void downloadXlsx('waycatalog-drivers', 'Водители', exportHeaders, exportRows)}><FileSpreadsheet />XLSX</button>
          </div>
        </header>
        {driversQuery.isLoading && <div className="platform-state">Загружаем водителей…</div>}
        {driversQuery.isError && <div className="platform-state">Не удалось загрузить водителей.</div>}
        {!driversQuery.isLoading && visibleDrivers.length === 0 && (
          <div className="platform-driver-list__empty"><Truck /><strong>Водители не найдены</strong><small>Измените фильтр или добавьте водителя.</small></div>
        )}
        {visibleDrivers.map((driver) => (
          <article className="platform-driver-row" key={driver.id}>
            <span className="platform-driver-row__avatar"><UserRound /><i className={driver.isOnline ? 'is-online' : ''} /></span>
            <div className="platform-driver-row__identity">
              <strong>{driver.name || 'Без имени'}</strong>
              <small>{driver.phone || driver.email || 'Контакты не указаны'}</small>
              <small>{driver.vehicleInfo || 'Автомобиль не указан'}{driver.carNumber ? ` · ${driver.carNumber}` : ''}</small>
              <em><MapPin />{driver.serviceSettlements.join(', ') || driver.cityName || 'Город не указан'}</em>
              <em><Truck />До {driver.maxActiveDeliveries} заказов одновременно</em>
            </div>
            <span className={driver.isOnline ? 'platform-driver-status is-online' : 'platform-driver-status'}>
              {driver.isOnline ? 'Онлайн' : 'Оффлайн'}
            </span>
            <span className={driver.debt > 0 ? 'platform-driver-row__debt is-danger' : 'platform-driver-row__debt'}>
              <strong>{formatMoney(driver.debt)}</strong><small>долг</small>
            </span>
            <div className="platform-driver-row__menu">
              <button type="button" aria-label="Действия" onClick={() => setMenuDriverId((value) => value === driver.id ? '' : driver.id)}><MoreVertical /></button>
              {menuDriverId === driver.id && (
                <div>
                  <button type="button" onClick={() => { setDialog({ type: 'profile', driver }); setMenuDriverId(''); }}><UserRound />Профиль</button>
                  <button type="button" onClick={() => { setDialog({ type: 'edit', driver }); setMenuDriverId(''); }}><Pencil />Редактировать</button>
                  <button type="button" onClick={() => { setDialog({ type: 'orders', driver }); setMenuDriverId(''); }}><Truck />Заказы</button>
                  <button type="button" onClick={() => { setDialog({ type: 'finance', driver }); setMenuDriverId(''); }}><WalletCards />Финансы</button>
                  <button type="button" onClick={() => { setDialog({ type: 'edit', driver }); setMenuDriverId(''); }}><KeyRound />Сбросить пароль</button>
                  <button className={driver.isActive ? 'is-danger' : ''} type="button" onClick={() => void toggleBlocked(driver)}><Ban />{driver.isActive ? 'Заблокировать' : 'Активировать'}</button>
                </div>
              )}
            </div>
          </article>
        ))}
      </section>

      {dialog?.type === 'create' && (
        <Sheet title="Новый водитель" subtitle="Создание доступа к кабинету" onClose={() => setDialog(null)}>
          <DriverForm
            cityOptions={cityOptions}
            settlementOptions={settlementOptions}
            onClose={() => setDialog(null)}
            onSaved={(result, createdPassword) => {
              if (result && createdPassword) setCreatedAccess({ email: result.email, password: createdPassword });
              setDialog(null);
              refresh();
            }}
          />
        </Sheet>
      )}
      {dialog?.type === 'edit' && (
        <Sheet title="Редактировать водителя" subtitle={dialog.driver.name} onClose={() => setDialog(null)}>
          <DriverForm
            driver={dialog.driver}
            cityOptions={cityOptions}
            settlementOptions={settlementOptions}
            onClose={() => setDialog(null)}
            onSaved={() => { setDialog(null); refresh(); }}
          />
        </Sheet>
      )}
      {dialog && ['profile', 'orders', 'finance'].includes(dialog.type) && 'driver' in dialog && (
        <Sheet
          title={dialog.type === 'profile' ? dialog.driver.name : dialog.type === 'orders' ? 'Заказы водителя' : 'Финансы водителя'}
          subtitle={dialog.type === 'profile' ? (dialog.driver.isOnline ? 'Онлайн' : 'Оффлайн') : dialog.driver.name}
          onClose={() => setDialog(null)}
        >
          <DriverDetails
            driver={dialog.driver}
            activity={activityFor(activities, dialog.driver.id)}
            mode={dialog.type as 'profile' | 'orders' | 'finance'}
          />
        </Sheet>
      )}
    </main>
  );
}
