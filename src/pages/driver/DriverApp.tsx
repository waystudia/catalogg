import {
  ArrowLeft,
  Bike,
  CalendarDays,
  Car,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Headphones,
  Home,
  MapPin,
  Navigation,
  Phone,
  QrCode,
  Settings,
  ShieldCheck,
  Star,
  ToggleLeft,
  ToggleRight,
  User,
  WalletCards,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useDriverStore } from '../../features/driver/store';
import type { DeliveryStatus } from '../../features/order/orderLifecycle';
import {
  acceptDeliveryOffer,
  completeDeliveryProgress,
  getAuthenticatedDriverId,
  getDriverDashboard,
  setDriverAvailability,
  subscribeToDriverRealtime,
  updateDeliveryProgress,
  type DeliveryOffer,
  type DriverDashboardSnapshot,
  type DriverProfile
} from '../../shared/api/deliveryApi';
import { supabase } from '../../shared/supabase';
import './driver.css';

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

const deliveryStatusLabels: Record<DeliveryStatus, string> = {
  not_required: 'Не требуется',
  waiting_courier: 'Новый заказ',
  assigned: 'Принят',
  arrived_to_restaurant: 'На месте в ресторане',
  handed_over: 'Заказ получен',
  on_the_way: 'В пути к клиенту',
  arrived_to_client: 'На месте у клиента',
  delivered: 'Доставлен',
  failed: 'Проблема'
};

const emptySnapshot: DriverDashboardSnapshot = {
  profile: {
    id: 'driver-demo',
    name: 'Водитель',
    phone: '',
    vehicleInfo: '',
    carNumber: '',
    photoUrl: '',
    rating: 5,
    status: 'offline',
    isOnline: false
  },
  activeDelivery: null,
  availableDeliveries: [],
  history: [],
  stats: {
    ordersToday: 0,
    completedToday: 0,
    canceledToday: 0,
    earningsToday: 0,
    earningsWeek: 0,
    earningsMonth: 0
  }
};

