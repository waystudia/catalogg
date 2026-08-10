import { supabase } from '../supabase';
import { normalizeDriverCapacity } from '../driverCapacity';
import {
  buildDeliveryDestinationAddress,
  buildYandexMapsRouteUrl,
  canSendOrderToDelivery,
  type DeliveryStatus,
  type PaymentStatus
} from '../../features/order/orderLifecycle';
import {
  createRestaurantOrderWithClient,
  normalizeRestaurantDeliverySettingsForSave,
  type CreateRestaurantOrderFromCartInput
} from './restaurantOrderPayload';
import { getConfiguredDeliveryPrice } from './deliveryPricingApi';
import { resolveStoredDeliveryLocation } from '../deliveryLocation';
import { formatPublicOrderNumber } from '../publicOrderNumber';
import type { RestaurantCourierType } from '../../features/restaurant-billing/restaurantBillingRules';

type MaybeArray<T> = T | T[];

const firstRelation = <T,>(value: MaybeArray<T> | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

export type RestaurantOrderStatus =
  | 'new'
  | 'waiting_payment_confirmation'
  | 'payment_confirmed'
  | 'accepted'
  | 'confirmed'
  | 'preparing'
  | 'cooking'
  | 'ready'
  | 'waiting_driver'
  | 'driver_assigned'
  | 'assigned_driver'
  | 'picked_up'
  | 'on_the_way'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'canceled';

export type RestaurantOrderFulfillment = 'hall' | 'takeaway' | 'delivery';

export type RestaurantOrderItem = {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type RestaurantOrder = {
  id: string;
  orderNumber: string;
  catalogId: string;
  isTestOrder?: boolean;
  clientName: string;
  clientPhone: string;
  fulfillmentType: RestaurantOrderFulfillment;
  cabinLabel: string;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  clientAccuracyM: number | null;
  deliveryCity: string;
  deliverySettlement: string;
  restaurantAddress: string;
  restaurantCity: string;
  restaurantLat: number | null;
  restaurantLng: number | null;
  comment: string;
  status: RestaurantOrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  deliveryId: string | null;
  deliveryUpdatedAt: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverVehicleInfo: string | null;
  driverCarNumber: string | null;
  driverPhotoUrl: string | null;
  driverLat: number | null;
  driverLng: number | null;
  driverLocationAt: string | null;
  restaurantPaymentConfirmedAt: string | null;
  pickupQrConfirmedAt: string | null;
  subtotal: number;
  deliveryFee: number;
  courierPayout: number;
  total: number;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancellationReason: string;
  qrToken: string | null;
  qrExpiresAt: string | null;
  verificationCode: string | null;
  items: RestaurantOrderItem[];
};

export type RestaurantDispatchDriver = {
  id: string;
  name: string;
  phone: string;
  vehicleInfo: string;
  carNumber: string;
  rating: number;
  isOnline: boolean;
  status: string;
  scope: 'restaurant' | 'platform';
  servesOrder: boolean;
  isPrimary: boolean;
  priority: number;
  activeDeliveries: number;
  maxActiveDeliveries: number;
};

export type PublicRestaurantOrderStatus = {
  id: string;
  clientName: string;
  clientPhone: string;
  fulfillmentType: RestaurantOrderFulfillment;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  clientAccuracyM: number | null;
  restaurantName: string;
  restaurantAddress: string;
  restaurantLat: number | null;
  restaurantLng: number | null;
  status: RestaurantOrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  driverName: string;
  driverPhone: string;
  driverLat: number | null;
  driverLng: number | null;
  driverLocationAt: string | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  items: RestaurantOrderItem[];
};

export type RestaurantDeliverySettings = {
  enable_orders: boolean;
  enable_delivery: boolean;
  enable_pickup: boolean;
  enable_hall_orders: boolean;
  use_own_courier: boolean;
  use_platform_drivers: boolean;
  own_courier_wait_minutes: number;
  fallback_to_platform_drivers: boolean;
  qr_required: boolean;
  minimum_order_amount: number;
  free_delivery_from: number;
  default_preparation_minutes: number;
  delivery_radius_km: number;
  delivery_area_mode: 'radius' | 'settlements' | 'hybrid';
  primary_city: string;
  service_settlements: string[];
  delivery_hours_start: string;
  delivery_hours_end: string;
  out_of_hours_mode: 'deny' | 'preorder' | 'warn';
};

export type RestaurantOwnCourier = {
  driverId: string;
  name: string;
  email: string;
  isPrimary: boolean;
  priority: number;
  courierType: RestaurantCourierType | null;
};

const defaultDeliverySettings: RestaurantDeliverySettings = {
  enable_orders: false,
  enable_delivery: true,
  enable_pickup: true,
  enable_hall_orders: true,
  use_own_courier: false,
  use_platform_drivers: false,
  own_courier_wait_minutes: 5,
  fallback_to_platform_drivers: true,
  qr_required: false,
  minimum_order_amount: 0,
  free_delivery_from: 0,
  default_preparation_minutes: 25,
  delivery_radius_km: 5,
  delivery_area_mode: 'radius',
  primary_city: '',
  service_settlements: [],
  delivery_hours_start: '',
  delivery_hours_end: '',
  out_of_hours_mode: 'warn'
};

type OrderRow = {
  id: string;
  catalog_id: string;
  is_test_order?: boolean | null;
  customer_name: string;
  customer_phone: string;
  fulfillment_type?: RestaurantOrderFulfillment;
  cabin_label?: string;
  table_label?: string;
  delivery_address?: string;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  client_accuracy_m?: number | null;
  restaurant_address_snapshot?: string | null;
  restaurant_lat_snapshot?: number | null;
  restaurant_lng_snapshot?: number | null;
  delivery_city?: string;
  delivery_settlement?: string;
  restaurants?: MaybeArray<{
    cities?: MaybeArray<{ name: string | null }> | null;
  }> | null;
  comment: string;
  status: RestaurantOrderStatus;
  payment_status?: PaymentStatus;
  restaurant_payment_confirmed_at?: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  created_at: string;
  accepted_at?: string | null;
  ready_at?: string | null;
  completed_at?: string | null;
  cancellation_reason?: string;
  qr_token?: string | null;
  qr_expires_at?: string | null;
  verification_code?: string | null;
  deliveries?: Array<{
    id: string;
    status: DeliveryStatus | 'waiting_driver';
    driver_id: string | null;
    updated_at?: string | null;
    pickup_qr_confirmed_at?: string | null;
    offered_fee?: number | null;
    drivers?: MaybeArray<{
      name: string | null;
      phone: string | null;
      vehicle_info: string | null;
      car_number: string | null;
      photo_url: string | null;
      last_lat: number | null;
      last_lng: number | null;
      last_location_at: string | null;
    }> | null;
  }>;
  order_items?: Array<{
    id: string;
    title: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

type OrderDeliveryRow = NonNullable<OrderRow['deliveries']>[number];

type DriverLookupRow = {
  order_id?: string;
  id: string;
  delivery_id?: string | null;
  delivery_status?: DeliveryStatus | 'waiting_driver' | null;
  delivery_updated_at?: string | null;
  pickup_qr_confirmed_at?: string | null;
  restaurant_payment_confirmed_at?: string | null;
  name: string | null;
  phone: string | null;
  vehicle_info: string | null;
  car_number: string | null;
  photo_url: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
};

type PublicRestaurantOrderStatusRow = {
  id?: unknown;
  customer_name?: unknown;
  customer_phone?: unknown;
  fulfillment_type?: unknown;
  delivery_address?: unknown;
  delivery_lat?: unknown;
  delivery_lng?: unknown;
  client_accuracy_m?: unknown;
  restaurant_name?: unknown;
  restaurant_address?: unknown;
  restaurant_lat?: unknown;
  restaurant_lng?: unknown;
  status?: unknown;
  payment_status?: unknown;
  delivery_status?: unknown;
  driver_name?: unknown;
  driver_phone?: unknown;
  driver_lat?: unknown;
  driver_lng?: unknown;
  driver_location_at?: unknown;
  subtotal?: unknown;
  delivery_fee?: unknown;
  total?: unknown;
  created_at?: unknown;
  accepted_at?: unknown;
  ready_at?: unknown;
  completed_at?: unknown;
  items?: unknown;
};

type PublicRestaurantOrderStatusItemRow = {
  id?: unknown;
  title?: unknown;
  quantity?: unknown;
  unit_price?: unknown;
  line_total?: unknown;
};

const demoOrders: RestaurantOrder[] = [
  {
    id: 'demo-order-1',
    orderNumber: '1024',
    catalogId: 'demo',
    isTestOrder: true,
    clientName: 'Гость',
    clientPhone: '+7 999 000-00-00',
    fulfillmentType: 'hall',
    cabinLabel: 'Кабинка №2',
    deliveryAddress: '',
    deliveryLat: null,
    deliveryLng: null,
    clientAccuracyM: null,
    deliveryCity: '',
    deliverySettlement: '',
    restaurantAddress: '',
    restaurantCity: '',
    restaurantLat: null,
    restaurantLng: null,
    comment: 'Без лука',
    status: 'new',
    paymentStatus: 'unpaid',
    deliveryStatus: 'not_required',
    deliveryId: null,
    deliveryUpdatedAt: null,
    driverName: null,
    driverPhone: null,
    driverVehicleInfo: null,
    driverCarNumber: null,
    driverPhotoUrl: null,
    driverLat: null,
    driverLng: null,
    driverLocationAt: null,
    restaurantPaymentConfirmedAt: null,
    pickupQrConfirmedAt: null,
    subtotal: 1180,
    deliveryFee: 0,
    courierPayout: 0,
    total: 1180,
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    readyAt: null,
    completedAt: null,
    cancellationReason: '',
    qrToken: null,
    qrExpiresAt: null,
    verificationCode: '4821',
    items: [
      { id: 'demo-item-1', title: 'Шашлык из баранины', quantity: 1, unitPrice: 690, lineTotal: 690 },
      { id: 'demo-item-2', title: 'Чеченский чай', quantity: 2, unitPrice: 245, lineTotal: 490 }
    ]
  }
];

const orderSelect = `
  id,
  catalog_id,
  is_test_order,
  customer_name,
  customer_phone,
  fulfillment_type,
  cabin_label,
  table_label,
  delivery_address,
  delivery_lat,
  delivery_lng,
  client_accuracy_m,
  restaurant_address_snapshot,
  restaurant_lat_snapshot,
  restaurant_lng_snapshot,
  delivery_city,
  delivery_settlement,
  restaurant_id,
  comment,
  status,
  subtotal,
  delivery_fee,
  total,
  created_at,
  accepted_at,
  ready_at,
  completed_at,
  cancellation_reason,
  qr_token,
  qr_expires_at,
  verification_code,
  payment_status,
  restaurant_payment_confirmed_at,
  restaurants(city_id, cities(name)),
  deliveries(id, status, driver_id, updated_at, pickup_qr_confirmed_at, offered_fee, drivers(name, phone, vehicle_info, car_number, photo_url, last_lat, last_lng, last_location_at)),
  order_items(id, title, quantity, unit_price, line_total)
`;

const selectRelevantDelivery = (deliveries: OrderRow['deliveries']) => {
  if (!Array.isArray(deliveries) || deliveries.length === 0) return null;
  return [...deliveries].sort((first, second) => {
    const firstAssigned = Number(Boolean(first.driver_id));
    const secondAssigned = Number(Boolean(second.driver_id));
    if (firstAssigned !== secondAssigned) return secondAssigned - firstAssigned;
    const activeStatuses = ['assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client'];
    const firstActive = Number(activeStatuses.includes(first.status));
    const secondActive = Number(activeStatuses.includes(second.status));
    if (firstActive !== secondActive) return secondActive - firstActive;
    return new Date(second.updated_at ?? 0).getTime() - new Date(first.updated_at ?? 0).getTime();
  })[0] ?? null;
};

const mapOrder = (row: OrderRow, restaurantNameOrSlug = ''): RestaurantOrder => {
  const delivery = selectRelevantDelivery(row.deliveries);
  const driver = firstRelation(delivery?.drivers);
  const deliveryLocation = resolveStoredDeliveryLocation({
    lat: row.delivery_lat,
    lng: row.delivery_lng,
    accuracyM: row.client_accuracy_m,
    note: row.comment
  });
  const restaurantLocation = resolveStoredDeliveryLocation({
    lat: row.restaurant_lat_snapshot,
    lng: row.restaurant_lng_snapshot,
    accuracyM: null,
    note: ''
  });
  const driverLocation = resolveStoredDeliveryLocation({
    lat: driver?.last_lat,
    lng: driver?.last_lng,
    accuracyM: null,
    note: ''
  });

  return {
    id: row.id,
    orderNumber: formatPublicOrderNumber(row.id, restaurantNameOrSlug),
    catalogId: row.catalog_id,
    isTestOrder: row.is_test_order === true,
    clientName: row.customer_name,
    clientPhone: row.customer_phone,
    fulfillmentType: row.fulfillment_type ?? 'hall',
    cabinLabel: row.cabin_label || row.table_label || '',
    deliveryAddress: row.delivery_address ?? '',
    deliveryLat: deliveryLocation?.lat ?? null,
    deliveryLng: deliveryLocation?.lng ?? null,
    clientAccuracyM: deliveryLocation?.accuracyM ?? null,
    deliveryCity: row.delivery_city ?? '',
    deliverySettlement: row.delivery_settlement ?? '',
    restaurantAddress: row.restaurant_address_snapshot ?? '',
    restaurantCity: firstRelation(firstRelation(row.restaurants)?.cities)?.name ?? '',
    restaurantLat: restaurantLocation?.lat ?? null,
    restaurantLng: restaurantLocation?.lng ?? null,
    comment: row.comment,
    status: row.status,
    paymentStatus: row.payment_status ?? 'unpaid',
    deliveryStatus:
      delivery?.status === 'waiting_driver'
        ? 'waiting_courier'
        : delivery?.status ?? (row.fulfillment_type === 'delivery' ? 'waiting_courier' : 'not_required'),
    deliveryId: delivery?.id ?? null,
    deliveryUpdatedAt: delivery?.updated_at ?? null,
    driverName: driver?.name ?? null,
    driverPhone: driver?.phone ?? null,
    driverVehicleInfo: driver?.vehicle_info ?? null,
    driverCarNumber: driver?.car_number ?? null,
    driverPhotoUrl: driver?.photo_url ?? null,
    driverLat: driverLocation?.lat ?? null,
    driverLng: driverLocation?.lng ?? null,
    driverLocationAt: driver?.last_location_at ?? null,
    restaurantPaymentConfirmedAt: row.restaurant_payment_confirmed_at ?? null,
    pickupQrConfirmedAt: delivery?.pickup_qr_confirmed_at ?? null,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
    courierPayout: Number(delivery?.offered_fee ?? 0),
    total: row.total,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at ?? null,
    readyAt: row.ready_at ?? null,
    completedAt: row.completed_at ?? null,
    cancellationReason: row.cancellation_reason ?? '',
    qrToken: row.qr_token ?? null,
    qrExpiresAt: row.qr_expires_at ?? null,
    verificationCode: row.verification_code ?? null,
    items: (row.order_items ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.line_total
    }))
  };
};

const hydrateRestaurantOrderDriver = (order: RestaurantOrder, driver: DriverLookupRow | null): RestaurantOrder => {
  if (!driver) return order;
  const driverLocation = resolveStoredDeliveryLocation({
    lat: driver.last_lat,
    lng: driver.last_lng,
    accuracyM: null,
    note: ''
  });

  return {
    ...order,
    deliveryId: driver.delivery_id ?? order.deliveryId,
    deliveryStatus:
      driver.delivery_status === 'waiting_driver'
        ? 'waiting_courier'
        : driver.delivery_status ?? order.deliveryStatus,
    deliveryUpdatedAt: driver.delivery_updated_at ?? order.deliveryUpdatedAt,
    pickupQrConfirmedAt: driver.pickup_qr_confirmed_at ?? order.pickupQrConfirmedAt,
    restaurantPaymentConfirmedAt:
      driver.restaurant_payment_confirmed_at ?? order.restaurantPaymentConfirmedAt,
    driverName: driver.name ?? order.driverName,
    driverPhone: driver.phone ?? order.driverPhone,
    driverVehicleInfo: driver.vehicle_info ?? order.driverVehicleInfo,
    driverCarNumber: driver.car_number ?? order.driverCarNumber,
    driverPhotoUrl: driver.photo_url ?? order.driverPhotoUrl,
    driverLat: driverLocation?.lat ?? order.driverLat,
    driverLng: driverLocation?.lng ?? order.driverLng,
    driverLocationAt: driver.last_location_at ?? order.driverLocationAt
  };
};

const stringValue = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const nullableStringValue = (value: unknown) => (typeof value === 'string' ? value : null);
const numberValue = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0);
const booleanValue = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : fallback);

