import {
  buildDeliveryDestinationAddress,
  buildDriverDeliveryView,
  createPickupQrToken,
  type DeliveryStatus,
  type DriverDeliveryView,
  type DriverStatus,
  type OrderLifecycleSnapshot
} from '../../features/order/orderLifecycle';
import { getDriverGrossEarning } from '../../features/driver/dashboardPresentation';
import { clearPwaResumePath } from '../pwaSession';
import { parseRestaurantCoordinatesFromMapLink } from '../restaurantLocation';
import { formatPublicOrderNumber } from '../publicOrderNumber';
import { supabase } from '../supabase';
import {
  copySupabaseSessionToScope,
  getSupabaseAuthStorage,
  getSupabaseAuthStorageKey
} from '../supabaseAuthScope';
import { normalizeBusinessType, type BusinessType } from '../businessTerminology';

export type DriverProfile = {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly vehicleInfo: string;
  readonly carNumber: string;
  readonly payoutDetails: string;
  readonly debtAmount: number;
  readonly photoUrl: string;
  readonly serviceSettlements: readonly string[];
  readonly rating: number;
  readonly status: DriverStatus;
  readonly isOnline: boolean;
  readonly lastLat: number | null;
  readonly lastLng: number | null;
  readonly lastLocationAt: string | null;
};

export type DeliveryOffer = DriverDeliveryView & {
  readonly businessType: BusinessType;
  readonly catalogId: string;
  readonly deliveryId: string;
  readonly orderNumber: string;
  readonly createdAt: string;
  readonly itemsCount: number;
  readonly orderTotal: number;
  readonly clientDeliveryFee: number;
  readonly paymentLabel: string;
  readonly restaurantLogoUrl: string;
  readonly routeEtaMin: number;
  readonly paymentMethod: 'cash' | 'bank_transfer';
  readonly restaurantPaymentConfirmed: boolean;
  readonly restaurantFundsDelivery: boolean;
  readonly restaurantDeliveryPayoutAmount: number;
  readonly driverRestaurantOrderPaymentConfirmedAt: string | null;
  readonly driverRestaurantOrderPaymentAmount: number;
  readonly driverRestaurantDeliveryPayoutReceivedAt: string | null;
  readonly driverRestaurantDeliveryPayoutReceivedAmount: number;
  readonly pickupQrConfirmed: boolean;
  readonly pickupQrExpiresAt?: string;
};

export type DriverEarning = {
  readonly id: string;
  readonly deliveryId: string;
  readonly orderNumber: string;
  readonly restaurantName: string;
  readonly amount: number;
  readonly completedAt: string;
};

export type DriverDashboardSnapshot = {
  readonly profile: DriverProfile;
  readonly activeDelivery: DeliveryOffer | null;
  readonly availableDeliveries: readonly DeliveryOffer[];
  readonly history: readonly DriverEarning[];
  readonly stats: {
    readonly ordersToday: number;
    readonly completedToday: number;
    readonly canceledToday: number;
    readonly earningsToday: number;
    readonly earningsWeek: number;
    readonly earningsMonth: number;
  };
};

export class DriverActionError extends Error {
  constructor(message: string, readonly code: 'auth' | 'unavailable' | 'network' | 'unknown' = 'unknown') {
    super(message);
    this.name = 'DriverActionError';
  }
}

type DeliveryRow = {
  id: string;
  order_id: string;
  driver_id: string | null;
  status: DeliveryStatus | 'waiting_driver' | 'assigned';
  delivery_provider: string;
  pickup_qr_token: string | null;
  pickup_qr_expires_at: string | null;
  pickup_qr_confirmed_at?: string | null;
  assigned_at: string | null;
  route_to_restaurant_url: string | null;
  route_to_client_url: string | null;
  estimated_time_min: number | null;
  estimated_time_max: number | null;
  offered_fee: number | null;
  pricing_status: 'pending' | 'offered' | 'countered' | 'accepted' | 'rejected' | null;
  client_delivery_fee?: number | null;
  restaurant_funds_delivery?: boolean | null;
  restaurant_delivery_payout_amount?: number | null;
  driver_restaurant_order_payment_confirmed_at?: string | null;
  driver_restaurant_order_payment_amount?: number | null;
  driver_restaurant_delivery_payout_received_at?: string | null;
  driver_restaurant_delivery_payout_received_amount?: number | null;
  created_at: string;
  orders?: MaybeArray<{
    id: string;
    order_type: OrderLifecycleSnapshot['orderType'];
    fulfillment_type?: 'hall' | 'takeaway' | 'delivery' | null;
    status: OrderLifecycleSnapshot['status'];
    payment_status: OrderLifecycleSnapshot['paymentStatus'];
    payment_method?: 'cash' | 'bank_transfer' | null;
    restaurant_payment_confirmed_at?: string | null;
    client_name: string | null;
    client_phone: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    delivery_address: string | null;
    delivery_city: string | null;
    delivery_settlement: string | null;
    delivery_lat: number | null;
    delivery_lng: number | null;
    delivery_comment: string | null;
    delivery_comment_snapshot?: string | null;
    client_address_comment?: string | null;
    comment?: string | null;
    restaurant_address_snapshot: string | null;
    restaurant_lat_snapshot: number | null;
    restaurant_lng_snapshot: number | null;
    catalog_id?: string | null;
    restaurant_id?: string | null;
    delivery_fee: number | null;
    total: number | null;
    total_amount: number | null;
    created_at: string;
    order_items?: Array<{
      quantity: number | null;
    }> | null;
    restaurants?: MaybeArray<{
      name: string | null;
      logo_url: string | null;
      cover_url: string | null;
      description: string | null;
      address_line: string | null;
      lat: number | null;
      lng: number | null;
      map_url?: string | null;
    }> | null;
  }> | null;
};

