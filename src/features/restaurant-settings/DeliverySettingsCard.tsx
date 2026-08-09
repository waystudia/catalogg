import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CloudUpload,
  Download,
  MapPin,
  QrCode,
  Settings,
  Users
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  getRestaurantOwnCouriers,
  linkRestaurantCourierByEmail,
  removeRestaurantCourier,
  updateRestaurantCourierType,
  type RestaurantOwnCourier,
  type RestaurantDeliverySettings
} from '../../shared/api/restaurantOrdersApi';
import { getDeliverySettlements } from '../../shared/api/settlementsApi';
import {
  getDeliveryCityOptions,
  getDeliverySettlementOptions,
  keepSettlementsAvailableForCity
} from '../../shared/deliveryGeography';
import { getCourierBillingRule, restaurantCourierTypeLabels, type RestaurantCourierType } from '../restaurant-billing/restaurantBillingRules';

type DetailSection = null | 'couriers' | 'parameters' | 'zones' | 'qr';

const sectionTitles: Record<Exclude<DetailSection, null>, string> = {
  couriers: 'Курьеры и платформа',
  parameters: 'Параметры доставки',
  zones: 'Зоны и города',
  qr: 'QR-подтверждение'
};

export type RestaurantCourierService = {
  list: (catalogSlug: string) => Promise<RestaurantOwnCourier[]>;
  link: (catalogSlug: string, email: string, courierType: RestaurantCourierType) => Promise<RestaurantOwnCourier>;
  setType: (catalogSlug: string, driverId: string, courierType: RestaurantCourierType) => Promise<void>;
  remove: (catalogSlug: string, driverId: string) => Promise<void>;
};

const defaultCourierService: RestaurantCourierService = {
  list: getRestaurantOwnCouriers,
  link: linkRestaurantCourierByEmail,
  setType: updateRestaurantCourierType,
  remove: removeRestaurantCourier
};

