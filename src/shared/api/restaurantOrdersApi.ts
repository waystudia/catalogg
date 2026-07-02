import { supabase } from '../supabase';
import type { CartItem } from '../../entities/models';

export type RestaurantOrderStatus =
  | 'new'
  | 'accepted'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'waiting_driver'
  | 'driver_assigned'
  | 'on_the_way'
  | 'delivered'
  | 'completed'
  | 'cancelled';

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
  deliveryCity: string;
  deliverySettlement: string;
  comment: string;
  status: RestaurantOrderStatus;
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
  enable_delivery: false,
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
  delivery_city?: string;
  delivery_settlement?: string;
  comment: string;
  status: RestaurantOrderStatus;
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
    deliveryCity: '',
    deliverySettlement: '',
    comment: 'Без лука',
    status: 'new',
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
  order_items(id, title, quantity, unit_price, line_total)
`;

const mapOrder = (row: OrderRow): RestaurantOrder => ({
  id: row.id,
  orderNumber: row.id.slice(0, 8).toUpperCase(),
  catalogId: row.catalog_id,
  clientName: row.customer_name,
  clientPhone: row.customer_phone,
  fulfillmentType: row.fulfillment_type ?? 'hall',
  cabinLabel: row.cabin_label || row.table_label || '',
  deliveryAddress: row.delivery_address ?? '',
  deliveryCity: row.delivery_city ?? '',
  deliverySettlement: row.delivery_settlement ?? '',
  comment: row.comment,
  status: row.status,
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
});

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
  return ((data ?? []) as OrderRow[]).map(mapOrder);
}

export async function updateRestaurantOrderStatus(
  order: RestaurantOrder,
  status: RestaurantOrderStatus,
  reason = ''
) {
  if (!supabase) return;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === 'accepted' || status === 'confirmed') patch.accepted_at = order.acceptedAt ?? now;
  if (status === 'ready' || status === 'waiting_driver') patch.ready_at = order.readyAt ?? now;
  if (status === 'completed' || status === 'delivered') patch.completed_at = order.completedAt ?? now;
  if (status === 'cancelled') patch.cancellation_reason = reason || 'restaurant_cancelled';

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
    service_settlements: Array.isArray(nextData.service_settlements) ? nextData.service_settlements.filter(Boolean) : []
  };
}

export async function saveRestaurantDeliverySettings(slug: string, settings: RestaurantDeliverySettings) {
  if (!supabase) return;
  const catalogId = await getCatalogIdBySlug(slug);
  if (!catalogId) return;

  const { error } = await supabase
    .from('restaurant_delivery_settings')
    .upsert({ catalog_id: catalogId, ...settings }, { onConflict: 'catalog_id' });

  if (error) throw error;
}

export async function createRestaurantOrderFromCart({
  slug,
  items,
  fulfillmentType,
  cabinLabel,
  deliveryCity = '',
  deliverySettlement = '',
  deliveryAddress = '',
  comment = ''
}: {
  slug: string;
  items: CartItem[];
  fulfillmentType: RestaurantOrderFulfillment;
  cabinLabel?: string;
  deliveryCity?: string;
  deliverySettlement?: string;
  deliveryAddress?: string;
  comment?: string;
}) {
  if (!supabase) return null;
  const catalogId = await getCatalogIdBySlug(slug);
  if (!catalogId) return null;

  const { data, error } = await supabase.rpc('create_public_restaurant_order', {
    target_catalog_id: catalogId,
    customer_name: 'Гость',
    customer_phone: '',
    fulfillment_type: fulfillmentType,
    cabin_label: cabinLabel ?? '',
    delivery_address: deliveryAddress,
    delivery_city: deliveryCity,
    delivery_settlement: deliverySettlement,
    client_address_comment: deliverySettlement,
    comment,
    items: items.map((item) => ({
      product_id: item.product.id,
      quantity: item.quantity
    }))
  });

  if (error) throw error;
  return String(data);
}