type DriverRow = {
  id: string;
  name: string | null;
  phone: string | null;
  vehicle_info: string | null;
  car_number: string | null;
  payout_details?: string | null;
  debt_amount?: number | string | null;
  photo_url: string | null;
  service_settlements?: string[] | null;
  rating: number | null;
  status: DriverStatus | null;
  is_online: boolean | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
};

type EarningRow = {
  id: string;
  delivery_id: string;
  amount: number;
  net_amount: number | null;
  created_at: string;
  deliveries?: MaybeArray<{
    id: string;
    order_id: string;
    orders?: MaybeArray<{
      id: string;
      restaurants?: MaybeArray<{
        name: string | null;
      }> | null;
    }> | null;
  }> | null;
};

type MaybeArray<T> = T | T[];

type OrderContactRow = {
  id: string;
  catalog_id?: string | null;
  restaurant_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  delivery_comment?: string | null;
  delivery_comment_snapshot?: string | null;
  client_address_comment?: string | null;
  comment?: string | null;
  restaurant_address_snapshot?: string | null;
  restaurant_lat_snapshot?: number | null;
  restaurant_lng_snapshot?: number | null;
};

type CatalogLocationRow = {
  id: string;
  address: string | null;
  map_url: string | null;
};

type RestaurantLocationRow = {
  id: string;
  catalog_id: string | null;
  address_line: string | null;
  lat: number | null;
  lng: number | null;
};

const firstRelation = <T,>(value: MaybeArray<T> | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;
type DeliveryOrderRow = NonNullable<NonNullable<DeliveryRow['orders']> extends MaybeArray<infer T> ? T : never>;

const coordinateValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const resolveOrderContactName = (order: Pick<OrderContactRow, 'customer_name' | 'client_name'>) =>
  order.customer_name || order.client_name || '';

const resolveOrderContactPhone = (order: Pick<OrderContactRow, 'customer_phone' | 'client_phone'>) =>
  order.customer_phone || order.client_phone || '';

const resolveOrderDeliveryComment = (
  order: Pick<OrderContactRow, 'delivery_comment_snapshot' | 'delivery_comment' | 'client_address_comment' | 'comment'>
) => order.delivery_comment_snapshot || order.delivery_comment || order.client_address_comment || order.comment || '';

export const demoDriverId = 'driver-demo';

const demoProfile: DriverProfile = {
  id: demoDriverId,
  name: 'Алан М.',
  phone: '+7 928 123-45-67',
  vehicleInfo: 'Hyundai Solaris',
  carNumber: 'A123BC 95',
  payoutDetails: 'Карта / счёт',
  debtAmount: 0,
  photoUrl: '',
  serviceSettlements: ['Грозный'],
  rating: 4.9,
  status: 'online',
  isOnline: true,
  lastLat: null,
  lastLng: null,
  lastLocationAt: null
};

const demoOrder = (overrides: Partial<OrderLifecycleSnapshot> = {}): OrderLifecycleSnapshot => ({
  id: 'WC-12347',
  orderType: 'delivery',
  status: 'waiting_driver',
  paymentStatus: 'confirmed',
  clientName: 'Адам М.',
  clientPhone: '+7 928 123-45-67',
  deliveryAddress: 'ул. Ленина, 123, кв. 45',
  deliveryComment: 'Подъезд 2, домофон 45К',
  restaurantName: 'Rizih',
  restaurantAddress: 'пр-т Путина, 20',
  deliveryFee: 520,
  distanceKm: 1.8,
  ...overrides
});

const demoOffers: readonly DeliveryOffer[] = [
  {
    ...buildDriverDeliveryView({ order: demoOrder(), assignment: null, viewerDriverId: demoDriverId }),
    businessType: 'restaurant',
    catalogId: '',
    deliveryId: 'delivery-demo-1',
    orderNumber: 'R2347',
    createdAt: new Date().toISOString(),
    itemsCount: 3,
    orderTotal: 1640,
    clientDeliveryFee: 520,
    paymentLabel: 'Оплата онлайн',
    restaurantLogoUrl: '',
    routeEtaMin: 15,
    paymentMethod: 'bank_transfer',
    restaurantPaymentConfirmed: true,
    restaurantFundsDelivery: false,
    restaurantDeliveryPayoutAmount: 0,
    driverRestaurantOrderPaymentConfirmedAt: null,
    driverRestaurantOrderPaymentAmount: 0,
    driverRestaurantDeliveryPayoutReceivedAt: null,
    driverRestaurantDeliveryPayoutReceivedAmount: 0,
    pickupQrConfirmed: false
  },
  {
    ...buildDriverDeliveryView({
      order: demoOrder({
        id: 'WC-12346',
        restaurantName: 'Кафе Мангал',
        restaurantAddress: 'ул. Мира, 56',
        deliveryAddress: 'ул. Ленина, 123',
        deliveryFee: 450,
        distanceKm: 1.2
      }),
      assignment: null,
      viewerDriverId: demoDriverId
    }),
    businessType: 'restaurant',
    catalogId: '',
    deliveryId: 'delivery-demo-2',
    orderNumber: 'M2346',
    createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    itemsCount: 2,
    orderTotal: 1180,
    clientDeliveryFee: 450,
    paymentLabel: 'Оплата онлайн',
    restaurantLogoUrl: '',
    routeEtaMin: 12,
    paymentMethod: 'bank_transfer',
    restaurantPaymentConfirmed: true,
    restaurantFundsDelivery: false,
    restaurantDeliveryPayoutAmount: 0,
    driverRestaurantOrderPaymentConfirmedAt: null,
    driverRestaurantOrderPaymentAmount: 0,
    driverRestaurantDeliveryPayoutReceivedAt: null,
    driverRestaurantDeliveryPayoutReceivedAmount: 0,
    pickupQrConfirmed: false
  }
];

const demoHistory: readonly DriverEarning[] = [
  {
    id: 'earning-demo-1',
    deliveryId: 'delivery-history-1',
    orderNumber: 'R2345',
    restaurantName: 'Rizih',
    amount: 470,
    completedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString()
  },
  {
    id: 'earning-demo-2',
    deliveryId: 'delivery-history-2',
    orderNumber: 'S2344',
    restaurantName: 'Суши House',
    amount: 350,
    completedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  }
];

const withDriverRequestTimeout = async <T,>(
  request: PromiseLike<T>,
  message: string,
  timeoutMs = 8_000
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new DriverActionError(message, 'network')), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
};

