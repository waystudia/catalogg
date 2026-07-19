import {
  buildDeliveryDestinationAddress,
  buildDriverDeliveryView,
  createPickupQrToken,
  type DeliveryStatus,
  type DriverDeliveryView,
  type DriverStatus,
  type OrderLifecycleSnapshot
} from '../../features/order/orderLifecycle';
import { clearPwaResumePath } from '../pwaSession';
import { parseRestaurantCoordinatesFromMapLink } from '../restaurantLocation';
import { supabase } from '../supabase';

export type DriverProfile = {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly vehicleInfo: string;
  readonly carNumber: string;
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
  readonly deliveryId: string;
  readonly orderNumber: string;
  readonly createdAt: string;
  readonly itemsCount: number;
  readonly orderTotal: number;
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
  offered_fee: number | null;
  pricing_status: 'pending' | 'offered' | 'countered' | 'accepted' | 'rejected' | null;
  created_at: string;
  orders?: MaybeArray<{
    id: string;
    order_type: OrderLifecycleSnapshot['orderType'];
    fulfillment_type?: 'hall' | 'takeaway' | 'delivery' | null;
    status: OrderLifecycleSnapshot['status'];
    payment_status: OrderLifecycleSnapshot['paymentStatus'];
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
  photo_url: string | null;
  service_settlements?: string[] | null;
  rating: number | null;
  status: DriverStatus | null;
  is_online: boolean | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
};

type DriverUserRow = {
  id: string;
  auth_user_id: string | null;
  email?: string | null;
  role?: string | null;
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
    deliveryId: 'delivery-demo-1',
    orderNumber: 'R2347',
    createdAt: new Date().toISOString(),
    itemsCount: 3,
    orderTotal: 1640,
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
    orderNumber: 'M2346',
    createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    itemsCount: 2,
    orderTotal: 1180,
    paymentLabel: 'Оплата онлайн',
    restaurantLogoUrl: '',
    routeEtaMin: 12
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

const restaurantInitials: Record<string, string> = {
  А: 'A',
  Б: 'B',
  В: 'V',
  Г: 'G',
  Д: 'D',
  Е: 'E',
  Ё: 'E',
  Ж: 'Z',
  З: 'Z',
  И: 'I',
  Й: 'I',
  К: 'K',
  Л: 'L',
  М: 'M',
  Н: 'N',
  О: 'O',
  П: 'P',
  Р: 'R',
  С: 'S',
  Т: 'T',
  У: 'U',
  Ф: 'F',
  Х: 'H',
  Ц: 'C',
  Ч: 'C',
  Ш: 'S',
  Щ: 'S',
  Ы: 'Y',
  Э: 'E',
  Ю: 'U',
  Я: 'Y'
};

const orderNumberPrefix = (restaurantName?: string | null) => {
  const first = restaurantName?.trim().charAt(0).toUpperCase() || 'W';
  return /^[A-Z]$/.test(first) ? first : restaurantInitials[first] ?? 'W';
};

const orderNumberSequence = (orderId: string) => {
  const hash = Array.from(orderId).reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 7);
  return String((hash % 9999) + 1).padStart(4, '0');
};

const orderNumber = (orderId: string, restaurantName?: string | null) =>
  `${orderNumberPrefix(restaurantName)}${orderNumberSequence(orderId)}`;

const rowToOffer = (row: DeliveryRow, viewerDriverId: string): DeliveryOffer | null => {
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
    deliveryId: row.id,
    orderNumber: orderNumber(row.order_id, restaurant?.name),
    createdAt: order.created_at,
    itemsCount: (order.order_items ?? []).reduce((sum, item) => sum + Math.max(1, Number(item.quantity ?? 1)), 0),
    orderTotal: Number(order.total ?? order.total_amount ?? 0),
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
    orderNumber: orderNumber(delivery?.order_id ?? row.delivery_id, restaurant?.name),
    restaurantName: restaurant?.name ?? 'Ресторан',
    amount: Number(row.net_amount ?? row.amount),
    completedAt: row.created_at
  };
};

export const getAuthenticatedDriverId = async (): Promise<string | null> => {
  if (!supabase) return demoDriverId;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const authUser = sessionData.session?.user;
  if (sessionError || !authUser?.id) return null;

  const { data: rpcDriverId, error: rpcDriverError } = await supabase.rpc('current_driver_id');
  if (!rpcDriverError && typeof rpcDriverId === 'string' && rpcDriverId) {
    return rpcDriverId;
  }

  const metadataDriverId =
    typeof authUser.app_metadata?.driver_id === 'string' ? authUser.app_metadata.driver_id : '';
  if (metadataDriverId) {
    return metadataDriverId;
  }

  const metadataPublicUserId =
    typeof authUser.app_metadata?.public_user_id === 'string' ? authUser.app_metadata.public_user_id : '';
  if (metadataPublicUserId) {
    const { data: metadataDriver, error: metadataDriverError } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', metadataPublicUserId)
      .maybeSingle();
    if (!metadataDriverError && metadataDriver) return (metadataDriver as Pick<DriverRow, 'id'>).id;
  }

  const { data: publicUserByAuth, error: publicUserByAuthError } = await supabase
    .from('users')
    .select('id, auth_user_id, email, role')
    .eq('auth_user_id', authUser.id)
    .eq('role', 'driver')
    .maybeSingle();
  const publicUsers: DriverUserRow[] = [];
  if (!publicUserByAuthError && publicUserByAuth) {
    publicUsers.push(publicUserByAuth as DriverUserRow);
  }

  if (authUser.email) {
    const { data: publicUserByEmail, error: publicUserByEmailError } = await supabase
      .from('users')
      .select('id, auth_user_id, email, role')
      .eq('email', authUser.email.trim().toLowerCase())
      .eq('role', 'driver')
      .maybeSingle();
    if (!publicUserByEmailError && publicUserByEmail) {
      publicUsers.push(publicUserByEmail as DriverUserRow);
    }
  }

  for (const publicUser of publicUsers) {
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', publicUser.id)
      .maybeSingle();
    if (!driverError && driver) return (driver as Pick<DriverRow, 'id'>).id;
  }

  return null;
};