type DispatchDriverRow = {
  id: string;
  name: string | null;
  phone: string | null;
  vehicle_info: string | null;
  car_number: string | null;
  service_settlements?: string[] | null;
  city_name?: string | null;
  rating: number | null;
  is_online: boolean | null;
  status: string | null;
  max_active_deliveries?: number | string | null;
};

type RestaurantCourierRow = {
  is_primary?: boolean | null;
  priority?: number | null;
  drivers?: MaybeArray<DispatchDriverRow> | null;
};

const errorText = (error: unknown) => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    return [value.code, value.message, value.details, value.hint]
      .filter((part): part is string => typeof part === 'string')
      .join(' ');
  }
  return '';
};

const relationMissing = (error: unknown) => {
  const text = errorText(error).toLowerCase();
  return (
    text.includes('42p01') ||
    text.includes('pgrst200') ||
    text.includes('pgrst201') ||
    text.includes('could not find') ||
    text.includes('does not exist') ||
    text.includes('schema cache')
  );
};

const normalizeDispatchPlace = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/[ё]/g, 'е')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[^0-9a-zа-я]+/g, ' ')
    .trim();

const placeMatches = (servedPlace: string, city: string, settlement: string) => {
  if (!servedPlace) return false;
  const target = [city, settlement].filter(Boolean).join(' ');
  return (
    (target && target.includes(servedPlace)) ||
    (city && servedPlace.includes(city)) ||
    (settlement && servedPlace.includes(settlement))
  );
};