type DriverSoftQueryResult<T> = {
  readonly data: T | null;
  readonly error: unknown | null;
};

type DriverDashboardDataRow = {
  readonly profile: DriverRow;
  readonly deliveries: DeliveryRow[];
};

const runSoftDriverQuery = async <T,>(
  request: PromiseLike<{ data: T | null; error: unknown | null }>,
  message: string,
  timeoutMs = 8_000
): Promise<DriverSoftQueryResult<T>> => {
  try {
    const result = await withDriverRequestTimeout(request, message, timeoutMs);
    return { data: result.data, error: result.error ?? null };
  } catch (error) {
    return { data: null, error };
  }
};

const loadDriverDeliveryOffers = async (): Promise<DriverSoftQueryResult<DeliveryRow[]>> => {
  if (!supabase) return { data: [], error: null };
  const client = supabase;

  const requestOffers = () => runSoftDriverQuery<DeliveryRow[]>(
    client.rpc('get_driver_delivery_offers') as PromiseLike<{
      data: DeliveryRow[] | null;
      error: unknown | null;
    }>,
    'Не удалось загрузить доставки водителя.',
    20_000
  );

  const firstAttempt = await requestOffers();
  if (!firstAttempt.error) return firstAttempt;

  copySupabaseSessionToScope('driver');
  return runSoftDriverQuery<DeliveryRow[]>(
    client.rpc('get_driver_delivery_offers') as PromiseLike<{
      data: DeliveryRow[] | null;
      error: unknown | null;
    }>,
    'Не удалось загрузить доставки водителя.',
    20_000
  );
};

const loadCurrentDriverProfile = async (): Promise<DriverSoftQueryResult<DriverRow>> => {
  if (!supabase) return { data: null, error: null };
  const client = supabase;
  const requestProfile = () => runSoftDriverQuery<DriverRow>(
    client.rpc('get_current_driver_dashboard_profile') as PromiseLike<{
      data: DriverRow | null;
      error: unknown | null;
    }>,
    'Не удалось загрузить данные водителя. Повторите обновление.',
    12_000
  );

  const firstAttempt = await requestProfile();
  if (!firstAttempt.error) return firstAttempt;

  copySupabaseSessionToScope('driver');
  return requestProfile();
};

const loadCurrentDriverDashboardData = async (): Promise<DriverSoftQueryResult<DriverDashboardDataRow>> => {
  if (!supabase) return { data: null, error: null };
  const client = supabase;
  const requestDashboard = () => runSoftDriverQuery<DriverDashboardDataRow>(
    client.rpc('get_current_driver_dashboard_data') as PromiseLike<{
      data: DriverDashboardDataRow | null;
      error: unknown | null;
    }>,
    'Не удалось загрузить профиль и заказы водителя. Повторите обновление.',
    20_000
  );

  const firstAttempt = await requestDashboard();
  if (!firstAttempt.error) return firstAttempt;

  copySupabaseSessionToScope('driver');
  return requestDashboard();
};

const buildDemoSnapshot = (profile: DriverProfile = demoProfile): DriverDashboardSnapshot => ({
  profile,
  activeDelivery: null,
  availableDeliveries: profile.isOnline ? demoOffers : [],
  history: demoHistory,
  stats: {
    ordersToday: 5,
    completedToday: 4,
    canceledToday: 0,
    earningsToday: 2450,
    earningsWeek: 12800,
    earningsMonth: 54800
  }
});

const normalizeDeliveryStatus = (status: DeliveryRow['status']): DeliveryStatus =>
  status === 'waiting_driver' ? 'waiting_courier' : status;

const normalizeOrderType = (order: DeliveryOrderRow): OrderLifecycleSnapshot['orderType'] => {
  if (order.order_type === 'delivery' || order.order_type === 'pickup' || order.order_type === 'dine_in') {
    return order.order_type;
  }
  if (order.fulfillment_type === 'delivery') return 'delivery';
  if (order.fulfillment_type === 'takeaway') return 'pickup';
  return 'dine_in';
};

