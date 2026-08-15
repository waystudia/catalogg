import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Banknote,
  Check,
  Clock,
  Copy,
  CreditCard,
  Edit3,
  Home,
  LocateFixed,
  MapPin,
  Minus,
  Package,
  Plus,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Truck,
  X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { legalDocuments } from '../../shared/legalDocuments';
import type { Cabin, OrderMode, Restaurant } from '../../entities/models';
import {
  CLIENT_ORDER_CONSENT_VERSION,
  useClientPlatformStore
} from '../client-platform/store';
import type { ClientAddress, ClientOrder } from '../client-platform/types';
import {
  selectCartCount,
  selectCartTotal,
  useCartStore,
  useOrderStore
} from '../stores';
import { getActiveRestaurantCabins } from '../restaurant-settings/catalogAdminModel';
import { formatOrderPaymentMethodMarker } from '../restaurant-admin/orderPresentation';
import { getClientCityId } from '../../shared/api/clientPlatformApi';
import {
  createRestaurantOrderFromCart,
  type RestaurantDeliverySettings
} from '../../shared/api/restaurantOrdersApi';
import {
  buildRestaurantOrderFingerprint,
  createRestaurantOrderIdempotencyKey,
  findRestaurantOrderStockIssues,
  getRestaurantOrderCreationErrorMessage,
  type CreateRestaurantOrderFromCartInput
} from '../../shared/api/restaurantOrderPayload';
import {
  getDeliverySettlements,
  submitSettlementRequest
} from '../../shared/api/settlementsApi';
import {
  isValidRussianClientPhone,
  loadPublicClientCheckoutProfile,
  normalizeRussianClientPhone,
  normalizeSettlementName,
  savePublicClientProfile
} from '../../shared/clientIdentity';
import {
  chooseMoreAccuratePosition,
  DELIVERY_GEOLOCATION_OPTIONS,
  DELIVERY_LOCATION_TIMEOUT_MS,
  DELIVERY_TARGET_ACCURACY_M,
  deliveryPositionIsAccurateEnough,
  deliveryGeolocationTimeoutMessage,
  getDeliveryGeolocationErrorMessage,
  getDeliveryLocationProgress,
  getDeliveryLowAccuracyMessage,
  normalizeDeliveryCoordinates,
  type DeliveryCoordinates
} from '../../shared/deliveryLocation';
import type { DeliveryLocationSearchResult } from '../../shared/deliveryGeocoder';
import { DeliveryMapPicker } from '../../shared/DeliveryMapPicker';
import type { RestaurantPaymentSettings } from '../../shared/paymentSettings';
import { SafeImage } from '../../shared/SafeImage';
import { loadCatalog } from '../../shared/supabase';
import { buildRestaurantMapUrl } from '../../shared/restaurantLocation';
import { getCartItemPrice } from '../../entities/productVariants';
import { getCartLineId, getSelectedModifierDetails } from '../../entities/productModifiers';
import {
  buildMerchantOrderPanelUrl,
  buildWhatsappOrderNotificationText
} from '../../shared/whatsappOrder';
import { formatPublicOrderNumber } from '../../shared/publicOrderNumber';
import { initializePostOrderAddon } from '../../shared/api/combinedOrderApi';
import {
  getStoredClientSessionToken,
  loginClientAccount,
  recordClientRegistrationLegalChoices,
  registerClientAccount,
  restoreClientAccountSession
} from '../../shared/api/clientAccountApi';
import { clientPasskeyIsSupported } from '../../shared/api/clientPasskeyApi';
import { ClientPasskeyRegistrationDialog } from '../client-pairing/ClientPairing';
import { qualifiesForFreeDelivery } from './deliveryPricing';

const DEFAULT_DELIVERY_LOCATION = { lat: 43.3184, lng: 45.6927 };
const formatPrice = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
const buildDeliveryAddress = (city: string, settlement: string, address: string) =>
  Array.from(new Set([city.trim(), settlement.trim(), address.trim()].filter(Boolean))).join(', ');

