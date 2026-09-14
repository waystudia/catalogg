import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Car,
  ChevronRight,
  Check,
  CircleDollarSign,
  ClipboardList,
  Headphones,
  Home,
  KeyRound,
  LogOut,
  MapPin,
  Navigation,
  PackageCheck,
  Phone,
  QrCode,
  RefreshCw,
  Settings,
  ShieldCheck,
  Star,
  ToggleLeft,
  ToggleRight,
  User,
  WalletCards,
  X
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { useDriverStore } from '../../features/driver/store';
import {
  getDriverDeliveryProgress,
  getDriverNextAction,
  splitDriverHomeOffers
} from '../../features/driver/dashboardPresentation';
import {
  buildYandexNavigatorReturnUrl,
  calculateDriverCashHandover
} from '../../features/order/orderLifecycle';
import type { DeliveryStatus } from '../../features/order/orderLifecycle';
import {
  acceptDeliveryOffer,
  changeDriverPassword,
  completeDeliveryProgress,
  confirmDriverDeliveryHandoff,
  confirmDriverPickup,
  demoDriverId,
  getAuthenticatedDriverId,
  getDriverDashboard,
  getDriverNavigatorRouteUrl,
  hasDriverAuthSession,
  refreshDriverPickupQr,
  saveDriverProfile,
  signOutDriver,
  setDriverAvailability,
  subscribeToDriverRealtime,
  updateDriverLocation,
  updateDeliveryProgress,
  type DeliveryOffer,
  type DriverDashboardSnapshot,
  DriverActionError,
  type DriverProfile
} from '../../shared/api/deliveryApi';
import { requestDriverDeliveryPrice } from '../../shared/api/deliveryPricingApi';
import { getDeliverySettlements } from '../../shared/api/settlementsApi';
import { formatOrderTime, groupOrdersByDate } from '../../shared/orderListGroups';
import {
  getRestaurantOrderNotificationPermission,
  requestRestaurantOrderNotificationPermission,
  restoreRestaurantOrderNotificationSubscription,
  showRestaurantOrderNotification
} from '../../shared/restaurantOrderNotifications';
import { redirectToClientHome } from '../../shared/appNavigation';
import { supabase } from '../../shared/supabase';
import { getBusinessTerms } from '../../shared/businessTerminology';
import { confirmRoleSignOut, getDriverBackTarget } from '../../shared/roleSessionSafety';
import './driver.css';

const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;

const buildDriverPickupQrPayload = (delivery: Pick<DeliveryOffer, 'deliveryId' | 'orderId' | 'pickupQrToken'> | null) =>
  delivery?.pickupQrToken ? `wc-delivery|${delivery.deliveryId}|${delivery.pickupQrToken}` : '';

const useDriverPickupQrImage = (payload: string) => {
  const [qrImageUrl, setQrImageUrl] = useState('');

  useEffect(() => {
    let isCancelled = false;

    if (!payload) {
      setQrImageUrl('');
      return () => {
        isCancelled = true;
      };
    }

    void QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 320
    })
      .then((dataUrl) => {
        if (!isCancelled) setQrImageUrl(dataUrl);
      })
      .catch(() => {
        if (!isCancelled) setQrImageUrl('');
      });

    return () => {
      isCancelled = true;
    };
  }, [payload]);

  return qrImageUrl;
};

const coordinatePairPattern = /-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/g;
const addressHasStreetDetails = (value: string) =>
  /(ул\.?|улиц|пр-т|просп|переул|пер\.?|дом|д\.|кв\.|корп|строен|[а-яё]\s+\d+)/iu.test(value);

const formatDriverDeliveryAddress = (address: string) => {
  const cleanedParts = address
    .replace(coordinatePairPattern, '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const dedupedAddress = Array.from(new Set(cleanedParts)).join(', ');
  if (!dedupedAddress) return 'Адрес не указан';
  return addressHasStreetDetails(dedupedAddress)
    ? dedupedAddress
    : `${dedupedAddress} · улица и дом не указаны`;
};

const parseDriverSettlements = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

function playDriverNewOrderSound() {
  try {
    const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = window.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextCtor) return;

    const audio = new AudioContextCtor();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.24);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.26);
    window.setTimeout(() => void audio.close(), 340);
  } catch {
    // Browsers may block audio until the first user gesture.
  }
}

const deliveryStatusLabels: Record<DeliveryStatus, string> = {
  not_required: 'Не требуется',
  waiting_courier: 'Новый заказ',
  assigned: 'Принят',
  arrived_to_restaurant: '',
  handed_over: 'Заказ получен',
  on_the_way: 'В пути к клиенту',
  arrived_to_client: 'На месте у клиента',
  delivered: 'Доставлен',
  failed: 'Проблема'
};

const getDeliveryStatusLabel = (status: DeliveryStatus, businessType: DeliveryOffer['businessType']) =>
  status === 'arrived_to_restaurant'
    ? getBusinessTerms(businessType).driverAtPlaceStatus
    : deliveryStatusLabels[status];

const driverDeliveryStatusTones: Record<DeliveryStatus, 'new' | 'work' | 'ready' | 'delivery' | 'done'> = {
  not_required: 'done',
  waiting_courier: 'new',
  assigned: 'work',
  arrived_to_restaurant: 'work',
  handed_over: 'ready',
  on_the_way: 'delivery',
  arrived_to_client: 'delivery',
  delivered: 'done',
  failed: 'done'
};

const deliveryStatusProgress: Record<DeliveryStatus, number> = {
  not_required: 0,
  waiting_courier: 1,
  assigned: 2,
  arrived_to_restaurant: 3,
  handed_over: 4,
  on_the_way: 5,
  arrived_to_client: 6,
  delivered: 7,
  failed: 7
};

const latestDeliveryStatus = (first: DeliveryStatus, second: DeliveryStatus) =>
  deliveryStatusProgress[second] > deliveryStatusProgress[first] ? second : first;

function DriverCashPaymentHandover({
  deliveryId,
  clientTotal,
  courierPayout,
  businessType
}: {
  deliveryId: string;
  clientTotal: number;
  courierPayout: number;
  businessType: DeliveryOffer['businessType'];
}) {
  const terms = getBusinessTerms(businessType);
  const storageKey = `driver-cash-handed-over:${deliveryId}`;
  const [moneyHandedOver, setMoneyHandedOver] = useState(false);
  const restaurantCashAmount = calculateDriverCashHandover({ clientTotal, courierPayout });

  useEffect(() => {
    setMoneyHandedOver(window.sessionStorage.getItem(storageKey) === 'true');
  }, [storageKey]);

  const confirmMoneyHandedOver = () => {
    window.sessionStorage.setItem(storageKey, 'true');
    setMoneyHandedOver(true);
  };

  return (
    <section className="driver-cash-handover">
      <p>
        {moneyHandedOver
          ? `Деньги переданы. Ожидайте подтверждения оплаты ${terms.placeInstrumental}.`
          : `Передайте ${terms.placeDative} ${formatPrice(restaurantCashAmount)}. Ваши ${formatPrice(courierPayout)} уже удержаны из суммы ${terms.placeGenitive}.`}
      </p>
      <button type="button" disabled={moneyHandedOver} onClick={confirmMoneyHandedOver}>
        {moneyHandedOver ? 'Деньги переданы ✓' : 'Я передал деньги'}
      </button>
      <small>После подтверждения {terms.placeInstrumental} появится QR, затем станет доступна кнопка «Забрал заказ».</small>
    </section>
  );
}

