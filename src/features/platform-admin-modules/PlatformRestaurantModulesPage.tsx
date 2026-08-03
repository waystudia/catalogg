import {
  ArrowLeft,
  Boxes,
  Check,
  ChevronRight,
  CreditCard,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  getRestaurantModuleEntitlements,
  getRestaurantModuleRestaurants,
  saveRestaurantModuleEntitlement,
  type RestaurantModuleEntitlement,
  type RestaurantModuleRestaurant
} from '../../shared/api/restaurantModulesApi';
import {
  createDefaultRestaurantModules,
  getModuleAccessMode,
  getRestaurantModulePackageFeatures,
  type RestaurantModulePackage
} from './restaurantModuleAccess';
import './platform-restaurant-modules.css';

const packageLabels: Record<RestaurantModulePackage, string> = {
  basic: 'Базовый',
  pos: 'POS',
  pos_warehouse: 'POS + Склад',
  full: 'Полный'
};

const moduleFields = [
  ['posEnabled', 'POS'],
  ['warehouseEnabled', 'Склад'],
  ['recipesEnabled', 'Техкарты'],
  ['financeEnabled', 'Финансы'],
  ['promotionsEnabled', 'Акции'],
  ['loyaltyEnabled', 'Лояльность']
] as const;

const limitFields = [
  ['maxCashiers', 'Кассиры'],
  ['maxDevices', 'Устройства'],
  ['maxLocations', 'Точки'],
  ['maxWarehouses', 'Склады']
] as const;

const statusLabels = {
  trial: 'Пробный период',
  active: 'Активна',
  past_due: 'Просрочена',
  expired: 'Истекла',
  cancelled: 'Отменена'
} as const;

type Props = {
  onBack: () => void;
  loadRestaurants?: () => Promise<RestaurantModuleRestaurant[]>;
  loadEntitlements?: () => Promise<RestaurantModuleEntitlement[]>;
  saveEntitlement?: (value: RestaurantModuleEntitlement) => Promise<RestaurantModuleEntitlement>;
};