const driverServesOrder = (driver: DispatchDriverRow, order: Pick<RestaurantOrder, 'deliveryCity' | 'deliverySettlement'>) => {
  const city = normalizeDispatchPlace(order.deliveryCity);
  const settlement = normalizeDispatchPlace(order.deliverySettlement);
  const driverCity = normalizeDispatchPlace(driver.city_name ?? '');
  const serviceSettlements = Array.isArray(driver.service_settlements)
    ? driver.service_settlements.map((item) => normalizeDispatchPlace(item)).filter(Boolean)
    : [];

  if (!driverCity && serviceSettlements.length === 0) return true;
  return placeMatches(driverCity, city, settlement) || serviceSettlements.some((place) => placeMatches(place, city, settlement));
};

const mapDispatchDriver = (
  row: DispatchDriverRow,
  order: Pick<RestaurantOrder, 'deliveryCity' | 'deliverySettlement'>,
  scope: RestaurantDispatchDriver['scope'],
  assignment?: Pick<RestaurantCourierRow, 'is_primary' | 'priority'>
): RestaurantDispatchDriver => ({
  id: row.id,
  name: row.name ?? 'Водитель',
  phone: row.phone ?? '',
  vehicleInfo: row.vehicle_info ?? '',
  carNumber: row.car_number ?? '',
  rating: Number(row.rating ?? 5),
  isOnline: booleanValue(row.is_online),
  status: row.status ?? 'offline',
  scope,
  servesOrder: driverServesOrder(row, order),
  isPrimary: assignment?.is_primary ?? false,
  priority: Number(assignment?.priority ?? 100),
  activeDeliveries: 0,
  maxActiveDeliveries: normalizeDriverCapacity(row.max_active_deliveries)
});

