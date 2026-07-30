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
  type RestaurantDeliverySettings
} from '../../shared/api/restaurantOrdersApi';
import { getDeliverySettlements } from '../../shared/api/settlementsApi';

type DetailSection = null | 'couriers' | 'parameters' | 'zones' | 'qr';

const sectionTitles: Record<Exclude<DetailSection, null>, string> = {
  couriers: 'Курьеры и платформа',
  parameters: 'Параметры доставки',
  zones: 'Зоны и города',
  qr: 'QR-подтверждение'
};

export function DeliverySettingsCard({
  settings,
  catalogSlug,
  onSave,
  onOpenBackup,
  onBack
}: {
  settings: RestaurantDeliverySettings;
  catalogSlug: string;
  onSave: (settings: RestaurantDeliverySettings) => void;
  onOpenBackup: () => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [section, setSection] = useState<DetailSection>(null);
  const [courierEmail, setCourierEmail] = useState('');
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
    queryFn: () => getRestaurantOwnCouriers(catalogSlug),
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
  const placeOptions = useMemo(
    () => Array.from(new Set(directorySettlements.flatMap((settlement) => [
      settlement.cityName.trim(),
      settlement.settlementName.trim()
    ]).filter(Boolean))),
    [directorySettlements]
  );
  const directorySettlementOptions = useMemo(() => {
    const city = draft.primary_city.trim().toLocaleLowerCase('ru-RU');
    return directorySettlements
      .filter((settlement) => {
        const settlementCity = settlement.cityName.trim().toLocaleLowerCase('ru-RU');
        return !city || !settlementCity || settlementCity === city;
      })
      .map((settlement) => settlement.settlementName)
      .filter(Boolean);
  }, [directorySettlements, draft.primary_city]);
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
      const courier = await linkRestaurantCourierByEmail(catalogSlug, normalizedEmail);
      setCourierEmail('');
      setCourierMessage(`${courier.name} добавлен в курьеры ресторана.`);
      await refetchOwnCouriers();
    } catch (error) {
      setCourierMessage(error instanceof Error ? error.message : 'Не удалось добавить курьера.');
    } finally {
      setIsSavingCourier(false);
    }
  };
  const removeCourier = async (driverId: string) => {
    setIsSavingCourier(true);
    setCourierMessage('');
    try {
      await removeRestaurantCourier(catalogSlug, driverId);
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
                <button type="button" disabled={isSavingCourier} onClick={() => void addCourier()}>
                  Добавить курьера
                </button>
                {courierMessage && <small role="status">{courierMessage}</small>}
                <div className="restaurant-courier-list">
                  {ownCouriers.map((courier) => (
                    <article key={courier.driverId}>
                      <span><strong>{courier.name}</strong><small>{courier.email}</small></span>
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
            <label className="settings-toggle-row"><input type="checkbox" checked={draft.use_platform_drivers} onChange={(event) => setBoolean('use_platform_drivers', event.target.checked)} /><span><strong>Водители платформы</strong><small>Передавать доставку курьерам WayCatalog.</small></span></label>
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
              <select value={draft.primary_city} onChange={(event) => setText('primary_city', event.target.value)}>
                <option value="">Выберите село или город</option>
                {placeOptions.map((place) => <option value={place} key={place}>{place}</option>)}
              </select>
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