const emptySnapshot: DriverDashboardSnapshot = {
  profile: {
    id: '',
    name: '',
    phone: '',
    vehicleInfo: '',
    carNumber: '',
    payoutDetails: '',
    debtAmount: 0,
    photoUrl: '',
    serviceSettlements: [],
    rating: 5,
    status: 'offline',
    isOnline: false,
    lastLat: null,
    lastLng: null,
    lastLocationAt: null
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
  const bindDriver = useDriverStore((state) => state.bindDriver);
  const localActiveDelivery = useDriverStore((state) => state.localActiveDelivery);
  const completedDeliveryIds = useDriverStore((state) => state.completedDeliveryIds);
  const dismissedDeliveryIds = useDriverStore((state) => state.dismissedDeliveryIds);
  const [snapshot, setSnapshot] = useState<DriverDashboardSnapshot>(emptySnapshot);
  const [error, setError] = useState('');
  const [authChecked, setAuthChecked] = useState(!supabase);
  const [hasDriverAccess, setHasDriverAccess] = useState(!supabase);
  const [recentDeliveryIds, setRecentDeliveryIds] = useState<Set<string>>(() => new Set());
  const knownDeliveryIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedDeliveriesRef = useRef(false);
  const dashboardLoadRef = useRef<Promise<boolean> | null>(null);

  const loadDashboard = useCallback(() => {
    if (dashboardLoadRef.current) return dashboardLoadRef.current;

    const pendingLoad = (async () => {
      try {
        const nextSnapshot = await getDriverDashboard();
        const visibleDeliveries = [
          nextSnapshot.activeDelivery,
          ...nextSnapshot.availableDeliveries
        ].filter((offer): offer is DeliveryOffer => Boolean(offer));
        const knownIds = knownDeliveryIdsRef.current;
        const newDeliveryIds = hasLoadedDeliveriesRef.current
          ? visibleDeliveries
              .filter((offer) => offer.status === 'waiting_courier' && !knownIds.has(offer.deliveryId))
              .map((offer) => offer.deliveryId)
          : [];
        if (newDeliveryIds.length > 0) {
          const newOffers = visibleDeliveries.filter((offer) => newDeliveryIds.includes(offer.deliveryId));
          setRecentDeliveryIds((current) => new Set([...current, ...newDeliveryIds]));
          playDriverNewOrderSound();
          newOffers.slice(0, 3).forEach((offer) => {
            void showRestaurantOrderNotification({
              title: `Новая доставка ${offer.orderNumber}`,
              body: `${offer.restaurantName} · ${offer.deliveryAddress}`,
              tag: `driver-delivery-${offer.deliveryId}`,
              url: `${window.location.origin}${window.location.pathname}${window.location.search}#/driver/orders/${offer.deliveryId}`
            });
          });
          window.setTimeout(() => {
            setRecentDeliveryIds((current) => {
              const next = new Set(current);
              newDeliveryIds.forEach((id) => next.delete(id));
              return next;
            });
          }, 9000);
        }
        knownDeliveryIdsRef.current = new Set(visibleDeliveries.map((offer) => offer.deliveryId));
        hasLoadedDeliveriesRef.current = true;
        setSnapshot(nextSnapshot);
        if (nextSnapshot.profile.id !== demoDriverId && nextSnapshot.profile.id !== selectedDriverId) {
          bindDriver(nextSnapshot.profile.id);
        }
        setError('');
        return true;
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить доставки');
        return false;
      }
    })().finally(() => {
      if (dashboardLoadRef.current === pendingLoad) dashboardLoadRef.current = null;
    });

    dashboardLoadRef.current = pendingLoad;
    return pendingLoad;
  }, [bindDriver, selectedDriverId]);

  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;
    void (async () => {
      const hasSession = await hasDriverAuthSession();
      if (!isMounted) return;

      if (!hasSession) {
        setHasDriverAccess(false);
        setAuthChecked(true);
        return;
      }

      try {
        const driverId = await getAuthenticatedDriverId();
        if (!isMounted) return;
        if (driverId) {
          bindDriver(driverId);
          setHasDriverAccess(true);
          setError('');
        } else {
          setHasDriverAccess(false);
          setError('');
        }
      } catch {
        if (!isMounted) return;
        setHasDriverAccess(false);
        setError('');
      } finally {
        if (isMounted) setAuthChecked(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [bindDriver]);

  useEffect(() => {
    if (!authChecked || !hasDriverAccess || selectedDriverId === demoDriverId) return;
    void loadDashboard();
  }, [authChecked, hasDriverAccess, loadDashboard, selectedDriverId]);

  const profile: DriverProfile = {
    ...snapshot.profile,
    status: localActiveDelivery ? 'busy' : snapshot.profile.status
  };
  const effectiveDriverId = hasDriverAccess ? selectedDriverId : '';
  const route = location.pathname.split('/').filter(Boolean)[1] ?? 'home';

  useEffect(() => {
    if (!authChecked || !hasDriverAccess || !effectiveDriverId) return;
    const restorePush = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void restoreRestaurantOrderNotificationSubscription({
          role: 'driver',
          driverId: effectiveDriverId
        });
      }
    };
    restorePush();
    window.addEventListener('online', restorePush);
    window.addEventListener('pageshow', restorePush);
    document.addEventListener('visibilitychange', restorePush);
    return () => {
      window.removeEventListener('online', restorePush);
      window.removeEventListener('pageshow', restorePush);
      document.removeEventListener('visibilitychange', restorePush);
    };
  }, [authChecked, effectiveDriverId, hasDriverAccess]);

  useEffect(() => {
    if (!authChecked || !hasDriverAccess || !effectiveDriverId) return undefined;
    return subscribeToDriverRealtime(effectiveDriverId, loadDashboard);
  }, [authChecked, effectiveDriverId, hasDriverAccess, loadDashboard]);

  useEffect(() => {
    if (!authChecked || !hasDriverAccess || !snapshot.profile.isOnline || !effectiveDriverId || !navigator.geolocation) {
      return undefined;
    }

    let lastSentAt = 0;
    let pendingTimer: number | null = null;
    let latestLocation: { lat: number; lng: number; accuracy: number | null } | null = null;
    const sendLocation = () => {
      if (!latestLocation) return;
      lastSentAt = Date.now();
      const location = latestLocation;
      latestLocation = null;
      void updateDriverLocation(effectiveDriverId, location).catch(() => undefined);
    };
    const onPosition = (position: GeolocationPosition) => {
      const recordedAtMs = Number.isFinite(position.timestamp) && position.timestamp > 0
        ? position.timestamp
        : Date.now();
      latestLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null
      };
      setSnapshot((current) => ({
        ...current,
        profile: {
          ...current.profile,
          lastLat: position.coords.latitude,
          lastLng: position.coords.longitude,
          lastLocationAt: new Date(recordedAtMs).toISOString()
        }
      }));
      const waitMs = Math.max(0, 5_000 - (Date.now() - lastSentAt));
      if (waitMs === 0) {
        sendLocation();
      } else if (pendingTimer === null) {
        pendingTimer = window.setTimeout(() => {
          pendingTimer = null;
          sendLocation();
        }, waitMs);
      }
    };

    const watchId = navigator.geolocation.watchPosition(onPosition, () => undefined, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 10_000
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (pendingTimer !== null) window.clearTimeout(pendingTimer);
    };
  }, [authChecked, effectiveDriverId, hasDriverAccess, snapshot.profile.isOnline]);

  useEffect(() => {
    if (!authChecked || !hasDriverAccess) return undefined;

    const refreshDriverDashboard = () => {
      void loadDashboard();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshDriverDashboard();
      }
    };
    const intervalId = window.setInterval(refreshWhenVisible, 10_000);

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
  }, [authChecked, hasDriverAccess, loadDashboard]);

  useEffect(() => {
    if (!authChecked || !hasDriverAccess) return undefined;

    const refreshAfterPickupConfirmation = (event: StorageEvent) => {
      if (event.key === 'waycatalog-driver-delivery-confirmed') {
        void loadDashboard();
      }
    };

    window.addEventListener('storage', refreshAfterPickupConfirmation);
    return () => window.removeEventListener('storage', refreshAfterPickupConfirmation);
  }, [authChecked, hasDriverAccess, loadDashboard]);

  useEffect(() => {
    if (!authChecked || !hasDriverAccess || !['active', 'map'].includes(route)) return undefined;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadDashboard();
    }, 20_000);
    return () => window.clearInterval(intervalId);
  }, [authChecked, hasDriverAccess, loadDashboard, route]);

  const activeDelivery = useMemo(() => {
    if (snapshot.activeDelivery && localActiveDelivery?.deliveryId === snapshot.activeDelivery.deliveryId) {
      return {
        ...localActiveDelivery,
        ...snapshot.activeDelivery,
        status: latestDeliveryStatus(localActiveDelivery.status, snapshot.activeDelivery.status),
        pickupQrToken: snapshot.activeDelivery.pickupQrToken ?? localActiveDelivery.pickupQrToken,
        routeToClientUrl: snapshot.activeDelivery.routeToClientUrl ?? localActiveDelivery.routeToClientUrl
      };
    }

    return localActiveDelivery ?? snapshot.activeDelivery;
  }, [localActiveDelivery, snapshot.activeDelivery]);
  const availableDeliveries = snapshot.profile.isOnline
    ? snapshot.availableDeliveries.filter(
        (delivery) =>
          !completedDeliveryIds.includes(delivery.deliveryId) &&
          !dismissedDeliveryIds.includes(delivery.deliveryId)
      )
    : [];
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
          <small>Используйте телефон или email и пароль, которые выдал супер-админ.</small>
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
            recentDeliveryIds={recentDeliveryIds}
            error={error}
          />
        ) : route === 'active' || route === 'map' ? (
          <DriverActiveScreen delivery={activeDelivery} />
        ) : route === 'qr' ? (
          <DriverQrScreen delivery={activeDelivery} />
        ) : route === 'earnings' ? (
          <DriverEarningsScreen snapshot={snapshot} />
        ) : route === 'settings' ? (
          <DriverSettingsScreen
            profile={profile}
            onProfileSaved={async () => {
              await loadDashboard();
            }}
          />
        ) : route === 'support' ? (
          <DriverSupportScreen />
        ) : (
          <DriverHomeScreen
            profile={profile}
            snapshot={snapshot}
            activeDelivery={activeDelivery}
            availableDeliveries={availableDeliveries}
            error={error}
            onRefresh={loadDashboard}
            onAvailabilityChanged={(isOnline) => {
              setSnapshot((current) => ({
                ...current,
                profile: {
                  ...current.profile,
                  isOnline,
                  status: isOnline ? 'online' : 'offline'
                }
              }));
            }}
          />
        )}
        <DriverBottomNav active={route === 'map' ? 'home' : route} />
      </section>
    </main>
  );
}