export function PlatformRestaurantModulesPage({
  onBack,
  loadRestaurants = getRestaurantModuleRestaurants,
  loadEntitlements = getRestaurantModuleEntitlements,
  saveEntitlement = saveRestaurantModuleEntitlement
}: Props) {
  const [restaurants, setRestaurants] = useState<RestaurantModuleRestaurant[]>([]);
  const [entitlements, setEntitlements] = useState<RestaurantModuleEntitlement[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RestaurantModuleEntitlement | null>(null);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    void Promise.all([loadRestaurants(), loadEntitlements()]).then(
      ([nextRestaurants, nextEntitlements]) => {
        if (!active) return;
        setRestaurants(nextRestaurants);
        setEntitlements(nextEntitlements);
        setState('ready');
      },
      () => {
        if (active) setState('error');
      }
    );
    return () => {
      active = false;
    };
  }, [loadEntitlements, loadRestaurants]);

  const filteredRestaurants = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return restaurants;
    return restaurants.filter((restaurant) =>
      `${restaurant.name} ${restaurant.slug}`.toLowerCase().includes(normalized)
    );
  }, [query, restaurants]);

  const openRestaurant = (restaurant: RestaurantModuleRestaurant) => {
    const entitlement = entitlements.find((item) => item.catalogId === restaurant.catalogId)
      ?? createDefaultRestaurantModules(restaurant.catalogId);
    setSelectedCatalogId(restaurant.catalogId);
    setDraft({ ...entitlement });
    setState('ready');
  };

  const updatePackage = (packageCode: RestaurantModulePackage) => {
    if (!draft) return;
    setDraft({ ...draft, packageCode, ...getRestaurantModulePackageFeatures(packageCode) });
  };

  const save = async () => {
    if (!draft) return;
    setState('saving');
    try {
      const saved = await saveEntitlement(draft);
      setEntitlements((current) => [...current.filter((item) => item.catalogId !== saved.catalogId), saved]);
      setDraft(saved);
      setState('saved');
    } catch {
      setState('error');
    }
  };

  const selectedRestaurant = restaurants.find((restaurant) => restaurant.catalogId === selectedCatalogId) ?? null;

  return (
    <main className="platform-page restaurant-modules-page">
      <header className="restaurant-modules-head">
        <button type="button" onClick={onBack} aria-label="Назад"><ArrowLeft /></button>
        <span>
          <small>Подписки и платежи</small>
          <h1>Модули ресторанов</h1>
          <p>Выдавайте POS, склад, техкарты и финансовые инструменты отдельно для каждого ресторана.</p>
        </span>
        <div><ShieldCheck /><strong>Безопасное включение</strong><small>Новые модули выключены по умолчанию</small></div>
      </header>

      <section className="restaurant-modules-summary" aria-label="Сводка модулей">
        <article><span><Store /></span><div><strong>{restaurants.length}</strong><small>Ресторанов</small></div></article>
        <article><span><CreditCard /></span><div><strong>{restaurants.filter((item) => item.subscriptionStatus === 'active').length}</strong><small>Активных подписок</small></div></article>
        <article><span><Boxes /></span><div><strong>{entitlements.filter((item) => item.posEnabled).length}</strong><small>POS подключено</small></div></article>
        <article><span><Sparkles /></span><div><strong>{entitlements.filter((item) => item.packageCode === 'full').length}</strong><small>Полных пакетов</small></div></article>
      </section>

      <section className="restaurant-modules-toolbar">
        <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти ресторан" aria-label="Найти ресторан" /></label>
        <span>{filteredRestaurants.length} ресторанов</span>
      </section>

      {state === 'loading' && <p className="restaurant-modules-state">Загружаем права ресторанов…</p>}
      {state === 'error' && !draft && <p className="restaurant-modules-state is-error">Не удалось загрузить права модулей.</p>}

      <section className="restaurant-modules-list" aria-label="Рестораны">
        {filteredRestaurants.map((restaurant) => {
          const entitlement = entitlements.find((item) => item.catalogId === restaurant.catalogId)
            ?? createDefaultRestaurantModules(restaurant.catalogId);
          const enabledCount = moduleFields.filter(([field]) => entitlement[field]).length;
          const accessMode = getModuleAccessMode({
            enabled: true,
            status: restaurant.subscriptionStatus,
            endsAt: restaurant.subscriptionEndsAt
          });
          return (
            <article key={restaurant.catalogId}>
              <span className="restaurant-modules-list__logo">{restaurant.name.slice(0, 1).toUpperCase()}</span>
              <div className="restaurant-modules-list__identity">
                <strong>{restaurant.name}</strong>
                <small>/{restaurant.slug}</small>
              </div>
              <div><small>Пакет</small><strong>{packageLabels[entitlement.packageCode]}</strong></div>
              <div><small>Модули</small><strong>{enabledCount} из 6 модулей</strong></div>
              <div><small>Подписка</small><strong>{statusLabels[restaurant.subscriptionStatus]}</strong></div>
              <span className={`restaurant-modules-access is-${accessMode}`}>
                {accessMode === 'active' ? 'Доступ активен' : 'Просмотр без операций'}
              </span>
              <button type="button" onClick={() => openRestaurant(restaurant)} aria-label={`Настроить ${restaurant.name}`}><Settings2 /><ChevronRight /></button>
            </article>
          );
        })}
      </section>

      {selectedRestaurant && draft && (
        <div className="restaurant-modules-dialog-backdrop" role="presentation">
          <section className="restaurant-modules-dialog" role="dialog" aria-modal="true" aria-labelledby="restaurant-modules-dialog-title">
            <header>
              <span><small>Настройка подписки</small><h2 id="restaurant-modules-dialog-title">{selectedRestaurant.name}</h2></span>
              <button type="button" onClick={() => { setSelectedCatalogId(null); setDraft(null); }} aria-label="Закрыть настройки">×</button>
            </header>

            <label className="restaurant-modules-package">
              Пакет {selectedRestaurant.name}
              <select value={draft.packageCode} onChange={(event) => updatePackage(event.target.value as RestaurantModulePackage)}>
                {Object.entries(packageLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
              <small>Пакет задаёт базовый набор. Ниже можно сделать индивидуальное исключение.</small>
            </label>

            <fieldset className="restaurant-modules-switches">
              <legend>Доступные модули</legend>
              {moduleFields.map(([field, label]) => (
                <label key={field}>
                  <input type="checkbox" checked={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.checked })} />
                  <span><Check /></span>
                  <strong>{label}</strong>
                </label>
              ))}
            </fieldset>

            <fieldset className="restaurant-modules-limits">
              <legend>Лимиты тарифа</legend>
              {limitFields.map(([field, label]) => (
                <label key={field}>{label}<input type="number" min="0" value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: Math.max(0, Number(event.target.value)) })} /></label>
              ))}
            </fieldset>

            <footer>
              <span>{state === 'saved' ? 'Доступ сохранён' : state === 'error' ? 'Не удалось сохранить' : 'Изменения применятся только к этому ресторану'}</span>
              <button type="button" onClick={() => void save()} disabled={state === 'saving'}>{state === 'saving' ? 'Сохраняем…' : 'Сохранить доступ'}</button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
