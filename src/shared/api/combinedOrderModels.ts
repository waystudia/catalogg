export type CombinedOrderAddonMerchant = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly businessType: string;
  readonly logoUrl: string;
  readonly rating: number;
  readonly assemblyMinutes: number;
  readonly extraDistanceKm: number;
  readonly extraTimeMinutes: number;
  readonly routeSequence: readonly string[];
};

export type CombinedOrderAddonOffer = {
  readonly available: boolean;
  readonly reason: string;
  readonly orderGroupId: string;
  readonly offerId: string;
  readonly expiresAt: string;
  readonly addonDeliveryFee: number;
  readonly merchants: readonly CombinedOrderAddonMerchant[];
};

export type CombinedOrderAddonItemInput = {
  readonly productId: string;
  readonly quantity: number;
  readonly requestedQuantity?: number;
};

export type CombinedOrderAddonQuote = {
  readonly quoteId: string;
  readonly quoteToken: string;
  readonly merchantId: string;
  readonly itemsSubtotal: number;
  readonly addonDeliveryFee: number;
  readonly total: number;
  readonly expiresAt: string;
};

export type CombinedOrderAddonConfirmation = {
  readonly orderGroupId: string;
  readonly merchantOrderId: string;
  readonly deliveryId: string;
  readonly merchantSubtotal: number;
  readonly baseDeliveryFee: number;
  readonly addonDeliveryFee: number;
  readonly grandTotal: number;
  readonly idempotent: boolean;
};

export type CombinedOrderMerchantSummary = {
  readonly id: string;
  readonly merchantId: string;
  readonly merchantName: string;
  readonly merchantType: string;
  readonly isAddon: boolean;
  readonly status: string;
  readonly subtotal: number;
  readonly estimatedReadyAt: string;
  readonly items: readonly {
    readonly id: string;
    readonly title: string;
    readonly quantity: number;
    readonly lineTotal: number;
  }[];
};

export type CombinedOrderDeliveryStopSummary = {
  readonly id: string;
  readonly merchantOrderId: string;
  readonly type: "pickup" | "dropoff";
  readonly sequence: number;
  readonly status: string;
  readonly address: string;
  readonly merchantName: string;
};

export type CombinedOrderSummary = {
  readonly orderGroupId: string;
  readonly primaryOrderId: string;
  readonly status: string;
  readonly merchantSubtotal: number;
  readonly baseDeliveryFee: number;
  readonly addonDeliveryFee: number;
  readonly grandTotal: number;
  readonly merchantOrders: readonly CombinedOrderMerchantSummary[];
  readonly delivery: null | {
    readonly id: string;
    readonly status: string;
    readonly routeVersion: number;
    readonly stops: readonly CombinedOrderDeliveryStopSummary[];
  };
};

export type EdgeObject = Record<string, unknown>;

export const asObject = (value: unknown): EdgeObject | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as EdgeObject)
    : null;

const asString = (value: unknown) => (typeof value === "string" ? value : "");
const asNumber = (value: unknown) =>
  Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const asStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

export const mapCombinedOrderAddonOffer = (
  value: unknown,
): CombinedOrderAddonOffer | null => {
  const row = asObject(value);
  if (!row) return null;
  const merchants = Array.isArray(row.merchants)
    ? row.merchants.flatMap((value) => {
        const merchant = asObject(value);
        if (!merchant || !asString(merchant.id) || !asString(merchant.slug))
          return [];
        return [
          {
            id: asString(merchant.id),
            slug: asString(merchant.slug),
            name: asString(merchant.name) || "Магазин",
            businessType: asString(
              merchant.business_type ?? merchant.businessType,
            ),
            logoUrl: asString(merchant.logo_url ?? merchant.logoUrl),
            rating: asNumber(merchant.rating),
            assemblyMinutes: asNumber(
              merchant.assembly_minutes ?? merchant.assemblyMinutes,
            ),
            extraDistanceKm: asNumber(
              merchant.extraDistanceKm ?? merchant.extra_distance_km,
            ),
            extraTimeMinutes: asNumber(
              merchant.extraTimeMinutes ?? merchant.extra_time_minutes,
            ),
            routeSequence: asStringArray(
              merchant.routeSequence ?? merchant.route_sequence,
            ),
          } satisfies CombinedOrderAddonMerchant,
        ];
      })
    : [];

  return {
    available: row.available === true && merchants.length > 0,
    reason: asString(row.reason),
    orderGroupId: asString(row.orderGroupId ?? row.order_group_id),
    offerId: asString(row.offerId ?? row.offer_id),
    expiresAt: asString(row.expiresAt ?? row.expires_at),
    addonDeliveryFee: asNumber(row.addonDeliveryFee ?? row.addon_delivery_fee),
    merchants,
  };
};