const rowToOffer = (
  row: DeliveryRow,
  viewerDriverId: string,
  businessType: BusinessType = 'restaurant'
): DeliveryOffer | null => {
  const order = firstRelation(row.orders);
  if (!order) return null;
  const restaurant = firstRelation(order.restaurants);
  const restaurantMapCoordinates = restaurant?.map_url ? parseRestaurantCoordinatesFromMapLink(restaurant.map_url) : null;

  const deliveryFee = Number(row.offered_fee ?? 0) > 0 ? Number(row.offered_fee) : Number(order.delivery_fee ?? 0);
  const lifecycleOrder: OrderLifecycleSnapshot = {
    id: order.id,
    orderType: normalizeOrderType(order),
    status: order.status,
    paymentStatus: order.payment_status,
    clientName: resolveOrderContactName(order),
    clientPhone: resolveOrderContactPhone(order),
    deliveryAddress: buildDeliveryDestinationAddress({
      address: order.delivery_address,
      settlement: order.delivery_settlement,
      city: order.delivery_city
    }),
    deliveryLat: order.delivery_lat,
    deliveryLng: order.delivery_lng,
    deliveryComment: resolveOrderDeliveryComment(order),
    restaurantName: restaurant?.name ?? 'Ресторан',
    restaurantAddress: order.restaurant_address_snapshot ?? restaurant?.address_line ?? restaurant?.description ?? '',
    restaurantLat: restaurantMapCoordinates?.lat ?? coordinateValue(restaurant?.lat) ?? coordinateValue(order.restaurant_lat_snapshot),
    restaurantLng: restaurantMapCoordinates?.lng ?? coordinateValue(restaurant?.lng) ?? coordinateValue(order.restaurant_lng_snapshot),
    deliveryFee,
    distanceKm: 1.8
  };
  const assignment = row.driver_id
    ? {
        orderId: row.order_id,
        driverId: row.driver_id,
        status: normalizeDeliveryStatus(row.status),
        pickupQrToken: row.pickup_qr_token ?? '',
        pickupQrExpiresAt: row.pickup_qr_expires_at ?? new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        assignedAt: row.assigned_at ?? row.created_at
      }
    : null;

  return {
    ...buildDriverDeliveryView({ order: lifecycleOrder, assignment, viewerDriverId }),
    businessType,
    catalogId: order.catalog_id ?? '',
    deliveryId: row.id,
    orderNumber: formatPublicOrderNumber(row.order_id, restaurant?.name),
    createdAt: order.created_at,
    itemsCount: (order.order_items ?? []).reduce((sum, item) => sum + Math.max(1, Number(item.quantity ?? 1)), 0),
    orderTotal: Number(order.total ?? order.total_amount ?? 0),
    clientDeliveryFee: Number(row.client_delivery_fee ?? order.delivery_fee ?? 0),
    paymentLabel: order.payment_status === 'confirmed' ? 'Оплата подтверждена' : 'Оплата ожидает',
    restaurantLogoUrl: restaurant?.logo_url ?? restaurant?.cover_url ?? '',
    routeEtaMin: row.estimated_time_min ?? 20,
    paymentMethod: order.payment_method === 'cash' ? 'cash' : 'bank_transfer',
    restaurantPaymentConfirmed: Boolean(order.restaurant_payment_confirmed_at),
    restaurantFundsDelivery: Boolean(row.restaurant_funds_delivery),
    restaurantDeliveryPayoutAmount: Number(row.restaurant_delivery_payout_amount ?? 0),
    driverRestaurantOrderPaymentConfirmedAt: row.driver_restaurant_order_payment_confirmed_at ?? null,
    driverRestaurantOrderPaymentAmount: Number(row.driver_restaurant_order_payment_amount ?? 0),
    driverRestaurantDeliveryPayoutReceivedAt: row.driver_restaurant_delivery_payout_received_at ?? null,
    driverRestaurantDeliveryPayoutReceivedAmount: Number(
      row.driver_restaurant_delivery_payout_received_amount ?? 0
    ),
    pickupQrConfirmed: Boolean(row.pickup_qr_confirmed_at),
    pickupQrExpiresAt: row.pickup_qr_expires_at ?? undefined
  };
};

const rowToDriverProfile = (row: DriverRow | null): DriverProfile => ({
  id: row?.id ?? demoDriverId,
  name: row?.name ?? demoProfile.name,
  phone: row?.phone ?? demoProfile.phone,
  vehicleInfo: row?.vehicle_info ?? demoProfile.vehicleInfo,
  carNumber: row?.car_number ?? demoProfile.carNumber,
  payoutDetails: row?.payout_details ?? demoProfile.payoutDetails,
  debtAmount: Number(row?.debt_amount ?? 0),
  photoUrl: row?.photo_url ?? '',
  serviceSettlements: Array.isArray(row?.service_settlements) ? row.service_settlements : demoProfile.serviceSettlements,
  rating: row?.rating ?? demoProfile.rating,
  status: row?.status ?? (row?.is_online ? 'online' : 'offline'),
  isOnline: row?.is_online ?? false,
  lastLat: row?.last_lat ?? null,
  lastLng: row?.last_lng ?? null,
  lastLocationAt: row?.last_location_at ?? null
});

const rowToEarning = (row: EarningRow): DriverEarning => {
  const delivery = firstRelation(row.deliveries);
  const order = firstRelation(delivery?.orders);
  const restaurant = firstRelation(order?.restaurants);

  return {
    id: row.id,
    deliveryId: row.delivery_id,
    orderNumber: formatPublicOrderNumber(delivery?.order_id ?? row.delivery_id, restaurant?.name),
    restaurantName: restaurant?.name ?? 'Ресторан',
    amount: getDriverGrossEarning({ amount: row.amount, netAmount: row.net_amount }),
    completedAt: row.created_at
  };
};

