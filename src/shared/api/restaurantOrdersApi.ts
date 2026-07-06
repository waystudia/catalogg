import { supabase } from '../supabase';
import {
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
  clientName: string;
  clientPhone: string;
  fulfillmentType: RestaurantOrderFulfillment;
  cabinLabel: string;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryCity: string;
  deliverySettlement: string;
  restaurantAddress: string;
  restaurantLat: number | null;
  restaurantLng: number | null;
  comment: string;
  status: RestaurantOrderStatus;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  deliveryId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  subtotal: number;
  deliveryFee: number;
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
  customer_name: string;
  customer_phone: string;
  fulfillment_type?: RestaurantOrderFulfillment;
  cabin_label?: string;
  table_label?: string;
  delivery_address?: string;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  restaurant_address_snapshot?: string | null;
  restaurant_lat_snapshot?: number | null;
  restaurant_lng_snapshot?: number | null;
  delivery_city?: string;
  delivery_settlement?: string;
  comment: string;
  status: RestaurantOrderStatus;
  payment_status?: PaymentStatus;
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
    drivers?: MaybeArray<{
      name: string | null;
      phone: string | null;
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

const demoOrders: RestaurantOrder[] = [
  {
    id: 'demo-order-1',
    orderNumber: '1024',
    catalogId: 'demo',
    clientName: 'Гость',
    clientPhone: '+7 999 000-00-00',
    fulfillmentType: 'hall',
    cabinLabel: 'Кабинка №2',
    deliveryAddress: '',
    deliveryLat: null,
    deliveryLng: null,
    deliveryCity: '',
    deliverySettlement: '',
    restaurantAddress: '',
    restaurantLat: null,
    restaurantLng: null,
    comment: 'Без лука',
    status: 'new',
    paymentStatus: 'unpaid',
    deliveryStatus: 'not_required',
    deliveryId: null,
    driverName: null,
    driverPhone: null,
    subtotal: 1180,
    deliveryFee: 0,
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
  customer_name,
  customer_phone,
  fulfillment_type,
  cabin_label,
  table_label,
  delivery_address,
  delivery_lat,
  delivery_lng,
  restaurant_address_snapshot,
  restaurant_lat_snapshot,
  restaurant_lng_snapshot,
  delivery_city,
  delivery_settlement,
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
  deliveries(id, status, driver_id, drivers(name, phone)),
  order_items(id, title, quantity, unit_price, line_total)
`;

const mapOrder = (row: OrderRow): RestaurantOrder => {
  const delivery = row.deliveries?.[0];
  const driver = firstRelation(delivery?.drivers);

  return {
    id: row.id,
    orderNumber: row.id.slice(0, 8).toUpperCase(),
    catalogId: row.catalog_id,
    clientName: row.customer_name,
    clientPhone: row.customer_phone,
    fulfillmentType: row.fulfillment_type ?? 'hall',
    cabinLabel: row.cabin_label || row.table_label || '',
    deliveryAddress: row.delivery_address ?? '',
    deliveryLat: row.delivery_lat ?? null,
    deliveryLng: row.delivery_lng ?? null,
    deliveryCity: row.delivery_city ?? '',
    deliverySettlement: row.delivery_settlement ?? '',
    restaurantAddress: row.restaurant_address_snapshot ?? '',
    restaurantLat: row.restaurant_lat_snapshot ?? null,
    restaurantLng: row.restaurant_lng_snapshot ?? null,
    comment: row.comment,
    status: row.status,
    paymentStatus: row.payment_status ?? 'unpaid',
    deliveryStatus:
      delivery?.status === 'waiting_driver'
        ? 'waiting_courier'
        : delivery?.status ?? (row.fulfillment_type === 'delivery' ? 'waiting_courier' : 'not_required'),
    deliveryId: delivery?.id ?? null,
    driverName: driver?.name ?? null,
    driverPhone: driver?.phone ?? null,
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee,
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

export async function getCatalogIdBySlug(slug: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('catalogs').select('id').eq('slug', slug).maybeSingle();
  if (error || !data) return null;
  return String(data.id);
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
  return ((data ?? []) as unknown as OrderRow[]).map(mapOrder);
}

export async function updateRestaurantOrderStatus(
  order: RestaurantOrder,
  status: RestaurantOrderStatus,
  reason = ''
) {
  if (!supabase) return;
  if (
    status === 'waiting_driver' &&
    !canSendOrderToDelivery({
      orderType: order.fulfillmentType === 'delivery' ? 'delivery' : order.fulfillmentType === 'takeaway' ? 'pickup' : 'dine_in',
      status: 'ready',
      paymentStatus: order.paymentStatus
    })
  ) {
    throw new Error('Подтвердите оплату перед отправкой заказа водителю.');
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === 'accepted' || status === 'confirmed') patch.accepted_at = order.acceptedAt ?? now;
  if (status === 'ready' || status === 'waiting_driver') patch.ready_at = order.readyAt ?? now;
  if (status === 'completed' || status === 'delivered') patch.completed_at = order.completedAt ?? now;
  if (status === 'cancelled' || status === 'canceled') patch.cancellation_reason = reason || 'restaurant_cancelled';

  const { error } = await supabase.from('orders').update(patch).eq('id', order.id).eq('catalog_id', order.catalogId);
  if (error) throw error;

  await supabase.from('order_status_history').insert({
    catalog_id: order.catalogId,
    order_id: order.id,
    from_status: order.status,
    to_status: status,
    reason
  });

  if ((status === 'ready' || status === 'waiting_driver') && order.fulfillmentType === 'delivery') {
    if (status === 'waiting_driver') {
      await supabase.from('deliveries').upsert(
        {
          order_id: order.id,
          delivery_provider: 'platform',
          status: 'waiting_courier',
          route_to_restaurant_url: buildYandexMapsRouteUrl({
            to: {
              lat: order.restaurantLat,
              lng: order.restaurantLng,
              address: order.restaurantAddress
            }
          }),
          route_to_client_url: buildYandexMapsRouteUrl({
            from: {
              lat: order.restaurantLat,
              lng: order.restaurantLng,
              address: order.restaurantAddress
            },
            to: {
              lat: order.deliveryLat,
              lng: order.deliveryLng,
              address: order.deliveryAddress
            }
          }),
          estimated_time_min: 20,
          estimated_time_max: 40
        },
        { onConflict: 'order_id' }
      );
    }

    await supabase.from('delivery_tasks').upsert(
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
  }
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