export function DriverApp() {
  const location = useLocation();
  const selectedDriverId = useDriverStore((state) => state.selectedDriverId);
  const isOnline = useDriverStore((state) => state.isOnline);
  const localActiveDelivery = useDriverStore((state) => state.localActiveDelivery);
  const completedDeliveryIds = useDriverStore((state) => state.completedDeliveryIds);
  const [snapshot, setSnapshot] = useState<DriverDashboardSnapshot>(emptySnapshot);
  const [error, setError] = useState('');
  const [authChecked, setAuthChecked] = useState(!supabase);
  const [hasDriverAccess, setHasDriverAccess] = useState(!supabase);

  const loadDashboard = useCallback(async () => {
    try {
      const nextSnapshot = await getDriverDashboard(selectedDriverId);
      setSnapshot(nextSnapshot);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить доставки');
    }
  }, [selectedDriverId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;
    void getAuthenticatedDriverId().then((driverId) => {
      if (!isMounted) return;
      setHasDriverAccess(Boolean(driverId));
      setAuthChecked(true);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const profile: DriverProfile = {
    ...snapshot.profile,
    isOnline,
    status: localActiveDelivery ? 'busy' : isOnline ? 'online' : 'offline'
  };
  const effectiveDriverId = profile.id || selectedDriverId;

  useEffect(() => subscribeToDriverRealtime(effectiveDriverId, loadDashboard), [effectiveDriverId, loadDashboard]);

  const activeDelivery = localActiveDelivery ?? snapshot.activeDelivery;
  const availableDeliveries = isOnline
    ? snapshot.availableDeliveries.filter((delivery) => !completedDeliveryIds.includes(delivery.deliveryId))
    : [];
  const route = location.pathname.split('/').filter(Boolean)[1] ?? 'home';

  if (!authChecked) {
    return (
      <main className="driver-app">
        <section className="driver-phone driver-auth-state">
          <ClipboardList />
          <strong>Проверяем вход водителя...</strong>
        </section>
      </main>
    );
  }

  if (!hasDriverAccess) {
    return (
      <main className="driver-app">
        <section className="driver-phone driver-auth-state">
          <User />
          <strong>Войдите как водитель</strong>
          <small>Используйте email и пароль, которые выдал супер-админ.</small>
          <Link className="driver-primary driver-link-button" to="/login">
            Открыть вход
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="driver-app">
      <section className="driver-phone">
        {route === 'profile' ? (
          <DriverProfileScreen profile={profile} snapshot={snapshot} error={error} />
        ) : route === 'orders' ? (
          <DriverOrdersScreen
            driverId={effectiveDriverId}
            offers={availableDeliveries}
            activeDelivery={activeDelivery}
            error={error}
          />
        ) : route === 'active' ? (
          <DriverActiveScreen delivery={activeDelivery} />
        ) : route === 'map' ? (
          <DriverMapScreen delivery={activeDelivery ?? availableDeliveries[0] ?? null} />
        ) : route === 'qr' ? (
          <DriverQrScreen delivery={activeDelivery} />
        ) : route === 'earnings' ? (
          <DriverEarningsScreen snapshot={snapshot} />
        ) : route === 'settings' ? (
          <DriverSettingsScreen profile={profile} />
        ) : route === 'support' ? (
          <DriverSupportScreen />
        ) : (
          <DriverHomeScreen
            profile={profile}
            snapshot={snapshot}
            activeDelivery={activeDelivery}
            availableDeliveries={availableDeliveries}
            error={error}
          />
        )}
        <DriverBottomNav active={route} />
      </section>
    </main>
  );
}

function DriverHeader({ title, action }: { title: string; action?: ReactNode }) {
  const navigate = useNavigate();

  return (
    <header className="driver-header">
      <button type="button" onClick={() => navigate(-1)} aria-label="Назад">
        <ArrowLeft />
      </button>
      <h1>{title}</h1>
      <span>{action}</span>
    </header>
  );
}

function DriverHomeScreen({
  profile,
  snapshot,
  activeDelivery,
  availableDeliveries,
  error
}: {
  profile: DriverProfile;
  snapshot: DriverDashboardSnapshot;
  activeDelivery: DeliveryOffer | null;
  availableDeliveries: readonly DeliveryOffer[];
  error: string;
}) {
  const setOnline = useDriverStore((state) => state.setOnline);
  const toggleOnline = async () => {
    const nextOnline = !profile.isOnline;
    setOnline(nextOnline);
    await setDriverAvailability(profile.id, nextOnline);
  };

  return (
    <>
      <header className="driver-topbar">
        <div>
          <strong>{profile.isOnline ? 'Вы в сети' : 'Вы не в сети'}</strong>
          <small>{profile.name}</small>
        </div>
        <button className="driver-online-button" type="button" onClick={() => void toggleOnline()} aria-label="Онлайн статус">
          {profile.isOnline ? <ToggleRight /> : <ToggleLeft />}
        </button>
      </header>

      {error && <p className="driver-error">{error}</p>}

      <section className="driver-earnings-card">
        <span>Сегодня</span>
        <strong>{formatPrice(snapshot.stats.earningsToday)}</strong>
        <small>{snapshot.stats.ordersToday} заказов</small>
      </section>

      <div className="driver-stats-grid">
        <DriverStat label="Принято" value={String(snapshot.stats.ordersToday)} />
        <DriverStat label="Выполнено" value={String(snapshot.stats.completedToday)} />
        <DriverStat label="Отменено" value={String(snapshot.stats.canceledToday)} />
        <DriverStat label="Рейтинг" value={profile.rating.toFixed(1)} />
      </div>

      <DriverSectionTitle title="Текущий заказ" to="/driver/active" />
      {activeDelivery ? (
        <DriverDeliveryCard offer={activeDelivery} compact />
      ) : (
        <section className="driver-empty-block">
          <ClipboardList />
          <strong>Активного заказа нет</strong>
        </section>
      )}

      <DriverSectionTitle title="Ближайшие заказы" to="/driver/orders" />
      <div className="driver-list">
        {availableDeliveries.slice(0, 3).map((offer) => (
          <DriverDeliveryCard offer={offer} key={offer.deliveryId} />
        ))}
      </div>
    </>
  );
}

function DriverStat({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function DriverSectionTitle({ title, to }: { title: string; to: string }) {
  return (
    <div className="driver-section-title">
      <h2>{title}</h2>
      <Link to={to}>Смотреть все</Link>
    </div>
  );
}

function DriverDeliveryCard({ offer, compact = false }: { offer: DeliveryOffer; compact?: boolean }) {
  return (
    <Link className="driver-delivery-card" to={offer.isAssignedToViewer ? '/driver/active' : `/driver/orders/${offer.deliveryId}`}>
      <span className="driver-delivery-icon">
        <Bike />
      </span>
      <span>
        <strong>Заказ №{offer.orderNumber}</strong>
        <small>{offer.restaurantName}</small>
        <small>{compact ? offer.deliveryAddress : `${offer.distanceKm} км от вас`}</small>
      </span>
      <b>{formatPrice(offer.deliveryFee)}</b>
    </Link>
  );
}

function DriverOrdersScreen({
  driverId,
  offers,
  activeDelivery,
  error
}: {
  driverId: string;
  offers: readonly DeliveryOffer[];
  activeDelivery: DeliveryOffer | null;
  error: string;
}) {
  const { deliveryId } = useParams();
  const selectedOffer = offers.find((offer) => offer.deliveryId === deliveryId) ?? null;

  if (selectedOffer) return <DriverNewOrderScreen driverId={driverId} offer={selectedOffer} />;

  return (
    <>
      <DriverHeader title="Заказы" />
      {error && <p className="driver-error">{error}</p>}
      {activeDelivery && <DriverDeliveryCard offer={activeDelivery} compact />}
      <div className="driver-list">
        {offers.map((offer) => (
          <DriverDeliveryCard offer={offer} key={offer.deliveryId} />
        ))}
      </div>
      {offers.length === 0 && (
        <section className="driver-empty-block">
          <ClipboardList />
          <strong>Нет доступных заказов</strong>
        </section>
      )}
    </>
  );
}

function DriverNewOrderScreen({ driverId, offer }: { driverId: string; offer: DeliveryOffer }) {
  const navigate = useNavigate();
  const acceptLocalOffer = useDriverStore((state) => state.acceptLocalOffer);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState('');

  const accept = async () => {
    setIsAccepting(true);
    setError('');
    try {
      acceptLocalOffer(offer, driverId);
      await acceptDeliveryOffer(offer.deliveryId, driverId);
      navigate('/driver/active');
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'Не удалось принять заказ');
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <>
      <DriverHeader title="Новый заказ" action={<small>{offer.routeEtaMin} сек</small>} />
      <DriverMapPreview offer={offer} />
      <section className="driver-order-panel">
        <span className="driver-badge">Доставка</span>
        <h2>Заказ №{offer.orderNumber}</h2>
        <DriverRouteLine icon={<Home />} label={offer.restaurantName} value={offer.restaurantAddress} />
        <DriverRouteLine icon={<MapPin />} label="Клиент" value={offer.deliveryAddress} />
        <DriverRouteLine icon={<Navigation />} label="Расстояние" value={`${offer.distanceKm} км от вас`} />
        <strong>{formatPrice(offer.deliveryFee)}</strong>
        <small>{offer.paymentLabel}</small>
        {error && <p className="driver-error">{error}</p>}
        <button className="driver-primary" type="button" onClick={() => void accept()} disabled={isAccepting}>
          {isAccepting ? 'Принимаем...' : 'Принять заказ'}
        </button>
        <Link className="driver-secondary" to="/driver/orders">
          <X />
          Отклонить
        </Link>
      </section>
    </>
  );
}

function DriverActiveScreen({ delivery }: { delivery: DeliveryOffer | null }) {
  const navigate = useNavigate();
  const updateLocalDeliveryStatus = useDriverStore((state) => state.updateLocalDeliveryStatus);
  const completeLocalDelivery = useDriverStore((state) => state.completeLocalDelivery);
  const [error, setError] = useState('');

  const nextAction = useMemo(() => {
    if (!delivery) return null;
    if (delivery.status === 'assigned') return { label: 'Я на месте в ресторане', status: 'arrived_to_restaurant' as const };
    if (delivery.status === 'arrived_to_restaurant') return { label: 'Показать QR', status: 'arrived_to_restaurant' as const, to: '/driver/qr' };
    if (delivery.status === 'handed_over') return { label: 'В пути к клиенту', status: 'on_the_way' as const };
    if (delivery.status === 'on_the_way') return { label: 'Я на месте у клиента', status: 'arrived_to_client' as const };
    if (delivery.status === 'arrived_to_client') return { label: 'Заказ доставлен', status: 'delivered' as const };
    return null;
  }, [delivery]);

  const updateStatus = async (status: DeliveryStatus, to?: string) => {
    if (!delivery) return;
    setError('');
    try {
      if (status === 'delivered') {
        updateLocalDeliveryStatus(status);
        await completeDeliveryProgress(delivery.deliveryId);
        completeLocalDelivery();
        navigate('/driver/earnings');
        return;
      }

      updateLocalDeliveryStatus(status);
      await updateDeliveryProgress(delivery.deliveryId, status);
      if (to) navigate(to);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Не удалось обновить статус');
    }
  };

  if (!delivery) {
    return (
      <>
        <DriverHeader title="Активный заказ" />
        <section className="driver-empty-block">
          <ClipboardList />
          <strong>Активного заказа нет</strong>
          <Link to="/driver/orders">К заказам</Link>
        </section>
      </>
    );
  }

  return (
    <>
      <DriverHeader title={`Заказ №${delivery.orderNumber}`} action={<small>{deliveryStatusLabels[delivery.status]}</small>} />
      <DriverMapPreview offer={delivery} />
      <section className="driver-order-panel">
        <h2>{delivery.restaurantName}</h2>
        <DriverRouteLine icon={<MapPin />} label="Адрес клиента" value={delivery.deliveryAddress} />
        {delivery.clientName && <DriverRouteLine icon={<User />} label="Клиент" value={delivery.clientName} />}
        {delivery.clientPhone && <DriverRouteLine icon={<Phone />} label="Телефон" value={delivery.clientPhone} />}
        {delivery.deliveryComment && <DriverRouteLine icon={<ShieldCheck />} label="Комментарий" value={delivery.deliveryComment} />}
        <div className="driver-action-row">
          {delivery.clientPhone && <a href={`tel:${delivery.clientPhone}`}><Phone />Позвонить</a>}
          <a href={delivery.status === 'handed_over' || delivery.status === 'on_the_way' || delivery.status === 'arrived_to_client'
            ? delivery.routeToClientUrl ?? delivery.routeToRestaurantUrl
            : delivery.routeToRestaurantUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Navigation />Маршрут
          </a>
          <Link to="/driver/qr"><QrCode />QR</Link>
        </div>
        {error && <p className="driver-error">{error}</p>}
        {nextAction && (
          <button className="driver-primary" type="button" onClick={() => void updateStatus(nextAction.status, nextAction.to)}>
            {nextAction.label}
          </button>
        )}
      </section>
    </>
  );
}

function DriverQrScreen({ delivery }: { delivery: DeliveryOffer | null }) {
  const qrPayload = delivery?.pickupQrToken
    ? JSON.stringify({
        type: 'delivery',
        deliveryId: delivery.deliveryId,
        orderId: delivery.orderId,
        token: delivery.pickupQrToken
      })
    : '';
  const qrImageUrl = qrPayload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrPayload)}`
    : '';

  return (
    <>
      <DriverHeader title="QR заказа" />
      <section className="driver-qr-panel">
        {qrImageUrl ? <img src={qrImageUrl} alt="QR выдачи заказа" /> : <QrCode />}
        <strong>{qrPayload || 'QR появится после принятия заказа'}</strong>
        <small>Покажите этот экран ресторану перед выдачей заказа.</small>
      </section>
      <Link className="driver-primary driver-link-button" to="/driver/active">
        К активному заказу
      </Link>
    </>
  );
}

function DriverMapScreen({ delivery }: { delivery: DeliveryOffer | null }) {
  const routeIsToClient = delivery
    ? delivery.status === 'handed_over' || delivery.status === 'on_the_way' || delivery.status === 'arrived_to_client'
    : false;
  const nextAddress = routeIsToClient ? delivery?.deliveryAddress : delivery?.restaurantAddress;
  const routeUrl = routeIsToClient ? delivery?.routeToClientUrl ?? delivery?.routeToRestaurantUrl : delivery?.routeToRestaurantUrl;

  return (
    <>
      <DriverHeader title="Карта" />
      <DriverMapPreview offer={delivery} tall />
      {delivery && (
        <section className="driver-order-panel">
          <DriverRouteLine icon={<MapPin />} label="Следующая точка" value={nextAddress ?? ''} />
          <DriverRouteLine icon={<Navigation />} label="Маршрут" value={`${delivery.distanceKm} км · ${delivery.routeEtaMin} мин`} />
          <a className="driver-primary driver-link-button" href={routeUrl} target="_blank" rel="noreferrer">
            Построить маршрут
          </a>
        </section>
      )}
    </>
  );
}

function DriverEarningsScreen({ snapshot }: { snapshot: DriverDashboardSnapshot }) {
  return (
    <>
      <DriverHeader title="Заработок" />
      <div className="driver-period-tabs">
        <button className="is-active" type="button">День</button>
        <button type="button">Неделя</button>
        <button type="button">Месяц</button>
      </div>
      <section className="driver-earnings-summary">
        <span>Заработок</span>
        <strong>{formatPrice(snapshot.stats.earningsToday)}</strong>
      </section>
      <div className="driver-stats-grid">
        <DriverStat label="Заказы" value={String(snapshot.stats.ordersToday)} />
        <DriverStat label="Выполнено" value={String(snapshot.stats.completedToday)} />
        <DriverStat label="Отменено" value={String(snapshot.stats.canceledToday)} />
      </div>
      <div className="driver-list">
        {snapshot.history.map((earning) => (
          <article className="driver-history-row" key={earning.id}>
            <span>
              <strong>№{earning.orderNumber}</strong>
              <small>{earning.restaurantName} · {new Date(earning.completedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>
            </span>
            <b>{formatPrice(earning.amount)}</b>
          </article>
        ))}
      </div>
    </>
  );
}

function DriverProfileScreen({
  profile,
  snapshot,
  error
}: {
  profile: DriverProfile;
  snapshot: DriverDashboardSnapshot;
  error: string;
}) {
  const menu = [
    { to: '/driver/map', label: 'Карта', Icon: MapPin },
    { to: '/driver/earnings', label: 'Заработок', Icon: WalletCards },
    { to: '/driver/settings', label: 'Настройки', Icon: Settings },
    { to: '/driver/support', label: 'Поддержка', Icon: Headphones }
  ];

  return (
    <>
      <DriverHeader title="Профиль" action={<Star />} />
      <section className="driver-profile-card">
        <span className="driver-avatar">{profile.photoUrl ? <img src={profile.photoUrl} alt="" /> : <User />}</span>
        <strong>{profile.name}</strong>
        <small>{profile.phone}</small>
        <div>
          <span>{profile.isOnline ? 'Онлайн' : 'Оффлайн'}</span>
          <span>{profile.rating.toFixed(1)} ★</span>
        </div>
      </section>
      {error && <p className="driver-error">{error}</p>}
      <div className="driver-profile-menu">
        <DriverProfileRow icon={<Car />} label="Транспорт" value={`${profile.vehicleInfo} · ${profile.carNumber}`} />
        <DriverProfileRow icon={<ShieldCheck />} label="Документы" value="Проверено" />
        <DriverProfileRow icon={<CalendarDays />} label="Статистика" value={`${snapshot.stats.ordersToday} заказов`} />
        <DriverProfileRow icon={<CircleDollarSign />} label="Баланс" value={formatPrice(snapshot.stats.earningsToday)} />
        {menu.map(({ to, label, Icon }) => (
          <Link to={to} key={to}>
            <Icon />
            <span>{label}</span>
            <ChevronRight />
          </Link>
        ))}
      </div>
    </>
  );
}

function DriverProfileRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <article>
      {icon}
      <span>{label}</span>
      <b>{value}</b>
    </article>
  );
}

function DriverSettingsScreen({ profile }: { profile: DriverProfile }) {
  return (
    <>
      <DriverHeader title="Настройки" />
      <div className="driver-profile-menu">
        <DriverProfileRow icon={<User />} label="Имя" value={profile.name} />
        <DriverProfileRow icon={<Phone />} label="Телефон" value={profile.phone} />
        <DriverProfileRow icon={<Car />} label="Авто" value={profile.vehicleInfo} />
        <DriverProfileRow icon={<WalletCards />} label="Вывод средств" value="Карта / счёт" />
      </div>
    </>
  );
}

function DriverSupportScreen() {
  return (
    <>
      <DriverHeader title="Поддержка" />
      <section className="driver-empty-block">
        <Headphones />
        <strong>Поддержка водителей</strong>
        <a href="https://wa.me/79990000000" target="_blank" rel="noreferrer">Написать в WhatsApp</a>
      </section>
    </>
  );
}

function DriverRouteLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="driver-route-line">
      {icon}
      <span>
        <small>{label}</small>
        <strong>{value || 'Не указано'}</strong>
      </span>
    </div>
  );
}

function DriverMapPreview({ offer, tall = false }: { offer: DeliveryOffer | null; tall?: boolean }) {
  return (
    <section className={tall ? 'driver-map-preview driver-map-preview--tall' : 'driver-map-preview'}>
      <span className="driver-map-pin driver-map-pin--restaurant"><Home /></span>
      <span className="driver-map-route" />
      <span className="driver-map-pin driver-map-pin--client"><MapPin /></span>
      {offer && (
        <div>
          <strong>{offer.distanceKm} км</strong>
          <small>{offer.restaurantName} → клиент</small>
        </div>
      )}
    </section>
  );
}

function DriverBottomNav({ active }: { active: string }) {
  const items = [
    { id: 'home', to: '/driver', label: 'Главная', Icon: Home },
    { id: 'orders', to: '/driver/orders', label: 'Заказы', Icon: ClipboardList },
    { id: 'map', to: '/driver/map', label: 'Карта', Icon: MapPin },
    { id: 'earnings', to: '/driver/earnings', label: 'Баланс', Icon: WalletCards },
    { id: 'profile', to: '/driver/profile', label: 'Профиль', Icon: User }
  ];

  return (
    <nav className="driver-bottom-nav" aria-label="Навигация водителя">
      {items.map(({ id, to, label, Icon }) => (
        <Link className={active === id || (active === 'home' && id === 'home') ? 'is-active' : ''} to={to} key={id}>
          <Icon />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
