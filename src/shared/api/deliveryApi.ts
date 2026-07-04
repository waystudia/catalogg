import {
  buildDriverDeliveryView,
  createPickupQrToken,
  type DeliveryStatus,
  type DriverDeliveryView,
  type DriverStatus,
  type OrderLifecycleSnapshot
} from '../../features/order/orderLifecycle';
import { supabase } from '../supabase';

export type DriverProfile = {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly vehicleInfo: string;
  readonly carNumber: string;
  readonly photoUrl: string;
  readonly rating: number;
  readonly status: DriverStatus;
  readonly isOnline: boolean;
};

export type DeliveryOffer = DriverDeliveryView & {
  readonly deliveryId: string;
  readonly orderNumber: string;
  readonly createdAt: string;
  readonly paymentLabel: string;
  readonly restaurantLogoUrl: string;
  readonly routeEtaMin: number;
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

type DeliveryRow = {
  id: string;
  order_id: string;
  driver_id: string | null;
  status: DeliveryStatus | 'waiting_driver' | 'assigned';
  delivery_provider: string;
  pickup_qr_token: string | null;
  pickup_qr_expires_at: string | null;
  assigned_at: string | null;
  route_to_restaurant_url: string | null;
  route_to_client_url: string | null;
  estimated_time_min: number | null;
  estimated_time_max: number | null;
  created_at: string;
  orders?: MaybeArray<{
    id: string;
    order_type: OrderLifecycleSnapshot['orderType'];
    status: OrderLifecycleSnapshot['status'];
    payment_status: OrderLifecycleSnapshot['paymentStatus'];
    client_name: string | null;
    client_phone: string | null;
    delivery_address: string | null;
    delivery_lat: number | null;
    delivery_lng: number | null;
    delivery_comment: string | null;
    restaurant_address_snapshot: string | null;
    restaurant_lat_snapshot: number | null;
    restaurant_lng_snapshot: number | null;
    delivery_fee: number | null;
    total: number | null;
    total_amount: number | null;
    created_at: string;
    restaurants?: MaybeArray<{
      name: string | null;
      logo_url: string | null;
      cover_url: string | null;
      description: string | null;
      address_line: string | null;
      lat: number | null;
      lng: number | null;
    }> | null;
  }> | null;
};

type DriverRow = {
  id: string;
  name: string | null;
  phone: string | null;
  vehicle_info: string | null;
  car_number: string | null;
  photo_url: string | null;
  rating: number | null;
  status: DriverStatus | null;
  is_online: boolean | null;
};

type DriverUserRow = {
  id: string;
  auth_user_id: string | null;
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

const firstRelation = <T,>(value: MaybeArray<T> | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

export const demoDriverId = 'driver-demo';

const demoProfile: DriverProfile = {
  id: demoDriverId,
  name: 'Алан М.',
  phone: '+7 928 123-45-67',
  vehicleInfo: 'Hyundai Solaris',
  carNumber: 'A123BC 95',
  photoUrl: '',
  rating: 4.9,
  status: 'online',
  isOnline: true
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
    deliveryId: 'delivery-demo-1',
    orderNumber: '12347',
    createdAt: new Date().toISOString(),
    paymentLabel: 'Оплата онлайн',
    restaurantLogoUrl: '',
    routeEtaMin: 15
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
    deliveryId: 'delivery-demo-2',
    orderNumber: '12346',
    createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    paymentLabel: 'Оплата онлайн',
    restaurantLogoUrl: '',
    routeEtaMin: 12
  }
];

const demoHistory: readonly DriverEarning[] = [
  {
    id: 'earning-demo-1',
    deliveryId: 'delivery-history-1',
    orderNumber: '12345',
    restaurantName: 'Rizih',
    amount: 470,
    completedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString()
  },
  {
    id: 'earning-demo-2',
    deliveryId: 'delivery-history-2',
    orderNumber: '12344',
    restaurantName: 'Суши House',
    amount: 350,
    completedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
  }
];

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

const orderNumber = (orderId: string) => orderId.slice(0, 8).toUpperCase();

const rowToOffer = (row: DeliveryRow, viewerDriverId: string): DeliveryOffer | null => {
  const order = firstRelation(row.orders);
  if (!order) return null;
  const restaurant = firstRelation(order.restaurants);

  const deliveryFee = Number(order.delivery_fee ?? 0);
  const lifecycleOrder: OrderLifecycleSnapshot = {
    id: order.id,
    orderType: order.order_type,
    status: order.status,
    paymentStatus: order.payment_status,
    clientName: order.client_name ?? '',
    clientPhone: order.client_phone ?? '',
    deliveryAddress: order.delivery_address ?? '',
    deliveryLat: order.delivery_lat,
    deliveryLng: order.delivery_lng,
    deliveryComment: order.delivery_comment ?? '',
    restaurantName: restaurant?.name ?? 'Ресторан',
    restaurantAddress: order.restaurant_address_snapshot ?? restaurant?.address_line ?? restaurant?.description ?? '',
    restaurantLat: order.restaurant_lat_snapshot ?? restaurant?.lat ?? null,
    restaurantLng: order.restaurant_lng_snapshot ?? restaurant?.lng ?? null,
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
    deliveryId: row.id,
    orderNumber: orderNumber(row.order_id),
    createdAt: order.created_at,
    paymentLabel: order.payment_status === 'confirmed' ? 'Оплата подтверждена' : 'Оплата ожидает',
    restaurantLogoUrl: restaurant?.logo_url ?? restaurant?.cover_url ?? '',
    routeEtaMin: row.estimated_time_min ?? 20
  };
};

const rowToDriverProfile = (row: DriverRow | null): DriverProfile => ({
  id: row?.id ?? demoDriverId,
  name: row?.name ?? demoProfile.name,
  phone: row?.phone ?? demoProfile.phone,
  vehicleInfo: row?.vehicle_info ?? demoProfile.vehicleInfo,
  carNumber: row?.car_number ?? demoProfile.carNumber,
  photoUrl: row?.photo_url ?? '',
  rating: row?.rating ?? demoProfile.rating,
  status: row?.status ?? (row?.is_online ? 'online' : 'offline'),
  isOnline: row?.is_online ?? false
});

const rowToEarning = (row: EarningRow): DriverEarning => {
  const delivery = firstRelation(row.deliveries);
  const order = firstRelation(delivery?.orders);
  const restaurant = firstRelation(order?.restaurants);

  return {
    id: row.id,
    deliveryId: row.delivery_id,
    orderNumber: orderNumber(delivery?.order_id ?? row.delivery_id),
    restaurantName: restaurant?.name ?? 'Ресторан',
    amount: Number(row.net_amount ?? row.amount),
    completedAt: row.created_at
  };
};

export const getAuthenticatedDriverId = async (): Promise<string | null> => {
  if (!supabase) return demoDriverId;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user.id) return null;

  const { data: publicUser, error: publicUserError } = await supabase
    .from('users')
    .select('id, auth_user_id')
    .eq('auth_user_id', sessionData.session.user.id)
    .eq('role', 'driver')
    .maybeSingle();
  if (publicUserError || !publicUser) return null;

  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', (publicUser as DriverUserRow).id)
    .maybeSingle();
  if (driverError || !driver) return null;

  return (driver as Pick<DriverRow, 'id'>).id;
};

const resolveCurrentDriverId = async (fallbackDriverId: string) => {
  if (!supabase || fallbackDriverId !== demoDriverId) return fallbackDriverId;
  return (await getAuthenticatedDriverId()) ?? fallbackDriverId;
};

export async function getDriverDashboard(driverId = demoDriverId): Promise<DriverDashboardSnapshot> {
  if (!supabase) return buildDemoSnapshot();

  const resolvedDriverId = await resolveCurrentDriverId(driverId);

  const driverResult = await supabase
    .from('drivers')
    .select('id, name, phone, vehicle_info, car_number, photo_url, rating, status, is_online')
    .eq('id', resolvedDriverId)
    .maybeSingle();

  if (driverResult.error) throw driverResult.error;
  const profile = rowToDriverProfile(driverResult.data as DriverRow | null);

  const deliveriesResult = await supabase
    .from('deliveries')
    .select('id, order_id, driver_id, status, delivery_provider, pickup_qr_token, pickup_qr_expires_at, assigned_at, route_to_restaurant_url, route_to_client_url, estimated_time_min, estimated_time_max, created_at, orders(id, order_type, status, payment_status, client_name, client_phone, delivery_address, delivery_lat, delivery_lng, delivery_comment, restaurant_address_snapshot, restaurant_lat_snapshot, restaurant_lng_snapshot, delivery_fee, total, total_amount, created_at, restaurants(name, logo_url, cover_url, description, address_line, lat, lng))')
    .in('status', ['waiting_courier', 'waiting_driver', 'assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way'])
    .or(`driver_id.is.null,driver_id.eq.${profile.id}`)
    .order('created_at', { ascending: false });

  if (deliveriesResult.error) throw deliveriesResult.error;

  const offers = ((deliveriesResult.data ?? []) as unknown as DeliveryRow[])
    .map((row) => rowToOffer(row, profile.id))
    .filter((offer): offer is DeliveryOffer => Boolean(offer));
  const activeDelivery = offers.find((offer) => offer.isAssignedToViewer) ?? null;
  const availableDeliveries = profile.isOnline
    ? offers.filter((offer) => !offer.isAssignedToViewer && offer.status === 'waiting_courier')
    : [];

  const earningsResult = await supabase
    .from('earnings')
    .select('id, delivery_id, amount, net_amount, created_at, deliveries(id, order_id, orders(id, restaurants(name)))')
    .eq('driver_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (earningsResult.error) throw earningsResult.error;

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

export async function setDriverAvailability(driverId: string, isOnline: boolean) {
  if (!supabase) return;

  const { error } = await supabase
    .from('drivers')
    .update({ is_online: isOnline, status: isOnline ? 'online' : 'offline' })
    .eq('id', driverId);

  if (error) throw error;
}

export async function acceptDeliveryOffer(deliveryId: string, driverId: string) {
  if (!supabase) return;

  const { error } = await supabase.rpc('accept_available_delivery', {
    target_delivery_id: deliveryId,
    target_driver_id: driverId
  });

  if (error) throw error;
}

export async function updateDeliveryProgress(deliveryId: string, status: DeliveryStatus) {
  if (!supabase) return;

  const patch: Record<string, unknown> = { status };
  if (status === 'arrived_to_restaurant') {
    patch.driver_arrived_restaurant_at = new Date().toISOString();
  }
  if (status === 'arrived_to_client') {
    patch.driver_arrived_client_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('deliveries')
    .update(patch)
    .eq('id', deliveryId);

  if (error) throw error;
}

export async function completeDeliveryProgress(deliveryId: string) {
  if (!supabase) return;

  const { error } = await supabase.rpc('complete_driver_delivery', {
    target_delivery_id: deliveryId
  });

  if (error) throw error;
}

export async function confirmDeliveryPickupQr(deliveryId: string, token: string): Promise<boolean> {
  if (!supabase) return token.trim().length > 0;

  const { data, error } = await supabase.rpc('confirm_delivery_pickup_qr', {
    target_delivery_id: deliveryId,
    presented_token: token
  });

  if (error) throw error;
  return Boolean(data);
}

export function subscribeToDriverRealtime(driverId: string, onChange: () => void) {
  if (!supabase) return () => undefined;

  const channel = supabase
    .channel(`driver-deliveries-${driverId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_status_history' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers', filter: `id=eq.${driverId}` }, onChange)
    .subscribe();

  return () => {
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
    clientName: 'Адам М.',
    clientPhone: '+7 928 123-45-67',
    deliveryComment: 'Подъезд 2, домофон 45К',
    pickupQrToken: createPickupQrToken({
      orderId: offer.orderId,
      driverId,
      nonce: `${now.getTime()}-${expiresAt.getTime()}`
    })
  };
};