export const getAuthenticatedDriverId = async (): Promise<string | null> => {
  if (!supabase) return demoDriverId;
  copySupabaseSessionToScope('driver');

  try {
    const { data: rpcDriverId, error: rpcDriverError } = await withDriverRequestTimeout(
      supabase.rpc('current_driver_id'),
      'Не удалось проверить вход водителя.',
      4_000
    );
    if (!rpcDriverError) {
      return typeof rpcDriverId === 'string' && rpcDriverId ? rpcDriverId : null;
    }
  } catch {
    // A slow RPC must not look like a logout. Fall back to the restored Supabase session below.
  }

  const { data: sessionData, error: sessionError } = await withDriverRequestTimeout(
    supabase.auth.getSession(),
    'Не удалось проверить сессию водителя.',
    2_000
  );
  const authUser = sessionData.session?.user;
  if (sessionError) {
    throw new DriverActionError('Восстанавливаем сессию водителя после потери связи.', 'network');
  }
  if (!authUser?.id) return null;
  copySupabaseSessionToScope('driver');
  const metadataDriverId =
    typeof authUser.app_metadata?.driver_id === 'string' ? authUser.app_metadata.driver_id : '';
  if (metadataDriverId) return metadataDriverId;

  const email = authUser.email?.trim().toLowerCase();
  const fallbackFilters = [`user_id.eq.${authUser.id}`];

  const userFilters = [`auth_user_id.eq.${authUser.id}`];
  if (email) {
    userFilters.push(`email.eq.${email}`);
    fallbackFilters.push(`email.eq.${email}`);
  }

  try {
    const { data: platformUser } = await withDriverRequestTimeout(
      supabase
        .from('users')
        .select('id')
        .or(userFilters.join(','))
        .maybeSingle(),
      'Не удалось проверить пользователя водителя.',
      2_500
    );
    if (typeof platformUser?.id === 'string') {
      fallbackFilters.unshift(`user_id.eq.${platformUser.id}`);
    }
  } catch {
    // The driver RPC remains the source of truth; this lookup is only a quick legacy fallback.
  }

  const { data: driverRow, error: driverError } = await withDriverRequestTimeout(
    supabase
      .from('drivers')
      .select('id')
      .or(fallbackFilters.join(','))
      .maybeSingle(),
    'Не удалось проверить профиль водителя.',
    4_000
  );

  if (driverError) {
    throw new DriverActionError('Не удалось проверить профиль водителя. Повторяем подключение.', 'network');
  }
  return typeof driverRow?.id === 'string' ? driverRow.id : null;
};

export async function hasDriverAuthSession() {
  if (!supabase) return true;
  copySupabaseSessionToScope('driver');

  const { data, error } = await withDriverRequestTimeout(
    supabase.auth.getSession(),
    'Не удалось проверить сессию водителя.',
    2_000
  );
  if (error) {
    throw new DriverActionError('Восстанавливаем сессию водителя после потери связи.', 'network');
  }
  return Boolean(data.session?.user?.id);
}