function DriverHeader({ title, action }: { title: string; action?: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="driver-header">
      <button type="button" onClick={() => navigate(getDriverBackTarget(location.pathname))} aria-label="Назад">
        <ArrowLeft />
      </button>
      <h1>{title}</h1>
      <span>
        {action ?? (
          <button type="button" onClick={() => window.location.reload()} aria-label="Обновить">
            <RefreshCw />
          </button>
        )}
      </span>
    </header>
  );
}

function DriverHomeScreen({
  profile,
  snapshot,
  activeDelivery,
  availableDeliveries,
  error,
  onRefresh,
  onAvailabilityChanged
}: {
  profile: DriverProfile;
  snapshot: DriverDashboardSnapshot;
  activeDelivery: DeliveryOffer | null;
  availableDeliveries: readonly DeliveryOffer[];
  error: string;
  onRefresh: () => Promise<boolean>;
  onAvailabilityChanged: (isOnline: boolean) => void;
}) {
  const [availabilityError, setAvailabilityError] = useState('');
  const [isUpdatingAvailability, setIsUpdatingAvailability] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const [optimisticOnline, setOptimisticOnline] = useState<boolean | null>(null);
  const [notificationPermission, setNotificationPermission] = useState(() => getRestaurantOrderNotificationPermission());
  const displayedOnline = optimisticOnline ?? profile.isOnline;
  const displayDriverName = profile.name.trim() || 'Профиль загружается…';
  const { urgentOffer, otherOffers, hiddenOffersCount } = useMemo(
    () => splitDriverHomeOffers(availableDeliveries),
    [availableDeliveries]
  );

  useEffect(() => {
    if (!profile.id) return;
    void restoreRestaurantOrderNotificationSubscription({
      role: 'driver',
      driverId: profile.id
    }).then(setNotificationPermission);
  }, [profile.id]);

  useEffect(() => {
    if (optimisticOnline === profile.isOnline) setOptimisticOnline(null);
  }, [optimisticOnline, profile.isOnline]);

  const toggleOnline = async () => {
    if (isUpdatingAvailability) return;
    const nextOnline = !displayedOnline;
    setIsUpdatingAvailability(true);
    setAvailabilityError('');
    setOptimisticOnline(nextOnline);
    onAvailabilityChanged(nextOnline);
    try {
      await setDriverAvailability(nextOnline);
      void onRefresh();
      if (nextOnline) {
        void requestRestaurantOrderNotificationPermission({ role: 'driver', driverId: profile.id }).then(setNotificationPermission);
      }
    } catch (availabilityUpdateError) {
      const shouldRollback =
        availabilityUpdateError instanceof DriverActionError && availabilityUpdateError.code === 'auth';
      if (shouldRollback) {
        setOptimisticOnline(!nextOnline);
        onAvailabilityChanged(!nextOnline);
        setAvailabilityError(availabilityUpdateError.message);
      } else {
        setAvailabilityError('Статус отправлен. Если заказы не появились, нажмите обновить.');
        void onRefresh();
      }
    } finally {
      setIsUpdatingAvailability(false);
    }
  };

  const enableNotifications = () => {
    void requestRestaurantOrderNotificationPermission({ role: 'driver', driverId: profile.id }).then(setNotificationPermission);
  };

  const refreshDashboard = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshMessage('Обновляем заказы…');
    const refreshed = await onRefresh();
    setRefreshMessage(refreshed ? 'Заказы обновлены' : 'Обновление не выполнено');
    setIsRefreshing(false);
  };

  return (
    <>
      <header className="driver-topbar">
        <div>
          <strong className="driver-online-status">
            {displayedOnline ? 'Вы в сети' : 'Вы не в сети'}
            <span data-online={displayedOnline} aria-hidden="true" />
          </strong>
          <small>{displayDriverName}</small>
        </div>
        <div className="driver-topbar__actions">
          <button
            className={`driver-online-button driver-push-button ${notificationPermission === 'granted' ? 'is-active' : ''}`}
            type="button"
            onClick={enableNotifications}
            aria-label={notificationPermission === 'granted' ? 'Push-уведомления включены' : 'Включить push-уведомления'}
            title={notificationPermission === 'granted' ? 'Push включён' : 'Включить push-уведомления'}
          >
            <Bell />
          </button>
          <button
            className={`driver-online-button driver-refresh-button ${isRefreshing ? 'is-refreshing' : ''}`}
            type="button"
            onClick={() => void refreshDashboard()}
            aria-label="Обновить"
            aria-busy={isRefreshing}
            disabled={isRefreshing}
          >
            <RefreshCw />
          </button>
          <button className="driver-online-button driver-availability-button" type="button" disabled={isUpdatingAvailability} onClick={() => void toggleOnline()} aria-label="Онлайн статус">
            {displayedOnline ? <ToggleRight /> : <ToggleLeft />}
            <span>{displayedOnline ? 'Онлайн' : 'Офлайн'}</span>
          </button>
        </div>
      </header>

      {error && <p className="driver-error">{error}</p>}
      {availabilityError && <p className="driver-error">{availabilityError}</p>}
      {refreshMessage && <p className="driver-refresh-status" role="status">{refreshMessage}</p>}

      <section className="driver-today-strip" aria-label="Статистика за сегодня">
        <DriverStat label="Сегодня" value={formatPrice(snapshot.stats.earningsToday)} />
        <DriverStat label="Принято" value={String(snapshot.stats.ordersToday)} />
        <DriverStat label="Выполнено" value={String(snapshot.stats.completedToday)} />
        <DriverStat label="Отменено" value={String(snapshot.stats.canceledToday)} />
        <DriverStat label="Рейтинг" value={profile.rating.toFixed(1)} />
      </section>

      <DriverSectionTitle title="Текущая доставка" to="/driver/active" />
      {activeDelivery ? (
        <DriverCurrentDeliveryPanel offer={activeDelivery} onRefresh={onRefresh} />
      ) : (
        <section className="driver-empty-block driver-empty-block--compact">
          <ClipboardList />
          <strong>Сейчас активной доставки нет</strong>
        </section>
      )}

      {urgentOffer && (
        <DriverIncomingOrderPanel
          driverId={profile.id}
          offer={urgentOffer}
          onRefresh={onRefresh}
          key={urgentOffer.deliveryId}
        />
      )}

      <DriverSectionTitle title="Другие доступные заказы" to="/driver/orders" />
      <section className="driver-other-orders">
        {otherOffers.map((offer) => (
          <Link className="driver-other-order-row" to={`/driver/orders/${offer.deliveryId}`} key={offer.deliveryId}>
            <span>
              <strong>{offer.orderNumber}</strong>
              <small>{offer.restaurantName || getBusinessTerms(offer.businessType).place} → {formatDriverDeliveryAddress(offer.deliveryAddress)}</small>
              <small>{offer.distanceKm} км · ≈ {offer.routeEtaMin} мин</small>
            </span>
            <b>{formatPrice(offer.orderTotal > 0 ? offer.orderTotal : offer.deliveryFee)}</b>
            <ChevronRight aria-hidden="true" />
          </Link>
        ))}
        {otherOffers.length === 0 && <p>Других заказов пока нет</p>}
        {hiddenOffersCount > 0 && (
          <Link className="driver-more-orders-link" to="/driver/orders">
            Ещё {hiddenOffersCount} заказов
            <ChevronRight aria-hidden="true" />
          </Link>
        )}
      </section>
    </>
  );
}