export const mapCombinedOrderAddonQuote = (
  value: unknown,
): CombinedOrderAddonQuote | null => {
  const row = asObject(value);
  if (!row) return null;
  const quoteId = asString(row.quote_id ?? row.quoteId);
  const quoteToken = asString(row.quoteToken ?? row.quote_token);
  if (!quoteId || !quoteToken) return null;
  return {
    quoteId,
    quoteToken,
    merchantId: asString(row.merchantId ?? row.merchant_id),
    itemsSubtotal: asNumber(row.items_subtotal ?? row.itemsSubtotal),
    addonDeliveryFee: asNumber(row.addon_delivery_fee ?? row.addonDeliveryFee),
    total: asNumber(row.total),
    expiresAt: asString(row.expires_at ?? row.expiresAt),
  };
};

export const mapCombinedOrderAddonConfirmation = (
  value: unknown,
): CombinedOrderAddonConfirmation | null => {
  const row = asObject(value);
  if (!row) return null;
  const orderGroupId = asString(row.order_group_id ?? row.orderGroupId);
  const merchantOrderId = asString(
    row.merchant_order_id ?? row.merchantOrderId,
  );
  if (!orderGroupId || !merchantOrderId) return null;
  return {
    orderGroupId,
    merchantOrderId,
    deliveryId: asString(row.delivery_id ?? row.deliveryId),
    merchantSubtotal: asNumber(row.merchant_subtotal ?? row.merchantSubtotal),
    baseDeliveryFee: asNumber(row.base_delivery_fee ?? row.baseDeliveryFee),
    addonDeliveryFee: asNumber(row.addon_delivery_fee ?? row.addonDeliveryFee),
    grandTotal: asNumber(row.grand_total ?? row.grandTotal),
    idempotent: row.idempotent === true,
  };
};

export const mapCombinedOrderSummary = (
  value: unknown,
): CombinedOrderSummary | null => {
  const row = asObject(value);
  const orderGroupId = asString(row?.order_group_id ?? row?.orderGroupId);
  const primaryOrderId = asString(row?.primary_order_id ?? row?.primaryOrderId);
  if (!row || !orderGroupId || !primaryOrderId) return null;
  const merchantOrders = Array.isArray(row.merchant_orders)
    ? row.merchant_orders.flatMap((value) => {
        const order = asObject(value);
        if (!order || !asString(order.id)) return [];
        const items = Array.isArray(order.items)
          ? order.items.flatMap((value) => {
              const item = asObject(value);
              if (!item || !asString(item.id)) return [];
              return [
                {
                  id: asString(item.id),
                  title: asString(item.title),
                  quantity: asNumber(item.quantity),
                  lineTotal: asNumber(item.line_total ?? item.lineTotal),
                },
              ];
            })
          : [];
        return [
          {
            id: asString(order.id),
            merchantId: asString(order.merchant_id ?? order.merchantId),
            merchantName:
              asString(order.merchant_name ?? order.merchantName) || "Продавец",
            merchantType: asString(order.merchant_type ?? order.merchantType),
            isAddon: order.is_addon === true || order.isAddon === true,
            status: asString(order.status),
            subtotal: asNumber(order.subtotal),
            estimatedReadyAt: asString(
              order.estimated_ready_at ?? order.estimatedReadyAt,
            ),
            items,
          } satisfies CombinedOrderMerchantSummary,
        ];
      })
    : [];
  const deliveryRow = asObject(row.delivery);
  const deliveryId = asString(deliveryRow?.id);
  const stops = Array.isArray(deliveryRow?.stops)
    ? deliveryRow.stops.flatMap((value) => {
        const stop = asObject(value);
        const id = asString(stop?.id);
        const type = asString(stop?.type);
        if (!stop || !id || !["pickup", "dropoff"].includes(type)) return [];
        return [
          {
            id,
            merchantOrderId: asString(
              stop.merchant_order_id ?? stop.merchantOrderId,
            ),
            type: type as "pickup" | "dropoff",
            sequence: asNumber(stop.sequence),
            status: asString(stop.status),
            address: asString(stop.address),
            merchantName: asString(stop.merchant_name ?? stop.merchantName),
          } satisfies CombinedOrderDeliveryStopSummary,
        ];
      })
    : [];
  return {
    orderGroupId,
    primaryOrderId,
    status: asString(row.status),
    merchantSubtotal: asNumber(row.merchant_subtotal ?? row.merchantSubtotal),
    baseDeliveryFee: asNumber(row.base_delivery_fee ?? row.baseDeliveryFee),
    addonDeliveryFee: asNumber(row.addon_delivery_fee ?? row.addonDeliveryFee),
    grandTotal: asNumber(row.grand_total ?? row.grandTotal),
    merchantOrders,
    delivery:
      deliveryRow && deliveryId
        ? {
            id: deliveryId,
            status: asString(deliveryRow.status),
            routeVersion: asNumber(
              deliveryRow.route_version ?? deliveryRow.routeVersion,
            ),
            stops,
          }
        : null,
  };
};