export function DeliverySettingsCard({
  settings,
  catalogSlug,
  onSave,
  onOpenBackup,
  onBack,
  courierService = defaultCourierService
}: {
  settings: RestaurantDeliverySettings;
  catalogSlug: string;
  onSave: (settings: RestaurantDeliverySettings) => void;
  onOpenBackup: () => void;
  onBack: () => void;
  courierService?: RestaurantCourierService;
}) {
  const [draft, setDraft] = useState(settings);
  const [section, setSection] = useState<DetailSection>(null);
  const [courierEmail, setCourierEmail] = useState('');
  const [courierType, setCourierType] = useState<RestaurantCourierType | ''>('');
  const [pendingCourierTypes, setPendingCourierTypes] = useState<Record<string, RestaurantCourierType | ''>>({});
  const [courierMessage, setCourierMessage] = useState('');
  const [isSavingCourier, setIsSavingCourier] = useState(false);
  const { data: directorySettlements = [] } = useQuery({
    queryKey: ['delivery-settlements-public'],
    queryFn: getDeliverySettlements,
    staleTime: 5 * 60 * 1000
  });
  const {
    data: ownCouriers = [],
    refetch: refetchOwnCouriers
  } = useQuery({
    queryKey: ['restaurant-own-couriers', catalogSlug],
    queryFn: () => courierService.list(catalogSlug),
    enabled: section === 'couriers' && draft.use_own_courier,
    staleTime: 30_000
  });

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const setBoolean = (key: keyof RestaurantDeliverySettings, value: boolean) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const setNumber = (key: keyof RestaurantDeliverySettings, value: string) => {
    setDraft((current) => ({ ...current, [key]: Math.max(0, Number(value) || 0) }));
  };
  const setText = <K extends keyof RestaurantDeliverySettings>(
    key: K,
    value: RestaurantDeliverySettings[K]
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const cityOptions = useMemo(
    () => getDeliveryCityOptions(directorySettlements),
    [directorySettlements]
  );
  const directorySettlementOptions = useMemo(
    () => getDeliverySettlementOptions(directorySettlements, draft.primary_city),
    [directorySettlements, draft.primary_city]
  );
  const changePrimaryCity = (primaryCity: string) => {
    setDraft((current) => ({
      ...current,
      primary_city: primaryCity,
      service_settlements: keepSettlementsAvailableForCity(
        current.service_settlements,
        directorySettlements,
        primaryCity
      )
    }));
  };
  const toggleDirectorySettlement = (value: string) => {
    setDraft((current) => ({
      ...current,
      service_settlements: current.service_settlements.includes(value)
        ? current.service_settlements.filter((item) => item !== value)
        : [...current.service_settlements, value]
    }));
  };
  const save = () => onSave(draft);
  const addCourier = async () => {
    const normalizedEmail = courierEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setCourierMessage('Введите корректный e-mail водителя.');
      return;
    }
    setIsSavingCourier(true);
    setCourierMessage('');
    try {
      if (!courierType) {
        setCourierMessage('Выберите тип курьера.');
        return;
      }
      const courier = await courierService.link(catalogSlug, normalizedEmail, courierType);
      setCourierEmail('');
      setCourierType('');
      setCourierMessage(`${courier.name} добавлен в курьеры ресторана.`);
      await refetchOwnCouriers();
    } catch (error) {
      setCourierMessage(error instanceof Error ? error.message : 'Не удалось добавить курьера.');
    } finally {
      setIsSavingCourier(false);
    }
  };
  const classifyCourier = async (courier: RestaurantOwnCourier) => {
    const selectedType = pendingCourierTypes[courier.driverId] ?? courier.courierType;
    if (!selectedType) return;
    setIsSavingCourier(true);
    setCourierMessage('');
    try {
      await courierService.setType(catalogSlug, courier.driverId, selectedType);
      await refetchOwnCouriers();
      setPendingCourierTypes((current) => {
        const next = { ...current };
        delete next[courier.driverId];
        return next;
      });
      setCourierMessage(`Условия работы «${courier.name}» сохранены.`);
    } catch (error) {
      setCourierMessage(error instanceof Error ? error.message : 'Не удалось сохранить условия работы.');
    } finally {
      setIsSavingCourier(false);
    }
  };
  const removeCourier = async (driverId: string) => {
    setIsSavingCourier(true);
    setCourierMessage('');
    try {
      await courierService.remove(catalogSlug, driverId);
      setCourierMessage('Курьер удалён из ресторана.');
      await refetchOwnCouriers();
    } catch (error) {
      setCourierMessage(error instanceof Error ? error.message : 'Не удалось удалить курьера.');
    } finally {
      setIsSavingCourier(false);
    }
  };

  if (section) {
    return (
      <section className="admin-section-card delivery-settings-card delivery-settings-detail">
        <header>
          <button type="button" onClick={() => setSection(null)} aria-label="Назад к доставке"><ArrowLeft /></button>
          <div><small>Доставка и заказы</small><h2>{sectionTitles[section]}</h2></div>
        </header>

        {section === 'couriers' && (
          <div className="delivery-settings-switches">
            <label className="settings-toggle-row"><input type="checkbox" checked={draft.use_own_courier} onChange={(event) => setBoolean('use_own_courier', event.target.checked)} /><span><strong>Свой курьер</strong><small>Назначать водителей ресторана.</small></span></label>
            {draft.use_own_courier && (
              <section className="restaurant-courier-linker">
                <label>
                  E-mail водителя
                  <input
                    type="email"
                    value={courierEmail}
                    onChange={(event) => setCourierEmail(event.target.value)}
                    placeholder="driver@example.com"
                    autoComplete="off"
                  />
                </label>
                <label>
                  Тип курьера
                  <select value={courierType} onChange={(event) => setCourierType(event.target.value as RestaurantCourierType | '')}>
                    <option value="">Выберите тип</option>
                    <option value="staff_salaried">Штатный с зарплатой</option>
                    <option value="independent">Штатный без зарплаты</option>
                  </select>
                </label>
                {courierType && <small className="restaurant-courier-rule">{getCourierBillingRule({ courierType, freeDeliveryThresholdReached: false }).payerLabel}</small>}
                <button type="button" disabled={isSavingCourier || !courierType} onClick={() => void addCourier()}>
                  Добавить курьера
                </button>
                {courierMessage && <small role="status">{courierMessage}</small>}
                <div className="restaurant-courier-list">
                  {ownCouriers.map((courier) => (
                    <article key={courier.driverId}>
                      <span>
                        <strong>{courier.name}</strong><small>{courier.email}</small>
                        <small className={courier.courierType ? 'restaurant-courier-type' : 'restaurant-courier-type is-missing'}>
                          {courier.courierType ? restaurantCourierTypeLabels[courier.courierType] : 'Тип не выбран'}
                        </small>
                        {!courier.courierType && <small className="restaurant-courier-warning">Нельзя назначать на новые доставки, пока ресторан не выберет тип.</small>}
                      </span>
                      <span className="restaurant-courier-classifier">
                        <label>
                          <span>Условия работы</span>
                          <select aria-label={`Условия работы для ${courier.name}`} value={pendingCourierTypes[courier.driverId] ?? courier.courierType ?? ''} onChange={(event) => setPendingCourierTypes((current) => ({ ...current, [courier.driverId]: event.target.value as RestaurantCourierType | '' }))}>
                            <option value="">Выберите условия</option>
                            <option value="staff_salaried">Штатный с зарплатой</option>
                            <option value="independent">Штатный без зарплаты</option>
                          </select>
                        </label>
                        <button type="button" disabled={isSavingCourier || !pendingCourierTypes[courier.driverId] || pendingCourierTypes[courier.driverId] === courier.courierType} aria-label={`Сохранить условия для ${courier.name}`} onClick={() => void classifyCourier(courier)}>Сохранить</button>
                      </span>
                      <button
                        type="button"
                        disabled={isSavingCourier}
                        aria-label={`Удалить курьера ${courier.name}`}
                        onClick={() => void removeCourier(courier.driverId)}
                      >
                        Удалить курьера
                      </button>
                    </article>
                  ))}
                  {ownCouriers.length === 0 && <small>Курьеры ещё не привязаны.</small>}
                </div>
              </section>
            )}
            <label className="settings-toggle-row"><input type="checkbox" checked={draft.use_platform_drivers} onChange={(event) => setBoolean('use_platform_drivers', event.target.checked)} /><span><strong>Водители платформы</strong><small>Передавать доставку курьерам WayYaam.</small></span></label>
            <label className="settings-toggle-row"><input type="checkbox" checked={draft.fallback_to_platform_drivers} onChange={(event) => setBoolean('fallback_to_platform_drivers', event.target.checked)} /><span><strong>Передавать после таймера</strong><small>Искать водителя платформы, если свой курьер не найден.</small></span></label>
            <label>Ожидание своего курьера, мин<input value={draft.own_courier_wait_minutes} inputMode="numeric" onChange={(event) => setNumber('own_courier_wait_minutes', event.target.value)} /></label>
          </div>
        )}
        {section === 'parameters' && (
          <div className="delivery-settings-grid">
            <label>Минимальный заказ, ₽<input value={draft.minimum_order_amount} inputMode="numeric" onChange={(event) => setNumber('minimum_order_amount', event.target.value)} /></label>
            <label>Бесплатная доставка от, ₽<input value={draft.free_delivery_from} inputMode="numeric" onChange={(event) => setNumber('free_delivery_from', event.target.value)} /></label>
            <label>Время приготовления, мин<input value={draft.default_preparation_minutes} inputMode="numeric" onChange={(event) => setNumber('default_preparation_minutes', event.target.value)} /></label>
            <label>Радиус доставки, км<input value={draft.delivery_radius_km} inputMode="decimal" onChange={(event) => setNumber('delivery_radius_km', event.target.value)} /></label>
            <label>Ожидание курьера, мин<input value={draft.own_courier_wait_minutes} inputMode="numeric" onChange={(event) => setNumber('own_courier_wait_minutes', event.target.value)} /></label>
          </div>
        )}
        {section === 'zones' && (
          <div className="delivery-settings-grid">
            <label>
              Зона доставки
              <select
                value={draft.delivery_area_mode}
                onChange={(event) => setText('delivery_area_mode', event.target.value as RestaurantDeliverySettings['delivery_area_mode'])}
              >
                <option value="radius">По радиусу</option>
                <option value="settlements">По городам и селам</option>
                <option value="hybrid">Смешанный режим</option>
              </select>
            </label>
            <label>
              Основной город
              <select value={draft.primary_city} onChange={(event) => changePrimaryCity(event.target.value)}>
                <option value="">Выберите город</option>
                {draft.primary_city && !cityOptions.includes(draft.primary_city) && (
                  <option value={draft.primary_city}>{draft.primary_city}</option>
                )}
                {cityOptions.map((city) => <option value={city} key={city}>{city}</option>)}
              </select>
              {draft.primary_city && (
                <span className="delivery-settings-point-label">
                  <MapPin aria-hidden="true" />
                  <small>Точка ресторана: <strong>{draft.primary_city}</strong></small>
                </span>
              )}
            </label>
            <label className="delivery-settings-grid__wide">
              Сёла и районы обслуживания
              <span className="delivery-directory-picker">
                {directorySettlementOptions.map((settlement) => (
                  <button
                    type="button"
                    className={draft.service_settlements.includes(settlement) ? 'is-selected' : ''}
                    onClick={() => toggleDirectorySettlement(settlement)}
                    key={settlement}
                  >
                    {settlement}
                  </button>
                ))}
                {directorySettlementOptions.length === 0 && <small>Суперадмин ещё не добавил населённые пункты.</small>}
              </span>
              {draft.service_settlements.length > 0 && <small>Выбрано: {draft.service_settlements.join(', ')}</small>}
            </label>
          </div>
        )}
        {section === 'qr' && (
          <label className="settings-toggle-row">
            <input type="checkbox" checked={draft.qr_required} onChange={(event) => setBoolean('qr_required', event.target.checked)} />
            <span><strong>Требовать QR-подтверждение</strong><small>Курьер завершает доставку после подтверждения QR-кодом клиента.</small></span>
          </label>
        )}
        <button className="primary-wide" type="button" onClick={() => { save(); setSection(null); }}>Сохранить</button>
      </section>
    );
  }

  return (
    <section className="admin-section-card delivery-settings-card delivery-settings-hub">
      <header className="delivery-settings-hub__header">
        <button type="button" onClick={onBack} aria-label="Назад к настройкам"><ArrowLeft /></button>
        <div><small>Настройки ресторана</small><h2>Доставка и заказы</h2></div>
      </header>

      <div className="delivery-settings-basic">
        <label className="settings-toggle-row"><input type="checkbox" checked={draft.enable_hall_orders} onChange={(event) => setBoolean('enable_hall_orders', event.target.checked)} /><span><strong>Заказы в зале</strong><small>Столики и кабинки.</small></span></label>
        <label className="settings-toggle-row"><input type="checkbox" checked={draft.enable_pickup} onChange={(event) => setBoolean('enable_pickup', event.target.checked)} /><span><strong>Самовывоз</strong><small>Получение в ресторане.</small></span></label>
        <label className="settings-toggle-row"><input type="checkbox" checked={draft.enable_delivery} onChange={(event) => setBoolean('enable_delivery', event.target.checked)} /><span><strong>Доставка</strong><small>Доставка по адресу клиента.</small></span></label>
      </div>

      <div className="delivery-settings-tiles delivery-settings-tiles--details">
        <button type="button" onClick={() => setSection('couriers')}><Users /><span>Курьеры и платформа</span></button>
        <button type="button" onClick={() => setSection('parameters')}><Settings /><span>Параметры доставки</span></button>
        <button type="button" onClick={() => setSection('zones')}><MapPin /><span>Зоны и города</span></button>
        <button type="button" onClick={() => setSection('qr')}><QrCode /><span>QR-подтверждение</span></button>
      </div>

      <div className="delivery-settings-backup">
        <h3>Сохранение и резерв</h3>
        <div>
          <button type="button" onClick={save}><Download />Сохранить доставку</button>
          <button type="button" onClick={onOpenBackup}><CloudUpload />Резервное копирование</button>
        </div>
      </div>
    </section>
  );
}