function DriverIncomingOrderPanel({
  driverId,
  offer,
  onRefresh
}: {
  driverId: string;
  offer: DeliveryOffer;
  onRefresh: () => Promise<boolean>;
}) {
  const terms = getBusinessTerms(offer.businessType);
  const navigate = useNavigate();
  const acceptLocalOffer = useDriverStore((state) => state.acceptLocalOffer);
  const dismissDeliveryOffer = useDriverStore((state) => state.dismissDeliveryOffer);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSecondsLeft((seconds) => Math.max(0, seconds - 1));
    }, 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const accept = async () => {
    if (isAccepting) return;
    setIsAccepting(true);
    setError('');
    try {
      await acceptDeliveryOffer(offer.deliveryId);
      acceptLocalOffer(offer, driverId);
      await onRefresh();
      navigate('/driver', { replace: true });
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'Не удалось принять заказ');
    } finally {
      setIsAccepting(false);
    }
  };

  const reject = () => {
    dismissDeliveryOffer(offer.deliveryId);
    void onRefresh();
  };

  return (
    <section className="driver-urgent-offer" aria-label={`Новый заказ ${offer.orderNumber}`}>
      <div className="driver-urgent-offer__content">
        <header>
          <strong>⚡ НОВЫЙ ЗАКАЗ</strong>
          <time aria-label={`Осталось ${secondsLeft} секунд`}>{secondsLeft} сек</time>
        </header>
        <div className="driver-urgent-offer__headline">
          <strong>{offer.orderNumber}</strong>
          <b>{formatPrice(offer.orderTotal > 0 ? offer.orderTotal : offer.deliveryFee)}</b>
        </div>
        <p><Home /><span><small>{terms.place}</small><strong>{offer.restaurantName || terms.place} · {formatDriverDeliveryAddress(offer.restaurantAddress)}</strong></span></p>
        <p><MapPin /><span><small>Адрес доставки</small><strong>{formatDriverDeliveryAddress(offer.deliveryAddress)}</strong></span></p>
        <div className="driver-urgent-offer__meta">
          <span>{offer.distanceKm} км</span>
          <span>≈ {offer.routeEtaMin} мин</span>
          <span>{offer.paymentLabel}</span>
        </div>
        {error && <small className="driver-incoming-order__error">{error}</small>}
        <div className="driver-incoming-order__actions">
          <button type="button" className="driver-secondary" onClick={reject}>Отклонить</button>
          <button type="button" className="driver-primary" disabled={isAccepting} onClick={() => void accept()}>
            {isAccepting ? 'Принимаем...' : 'Принять заказ'}
          </button>
        </div>
      </div>
    </section>
  );
}

