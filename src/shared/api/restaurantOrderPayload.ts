import type { CartItem } from '../../entities/models';
import { formatDeliveryLocationNote } from '../deliveryLocation';

type DeliverySettingsForSave = {
  service_settlements: string[];
  delivery_hours_start: string | null | undefined;
  delivery_hours_end: string | null | undefined;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateRestaurantOrderFromCartInput = {
  slug: string;
  items: CartItem[];
  fulfillmentType: 'hall' | 'takeaway' | 'delivery';
  cabinLabel?: string;
  deliveryCity?: string;
  deliverySettlement?: string;
  deliveryAddress?: string;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  deliveryAccuracyM?: number | null;
  comment?: string;
  customerName?: string;
  customerPhone?: string;
};

type SupabaseResult<T> = PromiseLike<{ data: T | null; error: unknown }>;

export type PublicRestaurantOrderClient = {
  rpc: (functionName: string, args: Record<string, unknown>) => SupabaseResult<unknown>;
  from: (table: string) => {
    update: (patch: Record<string, unknown>) => {
      eq: (column: string, value: string) => PromiseLike<{ error: unknown }>;
    };
  };
};

export const buildPublicRestaurantOrderItems = (items: CartItem[]) =>
  items.map((item) => ({
    product_id: item.product.id,
    quantity: Math.max(1, item.quantity),
    options: []
  }));

export const resolvePublicOrderRpcName = (items: CartItem[]) =>
  items.every((item) => uuidPattern.test(item.product.id))
    ? 'create_public_restaurant_order'
    : 'create_legacy_public_restaurant_order';

export const normalizeRestaurantDeliverySettingsForSave = <T extends DeliverySettingsForSave>(settings: T) => ({
  ...settings,
  service_settlements: (settings.service_settlements ?? []).map((item) => item.trim()).filter(Boolean),
  delivery_hours_start: settings.delivery_hours_start?.trim() || null,
  delivery_hours_end: settings.delivery_hours_end?.trim() || null
});

const joinCommentParts = (...parts: Array<string | undefined>) =>
  parts.map((part) => part?.trim()).filter(Boolean).join('\n');

const throwSupabaseError = (error: unknown) => {
  if (error instanceof Error) throw error;
  throw new Error(typeof error === 'string' ? error : 'Supabase request failed');
};

const buildLocationPatch = ({
  fulfillmentType,
  deliveryLat = null,
  deliveryLng = null,
  deliveryAccuracyM = null,
  deliveryAddress = ''
}: CreateRestaurantOrderFromCartInput): Record<string, unknown> => ({
  delivery_lat: fulfillmentType === 'delivery' ? deliveryLat : null,
  delivery_lng: fulfillmentType === 'delivery' ? deliveryLng : null,
  client_lat: fulfillmentType === 'delivery' ? deliveryLat : null,
  client_lng: fulfillmentType === 'delivery' ? deliveryLng : null,
  client_accuracy_m: fulfillmentType === 'delivery' ? deliveryAccuracyM : null,
  delivery_address_snapshot: fulfillmentType === 'delivery' ? deliveryAddress : null
});

export async function createRestaurantOrderWithClient(
  client: PublicRestaurantOrderClient,
  catalogId: string,
  {
    items,
    fulfillmentType,
    cabinLabel,
    deliveryCity = '',
    deliverySettlement = '',
    deliveryAddress = '',
    deliveryLat = null,
    deliveryLng = null,
    deliveryAccuracyM = null,
    comment = '',
    customerName = 'Гость',
    customerPhone = ''
  }: CreateRestaurantOrderFromCartInput
) {
  const locationNote =
    fulfillmentType === 'delivery'
      ? formatDeliveryLocationNote(deliveryLat, deliveryLng, deliveryAccuracyM)
      : '';
  const { data, error } = await client.rpc(resolvePublicOrderRpcName(items), {
    target_catalog_id: catalogId,
    customer_name: customerName,
    customer_phone: customerPhone,
    fulfillment_type: fulfillmentType,
    cabin_label: cabinLabel ?? '',
    delivery_address: deliveryAddress,
    delivery_city: deliveryCity,
    delivery_settlement: deliverySettlement,
    client_address_comment: joinCommentParts(deliverySettlement, locationNote),
    comment: joinCommentParts(comment, locationNote),
    items: buildPublicRestaurantOrderItems(items)
  });

  if (error) throwSupabaseError(error);
  const orderId = String(data);

  try {
    const { error: updateError } = await client
      .from('orders')
      .update(
        buildLocationPatch({
          slug: '',
          items,
          fulfillmentType,
          deliveryLat,
          deliveryLng,
          deliveryAccuracyM,
          deliveryAddress
        })
      )
      .eq('id', orderId);

    if (updateError) {
      console.warn('Order was created, but delivery coordinates were not saved separately.', updateError);
    }
  } catch (locationUpdateError) {
    console.warn('Order was created, but delivery coordinates were not saved separately.', locationUpdateError);
  }

  return orderId;
}