const resolveCurrentDriverId = async (fallbackDriverId: string) => {
  if (!supabase || fallbackDriverId !== demoDriverId) return fallbackDriverId;
  return (await getAuthenticatedDriverId()) ?? fallbackDriverId;
};

export async function getDriverDashboard(driverId = demoDriverId): Promise<DriverDashboardSnapshot> {
  if (!supabase) return buildDemoSnapshot();

  const resolvedDriverId = await resolveCurrentDriverId(driverId);
  const [driverResult, deliveriesResult, earningsResult] = await Promise.all([
    supabase
      .from('drivers')
      .select('id, name, phone, vehicle_info, car_number, photo_url, service_settlements, rating, status, is_online, last_lat, last_lng, last_location_at')
      .eq('id', resolvedDriverId)
      .maybeSingle(),
    supabase.rpc('get_driver_delivery_offers'),
    supabase
      .from('earnings')
      .select('id, delivery_id, amount, net_amount, created_at, deliveries(id, order_id, orders(id, restaurants(name)))')
      .eq('driver_id', resolvedDriverId)
      .order('created_at', { ascending: false })
      .limit(30)
  ]);

  if (driverResult.error) throw driverResult.error;
  const profile = rowToDriverProfile(driverResult.data as DriverRow | null);

  if (deliveriesResult.error) throw deliveriesResult.error;
  if (earningsResult.error) throw earningsResult.error;

  let offers = ((deliveriesResult.data ?? []) as unknown as DeliveryRow[])
    .map((row) => rowToOffer(row, profile.id))
    .filter((offer): offer is DeliveryOffer => Boolean(offer));

  const assignedOrderIds = Array.from(new Set(offers
    .filter((offer) => offer.isAssignedToViewer)
    .map((offer) => offer.orderId)));
  if (assignedOrderIds.length > 0) {
    const contactsResult = await supabase
      .from('orders')
      .select('id, catalog_id, restaurant_id, customer_name, customer_phone, client_name, client_phone, delivery_comment, delivery_comment_snapshot, client_address_comment, comment, restaurant_address_snapshot, restaurant_lat_snapshot, restaurant_lng_snapshot')
      .in('id', assignedOrderIds);

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
    ? offers.filter((offer) => !offer.isAssignedToViewer && offer.status === 'waiting_courier')
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

  const { data, error } = await supabase.rpc('set_current_driver_availability', {
    next_is_online: isOnline
  });

  if (error) throw error;
  if (data !== isOnline) throw new Error('Онлайн-статус не был сохранён');
}

export async function updateDriverLocation(
  driverId: string,
  location: { lat: number; lng: number; accuracy?: number | null }
) {
  if (!supabase) return;

  const { error } = await supabase
    .from('drivers')
    .update({
      last_lat: location.lat,
      last_lng: location.lng,
      last_location_accuracy: location.accuracy ?? null,
      last_location_at: new Date().toISOString()
    })
    .eq('id', driverId);

  if (error) throw error;
}

export async function signOutDriver() {
  clearPwaResumePath();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function saveDriverServiceSettlements(driverId: string, serviceSettlements: readonly string[]) {
  if (!supabase) return;

  const { error } = await supabase
    .from('drivers')
    .update({ service_settlements: [...serviceSettlements] })
    .eq('id', driverId);

  if (error) throw error;
}

export async function changeDriverPassword(newPassword: string) {
  if (!supabase) return;

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function acceptDeliveryOffer(deliveryId: string) {
  if (!supabase) return;

  const { error } = await supabase.rpc('accept_available_delivery', {
    target_delivery_id: deliveryId
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

  if (!error) return;

  const errorText = error instanceof Error ? error.message : String(error);
  const liveSchemaRejectsClientArrival =
    status === 'arrived_to_client' &&
    /deliveries_status_check|check constraint|violates.*constraint/i.test(errorText);
  if (liveSchemaRejectsClientArrival) return;

  throw error;
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

export async function confirmDriverPickup(deliveryId: string): Promise<boolean> {
  if (!supabase) return true;

  const { data, error } = await supabase.rpc('confirm_driver_pickup', {
    target_delivery_id: deliveryId
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