const uniqueDispatchDrivers = (drivers: RestaurantDispatchDriver[]) => {
  const byId = new Map<string, RestaurantDispatchDriver>();
  for (const driver of drivers) {
    const current = byId.get(driver.id);
    if (!current || current.scope !== 'restaurant') {
      byId.set(driver.id, driver);
    }
  }
  return Array.from(byId.values());
};

const mapPublicOrderStatus = (row: PublicRestaurantOrderStatusRow): PublicRestaurantOrderStatus => ({
  id: stringValue(row.id),
  clientName: stringValue(row.customer_name, 'Гость'),
  clientPhone: stringValue(row.customer_phone),
  fulfillmentType: stringValue(row.fulfillment_type, 'hall') as RestaurantOrderFulfillment,
  deliveryAddress: stringValue(row.delivery_address),
  deliveryLat: row.delivery_lat == null ? null : numberValue(row.delivery_lat),
  deliveryLng: row.delivery_lng == null ? null : numberValue(row.delivery_lng),
  clientAccuracyM: row.client_accuracy_m == null ? null : numberValue(row.client_accuracy_m),
  restaurantName: stringValue(row.restaurant_name, 'Ресторан'),
  restaurantAddress: stringValue(row.restaurant_address),
  restaurantLat: row.restaurant_lat == null ? null : numberValue(row.restaurant_lat),
  restaurantLng: row.restaurant_lng == null ? null : numberValue(row.restaurant_lng),
  status: stringValue(row.status, 'new') as RestaurantOrderStatus,
  paymentStatus: stringValue(row.payment_status, 'unpaid') as PaymentStatus,
  deliveryStatus: stringValue(row.delivery_status, 'not_required') as DeliveryStatus,
  driverName: stringValue(row.driver_name),
  driverPhone: stringValue(row.driver_phone),
  driverLat: row.driver_lat == null ? null : numberValue(row.driver_lat),
  driverLng: row.driver_lng == null ? null : numberValue(row.driver_lng),
  driverLocationAt: nullableStringValue(row.driver_location_at),
  subtotal: numberValue(row.subtotal),
  deliveryFee: numberValue(row.delivery_fee),
  total: numberValue(row.total),
  createdAt: stringValue(row.created_at, new Date().toISOString()),
  acceptedAt: nullableStringValue(row.accepted_at),
  readyAt: nullableStringValue(row.ready_at),
  completedAt: nullableStringValue(row.completed_at),
  items: (Array.isArray(row.items) ? row.items : []).map((item) => {
    const orderItem = item as PublicRestaurantOrderStatusItemRow;
    return {
      id: stringValue(orderItem.id),
      title: stringValue(orderItem.title),
      quantity: numberValue(orderItem.quantity),
      unitPrice: numberValue(orderItem.unit_price),
      lineTotal: numberValue(orderItem.line_total)
    };
  })
});