export async function getDriverDashboard(): Promise<DriverDashboardSnapshot> {
  if (!supabase) return buildDemoSnapshot();

  const dashboardResult = await loadCurrentDriverDashboardData();
  let driverResult: DriverSoftQueryResult<DriverRow>;
  let deliveriesResult: DriverSoftQueryResult<DeliveryRow[]>;

  if (!dashboardResult.error && dashboardResult.data?.profile) {
    driverResult = { data: dashboardResult.data.profile, error: null };
    deliveriesResult = {
      data: Array.isArray(dashboardResult.data.deliveries) ? dashboardResult.data.deliveries : [],
      error: null
    };
  } else {
    [driverResult, deliveriesResult] = await Promise.all([
      loadCurrentDriverProfile(),
      loadDriverDeliveryOffers()
    ]);
  }

  if (driverResult.error) throw driverResult.error;
  const driverRow = driverResult.data as DriverRow | null;
  if (!driverRow) throw new DriverActionError('Профиль водителя не найден. Войдите заново.', 'auth');

  const resolvedDriverId = driverRow.id;
  const earningsResult = await runSoftDriverQuery<EarningRow[]>(
    supabase
      .from('earnings')
      .select('id, delivery_id, amount, net_amount, created_at, deliveries(id, order_id, orders(id, restaurants(name)))')
      .eq('driver_id', resolvedDriverId)
      .order('created_at', { ascending: false })
      .limit(30) as PromiseLike<{ data: EarningRow[] | null; error: unknown | null }>,
    'Не удалось загрузить заработок водителя.',
    8_000
  );

  const profile = rowToDriverProfile(driverRow);

  if (deliveriesResult.error) throw deliveriesResult.error;
  const deliveryRows = (deliveriesResult.data ?? []) as unknown as DeliveryRow[];

  const catalogIds = Array.from(new Set(deliveryRows
    .map((row) => firstRelation(row.orders)?.catalog_id)
    .filter((id): id is string => Boolean(id))));
  const businessTypeByCatalog = new Map<string, BusinessType>();
  if (catalogIds.length > 0) {
    const { data: catalogTypes } = await supabase
      .from('catalogs')
      .select('id, business_type')
      .in('id', catalogIds);
    (catalogTypes ?? []).forEach((catalog) => {
      businessTypeByCatalog.set(catalog.id, normalizeBusinessType(catalog.business_type));
    });
  }

  let offers = deliveryRows
    .map((row) => {
      const catalogId = firstRelation(row.orders)?.catalog_id;
      return rowToOffer(row, profile.id, catalogId ? businessTypeByCatalog.get(catalogId) : undefined);
    })
    .filter((offer): offer is DeliveryOffer => Boolean(offer));

  const assignedOrderIds = Array.from(new Set(offers
    .filter((offer) => offer.isAssignedToViewer)
    .map((offer) => offer.orderId)));
  if (assignedOrderIds.length > 0) {
    const contactsResult = await withDriverRequestTimeout(
      supabase
        .from('orders')
        .select('id, catalog_id, restaurant_id, customer_name, customer_phone, client_name, client_phone, delivery_comment, delivery_comment_snapshot, client_address_comment, comment, restaurant_address_snapshot, restaurant_lat_snapshot, restaurant_lng_snapshot')
        .in('id', assignedOrderIds),
      'Не удалось загрузить контакты заказа.',
      6_000
    );

    if (!contactsResult.error) {
      const contactRows = (contactsResult.data ?? []) as OrderContactRow[];
      const contactsByOrderId = new Map(
        contactRows.map((order) => [order.id, order])
      );
      const catalogIds = Array.from(new Set(contactRows.map((order) => order.catalog_id).filter((id): id is string => Boolean(id))));
      const restaurantIds = Array.from(new Set(contactRows.map((order) => order.restaurant_id).filter((id): id is string => Boolean(id))));
      const catalogLocationsById = new Map<string, CatalogLocationRow>();
      const restaurantLocationsById = new Map<string, RestaurantLocationRow>();
      const restaurantLocationsByCatalogId = new Map<string, RestaurantLocationRow>();

      if (catalogIds.length > 0) {
        const catalogLocationsResult = await supabase
          .from('catalogs')
          .select('id, address, map_url')
          .in('id', catalogIds);
        if (!catalogLocationsResult.error) {
          ((catalogLocationsResult.data ?? []) as CatalogLocationRow[])
            .forEach((catalog) => catalogLocationsById.set(catalog.id, catalog));
        }

        const restaurantLocationsByCatalogResult = await supabase
          .from('restaurants')
          .select('id, catalog_id, address_line, lat, lng')
          .in('catalog_id', catalogIds);
        if (!restaurantLocationsByCatalogResult.error) {
          ((restaurantLocationsByCatalogResult.data ?? []) as RestaurantLocationRow[])
            .forEach((restaurantLocation) => {
              if (restaurantLocation.catalog_id && !restaurantLocationsByCatalogId.has(restaurantLocation.catalog_id)) {
                restaurantLocationsByCatalogId.set(restaurantLocation.catalog_id, restaurantLocation);
              }
            });
        }
      }

      if (restaurantIds.length > 0) {
        const restaurantLocationsResult = await supabase
          .from('restaurants')
          .select('id, catalog_id, address_line, lat, lng')
          .in('id', restaurantIds);
        if (!restaurantLocationsResult.error) {
          ((restaurantLocationsResult.data ?? []) as RestaurantLocationRow[])
            .forEach((restaurantLocation) => restaurantLocationsById.set(restaurantLocation.id, restaurantLocation));
        }
      }

      offers = offers.map((offer) => {
        const order = contactsByOrderId.get(offer.orderId);
        if (!order || !offer.isAssignedToViewer) return offer;
        const restaurantLocation =
          (order.restaurant_id ? restaurantLocationsById.get(order.restaurant_id) : null) ??
          (order.catalog_id ? restaurantLocationsByCatalogId.get(order.catalog_id) : null) ??
          null;
        const catalogLocation = order.catalog_id ? catalogLocationsById.get(order.catalog_id) : null;
        const catalogMapCoordinates = catalogLocation?.map_url
          ? parseRestaurantCoordinatesFromMapLink(catalogLocation.map_url)
          : null;
        const restaurantLat =
          catalogMapCoordinates?.lat ??
          coordinateValue(restaurantLocation?.lat) ??
          coordinateValue(order.restaurant_lat_snapshot) ??
          offer.restaurantLat;
        const restaurantLng =
          catalogMapCoordinates?.lng ??
          coordinateValue(restaurantLocation?.lng) ??
          coordinateValue(order.restaurant_lng_snapshot) ??
          offer.restaurantLng;
        return {
          ...offer,
          catalogId: order.catalog_id ?? offer.catalogId,
          clientName: resolveOrderContactName(order) || offer.clientName,
          clientPhone: resolveOrderContactPhone(order) || offer.clientPhone,
          deliveryComment: resolveOrderDeliveryComment(order) || offer.deliveryComment,
          restaurantAddress: restaurantLocation?.address_line || order.restaurant_address_snapshot || catalogLocation?.address || offer.restaurantAddress,
          restaurantLat,
          restaurantLng
        };
      });
    }
  }

  const activeDelivery = offers.find((offer) => offer.isAssignedToViewer) ?? null;
  const availableDeliveries = profile.isOnline
    ? offers.filter((offer) => !offer.isAssignedToViewer && normalizeDeliveryStatus(offer.status) === 'waiting_courier')
    : [];

  const history = ((earningsResult.data ?? []) as unknown as EarningRow[]).map(rowToEarning);
  const earningsToday = history.reduce((sum, earning) => sum + earning.amount, 0);

  return {
    profile,
    activeDelivery,
    availableDeliveries,
    history,
    stats: {
      ordersToday: history.length + (activeDelivery ? 1 : 0),
      completedToday: history.length,
      canceledToday: 0,
      earningsToday,
      earningsWeek: earningsToday,
      earningsMonth: earningsToday
    }
  };
}