function DriverCurrentDeliveryPanel({
  offer,
  onRefresh
}: {
  offer: DeliveryOffer;
  onRefresh: () => Promise<boolean>;
}) {
  const terms = getBusinessTerms(offer.businessType);
  const navigate = useNavigate();
  const updateLocalDeliveryStatus = useDriverStore((state) => state.updateLocalDeliveryStatus);
  const completeLocalDelivery = useDriverStore((state) => state.completeLocalDelivery);
  const [isUpdating, setIsUpdating] = useState(false);
  const [qrSecondsLeft, setQrSecondsLeft] = useState(0);
  const qrRefreshInFlightRef = useRef(false);
  const [error, setError] = useState('');
  const nextAction = getDriverNextAction(offer.status, false, offer.businessType);
  const progress = getDriverDeliveryProgress(offer.status, false, offer.businessType);
  const qrPayload = buildDriverPickupQrPayload(offer);
  const qrImageUrl = useDriverPickupQrImage(qrPayload);
  const waitingForCashConfirmation =
    offer.status === 'arrived_to_restaurant' &&
    offer.paymentMethod === 'cash' &&
    !offer.restaurantPaymentConfirmed;
  const waitingForQr =
    offer.status === 'arrived_to_restaurant' &&
    !offer.pickupQrConfirmed;
  const pickupBlocked = waitingForCashConfirmation || waitingForQr;

  useEffect(() => {
    const qrExpiresAt = offer.pickupQrExpiresAt;
    if (!waitingForQr || !qrExpiresAt) {
      setQrSecondsLeft(0);
      return undefined;
    }

    const updateTimer = () => {
      const secondsLeft = Math.max(
        0,
        Math.ceil((new Date(qrExpiresAt).getTime() - Date.now()) / 1000)
      );
      setQrSecondsLeft(secondsLeft);

      if (secondsLeft === 0 && !qrRefreshInFlightRef.current) {
        qrRefreshInFlightRef.current = true;
        void refreshDriverPickupQr(offer.deliveryId)
          .then(() => onRefresh())
          .catch((refreshError) => {
            setError(refreshError instanceof Error ? refreshError.message : 'Не удалось обновить QR-код');
          })
          .finally(() => {
            qrRefreshInFlightRef.current = false;
          });
      }
    };

    updateTimer();
    const intervalId = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(intervalId);
  }, [offer.deliveryId, offer.pickupQrExpiresAt, onRefresh, waitingForQr]);

  const qrTimerLabel = `${String(Math.floor(qrSecondsLeft / 60)).padStart(2, '0')}:${String(qrSecondsLeft % 60).padStart(2, '0')}`;

  const advance = async () => {
    if (!nextAction || isUpdating) return;
    if (nextAction.to && !nextAction.status) {
      navigate(nextAction.to);
      return;
    }
    if (!nextAction.status) return;

    setIsUpdating(true);
    setError('');
    try {
      if (nextAction.status === 'delivered') {
        await completeDeliveryProgress(offer.deliveryId);
        updateLocalDeliveryStatus(nextAction.status);
        completeLocalDelivery();
      } else if (offer.status === 'arrived_to_restaurant' && nextAction.status === 'handed_over') {
        await confirmDriverPickup(offer.deliveryId);
        updateLocalDeliveryStatus(nextAction.status);
      } else {
        await updateDeliveryProgress(offer.deliveryId, nextAction.status);
        updateLocalDeliveryStatus(nextAction.status);
      }
      await onRefresh();
    } catch (advanceError) {
      setError(advanceError instanceof Error ? advanceError.message : 'Не удалось обновить этап доставки');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <section className="driver-current-block">
      <div className="driver-current-block__accepted">
        <strong>✓ ЗАКАЗ ПРИНЯТ</strong>
      </div>
      <header>
        <span>
          <strong>{offer.orderNumber}</strong>
          <small>Доставка · {offer.itemsCount} поз.</small>
        </span>
        <span>
          <small>Осталось ≈ {offer.routeEtaMin} мин</small>
        </span>
      </header>
      <p><Home /><span><small>Точка А</small><strong>{offer.restaurantName || terms.place} · {formatDriverDeliveryAddress(offer.restaurantAddress)}</strong></span></p>
      <p><MapPin /><span><small>Точка Б</small><strong>{formatDriverDeliveryAddress(offer.deliveryAddress)}</strong></span></p>
      <div className="driver-current-block__summary">
        <span>Ваш заработок</span>
        <strong>{formatPrice(offer.deliveryFee)}</strong>
      </div>
      <ol className="driver-delivery-progress" aria-label="Статус доставки">
        {progress.labels.map((label, index) => {
          const step = index + 1;
          return (
            <li key={label} data-complete={step <= progress.activeStep} data-active={step === progress.activeStep}>
              <span>{step}</span>
              <small>{label}</small>
            </li>
          );
        })}
      </ol>
      {waitingForCashConfirmation && (
        <DriverCashPaymentHandover
          businessType={offer.businessType}
          deliveryId={offer.deliveryId}
          clientTotal={offer.orderTotal}
          courierPayout={offer.deliveryFee}
        />
      )}
      {!waitingForCashConfirmation && waitingForQr && (
        <p className="driver-handover-gate">Покажите QR-код {terms.placeDative}. После сканирования можно забрать заказ.</p>
      )}
      {!waitingForCashConfirmation && waitingForQr && qrPayload && (
        <button
          className="driver-inline-qr"
          type="button"
          onClick={() => navigate('/driver/qr')}
          aria-label="Открыть QR заказа на весь экран"
        >
          {qrImageUrl ? <img src={qrImageUrl} alt={`QR выдачи заказа ${offer.orderNumber}`} /> : <QrCode />}
          <span>
            <strong>Показать QR: {terms.placeDative}</strong>
            <small>Нажмите, чтобы открыть крупный QR на весь экран.</small>
            <small className="driver-inline-qr__timer">
              {qrSecondsLeft > 0 ? `Новый QR через ${qrTimerLabel}` : 'Обновляем QR-код…'}
            </small>
          </span>
        </button>
      )}
      {error && <small className="driver-incoming-order__error">{error}</small>}
      <div className="driver-current-block__actions">
        <DriverYandexNavigationActions delivery={offer} />
        {offer.clientPhone ? (
          <a className="driver-secondary" href={`tel:${offer.clientPhone}`}><Phone />Позвонить</a>
        ) : (
          <button className="driver-secondary" type="button" disabled><Phone />Позвонить</button>
        )}
        {nextAction && (
          <button className="driver-primary" type="button" disabled={isUpdating || pickupBlocked} onClick={() => void advance()}>
            {isUpdating ? 'Сохраняем...' : nextAction.label}
          </button>
        )}
        {offer.status === 'arrived_to_client' && (
          <Link className="driver-primary" to="/driver/active">
            <PackageCheck />
            {offer.clientReceivedAt
              ? 'Завершить заказ'
              : offer.driverHandedToClientAt
                ? 'Ждём подтверждения клиента'
                : 'Подтвердить передачу клиенту'}
          </Link>
        )}
      </div>
    </section>
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

function DriverDeliveryCard({
  offer,
  compact = false,
  highlighted = false
}: {
  offer: DeliveryOffer;
  compact?: boolean;
  highlighted?: boolean;
}) {
  const statusTone = driverDeliveryStatusTones[offer.status];
  const price = offer.orderTotal > 0 ? offer.orderTotal : offer.deliveryFee;

  return (
    <Link
      className="driver-delivery-card driver-order-summary-card"
      data-compact={compact}
      data-highlighted={highlighted}
      to={`/driver/orders/${offer.deliveryId}`}
    >
      <span className="driver-order-summary-card__head">
        <strong>{offer.orderNumber}</strong>
        <time dateTime={offer.createdAt}>{formatOrderTime(offer.createdAt)}</time>
      </span>
      <span className="driver-order-summary-card__meta">
        Доставка • {offer.itemsCount} поз.
      </span>
      <span className="driver-order-summary-card__address">
        {compact ? formatDriverDeliveryAddress(offer.deliveryAddress) : formatDriverDeliveryAddress(offer.deliveryAddress) || `${offer.distanceKm} км от вас`}
      </span>
      <span className="driver-order-summary-card__foot">
        <strong>{formatPrice(price)}</strong>
        <em data-tone={statusTone}>
          {offer.status === 'waiting_courier' && <span aria-hidden="true" />}
          {getDeliveryStatusLabel(offer.status, offer.businessType)}
        </em>
      </span>
    </Link>
  );
}

type DriverYandexNavigationDelivery = Pick<
  DeliveryOffer,
  | 'deliveryId'
  | 'status'
  | 'restaurantAddress'
  | 'restaurantLat'
  | 'restaurantLng'
  | 'deliveryAddress'
  | 'deliveryLat'
  | 'deliveryLng'
>;

export function DriverYandexNavigationActions({
  delivery,
  onConfirmPickup
}: {
  delivery: DriverYandexNavigationDelivery;
  onConfirmPickup?: () => Promise<void> | void;
}) {
  const [isConfirmingPickup, setIsConfirmingPickup] = useState(false);
  const [isBuildingRoute, setIsBuildingRoute] = useState(false);
  const [error, setError] = useState('');
  const routeStorageKey = `wayyaam-navigator-launched:${delivery.deliveryId}`;
  const [hasLaunchedRoute, setHasLaunchedRoute] = useState(
    () => window.localStorage.getItem(routeStorageKey) === 'true'
  );
  const restaurantCoordinatesAreReady = Number.isFinite(delivery.restaurantLat) && Number.isFinite(delivery.restaurantLng);
  const clientCoordinatesAreReady = Number.isFinite(delivery.deliveryLat) && Number.isFinite(delivery.deliveryLng);

  useEffect(() => {
    setHasLaunchedRoute(window.localStorage.getItem(routeStorageKey) === 'true');
  }, [routeStorageKey]);

  const confirmPickup = async () => {
    if (!onConfirmPickup || isConfirmingPickup) return;
    setIsConfirmingPickup(true);
    setError('');
    try {
      await onConfirmPickup();
    } catch (pickupError) {
      setError(pickupError instanceof Error ? pickupError.message : 'Не удалось подтвердить получение заказа');
    } finally {
      setIsConfirmingPickup(false);
    }
  };

  const openInitialRoute = async (rebuildReason = '') => {
    if (isBuildingRoute) return;
    setIsBuildingRoute(true);
    setError('');
    try {
      const url = await getDriverNavigatorRouteUrl(delivery, rebuildReason);
      if (!url) throw new Error('Для маршрута нужны точные координаты бизнеса и клиента.');
      window.localStorage.setItem(routeStorageKey, 'true');
      setHasLaunchedRoute(true);
      window.location.href = url;
    } catch (routeError) {
      setError(routeError instanceof Error ? routeError.message : 'Не удалось открыть Яндекс Навигатор');
    } finally {
      setIsBuildingRoute(false);
    }
  };

  return (
    <section className="driver-yandex-navigation">
      {delivery.status === 'arrived_to_restaurant' && onConfirmPickup && (
        <button className="driver-primary" type="button" disabled={isConfirmingPickup} onClick={() => void confirmPickup()}>
          <PackageCheck />
          {isConfirmingPickup ? 'Подтверждаем...' : 'Я взял заказ'}
        </button>
      )}
      {hasLaunchedRoute ? (
        <a
          className="driver-primary driver-navigator-return"
          href={buildYandexNavigatorReturnUrl()}
        >
          <Navigation />
          <span><strong>Вернуться в Навигатор</strong><small>Маршрут уже создан — новая ссылка не расходуется</small></span>
          <ChevronRight />
        </a>
      ) : (
        <button
          className="driver-primary driver-navigator-open"
          type="button"
          disabled={isBuildingRoute || !restaurantCoordinatesAreReady || !clientCoordinatesAreReady}
          onClick={() => void openInitialRoute()}
        >
          <Navigation />
          <span>
            <strong>{isBuildingRoute ? 'Готовим маршрут...' : 'Открыть маршрут в Навигаторе'}</strong>
            <small>Бизнес → клиент, маршрут создаётся один раз</small>
          </span>
          <ChevronRight />
        </button>
      )}
      {!restaurantCoordinatesAreReady || !clientCoordinatesAreReady ? (
        <small className="driver-navigator-note">Сохраните точные координаты бизнеса и клиента, чтобы открыть маршрут.</small>
      ) : hasLaunchedRoute ? (
        <button className="driver-navigator-rebuild" type="button" onClick={() => void openInitialRoute('driver_requested_rebuild')} disabled={isBuildingRoute}>
          Маршрут потерян? Построить оставшийся заново
        </button>
      ) : null}
      {error && <p className="driver-error">{error}</p>}
    </section>
  );
}

function DriverOrdersScreen({
  driverId,
  offers,
  activeDelivery,
  recentDeliveryIds,
  error
}: {
  driverId: string;
  offers: readonly DeliveryOffer[];
  activeDelivery: DeliveryOffer | null;
  recentDeliveryIds: Set<string>;
  error: string;
}) {
  const location = useLocation();
  const deliveryId = location.pathname.split('/').filter(Boolean)[2] ?? '';
  const visibleOffers = useMemo(
    () =>
      activeDelivery
        ? [activeDelivery, ...offers.filter((offer) => offer.deliveryId !== activeDelivery.deliveryId)]
        : [...offers],
    [activeDelivery, offers]
  );
  const selectedOffer = visibleOffers.find((offer) => offer.deliveryId === deliveryId) ?? null;
  const offerGroups = useMemo(() => groupOrdersByDate(visibleOffers), [visibleOffers]);

  if (selectedOffer?.isAssignedToViewer) {
    return <DriverActiveScreen delivery={selectedOffer} />;
  }

  if (selectedOffer) return <DriverNewOrderScreen driverId={driverId} offer={selectedOffer} />;

  if (deliveryId) {
    return (
      <>
        <DriverHeader title="Заказ" />
        <section className="driver-empty-block">
          <ClipboardList />
          <strong>Заказ не найден</strong>
          <Link to="/driver/orders">К списку заказов</Link>
        </section>
      </>
    );
  }

  return (
    <>
      <DriverHeader title="Заказы" />
      {error && <p className="driver-error">{error}</p>}
      <div className="driver-list driver-order-groups">
        {offerGroups.map((group) => (
          <section className="driver-order-group" key={group.key}>
            <h2>{group.label}</h2>
            <div>
              {group.orders.map((offer) => (
                <DriverDeliveryCard
                  offer={offer}
                  compact={offer.isAssignedToViewer}
                  highlighted={recentDeliveryIds.has(offer.deliveryId)}
                  key={offer.deliveryId}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      {visibleOffers.length === 0 && (
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
  const dismissDeliveryOffer = useDriverStore((state) => state.dismissDeliveryOffer);
  const [isAccepting, setIsAccepting] = useState(false);
  const [requestedAmount, setRequestedAmount] = useState(String(Math.round(offer.deliveryFee)));
  const [priceComment, setPriceComment] = useState('');
  const [isRequestingPrice, setIsRequestingPrice] = useState(false);
  const [priceMessage, setPriceMessage] = useState('');
  const [error, setError] = useState('');
  const qrPayload = buildDriverPickupQrPayload(offer);
  const restaurantPickupLabel = [offer.restaurantName, offer.restaurantAddress].filter(Boolean).join(' · ');
  const displayDeliveryAddress = formatDriverDeliveryAddress(offer.deliveryAddress);

  const accept = async () => {
    setIsAccepting(true);
    setError('');
    try {
      await acceptDeliveryOffer(offer.deliveryId);
      acceptLocalOffer(offer, driverId);
      navigate('/driver', { replace: true });
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'Не удалось принять заказ');
    } finally {
      setIsAccepting(false);
    }
  };

  const rejectOffer = () => {
    dismissDeliveryOffer(offer.deliveryId);
    navigate('/driver/orders');
  };

  const requestPrice = async () => {
    setIsRequestingPrice(true);
    setError('');
    setPriceMessage('');
    try {
      await requestDriverDeliveryPrice({
        deliveryId: offer.deliveryId,
        driverId,
        amount: Number(requestedAmount),
        comment: priceComment
      });
      setPriceMessage('Запрос отправлен супер-админу. Заказ останется доступным после решения.');
    } catch (priceError) {
      setError(priceError instanceof Error ? priceError.message : 'Не удалось отправить запрос цены');
    } finally {
      setIsRequestingPrice(false);
    }
  };

  return (
    <>
      <DriverHeader title="Новый заказ" action={<small>{offer.routeEtaMin} мин</small>} />
      <section className="driver-order-panel">
        <span className="driver-badge">Доставка</span>
        <h2>Заказ {offer.orderNumber}</h2>
        <DriverRouteLine icon={<Home />} label="Забрать из" value={restaurantPickupLabel || 'Адрес ресторана уточняется'} />
        <DriverRouteLine icon={<MapPin />} label="Доставить в" value={displayDeliveryAddress} />
        <DriverRouteLine icon={<Navigation />} label="Расстояние" value={`${offer.distanceKm} км от вас`} />
        <DriverRouteLine icon={<CircleDollarSign />} label="Стоимость заказа" value={formatPrice(offer.orderTotal)} />
        <DriverRouteLine icon={<WalletCards />} label="Выплата за доставку" value={formatPrice(offer.deliveryFee)} />
        <small>{offer.paymentLabel}</small>
        <div className="driver-action-row driver-action-row--order">
          {qrPayload ? (
            <Link to="/driver/qr">
              <QrCode />
              QR
            </Link>
          ) : (
            <button type="button" disabled>
              <QrCode />
              QR после принятия
            </button>
          )}
        </div>
        <div className="driver-price-request">
          <label>Предложить свою цену<input type="number" min="0" step="1" value={requestedAmount} onChange={(event) => setRequestedAmount(event.target.value)} /></label>
          <input value={priceComment} onChange={(event) => setPriceComment(event.target.value)} placeholder="Комментарий для супер-админа" />
          <button className="driver-secondary" type="button" onClick={() => void requestPrice()} disabled={isRequestingPrice}>{isRequestingPrice ? 'Отправляем...' : 'Согласовать цену'}</button>
        </div>
        {priceMessage && <p className="driver-success">{priceMessage}</p>}
        {error && <p className="driver-error">{error}</p>}
        <button className="driver-primary" type="button" onClick={() => void accept()} disabled={isAccepting}>
          {isAccepting ? 'Принимаем...' : 'Принять заказ'}
        </button>
        <button className="driver-secondary" type="button" onClick={rejectOffer}>
          <X />
          Отклонить
        </button>
      </section>
    </>
  );
}

export function DriverActiveScreen({ delivery }: { delivery: DeliveryOffer | null }) {
  const navigate = useNavigate();
  const updateLocalDeliveryStatus = useDriverStore((state) => state.updateLocalDeliveryStatus);
  const completeLocalDelivery = useDriverStore((state) => state.completeLocalDelivery);
  const [error, setError] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [driverHandedAt, setDriverHandedAt] = useState(delivery?.driverHandedToClientAt ?? null);
  const displayDeliveryAddress = delivery ? formatDriverDeliveryAddress(delivery.deliveryAddress) : '';

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [delivery?.deliveryId]);

  useEffect(() => {
    setDriverHandedAt(delivery?.driverHandedToClientAt ?? null);
  }, [delivery?.deliveryId, delivery?.driverHandedToClientAt]);

  const nextAction = useMemo(() => delivery ? getDriverNextAction(delivery.status, false, delivery.businessType) : null, [delivery]);
  const progress = useMemo(() => delivery ? getDriverDeliveryProgress(delivery.status, false, delivery.businessType) : null, [delivery]);
  const waitingForCashConfirmation = Boolean(
    delivery?.status === 'arrived_to_restaurant' &&
    delivery.paymentMethod === 'cash' &&
    !delivery.restaurantPaymentConfirmed
  );
  const waitingForQr = Boolean(
    delivery?.status === 'arrived_to_restaurant' &&
    !delivery.pickupQrConfirmed
  );
  const pickupBlocked = waitingForCashConfirmation || waitingForQr;
  const updateStatus = async (status?: DeliveryStatus, to?: string) => {
    if (!delivery || isUpdatingStatus) return;
    if (to && !status) {
      navigate(to);
      return;
    }
    if (!status) return;
    setError('');
    setIsUpdatingStatus(true);
    try {
      if (status === 'delivered') {
        await completeDeliveryProgress(delivery.deliveryId);
        updateLocalDeliveryStatus(status);
        completeLocalDelivery();
        navigate('/driver/earnings');
        return;
      }

      if (delivery.status === 'arrived_to_restaurant' && status === 'handed_over') {
        await confirmDriverPickup(delivery.deliveryId);
      } else {
        await updateDeliveryProgress(delivery.deliveryId, status);
      }
      updateLocalDeliveryStatus(status);
      if (to) navigate(to);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Не удалось обновить статус');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const confirmHandoff = async () => {
    if (!delivery || isUpdatingStatus) return;
    setError('');
    setIsUpdatingStatus(true);
    try {
      const result = await confirmDriverDeliveryHandoff(delivery.deliveryId);
      setDriverHandedAt(result.driverHandedToClientAt);
    } catch (handoffError) {
      setError(handoffError instanceof Error ? handoffError.message : 'Не удалось сообщить клиенту о передаче заказа');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const finishDelivery = async () => {
    if (!delivery || isUpdatingStatus) return;
    setError('');
    setIsUpdatingStatus(true);
    try {
      await completeDeliveryProgress(delivery.deliveryId);
      updateLocalDeliveryStatus('delivered');
      completeLocalDelivery();
      navigate('/driver/earnings');
    } catch (completionError) {
      setError(completionError instanceof Error ? completionError.message : 'Не удалось завершить заказ');
      throw completionError;
    } finally {
      setIsUpdatingStatus(false);
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
      <DriverHeader title={`Заказ ${delivery.orderNumber}`} action={<small>{getDeliveryStatusLabel(delivery.status, delivery.businessType)}</small>} />
      <section
        className="driver-order-panel driver-current-block driver-current-block--details"
        aria-label={`Текущая доставка ${delivery.orderNumber}`}
      >
        <div className="driver-current-block__accepted">
          <strong>✓ ЗАКАЗ ПРИНЯТ</strong>
        </div>
        <header>
          <span>
            <strong>{delivery.orderNumber}</strong>
            <small>Доставка · {delivery.itemsCount} поз.</small>
          </span>
          <span>
            <small>Осталось ≈ {delivery.routeEtaMin} мин</small>
          </span>
        </header>
        <p>
          <Home />
          <span>
            <small>Точка А</small>
            <strong>{delivery.restaurantName} · {formatDriverDeliveryAddress(delivery.restaurantAddress)}</strong>
          </span>
        </p>
        <p>
          <MapPin />
          <span>
            <small>Точка Б</small>
            <strong>{displayDeliveryAddress}</strong>
          </span>
        </p>
        <div className="driver-current-block__summary">
          <span>Ваш заработок</span>
          <strong>{formatPrice(delivery.deliveryFee)}</strong>
        </div>
        {progress && (
          <ol className="driver-delivery-progress" aria-label="Статус доставки">
            {progress.labels.map((label, index) => {
              const step = index + 1;
              return (
                <li key={label} data-complete={step <= progress.activeStep} data-active={step === progress.activeStep}>
                  <span>{step}</span>
                  <small>{label}</small>
                </li>
              );
            })}
          </ol>
        )}
        {delivery.clientName && <DriverRouteLine icon={<User />} label="Клиент" value={delivery.clientName} />}
        {delivery.clientPhone && <DriverRouteLine icon={<Phone />} label="Телефон" value={delivery.clientPhone} />}
        {delivery.deliveryComment && <DriverRouteLine icon={<ShieldCheck />} label="Комментарий" value={delivery.deliveryComment} />}
        <div className="driver-action-row">
          {delivery.clientPhone && <a href={`tel:${delivery.clientPhone}`}><Phone />Позвонить</a>}
          <Link to="/driver/qr"><QrCode />QR</Link>
        </div>
        {waitingForCashConfirmation && (
          <DriverCashPaymentHandover
            businessType={delivery.businessType}
            deliveryId={delivery.deliveryId}
            clientTotal={delivery.orderTotal}
            courierPayout={delivery.deliveryFee}
          />
        )}
        {!waitingForCashConfirmation && waitingForQr && (
          <p className="driver-handover-gate">Покажите QR ресторану. После сканирования можно забрать заказ.</p>
        )}
        {nextAction && (
          <button className="driver-primary" type="button" onClick={() => void updateStatus(nextAction.status, nextAction.to)} disabled={isUpdatingStatus || pickupBlocked}>
            {isUpdatingStatus ? 'Обновляем...' : nextAction.label}
          </button>
        )}
        <DriverYandexNavigationActions delivery={delivery} />
        {delivery.status === 'arrived_to_client' && !driverHandedAt && (
          <section className="driver-handoff-card">
            <strong>Вы передали заказ клиенту?</strong>
            <small>После подтверждения клиент сразу увидит кнопку «Получил заказ».</small>
            <button className="driver-primary" type="button" onClick={() => void confirmHandoff()} disabled={isUpdatingStatus}>
              <PackageCheck />
              {isUpdatingStatus ? 'Отправляем...' : 'Отдал заказ'}
            </button>
          </section>
        )}
        {delivery.status === 'arrived_to_client' && driverHandedAt && !delivery.clientReceivedAt && (
          <section className="driver-handoff-card driver-handoff-card--waiting">
            <Check />
            <span><strong>Передача отмечена</strong><small>Ждём, когда клиент нажмёт «Получил заказ».</small></span>
          </section>
        )}
        {delivery.status === 'arrived_to_client' && driverHandedAt && delivery.clientReceivedAt && (
          <DriverCompletionSlider disabled={isUpdatingStatus} onComplete={finishDelivery} />
        )}
        {error && <p className="driver-error">{error}</p>}
      </section>
    </>
  );
}

export function DriverCompletionSlider({
  disabled = false,
  onComplete
}: {
  disabled?: boolean;
  onComplete: () => Promise<void> | void;
}) {
  const [value, setValue] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);

  const finishIfReady = async (currentValue = value) => {
    if (disabled || isCompleting || currentValue < 88) {
      if (currentValue < 88) setValue(0);
      return;
    }
    setIsCompleting(true);
    try {
      await onComplete();
      setValue(100);
    } catch {
      setValue(0);
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <section className="driver-completion-gate" aria-label="Завершение заказа">
      <div className="driver-completion-gate__confirmed">
        <Check />
        <span><strong>Клиент подтвердил получение</strong><small>Теперь заказ можно завершить.</small></span>
      </div>
      <label className="driver-completion-slider" style={{ '--driver-completion': `${value}%` } as CSSProperties}>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={value}
          disabled={disabled || isCompleting}
          aria-label="Сдвиньте вправо, чтобы завершить заказ"
          onChange={(event) => setValue(Number(event.target.value))}
          onPointerUp={(event) => void finishIfReady(Number(event.currentTarget.value))}
          onKeyUp={(event) => {
            if (event.key === 'Enter' || event.key === ' ') void finishIfReady(Number(event.currentTarget.value));
          }}
        />
        <span aria-hidden="true">{isCompleting ? 'Завершаем...' : 'сдвиньте, чтобы завершить'}</span>
      </label>
    </section>
  );
}

function DriverQrScreen({ delivery }: { delivery: DeliveryOffer | null }) {
  const navigate = useNavigate();
  const qrPayload = buildDriverPickupQrPayload(delivery);
  const qrImageUrl = useDriverPickupQrImage(qrPayload);

  useEffect(() => {
    if (delivery?.pickupQrConfirmed) {
      navigate('/driver/active', { replace: true });
    }
  }, [delivery?.pickupQrConfirmed, navigate]);

  return (
    <>
      <DriverHeader title="QR заказа" />
      <section className="driver-qr-panel">
        {qrImageUrl ? <img src={qrImageUrl} alt="QR выдачи заказа" /> : <QrCode />}
        <strong>{delivery ? `Код выдачи заказа ${delivery.orderNumber}` : 'QR появится после принятия заказа'}</strong>
        <small>Покажите этот экран ресторану перед выдачей заказа.</small>
      </section>
      <Link className="driver-primary driver-link-button" to="/driver/active">
        К активному заказу
      </Link>
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
        <article>
          <span>Заработано</span>
          <strong>{formatPrice(snapshot.stats.earningsToday)}</strong>
          <small>Начислено за выполненные доставки</small>
        </article>
        <article className="is-debt">
          <span>Долг платформе</span>
          <strong>{formatPrice(snapshot.profile.debtAmount)}</strong>
          <small>{snapshot.profile.debtAmount > 0 ? 'Сумма к оплате' : 'Задолженности нет'}</small>
        </article>
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
              <strong>{earning.orderNumber}</strong>
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
        <DriverProfileRow icon={<CalendarDays />} label="Статистика" value={`${snapshot.stats.ordersToday} заказов`} to="/driver/earnings" />
        <DriverProfileRow icon={<CircleDollarSign />} label="Баланс" value={formatPrice(snapshot.stats.earningsToday)} to="/driver/earnings" />
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

function DriverProfileRow({ icon, label, value, to }: { icon: ReactNode; label: string; value: string; to?: string }) {
  const content = (
    <>
      {icon}
      <span>{label}</span>
      <b>{value}</b>
      {to && <ChevronRight />}
    </>
  );

  return to ? <Link to={to}>{content}</Link> : <article>{content}</article>;
}

function DriverSettingsScreen({ profile, onProfileSaved }: { profile: DriverProfile; onProfileSaved: () => Promise<void> }) {
  const clearLocalActiveDelivery = useDriverStore((state) => state.clearLocalActiveDelivery);
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [vehicleInfo, setVehicleInfo] = useState(profile.vehicleInfo);
  const [carNumber, setCarNumber] = useState(profile.carNumber);
  const [payoutDetails, setPayoutDetails] = useState(profile.payoutDetails);
  const [serviceSettlementsText, setServiceSettlementsText] = useState(profile.serviceSettlements.join('\n'));
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isSavingSettlements, setIsSavingSettlements] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [directorySettlements, setDirectorySettlements] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;
    void getDeliverySettlements().then((settlements) => {
      if (isMounted) {
        setDirectorySettlements(Array.from(new Set(settlements.flatMap((item) => [item.cityName, item.settlementName]).filter(Boolean))));
      }
    });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    setName(profile.name);
    setPhone(profile.phone);
    setVehicleInfo(profile.vehicleInfo);
    setCarNumber(profile.carNumber);
    setPayoutDetails(profile.payoutDetails);
    setServiceSettlementsText(profile.serviceSettlements.join('\n'));
  }, [profile.carNumber, profile.name, profile.payoutDetails, profile.phone, profile.serviceSettlements, profile.vehicleInfo]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSavingProfile(true);
    try {
      await saveDriverProfile({
        name,
        phone,
        vehicleInfo,
        carNumber,
        payoutDetails,
        serviceSettlements: parseDriverSettlements(serviceSettlementsText)
      });
      setMessage('Профиль водителя сохранён');
      await onProfileSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить профиль водителя');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const saveSettlements = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSavingSettlements(true);
    try {
      await saveDriverProfile({
        name,
        phone,
        vehicleInfo,
        carNumber,
        payoutDetails,
        serviceSettlements: parseDriverSettlements(serviceSettlementsText),
      });
      setMessage('Места работы сохранены');
      await onProfileSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить места работы');
    } finally {
      setIsSavingSettlements(false);
    }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (newPassword.trim().length < 6) {
      setError('Пароль должен быть минимум 6 символов');
      return;
    }
    setIsSavingPassword(true);
    try {
      await changeDriverPassword(newPassword.trim());
      setNewPassword('');
      setMessage('Пароль обновлён');
    } catch (passwordError) {
      setError(passwordError instanceof Error ? passwordError.message : 'Не удалось сменить пароль');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <>
      <DriverHeader title="Настройки" />
      {message && <p className="driver-success">{message}</p>}
      {error && <p className="driver-error">{error}</p>}
      <form className="driver-settings-form" onSubmit={saveProfile}>
        <label>
          Имя
          <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
        </label>
        <label>
          Телефон
          <input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" />
        </label>
        <label>
          Авто
          <input value={vehicleInfo} onChange={(event) => setVehicleInfo(event.target.value)} placeholder="Марка и модель" />
        </label>
        <label>
          Госномер
          <input value={carNumber} onChange={(event) => setCarNumber(event.target.value)} placeholder="A123BC 95" />
        </label>
        <label>
          Вывод средств
          <input value={payoutDetails} onChange={(event) => setPayoutDetails(event.target.value)} placeholder="Карта / счёт" />
        </label>
        <label>
          Сёла и города, где работаете
          <select
            multiple
            size={Math.min(6, Math.max(2, directorySettlements.length))}
            value={parseDriverSettlements(serviceSettlementsText)}
            onChange={(event) => setServiceSettlementsText(Array.from(event.target.selectedOptions, (option) => option.value).join('\n'))}
          >
            {directorySettlements.map((settlement) => <option value={settlement} key={settlement}>{settlement}</option>)}
          </select>
          {directorySettlements.length === 0 && <small>Суперадмин ещё не добавил населённые пункты.</small>}
        </label>
        <button className="driver-primary" type="submit" disabled={isSavingProfile}>
          {isSavingProfile ? 'Сохраняем...' : 'Сохранить профиль'}
        </button>
      </form>
      <form className="driver-settings-form" onSubmit={saveSettlements}>
        <button className="driver-secondary" type="submit" disabled={isSavingSettlements}>
          {isSavingSettlements ? 'Сохраняем...' : 'Сохранить только места работы'}
        </button>
      </form>
      <form className="driver-settings-form" onSubmit={savePassword}>
        <label>
          Новый пароль
          <input
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            type="password"
            autoComplete="new-password"
            minLength={6}
            placeholder="Минимум 6 символов"
          />
        </label>
        <button className="driver-secondary" type="submit" disabled={isSavingPassword}>
          <KeyRound />
          <span>{isSavingPassword ? 'Обновляем...' : 'Сменить пароль'}</span>
        </button>
      </form>
      <div className="driver-profile-menu">
        <button
          type="button"
          onClick={async () => {
            if (!confirmRoleSignOut('водителя')) return;
            clearLocalActiveDelivery();
            await signOutDriver();
            redirectToClientHome();
          }}
        >
          <LogOut />
          <span>Выйти</span>
          <ChevronRight />
        </button>
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

function DriverBottomNav({ active }: { active: string }) {
  const items = [
    { id: 'home', to: '/driver', label: 'Главная', Icon: Home },
    { id: 'orders', to: '/driver/orders', label: 'Заказы', Icon: ClipboardList },
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