const catalogIdBySlugCache = new Map<string, string>();

export async function getCatalogIdBySlug(slug: string) {
  if (!supabase) return null;
  const normalizedSlug = slug.trim().toLowerCase();
  const cachedCatalogId = catalogIdBySlugCache.get(normalizedSlug);
  if (cachedCatalogId) return cachedCatalogId;
  const { data, error } = await supabase.from('catalogs').select('id').eq('slug', normalizedSlug).maybeSingle();
  if (error || !data) return null;
  const catalogId = String(data.id);
  catalogIdBySlugCache.set(normalizedSlug, catalogId);
  return catalogId;
}

const mapRestaurantOwnCourier = (row: {
  driver_id: string;
  driver_name: string | null;
  driver_email: string | null;
  is_primary: boolean | null;
  priority: number | string | null;
  courier_type: RestaurantCourierType | null;
}): RestaurantOwnCourier => ({
  driverId: row.driver_id,
  name: row.driver_name?.trim() || 'Водитель',
  email: row.driver_email?.trim() || '',
  isPrimary: row.is_primary ?? false,
  priority: Number(row.priority ?? 100),
  courierType: row.courier_type ?? null
});

export async function getRestaurantOwnCouriers(catalogSlug: string): Promise<RestaurantOwnCourier[]> {
  if (!supabase) return [];
  const catalogId = await getCatalogIdBySlug(catalogSlug);
  if (!catalogId) throw new Error('Каталог ресторана не найден');
  const { data, error } = await supabase.rpc('get_restaurant_couriers_for_catalog', {
    target_catalog_id: catalogId
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Parameters<typeof mapRestaurantOwnCourier>[0]>).map(mapRestaurantOwnCourier);
}

export async function linkRestaurantCourierByEmail(
  catalogSlug: string,
  email: string,
  courierType: RestaurantCourierType
): Promise<RestaurantOwnCourier> {
  if (!supabase) {
    return { driverId: 'driver-demo', name: 'Демо-водитель', email: email.trim(), courierType, isPrimary: false, priority: 10 };
  }
  const catalogId = await getCatalogIdBySlug(catalogSlug);
  if (!catalogId) throw new Error('Каталог ресторана не найден');
  const { data, error } = await supabase.rpc('link_restaurant_courier_by_email', {
    target_catalog_id: catalogId,
    target_email: email.trim().toLowerCase(),
    target_courier_type: courierType
  });
  if (error) throw new Error(error.message);
  const row = (data as Array<Parameters<typeof mapRestaurantOwnCourier>[0]> | null)?.[0];
  if (!row) throw new Error('Не удалось привязать водителя');
  return mapRestaurantOwnCourier(row);
}

export async function updateRestaurantCourierType(
  catalogSlug: string,
  driverId: string,
  courierType: RestaurantCourierType
): Promise<void> {
  if (!supabase) return;
  const catalogId = await getCatalogIdBySlug(catalogSlug);
  if (!catalogId) throw new Error('Каталог ресторана не найден');
  const { error } = await supabase.rpc('update_restaurant_courier_type', {
    target_catalog_id: catalogId,
    target_driver_id: driverId,
    target_courier_type: courierType
  });
  if (error) throw new Error(error.message);
}

export async function removeRestaurantCourier(catalogSlug: string, driverId: string) {
  if (!supabase) return;
  const catalogId = await getCatalogIdBySlug(catalogSlug);
  if (!catalogId) throw new Error('Каталог ресторана не найден');
  const { error } = await supabase.rpc('remove_restaurant_courier', {
    target_catalog_id: catalogId,
    target_driver_id: driverId
  });
  if (error) throw new Error(error.message);
}

export async function getRestaurantOrders(slug: string): Promise<RestaurantOrder[]> {
  if (!supabase) return demoOrders;
  const catalogId = await getCatalogIdBySlug(slug);
  if (!catalogId) return [];

  const { data, error } = await supabase
    .from('orders')
    .select(orderSelect)
    .eq('catalog_id', catalogId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = ((data ?? []) as unknown as OrderRow[]);
  const mappedOrders = rows.map((row) => mapOrder(row, slug));
  const ordersMissingDriver = mappedOrders.filter(
    (order) =>
      order.fulfillmentType === 'delivery' &&
      !order.driverName &&
      ['driver_assigned', 'assigned_driver', 'picked_up', 'on_the_way'].includes(order.status)
  );
  if (ordersMissingDriver.length === 0) return mappedOrders;

  const missingDriverIds = Array.from(
    new Set(
      rows
        .map((row) => selectRelevantDelivery(row.deliveries))
        .filter((delivery): delivery is OrderDeliveryRow => Boolean(delivery?.driver_id))
        .filter((delivery) => {
          const driver = firstRelation(delivery.drivers);
          return !driver?.name;
        })
        .map((delivery) => String(delivery.driver_id))
    )
  );

  const driverRpcResult = await supabase.rpc('get_restaurant_assigned_drivers', {
    target_catalog_id: catalogId
  });
  if (driverRpcResult.error) {
    console.warn('Assigned restaurant drivers RPC failed; using the legacy table fallback.', driverRpcResult.error);
  }
  const driversResult = driverRpcResult.error && missingDriverIds.length > 0
    ? await supabase
        .from('drivers')
        .select('id, name, phone, vehicle_info, car_number, photo_url, last_lat, last_lng, last_location_at')
        .in('id', missingDriverIds)
    : driverRpcResult;

  if (driversResult.error) return mappedOrders;

  const driverRows = (driversResult.data ?? []) as DriverLookupRow[];
  const driversByOrderId = new Map(
    driverRows
      .filter((driver) => driver.order_id)
      .map((driver) => [String(driver.order_id), driver])
  );
  const driversById = new Map(
    driverRows.map((driver) => [driver.id, driver])
  );

  return mappedOrders.map((order, index) => {
    const driverByOrder = driversByOrderId.get(order.id);
    if (driverByOrder && !order.driverName) {
      return hydrateRestaurantOrderDriver(order, driverByOrder);
    }
    const delivery = selectRelevantDelivery(rows[index]?.deliveries);
    const driverId = delivery?.driver_id ?? null;
    if (!driverId || order.driverName) return order;
    return hydrateRestaurantOrderDriver(order, driversById.get(driverId) ?? null);
  });
}

export async function deleteRestaurantPreactivationOrder(order: Pick<RestaurantOrder, 'id' | 'catalogId'>) {
  if (!supabase) return true;
  const { data, error } = await supabase.rpc('delete_restaurant_preactivation_order', {
    target_order_id: order.id,
    target_catalog_id: order.catalogId
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function deleteRestaurantTestOrder(
  order: Pick<RestaurantOrder, 'id' | 'catalogId'> & Partial<Pick<RestaurantOrder, 'isTestOrder'>>
) {
  if (order.isTestOrder !== true) return deleteRestaurantPreactivationOrder(order);
  if (!supabase) return true;
  const { data, error } = await supabase.rpc('delete_restaurant_test_order', {
    target_order_id: order.id,
    target_catalog_id: order.catalogId
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function getRestaurantDispatchDrivers(order: RestaurantOrder): Promise<RestaurantDispatchDriver[]> {
  if (!supabase) {
    return [
      {
        id: 'driver-demo',
        name: 'Алан М.',
        phone: '+7 928 123-45-67',
        vehicleInfo: 'Hyundai Solaris',
        carNumber: 'A123BC 95',
        rating: 4.9,
        isOnline: true,
        status: 'online',
        scope: 'restaurant',
        servesOrder: true,
        isPrimary: true,
        priority: 1,
        activeDeliveries: 0,
        maxActiveDeliveries: 2
      }
    ];
  }

  const driverSelect = 'id, name, phone, vehicle_info, car_number, city_name, service_settlements, rating, is_online, status, max_active_deliveries';
  const restaurantResult = await supabase
    .from('restaurants')
    .select('id')
    .eq('catalog_id', order.catalogId);

  if (restaurantResult.error) throw restaurantResult.error;
  const restaurantIds = ((restaurantResult.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  let restaurantDrivers: RestaurantDispatchDriver[] = [];

  if (restaurantIds.length > 0) {
    const ownResult = await supabase
      .from('restaurant_couriers')
      .select(`is_primary, priority, drivers(${driverSelect})`)
      .in('restaurant_id', restaurantIds)
      .eq('is_active', true);

    if (ownResult.error && !relationMissing(ownResult.error)) throw ownResult.error;

    restaurantDrivers = ((ownResult.data ?? []) as unknown as RestaurantCourierRow[])
      .map((row) => ({ row, driver: firstRelation(row.drivers) }))
      .filter((item): item is { row: RestaurantCourierRow; driver: DispatchDriverRow } => Boolean(item.driver))
      .map(({ row, driver }) => mapDispatchDriver(driver, order, 'restaurant', row))
      .sort((first, second) => Number(second.isPrimary) - Number(first.isPrimary) || first.priority - second.priority);
  }

  const platformResult = await supabase
    .from('drivers')
    .select(driverSelect)
    .eq('is_active', true)
    .eq('is_online', true)
    .order('rating', { ascending: false });

  if (platformResult.error) throw platformResult.error;

  const platformDrivers = ((platformResult.data ?? []) as unknown as DispatchDriverRow[])
    .map((driver) => mapDispatchDriver(driver, order, 'platform'))
    .filter((driver) => driver.servesOrder);

  const drivers = uniqueDispatchDrivers([...restaurantDrivers, ...platformDrivers]);
  const driverIds = drivers.map((driver) => driver.id);
  if (driverIds.length === 0) return drivers;

  const activeResult = await supabase
    .from('deliveries')
    .select('driver_id')
    .in('driver_id', driverIds)
    .in('status', ['assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client']);
  if (activeResult.error) throw activeResult.error;

  const activeCounts = new Map<string, number>();
  for (const row of (activeResult.data ?? []) as Array<{ driver_id: string | null }>) {
    if (!row.driver_id) continue;
    activeCounts.set(row.driver_id, (activeCounts.get(row.driver_id) ?? 0) + 1);
  }

  return drivers.map((driver) => ({
    ...driver,
    activeDeliveries: activeCounts.get(driver.id) ?? 0
  }));
}

export function subscribeToRestaurantOrdersRealtime(catalogId: string | null | undefined, onChange: () => void) {
  if (!supabase || !catalogId) return () => undefined;

  const channel = supabase
    .channel(`restaurant-orders-${catalogId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `catalog_id=eq.${catalogId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_status_history', filter: `catalog_id=eq.${catalogId}` }, onChange)
    .subscribe();

  return () => {
    void supabase?.removeChannel(channel);
  };
}

export async function getPublicRestaurantOrderStatus(orderId: string): Promise<PublicRestaurantOrderStatus | null> {
  if (!supabase) return null;
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) return null;

  const { data, error } = await supabase.rpc('get_public_restaurant_order_status', {
    target_order_id: normalizedOrderId
  });

  if (error) throw error;
  if (!data || typeof data !== 'object') return null;

  return mapPublicOrderStatus(data as PublicRestaurantOrderStatusRow);
}

export type PublicOrderTracking = {
  driverName: string;
  driverPhone: string;
  driverLat: number | null;
  driverLng: number | null;
  driverLocationAt: string | null;
  deliveryStatus: DeliveryStatus;
};

export async function getPublicOrderTracking(orderId: string): Promise<PublicOrderTracking | null> {
  if (!supabase || !orderId.trim()) return null;
  const { data, error } = await supabase.rpc('get_public_order_tracking', { target_order_id: orderId.trim() });
  if (error || !data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return {
    driverName: stringValue(row.driver_name),
    driverPhone: stringValue(row.driver_phone),
    driverLat: row.driver_lat == null ? null : numberValue(row.driver_lat),
    driverLng: row.driver_lng == null ? null : numberValue(row.driver_lng),
    driverLocationAt: nullableStringValue(row.driver_location_at),
    deliveryStatus: stringValue(row.delivery_status, 'waiting_courier') as DeliveryStatus
  };
}

export async function updateRestaurantOrderStatus(
  order: RestaurantOrder,
  status: RestaurantOrderStatus,
  reason = ''
) {
  if (!supabase) return;
  const persistedStatus = status === 'cancelled' ? 'canceled' : status;
  if (
    status === 'waiting_driver' &&
    !canSendOrderToDelivery({
      orderType: order.fulfillmentType === 'delivery' ? 'delivery' : order.fulfillmentType === 'takeaway' ? 'pickup' : 'dine_in',
      status: 'ready',
      paymentStatus: order.paymentStatus
    })
  ) {
    throw new Error('Укажите способ оплаты или подтвердите оплату перед отправкой заказа водителю.');
  }

  if (status === 'waiting_driver' && order.fulfillmentType === 'delivery') {
    const settingsResult = await supabase
      .from('restaurant_delivery_settings')
      .select('primary_city')
      .eq('catalog_id', order.catalogId)
      .maybeSingle();
    if (settingsResult.error) throw settingsResult.error;

    const restaurantSettlement = settingsResult.data?.primary_city || order.restaurantCity;
    const configuredDeliveryFee = await getConfiguredDeliveryPrice(restaurantSettlement, order.deliverySettlement);
    const deliveryPayload = {
      order_id: order.id,
      delivery_provider: 'platform',
      status: 'waiting_courier',
      route_to_restaurant_url: buildYandexMapsRouteUrl({
        to: { lat: order.restaurantLat, lng: order.restaurantLng, address: order.restaurantAddress }
      }),
      route_to_client_url: buildYandexMapsRouteUrl({
        from: { lat: order.restaurantLat, lng: order.restaurantLng, address: order.restaurantAddress },
        to: {
          lat: order.deliveryLat,
          lng: order.deliveryLng,
          address: buildDeliveryDestinationAddress({
            address: order.deliveryAddress,
            settlement: order.deliverySettlement,
            city: order.deliveryCity
          })
        }
      }),
      offered_fee: configuredDeliveryFee ?? order.deliveryFee,
      pricing_status: configuredDeliveryFee === null ? 'pending' : 'offered'
    } as const;

    const dispatchResult = await supabase.rpc('dispatch_restaurant_order_to_delivery', {
      target_order_id: order.id,
      target_catalog_id: order.catalogId,
      route_to_restaurant_url_input: deliveryPayload.route_to_restaurant_url,
      route_to_client_url_input: deliveryPayload.route_to_client_url,
      offered_fee_input: deliveryPayload.offered_fee,
      pricing_status_input: deliveryPayload.pricing_status
    });

    if (!dispatchResult.error) return;

    const rpcErrorText = `${dispatchResult.error.code ?? ''} ${dispatchResult.error.message ?? ''}`.toLowerCase();
    const isMissingDispatchRpc =
      rpcErrorText.includes('pgrst202') ||
      rpcErrorText.includes('could not find the function') ||
      rpcErrorText.includes('function not found');
    if (!isMissingDispatchRpc) throw dispatchResult.error;

    // Compatibility path for deployments where the atomic RPC has not reached PostgREST yet.
    const deliveryResult = await supabase.from('deliveries').upsert(
      { ...deliveryPayload, estimated_time_min: 20, estimated_time_max: 40 },
      { onConflict: 'order_id' }
    );
    if (deliveryResult.error) throw deliveryResult.error;

    const deliveryTaskResult = await supabase.from('delivery_tasks').upsert(
      {
        catalog_id: order.catalogId,
        order_id: order.id,
        delivery_status: 'waiting_driver',
        address: order.deliveryAddress,
        city: order.deliveryCity,
        settlement: order.deliverySettlement,
        qr_required: Boolean(order.qrToken || order.verificationCode)
      },
      { onConflict: 'order_id' }
    );
    if (deliveryTaskResult.error) throw deliveryTaskResult.error;
  }

  const { error } = await supabase.rpc('update_restaurant_order_status', {
    target_order_id: order.id,
    target_catalog_id: order.catalogId,
    next_status: persistedStatus,
    status_reason: reason
  });
  if (error) throw error;
}

export async function confirmRestaurantCashPayment(order: RestaurantOrder): Promise<boolean> {
  if (!supabase) return true;

  const { data, error } = await supabase.rpc('confirm_restaurant_cash_payment', {
    target_order_id: order.id
  });
  if (error) throw error;
  return Boolean(data);
}

export async function assignRestaurantOrderDriver(order: RestaurantOrder, driverId: string) {
  if (!supabase) return;
  if (!order.deliveryId) throw new Error('Сначала вызовите доставку, чтобы создать задачу для водителя.');

  const assignmentResult = await supabase.rpc('assign_restaurant_delivery_driver', {
    target_delivery_id: order.deliveryId,
    target_catalog_id: order.catalogId,
    target_driver_id: driverId
  });
  if (assignmentResult.error) throw assignmentResult.error;
}

export async function sendRestaurantOrderToDriverPool(order: RestaurantOrder) {
  if (!supabase) return;
  if (!order.deliveryId) {
    await updateRestaurantOrderStatus(order, 'waiting_driver');
    return;
  }

  const deliveryResult = await supabase
    .from('deliveries')
    .update({
      driver_id: null,
      status: 'waiting_courier',
      delivery_provider: 'platform',
      assigned_at: null,
      pickup_qr_token: null,
      pickup_qr_expires_at: null
    })
    .eq('id', order.deliveryId)
    .eq('order_id', order.id);

  if (deliveryResult.error) throw deliveryResult.error;

  const orderResult = await supabase
    .from('orders')
    .update({ status: 'waiting_driver' })
    .eq('id', order.id)
    .eq('catalog_id', order.catalogId);

  if (orderResult.error) throw orderResult.error;
}

export async function updateRestaurantOrderPaymentStatus(
  order: RestaurantOrder,
  paymentStatus: PaymentStatus
) {
  if (!supabase) return;

  const patch: Record<string, unknown> = { payment_status: paymentStatus };
  if (paymentStatus === 'confirmed') {
    patch.restaurant_payment_confirmed_at = new Date().toISOString();
    if (order.status === 'waiting_payment_confirmation') {
      patch.status = 'payment_confirmed';
    }
  }

  const { error } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', order.id)
    .eq('catalog_id', order.catalogId);

  if (error) throw error;
}

export async function getRestaurantDeliverySettings(slug: string): Promise<RestaurantDeliverySettings> {
  if (!supabase) return defaultDeliverySettings;
  const catalogId = await getCatalogIdBySlug(slug);
  if (!catalogId) return defaultDeliverySettings;

  const { data, error } = await supabase
    .from('restaurant_delivery_settings')
    .select('*')
    .eq('catalog_id', catalogId)
    .maybeSingle();

  if (error) throw error;
  const nextData = { ...defaultDeliverySettings, ...(data ?? {}) } as RestaurantDeliverySettings;
  return {
    ...nextData,
    service_settlements: Array.isArray(nextData.service_settlements) ? nextData.service_settlements.filter(Boolean) : [],
    delivery_hours_start: nextData.delivery_hours_start ?? '',
    delivery_hours_end: nextData.delivery_hours_end ?? ''
  };
}

export async function saveRestaurantDeliverySettings(slug: string, settings: RestaurantDeliverySettings) {
  if (!supabase) return;
  const catalogId = await getCatalogIdBySlug(slug);
  if (!catalogId) return;

  const { error } = await supabase
    .from('restaurant_delivery_settings')
    .upsert({ catalog_id: catalogId, ...normalizeRestaurantDeliverySettingsForSave(settings) }, { onConflict: 'catalog_id' });

  if (error) throw error;
}

export async function createRestaurantOrderFromCart(input: CreateRestaurantOrderFromCartInput) {
  if (!supabase) return null;
  const { slug } = input;
  const catalogId = await getCatalogIdBySlug(slug);
  if (!catalogId) return null;

  return createRestaurantOrderWithClient(supabase, catalogId, input);
}