export async function setDriverAvailability(isOnline: boolean) {
  if (!supabase) return;

  const { data, error } = await withDriverRequestTimeout(
    supabase.rpc('set_current_driver_availability', {
      next_is_online: isOnline
    }),
    'Не удалось изменить онлайн-статус. Проверьте связь и повторите.',
    6_000
  );

  if (error) {
    throw new DriverActionError(
      /authentication|required|jwt|auth/i.test(error.message)
        ? 'Войдите как водитель ещё раз.'
        : 'Не удалось изменить онлайн-статус. Проверьте связь и повторите.',
      /authentication|required|jwt|auth/i.test(error.message) ? 'auth' : 'network'
    );
  }
  if (data !== isOnline) throw new DriverActionError('Онлайн-статус не был сохранён', 'unknown');
}

export async function updateDriverLocation(
  _driverId: string,
  location: { lat: number; lng: number; accuracy?: number | null }
) {
  if (!supabase) return;

  const { error } = await withDriverRequestTimeout(
    supabase.rpc('update_current_driver_location', {
      next_lat: location.lat,
      next_lng: location.lng,
      next_accuracy: location.accuracy ?? null
    }),
    'Не удалось обновить местоположение водителя.',
    5_000
  );

  if (error) throw error;
}

export async function signOutDriver() {
  clearPwaResumePath();
  try {
    getSupabaseAuthStorage().removeItem(getSupabaseAuthStorageKey('driver'));
  } catch {
    // The navigation below should still complete if storage is unavailable.
  }
  if (!supabase) return;
  void withDriverRequestTimeout(
    supabase.auth.signOut({ scope: 'local' }),
    'Не удалось выйти из профиля водителя.',
    3_000
  ).catch(() => undefined);
}

export async function saveDriverServiceSettlements(driverId: string, serviceSettlements: readonly string[]) {
  if (!supabase) return;

  const { error } = await supabase
    .from('drivers')
    .update({ service_settlements: [...serviceSettlements] })
    .eq('id', driverId);

  if (error) throw error;
}

export type DriverProfileUpdate = {
  readonly name: string;
  readonly phone: string;
  readonly vehicleInfo: string;
  readonly carNumber: string;
  readonly payoutDetails: string;
  readonly serviceSettlements: readonly string[];
};

export async function saveDriverProfile(update: DriverProfileUpdate) {
  if (!supabase) return;

  const { error } = await withDriverRequestTimeout(
    supabase.rpc('update_current_driver_profile', {
      next_name: update.name.trim(),
      next_phone: update.phone.trim(),
      next_vehicle_info: update.vehicleInfo.trim(),
      next_car_number: update.carNumber.trim(),
      next_payout_details: update.payoutDetails.trim(),
      next_service_settlements: [...update.serviceSettlements]
    }),
    'Не удалось сохранить профиль водителя. Проверьте связь и повторите.',
    15_000
  );

  if (error) throw error;
}

