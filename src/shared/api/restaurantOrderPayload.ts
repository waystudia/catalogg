import type { CartItem, Product } from '../../entities/models';
import { getSelectedModifierDetails } from '../../entities/productModifiers';
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
  idempotencyKey?: string;
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
    options: [
      ...(item.selected_choice ? [{ name: item.selected_choice, product_id: item.product.id }] : []),
      ...getSelectedModifierDetails(item).map(({ group, option }) => ({
        group_id: group.id,
        option_id: option.id,
        name: `${group.name}: ${option.name}`,
        product_id: item.product.id
      }))
    ]
  }));

export type RestaurantOrderStockIssue = {
  productId: string;
  title: string;
  requested: number;
  available: number;
};

export const findRestaurantOrderStockIssues = (
  items: CartItem[],
  liveProducts: Product[]
): RestaurantOrderStockIssue[] => {
  const productsById = new Map(liveProducts.map((product) => [product.id, product]));
  const requestedByProduct = new Map<string, number>();
  items.forEach((item) => requestedByProduct.set(
    item.product.id,
    (requestedByProduct.get(item.product.id) ?? 0) + Math.max(1, item.quantity)
  ));

  return [...requestedByProduct.entries()].flatMap(([productId, requested]) => {
    const cartItem = items.find((item) => item.product.id === productId);
    if (!cartItem) return [];
    const liveProduct = productsById.get(productId);
    if (!liveProduct || liveProduct.is_hidden) {
      return [{
        productId,
        title: cartItem.product.title,
        requested,
        available: 0
      }];
    }
    if (liveProduct.is_unlimited) return [];

    const available = Math.max(0, liveProduct.current_stock ?? liveProduct.stock_count ?? 0);
    return available < requested
      ? [{
          productId,
          title: liveProduct.title || cartItem.product.title,
          requested,
          available
        }]
      : [];
  });
};

export const getRestaurantOrderCreationErrorMessage = (error: unknown) => {
  const text = errorText(error).toLowerCase();
  if (text.includes('stock is not enough') || text.includes('insufficient stock')) {
    return 'Один из товаров уже закончился. Обновите корзину и попробуйте снова.';
  }
  return 'Заказ не создан в системе ресторана. WhatsApp не открыт, чтобы не потерять и не продублировать заказ.';
};

const formatSelectedChoices = (items: CartItem[]) => {
  const lines = items.flatMap((item) => {
    const choices = [
      item.selected_choice,
      ...getSelectedModifierDetails(item).map(({ group, option }) => `${group.name}: ${option.name}`)
    ].filter(Boolean);
    return choices.length > 0 ? [`${item.product.title}: ${choices.join(', ')}`] : [];
  });
  return lines.length > 0 ? `Выбранные варианты:\n${lines.join('\n')}` : '';
};

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

export const buildOrderStatusShareUrl = ({
  origin,
  basePath,
  restaurantSlug,
  orderId
}: {
  origin: string;
  basePath: string;
  restaurantSlug: string;
  orderId: string;
}) => {
  const normalizedOrigin = origin.replace(/\/+$/, '');
  const normalizedBase = `/${basePath.replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
  return `${normalizedOrigin}${normalizedBase}/#/${encodeURIComponent(restaurantSlug)}/order/${encodeURIComponent(orderId)}`;
};

export const buildRestaurantOrderFingerprint = ({
  slug,
  items,
  fulfillmentType,
  cabinLabel = '',
  deliveryCity = '',
  deliverySettlement = '',
  deliveryAddress = '',
  customerName = '',
  customerPhone = ''
}: CreateRestaurantOrderFromCartInput) =>
  JSON.stringify({
    slug: slug.trim().toLowerCase(),
    fulfillmentType,
    cabinLabel: cabinLabel.trim(),
    deliveryCity: deliveryCity.trim(),
    deliverySettlement: deliverySettlement.trim(),
    deliveryAddress: deliveryAddress.trim(),
    customerName: customerName.trim(),
    customerPhone: customerPhone.replace(/\D/g, ''),
    items: items
      .map((item) => ({
        productId: item.product.id,
        quantity: Math.max(1, item.quantity),
        selectedChoice: item.selected_choice?.trim() || '',
        selectedModifiers: [...(item.selected_modifiers ?? [])]
          .sort((left, right) => `${left.groupId}:${left.optionId}`.localeCompare(`${right.groupId}:${right.optionId}`))
      }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  });

export const createRestaurantOrderIdempotencyKey = (fingerprint: string) => {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  return `restaurant-order:${randomPart}:${fingerprint.length}`;
};

const joinCommentParts = (...parts: Array<string | undefined>) =>
  parts.map((part) => part?.trim()).filter(Boolean).join('\n');

const throwSupabaseError = (error: unknown) => {
  if (error instanceof Error) throw error;
  throw new Error(typeof error === 'string' ? error : 'Supabase request failed');
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

const rpcIsMissing = (error: unknown) => {
  const text = errorText(error).toLowerCase();
  return text.includes('pgrst202') || text.includes('could not find the function') || text.includes('function not found');
};

const rpcShouldRetryWithoutIdempotencyKey = (error: unknown) => {
  const text = errorText(error).toLowerCase();
  return rpcIsMissing(error) || (text.includes('42702') && text.includes('idempotency_key') && text.includes('ambiguous'));
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
    customerPhone = '',
    idempotencyKey
  }: CreateRestaurantOrderFromCartInput
) {
  const locationNote =
    fulfillmentType === 'delivery'
      ? formatDeliveryLocationNote(deliveryLat, deliveryLng, deliveryAccuracyM)
      : '';
  const restaurantRpcArgs = {
    target_catalog_id: catalogId,
    customer_name: customerName,
    customer_phone: customerPhone,
    fulfillment_type: fulfillmentType,
    cabin_label: cabinLabel ?? '',
    delivery_address: deliveryAddress,
    delivery_city: deliveryCity,
    delivery_settlement: deliverySettlement,
    client_address_comment: joinCommentParts(deliverySettlement, locationNote),
    comment: joinCommentParts(comment, formatSelectedChoices(items), locationNote),
    idempotency_key: idempotencyKey?.trim() || null,
    items: buildPublicRestaurantOrderItems(items)
  };
  const rpcName = resolvePublicOrderRpcName(items);
  let { data, error } = await client.rpc(rpcName, restaurantRpcArgs);

  if (error && restaurantRpcArgs.idempotency_key && rpcShouldRetryWithoutIdempotencyKey(error)) {
    const argsWithoutIdempotencyKey: Record<string, unknown> = { ...restaurantRpcArgs };
    delete argsWithoutIdempotencyKey.idempotency_key;
    const retryResult = await client.rpc(rpcName, argsWithoutIdempotencyKey);
    data = retryResult.data;
    error = retryResult.error;
  }

  if (error && rpcIsMissing(error)) {
    const fallbackArgs = {
      target_catalog_id: catalogId,
      customer_name: customerName,
      customer_phone: customerPhone,
      comment: restaurantRpcArgs.comment,
      table_label: fulfillmentType === 'hall' ? cabinLabel ?? '' : '',
      items: restaurantRpcArgs.items
    };
    const fallbackResult = await client.rpc('create_public_order', fallbackArgs);
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

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