export function CheckoutScreen({
  catalogSlug,
  restaurant,
  cabins,
  deliverySettings,
  paymentSettings,
  onEditCart,
  onSubmitOrder
}: {
  catalogSlug: string;
  restaurant: Restaurant;
  cabins: Cabin[];
  deliverySettings: RestaurantDeliverySettings;
  paymentSettings: RestaurantPaymentSettings;
  onEditCart: () => void;
  onSubmitOrder: (orderId: string) => void;
}) {
  const {
    mode,
    cabinId,
    deliveryCity,
    deliverySettlement,
    deliveryAddress,
    deliveryLat,
    deliveryLng,
    deliveryAccuracyM,
    clientName,
    clientPhone,
    setOrder
  } = useOrderStore();
  const selectedClientCityId = useClientPlatformStore((state) => state.selectedCityId);
  const saveClientProfile = useClientPlatformStore((state) => state.saveProfile);
  const addClientAddress = useClientPlatformStore((state) => state.addAddress);
  const submitClientOrder = useClientPlatformStore((state) => state.submitOrder);
  const orderConsent = useClientPlatformStore((state) => state.orderConsent);
  const recordOrderConsent = useClientPlatformStore((state) => state.recordOrderConsent);
  const clearClientPlatformCart = useClientPlatformStore((state) => state.clearCart);
  const items = useCartStore((state) => state.items);
  const addCartItem = useCartStore((state) => state.add);
  const decrementCartItem = useCartStore((state) => state.decrement);
  const removeCartItem = useCartStore((state) => state.remove);
  const updateCartItemQuantity = useCartStore((state) => state.updateQuantity);
  const clearCart = useCartStore((state) => state.clear);
  const total = selectCartTotal(items);
  const cartCount = selectCartCount(items);
  const [orderComment, setOrderComment] = useState('');
  const hasCurrentOrderConsent = orderConsent?.version === CLIENT_ORDER_CONSENT_VERSION;
  const [acceptedOrderData, setAcceptedOrderData] = useState(hasCurrentOrderConsent);
  const [acceptedOrderTransfer, setAcceptedOrderTransfer] = useState(hasCurrentOrderConsent);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<'cash' | 'bank_transfer'>(() =>
    paymentSettings.transferEnabled ? 'bank_transfer' : 'cash'
  );
  const usesBankTransfer = checkoutPaymentMethod === 'bank_transfer' && paymentSettings.transferEnabled;
  const freeDeliveryFrom = Math.max(0, deliverySettings.free_delivery_from);
  const hasFreeDelivery = qualifiesForFreeDelivery(total, freeDeliveryFrom);
  const remainingForFreeDelivery = Math.max(0, freeDeliveryFrom - total);
  const freeDeliveryProgress = freeDeliveryFrom > 0
    ? Math.min(100, (total / freeDeliveryFrom) * 100)
    : 100;
  const activeCabins = useMemo(
    () => getActiveRestaurantCabins(cabins),
    [cabins]
  );
  const availableModes = useMemo(() => {
    const modes: Array<{ key: OrderMode; label: string; icon: typeof Home }> = [];
    if (deliverySettings.enable_hall_orders) modes.push({ key: 'hall', label: 'В зале', icon: ShoppingCart });
    if (deliverySettings.enable_pickup) modes.push({ key: 'takeaway', label: 'На вынос', icon: ShoppingBag });
    if (deliverySettings.enable_delivery) modes.push({ key: 'delivery', label: 'Доставка', icon: MapPin });
    return modes.length > 0 ? modes : [{ key: 'takeaway', label: 'На вынос', icon: ShoppingBag }];
  }, [deliverySettings.enable_delivery, deliverySettings.enable_hall_orders, deliverySettings.enable_pickup]);
  const configuredCity = deliverySettings.primary_city.trim();
  const { data: globalDeliverySettlements = [] } = useQuery({
    queryKey: ['delivery-settlements-public'],
    queryFn: getDeliverySettlements,
    staleTime: 5 * 60 * 1000
  });
  const selectedClientPlace = useMemo(() => {
    const places = globalDeliverySettlements.flatMap((settlement) => [settlement.cityName, settlement.settlementName]);
    return places.find((place) => place.trim() && getClientCityId(place) === selectedClientCityId)?.trim() ?? '';
  }, [globalDeliverySettlements, selectedClientCityId]);
  const settlementOptions = useMemo(() => {
    const globalOptions = globalDeliverySettlements.flatMap((settlement) => [settlement.cityName, settlement.settlementName]);

    return Array.from(
      new Set(
        [...(deliverySettings.service_settlements ?? []), ...globalOptions]
          .map((settlement) => settlement.trim())
          .filter(Boolean)
      )
    );
  }, [deliverySettings.service_settlements, globalDeliverySettlements]);
  const effectiveDeliveryCity = selectedClientPlace || deliveryCity || configuredCity;
  const selectedCabin = activeCabins.find((cabin) => cabin.id === cabinId);
  const [isLocating, setIsLocating] = useState(false);
  const [locationProgress, setLocationProgress] = useState<number | null>(null);
  const [locationProgressAccuracyM, setLocationProgressAccuracyM] = useState<number | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [isDeliveryMapOpen, setIsDeliveryMapOpen] = useState(false);
  const [usesCustomSettlement, setUsesCustomSettlement] = useState(false);
  const [customSettlement, setCustomSettlement] = useState('');
  const [deliveryValidationErrors, setDeliveryValidationErrors] = useState<string[]>([]);
  const [contactValidationErrors, setContactValidationErrors] = useState<string[]>([]);
  const [isClientSessionReady, setIsClientSessionReady] = useState(false);
  const [hasClientSession, setHasClientSession] = useState(false);
  const [clientPassword, setClientPassword] = useState('');
  const [accountError, setAccountError] = useState('');
  const [isPasskeyCheckoutPromptOpen, setIsPasskeyCheckoutPromptOpen] = useState(false);
  const isCheckoutAccountValid = hasClientSession || clientPassword.length >= 6;
  const effectiveDeliverySettlement = normalizeSettlementName(
    usesCustomSettlement ? customSettlement : deliverySettlement
  );
  const finalDeliveryAddress = buildDeliveryAddress(effectiveDeliveryCity, effectiveDeliverySettlement, deliveryAddress);
  const settlementNeedsAdminReview =
    Boolean(effectiveDeliverySettlement) &&
    !settlementOptions.some((settlement) => normalizeSettlementName(settlement) === effectiveDeliverySettlement);
  const selectedDeliveryLat = deliveryLat ?? DEFAULT_DELIVERY_LOCATION.lat;
  const selectedDeliveryLng = deliveryLng ?? DEFAULT_DELIVERY_LOCATION.lng;
  const locationSessionRef = useRef<{ watchId: number | null; timeoutId: number | null }>({
    watchId: null,
    timeoutId: null
  });
  const profileHydratedRef = useRef(false);
  const submitLockRef = useRef(false);
  const pendingOrderContinuationRef = useRef<(() => void) | null>(null);
  const orderAttemptRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const selectedClientPlaceRef = useRef('');
  const deliveryDetailsRef = useRef<HTMLElement | null>(null);
  const contactDetailsRef = useRef<HTMLElement | null>(null);
  const clientNameRef = useRef<HTMLInputElement | null>(null);
  const clientPhoneRef = useRef<HTMLInputElement | null>(null);
  const locationButtonRef = useRef<HTMLButtonElement | null>(null);

  const continuePendingOrder = (passkeyEnabled: boolean) => {
    const continuation = pendingOrderContinuationRef.current;
    pendingOrderContinuationRef.current = null;
    setIsPasskeyCheckoutPromptOpen(false);
    if (passkeyEnabled) toast.success('Face ID подключён к вашему профилю');
    continuation?.();
  };

  const validateCheckoutContact = () => {
    const errors: string[] = [];
    if (!clientName.trim()) errors.push('Введите имя.');
    if (!isValidRussianClientPhone(clientPhone)) errors.push('Введите полный номер телефона.');
    if (!hasClientSession && clientPassword.length < 6) errors.push('Введите пароль — минимум 6 символов.');

    setContactValidationErrors(errors);
    if (errors.length === 0) return true;

    contactDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      if (!clientName.trim()) {
        clientNameRef.current?.focus({ preventScroll: true });
      } else {
        clientPhoneRef.current?.focus({ preventScroll: true });
      }
    }, 450);
    toast.error(errors[0] ?? 'Проверьте контактные данные');
    return false;
  };

  const validateDeliveryDetails = () => {
    const errors: string[] = [];
    if (deliveryLat === null || deliveryLng === null) errors.push('Определите местоположение или выберите точку на карте.');
    if (!effectiveDeliverySettlement) errors.push('Выберите село или город.');
    if (!deliveryAddress.trim()) errors.push('Введите улицу и номер дома.');

    setDeliveryValidationErrors(errors);
    if (errors.length > 0) {
      deliveryDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => {
        if (deliveryLat === null || deliveryLng === null) {
          locationButtonRef.current?.focus({ preventScroll: true });
        }
      }, 450);
      toast.error('Заполните обязательные данные доставки');
      return false;
    }
    return true;
  };

  const clearLocationSession = useCallback(() => {
    const { watchId, timeoutId } = locationSessionRef.current;
    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    locationSessionRef.current = { watchId: null, timeoutId: null };
  }, []);

  const applyDeliveryCoordinates = useCallback(
    (coordinates: DeliveryCoordinates) => {
      const { lat, lng, accuracyM } = normalizeDeliveryCoordinates(coordinates);
      setOrder({
        deliveryLat: lat,
        deliveryLng: lng,
        deliveryAccuracyM: accuracyM,
        deliveryAddress: deliveryAddress || `${lat}, ${lng}`
      });

      if (accuracyM > DELIVERY_TARGET_ACCURACY_M) {
        setGeoError(getDeliveryLowAccuracyMessage(accuracyM));
      }
    },
    [deliveryAddress, setOrder]
  );

  const applyManualDeliveryPoint = useCallback(
    ({ lat, lng }: { lat: number; lng: number }) => {
      const nextLat = Number(lat.toFixed(7));
      const nextLng = Number(lng.toFixed(7));
      setGeoError('');
      setLocationProgress(null);
      setLocationProgressAccuracyM(null);
      setOrder({
        deliveryLat: nextLat,
        deliveryLng: nextLng,
        deliveryAccuracyM: null,
        deliveryAddress: deliveryAddress || `${nextLat}, ${nextLng}`
      });
    },
    [deliveryAddress, setOrder]
  );

  const applySearchedDeliveryPlace = useCallback(
    (result: DeliveryLocationSearchResult) => {
      const isKnownSettlement = settlementOptions.some(
        (settlement) => normalizeSettlementName(settlement) === normalizeSettlementName(result.name)
      );
      setUsesCustomSettlement(!isKnownSettlement);
      setCustomSettlement(isKnownSettlement ? '' : result.name);
      setOrder({
        deliverySettlement: result.name,
        deliveryAddress: result.label
      });
    },
    [setOrder, settlementOptions]
  );

  const locateDeliveryAddress = () => {
    if (!navigator.geolocation) {
      setLocationProgress(null);
      setLocationProgressAccuracyM(null);
      setGeoError('Геолокация недоступна в этом браузере.');
      return;
    }

    clearLocationSession();
    setIsLocating(true);
    setLocationProgress(0);
    setLocationProgressAccuracyM(null);
    setGeoError('');

    let bestCoordinates: DeliveryCoordinates | null = null;
    let finished = false;

    const finish = (coordinates: DeliveryCoordinates | null, message = '') => {
      if (finished) return;
      finished = true;
      clearLocationSession();

      if (coordinates) {
        setLocationProgress(100);
        setLocationProgressAccuracyM(Math.max(0, Math.round(coordinates.accuracy)));
        applyDeliveryCoordinates(coordinates);
      } else {
        setLocationProgress(null);
        setLocationProgressAccuracyM(null);
        setGeoError(message || 'Не удалось получить геолокацию. Проверьте разрешение браузера.');
      }

      setIsLocating(false);
    };

    const handlePosition = (position: GeolocationPosition) => {
      bestCoordinates = chooseMoreAccuratePosition(bestCoordinates, position.coords);
      setLocationProgress(getDeliveryLocationProgress(bestCoordinates.accuracy));
      setLocationProgressAccuracyM(Math.max(0, Math.round(bestCoordinates.accuracy)));

      if (deliveryPositionIsAccurateEnough(bestCoordinates, DELIVERY_TARGET_ACCURACY_M)) {
        finish(bestCoordinates);
      }
    };

    const handleError = (error: GeolocationPositionError) => {
      if (bestCoordinates) {
        finish(bestCoordinates);
        return;
      }
      finish(null, getDeliveryGeolocationErrorMessage(error));
    };

    try {
      const watchId = navigator.geolocation.watchPosition(
        handlePosition,
        handleError,
        DELIVERY_GEOLOCATION_OPTIONS
      );
      const timeoutId = window.setTimeout(
        () => finish(bestCoordinates, deliveryGeolocationTimeoutMessage),
        DELIVERY_LOCATION_TIMEOUT_MS + 1_000
      );
      locationSessionRef.current = { watchId, timeoutId };
    } catch {
      finish(null, 'Не удалось запустить геолокацию. Проверьте разрешение браузера.');
    }
  };

  useEffect(() => clearLocationSession, [clearLocationSession]);

  useEffect(() => {
    let isMounted = true;
    let retryId: number | null = null;

    const restoreSession = () => {
      void restoreClientAccountSession()
        .then((session) => {
          if (!isMounted) return;
          setHasClientSession(Boolean(session));
          if (session) {
            saveClientProfile({ name: session.name, phone: session.phone });
            setOrder({ clientName: session.name, clientPhone: normalizeRussianClientPhone(session.phone) });
          }
          setIsClientSessionReady(true);
        })
        .catch(() => {
          if (!isMounted) return;
          retryId = window.setTimeout(restoreSession, 2_500);
        });
    };

    restoreSession();

    return () => {
      isMounted = false;
      if (retryId !== null) window.clearTimeout(retryId);
    };
  }, [saveClientProfile, setOrder]);

  useEffect(() => {
    if (profileHydratedRef.current) return;
    profileHydratedRef.current = true;
    const savedProfile = loadPublicClientCheckoutProfile(catalogSlug);

    setOrder({
      clientName: clientName || savedProfile?.name || '',
      clientPhone: normalizeRussianClientPhone(clientPhone || savedProfile?.phone || ''),
      deliveryCity: deliveryCity || savedProfile?.deliveryCity || '',
      deliverySettlement: deliverySettlement || savedProfile?.deliverySettlement || '',
      deliveryAddress: deliveryAddress || savedProfile?.deliveryAddress || ''
    });
  }, [catalogSlug, clientName, clientPhone, deliveryAddress, deliveryCity, deliverySettlement, setOrder]);

  useEffect(() => {
    if (selectedClientPlace || !configuredCity || deliveryCity === configuredCity) return;
    setOrder({ deliveryCity: configuredCity });
  }, [configuredCity, deliveryCity, selectedClientPlace, setOrder]);

  useEffect(() => {
    if (mode !== 'delivery' || !selectedClientPlace || selectedClientPlaceRef.current === selectedClientPlace) return;
    selectedClientPlaceRef.current = selectedClientPlace;
    setOrder({ deliveryCity: selectedClientPlace, deliverySettlement: selectedClientPlace });
  }, [mode, selectedClientPlace, setOrder]);

  useEffect(() => {
    if (!deliverySettlement || settlementOptions.includes(deliverySettlement)) return;
    setUsesCustomSettlement(true);
    setCustomSettlement(deliverySettlement);
  }, [deliverySettlement, settlementOptions]);

  useEffect(() => {
    if (availableModes.some((item) => item.key === mode)) return;
    const nextMode = (availableModes[0]?.key as OrderMode | undefined) ?? ('takeaway' as OrderMode);
    setOrder({ mode: nextMode, cabinId: nextMode === 'hall' ? activeCabins[0]?.id || '' : '' });
  }, [activeCabins, availableModes, mode, setOrder]);

  useEffect(() => {
    if (mode !== 'hall') return;
    if (activeCabins.length === 1 && cabinId !== activeCabins[0].id) {
      setOrder({ cabinId: activeCabins[0].id });
      return;
    }
    if (activeCabins.length > 1 && cabinId && !activeCabins.some((cabin) => cabin.id === cabinId)) {
      setOrder({ cabinId: '' });
    }
  }, [activeCabins, cabinId, mode, setOrder]);
  const getOrderIdempotencyKey = (payload: CreateRestaurantOrderFromCartInput) => {
    const fingerprint = buildRestaurantOrderFingerprint(payload);

    if (orderAttemptRef.current?.fingerprint !== fingerprint) {
      orderAttemptRef.current = {
        fingerprint,
        idempotencyKey: createRestaurantOrderIdempotencyKey(fingerprint)
      };
    }

    return orderAttemptRef.current.idempotencyKey;
  };
  const buildWhatsappHref = (orderId: string) => {
    if (!restaurant.whatsapp) return '#';
    const panelUrl = buildMerchantOrderPanelUrl({
      origin: window.location.origin,
      basePath: import.meta.env.BASE_URL,
      merchantSlug: catalogSlug,
      orderId
    });
    const notification = buildWhatsappOrderNotificationText({
      orderNumber: formatPublicOrderNumber(orderId, restaurant.name || catalogSlug),
      panelUrl
    });
    return `https://wa.me/${restaurant.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(notification)}`;
  };
  const restaurantMapUrl = buildRestaurantMapUrl({
    lat: restaurant.lat,
    lng: restaurant.lng,
    mapLink: restaurant.mapLink,
    city: configuredCity,
    address: restaurant.address
  });
  const openRestaurantMap = () => {
    if (!restaurantMapUrl) {
      alert('Карта не указана');
      return;
    }
    window.open(restaurantMapUrl, '_blank', 'noopener,noreferrer');
  };
  const paymentRecipient = paymentSettings.displayName || [paymentSettings.lastName, paymentSettings.firstName, paymentSettings.middleName].filter(Boolean).join(' ');
  const checkoutBlockingReasons = [
    ...(items.length === 0 ? ['Добавьте хотя бы один товар.'] : []),
    ...(!clientName.trim() ? ['Введите имя.'] : []),
    ...(!isValidRussianClientPhone(clientPhone) ? ['Введите полный номер телефона.'] : []),
    ...(!isCheckoutAccountValid ? ['Введите пароль — минимум 6 символов.'] : []),
    ...(!acceptedOrderData || !acceptedOrderTransfer ? ['Подтвердите оба обязательных согласия.'] : []),
    ...(mode === 'delivery' && (deliveryLat === null || deliveryLng === null)
      ? ['Определите местоположение или выберите точку на карте.']
      : []),
    ...(mode === 'delivery' && !effectiveDeliverySettlement ? ['Выберите село или город.'] : []),
    ...(mode === 'delivery' && !deliveryAddress.trim() ? ['Введите улицу и номер дома.'] : [])
  ];

  if (!isClientSessionReady) {
    return (
      <main className="screen checkout-screen">
        <section className="checkout-privacy-card" aria-live="polite">
          <div className="checkout-customer-details__head">
            <ShieldCheck />
            <div>
              <h2>Проверяем личный кабинет</h2>
              <p>Для заказа нужно один раз войти или создать аккаунт с паролем.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="screen checkout-screen">
      <section className="checkout-segment" aria-label="Тип заказа">
        {availableModes.map(({ key, label, icon: Icon }) => (
          <button
            className={mode === key ? 'checkout-segment__button is-active' : 'checkout-segment__button'}
            type="button"
            key={key}
            onClick={() =>
              setOrder({
                mode: key as OrderMode,
                cabinId: key === 'hall' ? cabinId || activeCabins[0]?.id || '' : ''
              })
            }
          >
            <Icon />
            {label}
          </button>
        ))}
      </section>

      {mode === 'hall' && activeCabins.length > 0 && (
        <>
          <section className="checkout-section-head">
            <h2>Выбор кабинки</h2>
            <p>Выберите кабинку для заказа</p>
          </section>
          <section className="checkout-cabin-grid">
            {activeCabins.map(({ id, title, capacity, image_url }) => {
              return (
              <button className={cabinId === id ? 'checkout-cabin is-active' : 'checkout-cabin'} type="button" key={id} onClick={() => setOrder({ cabinId: id })}>
                <SafeImage className="checkout-cabin__image" src={image_url} alt={title} />
                <span className="checkout-cabin__overlay" />
                {cabinId === id && (
                  <span className="checkout-cabin__check">
                    <Check />
                  </span>
                )}
                <span className="checkout-cabin__label">
                  <strong>{title}</strong>
                  <small>{capacity}</small>
                </span>
              </button>
              );
            })}
          </section>
        </>
      )}

      {mode === 'takeaway' && (
        <section className="takeaway-note">
          <div className="takeaway-note__message">
            <Package />
            <strong>Вы заберёте заказ самостоятельно</strong>
          </div>
          <div className="restaurant-address">
            <span>Адрес ресторана</span>
            {configuredCity && <small className="restaurant-address__city">{configuredCity}</small>}
            <strong>{restaurant.address || 'Адрес не указан'}</strong>
            <button className="map-link-button" type="button" onClick={openRestaurantMap}>
              <MapPin />
              <span>Показать на карте</span>
            </button>
          </div>
        </section>
      )}

      {mode === 'delivery' && (
        <section className="takeaway-note" ref={deliveryDetailsRef} id="checkout-delivery-details">
          <div className="takeaway-note__message">
            <MapPin />
            <strong>Укажите населенный пункт и адрес доставки</strong>
          </div>
          <div className="checkout-location-actions">
            <button
              className="map-link-button checkout-location-button"
              type="button"
              onClick={locateDeliveryAddress}
              disabled={isLocating}
              ref={locationButtonRef}
            >
              <LocateFixed />
              <span>{isLocating ? `Определяем · ${locationProgress ?? 0}%` : 'Определить моё местоположение'}</span>
            </button>
            <button className="map-link-button checkout-location-button" type="button" onClick={() => setIsDeliveryMapOpen(true)}>
              <MapPin />
              <span>Уточнить точку на карте</span>
            </button>
          </div>
          {locationProgress !== null && (
            <div className="checkout-location-progress" role="status" aria-live="polite">
              <div>
                <span>{isLocating ? 'Получаем точные координаты GPS' : 'Местоположение определено'}</span>
                <strong>{locationProgress}%</strong>
              </div>
              <progress aria-label="Прогресс определения местоположения" max="100" value={locationProgress} />
              {locationProgressAccuracyM !== null && (
                <small>Текущая точность: около {locationProgressAccuracyM} м</small>
              )}
            </div>
          )}
          {(deliveryLat !== null && deliveryLng !== null) && (
            <p className="checkout-location-hint">
              Координаты: {deliveryLat.toFixed(7)}, {deliveryLng.toFixed(7)}
              {deliveryAccuracyM ? ` · точность ${deliveryAccuracyM} м` : ' · выбрано вручную'}
            </p>
          )}
          {deliveryAccuracyM && deliveryAccuracyM > 100 && (
            <p className="checkout-location-warning">Точность слабая. Проверьте адрес перед отправкой заказа.</p>
          )}
          {geoError && <p className="checkout-location-warning">{geoError}</p>}
          {deliveryValidationErrors.length > 0 && (
            <div className="checkout-validation-errors" role="alert">
              <strong>Заполните данные для доставки:</strong>
              <ul>
                {deliveryValidationErrors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            </div>
          )}
          <div className="checkout-delivery-fields">
            <label className="checkout-field">
              <span>Село или город</span>
              {settlementOptions.length > 0 ? (
                <>
                  <select
                    required
                    value={usesCustomSettlement ? '__other__' : deliverySettlement}
                    onChange={(event) => {
                      if (event.target.value === '__other__') {
                        setUsesCustomSettlement(true);
                        setOrder({ deliverySettlement: customSettlement });
                        return;
                      }
                      setUsesCustomSettlement(false);
                      setCustomSettlement('');
                      setDeliveryValidationErrors([]);
                      setOrder({ deliverySettlement: event.target.value });
                    }}
                  >
                    <option value="">Выберите населенный пункт</option>
                    {settlementOptions.map((settlement) => (
                      <option value={settlement} key={settlement}>
                        {settlement}
                      </option>
                    ))}
                    <option value="__other__">Другой населенный пункт</option>
                  </select>
                  {usesCustomSettlement && (
                    <input
                      value={customSettlement}
                      onChange={(event) => {
                        const value = event.target.value;
                        setDeliveryValidationErrors([]);
                        setCustomSettlement(value);
                        setOrder({ deliverySettlement: value });
                      }}
                      placeholder="Введите село или город"
                      required
                    />
                  )}
                </>
              ) : (
                <input
                  value={deliverySettlement}
                  onChange={(event) => {
                    setDeliveryValidationErrors([]);
                    setOrder({ deliverySettlement: event.target.value });
                  }}
                  placeholder="Например: Цоци-Юрт"
                  required
                />
              )}
            </label>
            <label className="checkout-field checkout-field--wide">
              <span>Адрес</span>
              <textarea
                value={deliveryAddress}
                onChange={(event) => {
                  setDeliveryValidationErrors([]);
                  setOrder({ deliveryAddress: event.target.value });
                }}
                rows={3}
                placeholder="Улица, дом, ориентир"
                required
              />
            </label>
          </div>
          {isDeliveryMapOpen && (
            <div className="modal-backdrop delivery-map-backdrop">
              <div className="delivery-map-sheet">
                <button
                  className="flow-modal__close"
                  type="button"
                  onClick={() => setIsDeliveryMapOpen(false)}
                  aria-label="Закрыть карту"
                >
                  <X />
                </button>
                <h2>Точка доставки</h2>
                <DeliveryMapPicker
                  lat={selectedDeliveryLat}
                  lng={selectedDeliveryLng}
                  accuracyM={deliveryAccuracyM}
                  isLocating={isLocating}
                  error={geoError}
                  onLocate={locateDeliveryAddress}
                  onChange={applyManualDeliveryPoint}
                  onSearchSelect={applySearchedDeliveryPlace}
                  onDone={() => setIsDeliveryMapOpen(false)}
                />
              </div>
            </div>
          )}
        </section>
      )}

      {freeDeliveryFrom > 0 && (
        <section className="checkout-free-delivery" aria-live="polite">
          <Truck />
          <div>
            <strong>
              {remainingForFreeDelivery > 0
                ? `До бесплатной доставки осталось ${formatPrice(remainingForFreeDelivery)}`
                : 'Бесплатная доставка доступна'}
            </strong>
            <span><i style={{ width: `${freeDeliveryProgress}%` }} /></span>
          </div>
        </section>
      )}

      <section
        className="checkout-customer-details"
        ref={contactDetailsRef}
        aria-labelledby="checkout-customer-title"
      >
        <div className="checkout-customer-details__head">
          <Home />
          <div>
            <h2 id="checkout-customer-title">Контактные данные</h2>
            <p>Нужны ресторану для подтверждения заказа</p>
          </div>
        </div>
        {contactValidationErrors.length > 0 && (
          <div className="checkout-validation-errors" role="alert">
            <ul>
              {contactValidationErrors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </div>
        )}
        <div className="checkout-customer-details__fields">
          <label className="checkout-field">
            <span>Имя</span>
            <input
              ref={clientNameRef}
              value={clientName}
              onChange={(event) => {
                setContactValidationErrors([]);
                setOrder({ clientName: event.target.value });
              }}
              placeholder="Ваше имя"
              autoComplete="name"
              required
            />
          </label>
          <label className="checkout-field">
            <span>Телефон</span>
            <input
              ref={clientPhoneRef}
              value={clientPhone || '+7'}
              onChange={(event) => {
                setContactValidationErrors([]);
                setOrder({ clientPhone: normalizeRussianClientPhone(event.target.value) });
              }}
              inputMode="tel"
              autoComplete="tel"
              aria-describedby="checkout-phone-hint"
              required
            />
            <small id="checkout-phone-hint">Введите 10 цифр после +7</small>
          </label>
          {!hasClientSession && (
            <label className="checkout-field">
              <span>Пароль</span>
              <input
                value={clientPassword}
                onChange={(event) => {
                  setClientPassword(event.target.value);
                  setAccountError('');
                  setContactValidationErrors([]);
                }}
                type="password"
                minLength={6}
                maxLength={72}
                autoComplete="new-password"
                placeholder="Минимум 6 символов"
                required
              />
              <small>Создадим профиль автоматически. Если номер уже зарегистрирован, выполним вход.</small>
            </label>
          )}
        </div>
        {accountError && <p className="checkout-account-error" role="alert">{accountError}</p>}
      </section>

      <section className="checkout-payment-method" aria-labelledby="checkout-payment-title">
        <div>
          <CreditCard />
          <h2 id="checkout-payment-title">Способ оплаты</h2>
        </div>
        <div className="checkout-payment-method__options">
          <button
            className={!usesBankTransfer ? 'is-active' : ''}
            type="button"
            aria-pressed={!usesBankTransfer}
            onClick={() => setCheckoutPaymentMethod('cash')}
          >
            <Banknote />
            <span><strong>Наличными</strong><small>при получении</small></span>
            <i aria-hidden="true" />
          </button>
          <button
            className={usesBankTransfer ? 'is-active' : ''}
            type="button"
            aria-pressed={usesBankTransfer}
            disabled={!paymentSettings.transferEnabled}
            onClick={() => setCheckoutPaymentMethod('bank_transfer')}
          >
            <CreditCard />
            <span>
              <strong>Безналично</strong>
              <small>{paymentSettings.transferEnabled ? 'переводом' : 'не настроено'}</small>
            </span>
            <i aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="checkout-summary" id="checkout-review" tabIndex={-1}>
        <div className="checkout-summary__head">
          <ShoppingCart />
          <div>
            <h2>Ваш заказ</h2>
            <span>{cartCount} товара</span>
          </div>
          <button type="button" onClick={onEditCart}>Изменить <ArrowRight /></button>
        </div>
        <div className="checkout-summary__list">
          {items.map((item) => {
            const lineId = getCartLineId(item);
            const modifierLabel = getSelectedModifierDetails(item).map(({ option }) => option.name).join(' · ');
            return (
            <article className="checkout-order-card" key={lineId}>
              <SafeImage src={item.product.image_url} alt={item.product.title} fallbackKind={item.product.placeholder_kind} width={320} height={240} loading="lazy" />
              <div className="checkout-order-card__body">
                <div className="checkout-order-card__copy">
                  <h3>{item.product.title}</h3>
                  {item.selected_choice && <small>{item.selected_choice}</small>}
                  {modifierLabel && <small>{modifierLabel}</small>}
                  {item.selected_weight !== undefined && <small>Вес: {item.selected_weight.toLocaleString('ru-RU')} кг</small>}
                  {item.inscription && <small>Надпись: «{item.inscription}»</small>}
                  {item.decoration_comment && <small>Оформление: {item.decoration_comment}</small>}
                  {item.production_date && <small>Дата: {item.production_date}</small>}
                  {item.production_time && <small>Время: {item.production_time}</small>}
                  <p>{item.product.description}</p>
                </div>
                <button
                  className="checkout-order-card__remove"
                  type="button"
                  onClick={() => removeCartItem(lineId)}
                  aria-label={`Удалить ${item.product.title}`}
                >
                  <Trash2 />
                </button>
                <div className="checkout-order-card__bottom">
                  <div>
                    <strong>{formatPrice(getCartItemPrice(item))}</strong>
                    <span>{item.quantity} × {formatPrice(getCartItemPrice(item))}</span>
                  </div>
                  <div className="checkout-order-card__stepper">
                    <button type="button" onClick={() => decrementCartItem(lineId)} aria-label="Уменьшить"><Minus /></button>
                    <b>{item.quantity}</b>
                    <button type="button" onClick={() => addCartItem(item.product, item.selected_choice, item.selected_modifiers, {
                      selectedWeight: item.selected_weight,
                      inscription: item.inscription,
                      decorationComment: item.decoration_comment,
                      productionDate: item.production_date,
                      productionTime: item.production_time
                    })} aria-label="Увеличить"><Plus /></button>
                  </div>
                </div>
              </div>
            </article>
          );})}
        </div>
        <div className="checkout-summary__total">
          <span><ShoppingCart /> Итого</span>
          <strong>{formatPrice(total)}</strong>
        </div>
      </section>

      <section className="checkout-delivery-facts">
        <div><Truck /><span>Стоимость доставки</span><strong>{hasFreeDelivery ? '0 ₽' : 'По тарифу'}</strong>{freeDeliveryFrom > 0 && <small>при сумме от {formatPrice(freeDeliveryFrom)}</small>}</div>
        <div><Clock /><span>Время доставки</span><strong>≈ {deliverySettings.default_preparation_minutes}–{deliverySettings.default_preparation_minutes + 20} мин</strong></div>
        <div><CreditCard /><span>Оплата</span><strong>{usesBankTransfer ? 'Безналично' : 'Наличными'}</strong><small>{usesBankTransfer ? 'переводом' : 'при получении'}</small></div>
      </section>

      <section className="checkout-comment-card">
        <label htmlFor="checkout-comment"><Edit3 /> Комментарий к заказу <span>(необязательно)</span></label>
        <textarea
          id="checkout-comment"
          value={orderComment}
          onChange={(event) => setOrderComment(event.target.value)}
          rows={2}
          placeholder="Например: не класть лук, позвонить заранее..."
        />
      </section>

      <section className="checkout-privacy-card">
        <ShieldCheck />
        <div><strong>Данные используются для заказа</strong><span>Ознакомьтесь с условиями и подтвердите передачу исполнителям</span></div>
      </section>

      <section className="legal-checkboxes" aria-label="Согласия для заказа">
        <label className="legal-checkbox">
          <input type="checkbox" checked={acceptedOrderData} onChange={(event) => setAcceptedOrderData(event.target.checked)} />
          <span>Принимаю <a href={legalDocuments.agreement} target="_blank" rel="noreferrer">Пользовательское соглашение</a> и даю <a href={legalDocuments.clientConsent} target="_blank" rel="noreferrer">согласие на обработку данных</a> этого заказа.</span>
        </label>
        <label className="legal-checkbox">
          <input type="checkbox" checked={acceptedOrderTransfer} onChange={(event) => setAcceptedOrderTransfer(event.target.checked)} />
          <span>Разрешаю <a href={legalDocuments.orderTransferConsent} target="_blank" rel="noreferrer">передать данные ресторану и назначенному водителю</a>.</span>
        </label>
      </section>

      <section className="checkout-submit-card">
        {usesBankTransfer && (
          <section className="checkout-payment-card">
            <h3><CreditCard /> Оплата переводом</h3>
            <strong>{formatPrice(total)}</strong>
            <dl>
              <div><dt>Получатель</dt><dd>{paymentRecipient || 'Получатель не указан'}</dd></div>
              <div><dt>Номер</dt><dd>{paymentSettings.transferNumber || 'Номер не указан'}</dd></div>
              <div><dt>Банк</dt><dd>{paymentSettings.bankName || 'Банк не указан'}</dd></div>
            </dl>
            {paymentSettings.qrUrl ? <img src={paymentSettings.qrUrl} alt="QR-код для оплаты" /> : <QrCode />}
            <p>{paymentSettings.comment || 'Переведите сумму ресторану и после оплаты нажмите "Я оплатил".'}</p>
            <div>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(paymentSettings.transferNumber).then(() => toast.success('Номер скопирован'))}>
                <Copy />
                Скопировать
              </button>
              <button type="button" onClick={() => toast.success('Ресторан увидит, что вы отметили оплату')}>
                Я оплатил
              </button>
            </div>
          </section>
        )}
        {checkoutBlockingReasons.length > 0 && (
          <div className="checkout-validation-errors checkout-submit-requirements" role="status" aria-live="polite">
            <strong>Чтобы отправить заказ:</strong>
            <ul>
              {checkoutBlockingReasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          </div>
        )}
        <button
          className={
            checkoutBlockingReasons.length === 0
              ? 'primary-wide checkout-summary__action'
              : 'primary-wide checkout-summary__action is-incomplete'
          }
          type="button"
          disabled={isSubmittingOrder}
          onClick={async () => {
            if (items.length === 0) {
              toast.error('Добавьте товары в корзину');
              return;
            }
            if (submitLockRef.current) {
              toast.info('Заказ уже отправляется. Подождите несколько секунд.');
              return;
            }
            if (!validateCheckoutContact()) return;
            if (!acceptedOrderData || !acceptedOrderTransfer) {
              toast.error('Подтвердите оба обязательных согласия.');
              return;
            }
            const missingCakeSchedule = items.find((item) => item.product.allow_production_schedule && (!item.production_date || !item.production_time));
            if (missingCakeSchedule) {
              toast.error(`Укажите дату и время для «${missingCakeSchedule.product.title}»`);
              onEditCart();
              return;
            }
            if (mode === 'delivery') {
              if (!validateDeliveryDetails()) return;
              if (settlementNeedsAdminReview) {
                void submitSettlementRequest({
                  cityName: effectiveDeliveryCity,
                  settlementName: effectiveDeliverySettlement,
                  source: `restaurant:${catalogSlug}`
                });
              }
            }
            const profileName = clientName.trim() || 'Гость';
            const profilePhone = clientPhone.trim();
            savePublicClientProfile(catalogSlug, {
              name: clientName,
              phone: clientPhone,
              deliveryCity: effectiveDeliveryCity,
              deliverySettlement: effectiveDeliverySettlement,
              deliveryAddress
            });
            saveClientProfile({ name: profileName, phone: profilePhone });
            const orderPayload: CreateRestaurantOrderFromCartInput = {
              slug: catalogSlug,
              businessType: restaurant.business_type,
              items,
              fulfillmentType: mode,
              cabinLabel: mode === 'hall' ? selectedCabin?.title ?? '' : '',
              deliveryCity: effectiveDeliveryCity,
              deliverySettlement: effectiveDeliverySettlement,
              deliveryAddress: finalDeliveryAddress,
              deliveryLat,
              deliveryLng,
              deliveryAccuracyM,
              comment: [
                mode === 'hall' && selectedCabin ? `Кабинка: ${selectedCabin.title}` : '',
                formatOrderPaymentMethodMarker(usesBankTransfer ? 'bank_transfer' : 'cash'),
                orderComment.trim()
              ].filter(Boolean).join('\n'),
              customerName: clientName.trim(),
              customerPhone: clientPhone.trim()
            };
            submitLockRef.current = true;
            setIsSubmittingOrder(true);

            try {
              const currentCatalog = await loadCatalog(catalogSlug);
              const stockIssues = findRestaurantOrderStockIssues(items, currentCatalog.products);
              if (stockIssues.length > 0) {
                stockIssues.forEach((issue) => {
                  updateCartItemQuantity(issue.productId, issue.available);
                });
                orderAttemptRef.current = null;
                const firstIssue = stockIssues[0];
                toast.error(
                  firstIssue.available === 0
                    ? `«${firstIssue.title}» закончился. Товар удалён из корзины.`
                    : `Для «${firstIssue.title}» осталось ${firstIssue.available} шт. Количество в корзине обновлено.`
                );
                submitLockRef.current = false;
                setIsSubmittingOrder(false);
                return;
              }
            } catch (error) {
              console.error('Catalog stock refresh failed', error);
              toast.error('Не удалось проверить актуальные остатки. Проверьте интернет и попробуйте ещё раз.');
              submitLockRef.current = false;
              setIsSubmittingOrder(false);
              return;
            }

            const shouldOfferPasskeyAfterAuth = !hasClientSession && clientPasskeyIsSupported();
            if (!hasClientSession) {
              setAccountError('');
              try {
                let session;
                try {
                  session = await registerClientAccount({
                    name: profileName,
                    phone: profilePhone,
                    password: clientPassword,
                    acceptedAgreement: acceptedOrderData,
                    acceptedPersonalData: acceptedOrderData,
                    acceptedAdvertising: false
                  });
                } catch (error) {
                  const message = error instanceof Error ? error.message : '';
                  if (!message.includes('Аккаунт с этим номером уже существует')) throw error;
                  session = await loginClientAccount({ phone: profilePhone, password: clientPassword });
                  const sessionToken = getStoredClientSessionToken();
                  if (!sessionToken) throw new Error('Не удалось открыть клиентскую сессию.');
                  await recordClientRegistrationLegalChoices(sessionToken, {
                    acceptedAgreement: acceptedOrderData,
                    acceptedPersonalData: acceptedOrderData,
                    acceptedAdvertising: false
                  });
                }
                setHasClientSession(true);
                saveClientProfile({ name: session.name, phone: session.phone });
              } catch (error) {
                const message = error instanceof Error ? error.message : 'Не удалось создать профиль.';
                setAccountError(message);
                toast.error(message);
                submitLockRef.current = false;
                setIsSubmittingOrder(false);
                return;
              }
            }

            const submitRestaurantOrder = () => {
              submitLockRef.current = true;
              setIsSubmittingOrder(true);
              let whatsappWindow: Window | null = null;
              if (restaurant.whatsapp) {
                try {
                  whatsappWindow = window.open('about:blank', '_blank');
                } catch {
                  whatsappWindow = null;
                }
              }
              const openCreatedOrderWhatsapp = (href: string) => {
                if (whatsappWindow && !whatsappWindow.closed) {
                  whatsappWindow.location.href = href;
                  return;
                }
                window.location.href = href;
              };
              const closeReservedWhatsappWindow = () => {
                try {
                  whatsappWindow?.close();
                } catch {
                  // The browser may block controlling a tab after opening it.
                }
              };
              void createRestaurantOrderFromCart({
                ...orderPayload,
                idempotencyKey: getOrderIdempotencyKey(orderPayload)
              })
                .then((orderId) => {
                  if (orderId) {
                    const orderType: ClientOrder['orderType'] =
                      mode === 'hall' ? 'dine_in' : mode === 'takeaway' ? 'pickup' : 'delivery';
                    const deliveryProvider: ClientOrder['deliveryProvider'] =
                      orderType === 'delivery'
                        ? deliverySettings.use_platform_drivers
                          ? 'platform'
                          : 'restaurant'
                        : orderType === 'pickup'
                          ? 'pickup'
                          : 'dine_in';
                    const preparationMinutes = Math.max(10, deliverySettings.default_preparation_minutes || 25);

                    if (mode === 'delivery') {
                      const clientAddress: ClientAddress = {
                        id: `checkout-${catalogSlug}`,
                        title: effectiveDeliverySettlement || effectiveDeliveryCity || 'Адрес доставки',
                        addressLine: finalDeliveryAddress,
                        lat: selectedDeliveryLat,
                        lng: selectedDeliveryLng,
                        accuracyM: deliveryAccuracyM,
                        entrance: '',
                        floor: '',
                        apartment: '',
                        intercomCode: '',
                        landmark: '',
                        comment: '',
                        isDefault: true
                      };

                      addClientAddress(clientAddress);
                    }

                    submitClientOrder({
                      id: orderId,
                      restaurantSlug: catalogSlug,
                      restaurantName: restaurant.name || catalogSlug,
                      orderType,
                      deliveryProvider,
                      paymentMethod: usesBankTransfer ? 'bank_transfer' : 'cash',
                      status: usesBankTransfer && paymentSettings.requireConfirmation
                        ? 'waiting_payment_confirmation'
                        : 'new',
                      paymentStatus: usesBankTransfer ? 'waiting_confirmation' : 'unpaid',
                      totalAmount: total,
                      addressLine:
                        orderType === 'delivery'
                          ? finalDeliveryAddress
                          : orderType === 'dine_in'
                            ? selectedCabin?.title ?? 'В зале'
                            : restaurant.address || 'Самовывоз',
                      deliveryLat: orderType === 'delivery' ? deliveryLat : null,
                      deliveryLng: orderType === 'delivery' ? deliveryLng : null,
                      clientName: profileName,
                      clientPhone: profilePhone,
                      createdAt: new Date().toISOString(),
                      estimatedTimeMin: preparationMinutes,
                      estimatedTimeMax: preparationMinutes + (orderType === 'delivery' ? 20 : 10),
                      items: items.map((item) => ({
                        dishId: item.product.id,
                        name: item.product.title,
                        price: getCartItemPrice(item),
                        quantity: item.quantity
                      }))
                    });
                    void initializePostOrderAddon(orderId).catch((error) => {
                      console.warn('Post-order addon initialization failed', error);
                    });
                    recordOrderConsent();
                    clearCart();
                    clearClientPlatformCart(catalogSlug);
                    const whatsappHref = restaurant.whatsapp ? buildWhatsappHref(orderId) : '';
                    onSubmitOrder(orderId);
                    toast.success('Заказ создан в системе ресторана');
                    if (whatsappHref) openCreatedOrderWhatsapp(whatsappHref);
                    return;
                  }
                  closeReservedWhatsappWindow();
                  toast.error('Не удалось создать заказ в системе ресторана. WhatsApp не открыт, чтобы не потерять и не продублировать заказ.');
                })
                .catch((error) => {
                  console.error('Order creation failed', error);
                  closeReservedWhatsappWindow();
                  toast.error(getRestaurantOrderCreationErrorMessage(error));
                })
                .finally(() => {
                  submitLockRef.current = false;
                  setIsSubmittingOrder(false);
                });
            };

            if (shouldOfferPasskeyAfterAuth) {
              pendingOrderContinuationRef.current = submitRestaurantOrder;
              submitLockRef.current = false;
              setIsSubmittingOrder(false);
              setIsPasskeyCheckoutPromptOpen(true);
              return;
            }

            submitRestaurantOrder();
          }}
        >
          <ArrowRight />
          {isSubmittingOrder ? 'Отправляем заказ...' : 'Отправить заказ'}
        </button>
      </section>
      <ClientPasskeyRegistrationDialog
        open={isPasskeyCheckoutPromptOpen}
        onContinue={continuePendingOrder}
      />
    </main>
  );
}