export async function changeDriverPassword(newPassword: string) {
  if (!supabase) return;

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function acceptDeliveryOffer(deliveryId: string) {
  if (!supabase) return;

  const { error } = await withDriverRequestTimeout(
    supabase.rpc('accept_available_delivery', {
      target_delivery_id: deliveryId
    }),
    'Не удалось принять заказ. Проверьте связь и повторите.',
    15_000
  );

  if (!error) return;

  if (/not available|cannot accept|another account/i.test(error.message)) {
    throw new DriverActionError('Этот заказ уже забрал другой водитель или он больше недоступен.', 'unavailable');
  }
  if (/authentication|required|jwt|auth/i.test(error.message)) {
    throw new DriverActionError('Войдите как водитель ещё раз.', 'auth');
  }
  throw new DriverActionError('Не удалось принять заказ. Проверьте связь и повторите.', 'network');
}

export async function updateDeliveryProgress(deliveryId: string, status: DeliveryStatus) {
  if (!supabase) return;

  const { error } = await withDriverRequestTimeout(
    supabase.rpc('update_current_driver_delivery_status', {
      target_delivery_id: deliveryId,
      next_status: status
    }),
    'Не удалось обновить статус. Проверьте связь и повторите.',
    15_000
  );

  if (!error) return;

  const errorText = error instanceof Error ? error.message : String(error);
  const liveSchemaRejectsClientArrival =
    status === 'arrived_to_client' &&
    /deliveries_status_check|check constraint|violates.*constraint/i.test(errorText);
  if (liveSchemaRejectsClientArrival) return;

  if (/authentication|required|jwt|auth/i.test(errorText)) {
    throw new DriverActionError('Войдите как водитель ещё раз.', 'auth');
  }
  throw new DriverActionError('Не удалось обновить статус. Проверьте связь и повторите.', 'network');
}

export async function confirmDriverRestaurantOrderPayment(deliveryId: string) {
  if (!supabase) {
    return { confirmedAt: new Date().toISOString(), amount: 0 };
  }

  const { data, error } = await withDriverRequestTimeout(
    supabase.rpc('confirm_current_driver_restaurant_order_payment', {
      target_delivery_id: deliveryId
    }),
    'Не удалось отметить передачу суммы заказа. Проверьте связь и повторите.',
    15_000
  );
  if (error) throw error;

  const result = (data ?? {}) as { confirmed_at?: unknown; amount?: unknown };
  return {
    confirmedAt: typeof result.confirmed_at === 'string' ? result.confirmed_at : '',
    amount: Number(result.amount ?? 0)
  };
}

export async function confirmDriverRestaurantDeliveryPayout(deliveryId: string) {
  if (!supabase) {
    return { receivedAt: new Date().toISOString(), amount: 0 };
  }

  const { data, error } = await withDriverRequestTimeout(
    supabase.rpc('confirm_current_driver_restaurant_delivery_payout', {
      target_delivery_id: deliveryId
    }),
    'Не удалось отметить получение оплаты доставки. Проверьте связь и повторите.',
    15_000
  );
  if (error) throw error;

  const result = (data ?? {}) as { received_at?: unknown; amount?: unknown };
  return {
    receivedAt: typeof result.received_at === 'string' ? result.received_at : '',
    amount: Number(result.amount ?? 0)
  };
}

export async function completeDeliveryProgress(deliveryId: string) {
  if (!supabase) return;

  const { error } = await withDriverRequestTimeout(
    supabase.rpc('complete_driver_delivery', {
      target_delivery_id: deliveryId
    }),
    'Не удалось завершить доставку. Проверьте связь и повторите.',
    15_000
  );

  if (error) throw error;
}

export async function refreshDriverPickupQr(deliveryId: string) {
  if (!supabase) {
    return {
      token: createPickupQrToken({ orderId: deliveryId, driverId: demoDriverId, nonce: crypto.randomUUID() }),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    };
  }

  const { data, error } = await supabase.rpc('refresh_current_driver_pickup_qr', {
    target_delivery_id: deliveryId
  });
  if (error) throw error;

  const row = (data ?? {}) as { token?: unknown; expires_at?: unknown };
  return {
    token: typeof row.token === 'string' ? row.token : '',
    expiresAt: typeof row.expires_at === 'string' ? row.expires_at : ''
  };
}

export async function confirmDeliveryPickupQr(
  deliveryId: string,
  token: string,
  restaurantSlug = ''
): Promise<boolean> {
  if (!supabase) return token.trim().length > 0;

  const { data, error } = await supabase.rpc('confirm_delivery_pickup_qr', {
    target_delivery_id: deliveryId,
    presented_token: token
  });

  if (error) throw error;
  if (data) return true;
  if (!restaurantSlug.trim()) return false;

  const fallbackResult = await supabase.rpc('confirm_delivery_pickup_qr_by_token', {
    target_catalog_slug: restaurantSlug.trim().toLowerCase(),
    presented_token: token
  });

  if (!fallbackResult.error) return Boolean(fallbackResult.data);
  if ((fallbackResult.error as { code?: string } | null)?.code !== 'PGRST202') {
    throw fallbackResult.error;
  }

  const { data: catalogRow, error: catalogError } = await supabase
    .from('catalogs')
    .select('id')
    .eq('slug', restaurantSlug.trim().toLowerCase())
    .maybeSingle();
  if (catalogError || !catalogRow?.id) return false;

  const { data: orderRows, error: ordersError } = await supabase
    .from('orders')
    .select('id')
    .eq('catalog_id', catalogRow.id)
    .limit(500);
  if (ordersError) throw ordersError;

  const orderIds = ((orderRows ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (orderIds.length === 0) return false;

  const deliveryLookup = await supabase
    .from('deliveries')
    .select('id')
    .in('order_id', orderIds)
    .eq('status', 'arrived_to_restaurant')
    .eq('pickup_qr_token', token.trim())
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (deliveryLookup.error || !deliveryLookup.data?.id) return false;

  const retryResult = await supabase.rpc('confirm_delivery_pickup_qr', {
    target_delivery_id: deliveryLookup.data.id,
    presented_token: token
  });
  if (retryResult.error) throw retryResult.error;
  return Boolean(retryResult.data);
}

export async function getRestaurantOrderIdForDelivery(deliveryId: string): Promise<string> {
  if (!supabase) return deliveryId;

  const { data, error } = await supabase.rpc('get_restaurant_order_id_for_delivery', {
    target_delivery_id: deliveryId
  });
  if (error) throw error;
  return typeof data === 'string' ? data : '';
}

export async function confirmDriverPickup(deliveryId: string): Promise<boolean> {
  if (!supabase) return true;

  const { data, error } = await withDriverRequestTimeout(
    supabase.rpc('confirm_driver_pickup', {
      target_delivery_id: deliveryId
    }),
    'Не удалось подтвердить получение заказа.',
    15_000
  );

  if (error) throw error;
  return Boolean(data);
}

export function subscribeToDriverRealtime(driverId: string, onChange: () => void) {
  if (!supabase) return () => undefined;

  let refreshTimer: number | null = null;
  const scheduleRefresh = () => {
    if (refreshTimer !== null) return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      onChange();
    }, 180);
  };

  const channel = supabase
    .channel(`driver-deliveries-${driverId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, (payload) => {
      const rows = [payload.old, payload.new].filter(Boolean) as Array<{ driver_id?: string | null; status?: string | null }>;
      const touchesOwnDelivery = rows.some((row) => row.driver_id === driverId);
      const touchesOpenOffer = rows.some((row) => row.status === 'waiting_courier' || row.status === 'waiting_driver');
      if (touchesOwnDelivery || touchesOpenOffer) {
        scheduleRefresh();
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers', filter: `id=eq.${driverId}` }, scheduleRefresh)
    .subscribe();

  return () => {
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    void supabase?.removeChannel(channel);
  };
}

export const buildLocalAcceptedOffer = (offer: DeliveryOffer, driverId: string): DeliveryOffer => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

  return {
    ...offer,
    status: 'assigned',
    isAssignedToViewer: true,
    clientName: offer.clientName,
    clientPhone: offer.clientPhone,
    deliveryComment: offer.deliveryComment,
    pickupQrToken: createPickupQrToken({
      orderId: offer.orderId,
      driverId,
      nonce: `${now.getTime()}-${expiresAt.getTime()}`
    })
  };
};
