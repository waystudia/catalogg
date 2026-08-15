import { getStoredClientSessionToken } from "./clientAccountApi";
import { supabase } from "../supabase";
import {
  asObject,
  mapCombinedOrderAddonConfirmation,
  mapCombinedOrderAddonOffer,
  mapCombinedOrderAddonQuote,
  mapCombinedOrderSummary,
  type CombinedOrderAddonConfirmation,
  type CombinedOrderAddonItemInput,
  type CombinedOrderAddonOffer,
  type CombinedOrderAddonQuote,
  type CombinedOrderSummary,
  type EdgeObject,
} from "./combinedOrderModels";

export type {
  CombinedOrderAddonConfirmation,
  CombinedOrderAddonItemInput,
  CombinedOrderAddonMerchant,
  CombinedOrderAddonOffer,
  CombinedOrderAddonQuote,
  CombinedOrderDeliveryStopSummary,
  CombinedOrderMerchantSummary,
  CombinedOrderSummary,
} from "./combinedOrderModels";

export type PostOrderAddonInitialization = {
  readonly available: boolean;
  readonly reason: string;
  readonly status: string;
  readonly orderGroupId: string;
  readonly offerId: string;
  readonly expiresAt: string;
  readonly addonDeliveryFee: number;
};

type InitializationRow = {
  available?: unknown;
  reason?: unknown;
  status?: unknown;
  order_group_id?: unknown;
  offer_id?: unknown;
  expires_at?: unknown;
  addon_delivery_fee?: unknown;
};

const mapInitialization = (
  value: unknown,
): PostOrderAddonInitialization | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as InitializationRow;
  return {
    available: row.available === true,
    reason: typeof row.reason === "string" ? row.reason : "",
    status: typeof row.status === "string" ? row.status : "",
    orderGroupId:
      typeof row.order_group_id === "string" ? row.order_group_id : "",
    offerId: typeof row.offer_id === "string" ? row.offer_id : "",
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : "",
    addonDeliveryFee: Number.isFinite(Number(row.addon_delivery_fee))
      ? Math.max(0, Number(row.addon_delivery_fee))
      : 0,
  };
};

const rpcIsUnavailable = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("pgrst202") ||
    normalized.includes("could not find the function") ||
    normalized.includes("function not found")
  );
};

export const initializePostOrderAddon = async (
  orderId: string,
): Promise<PostOrderAddonInitialization | null> => {
  const normalizedOrderId = orderId.trim();
  const sessionToken = getStoredClientSessionToken();
  if (!supabase || !normalizedOrderId || !sessionToken) return null;

  const { data, error } = await supabase.rpc("initialize_post_order_addon", {
    target_order_id: normalizedOrderId,
    client_session_token: sessionToken,
  });
  if (error) {
    if (rpcIsUnavailable(error.message ?? "")) return null;
    throw error;
  }
  return mapInitialization(data);
};

const readFunctionError = async (error: unknown) => {
  const value = asObject(error);
  const context = value?.context;
  if (context instanceof Response) {
    try {
      const body = asObject(await context.clone().json());
      const message =
        typeof (body?.error ?? body?.message) === "string"
          ? String(body?.error ?? body?.message)
          : "";
      if (message) return message;
    } catch {
      // Fall through to the SDK message when a gateway returned a non-JSON body.
    }
  }
  return typeof value?.message === "string"
    ? value.message
    : "Сервис объединённой доставки временно недоступен.";
};

const invokeCombinedOrder = async (body: EdgeObject): Promise<unknown> => {
  const sessionToken = getStoredClientSessionToken();
  if (!supabase || !sessionToken)
    throw new Error("Войдите в профиль, чтобы добавить товары к доставке.");
  const { data, error } = await supabase.functions.invoke("combined-order", {
    body,
    headers: { "x-wayyaam-client-session": sessionToken },
  });
  if (error) throw new Error(await readFunctionError(error));
  return data;
};

export const getPostOrderAddonOffer = async (
  orderGroupId: string,
): Promise<CombinedOrderAddonOffer | null> => {
  const data = await invokeCombinedOrder({
    action: "offer",
    orderGroupId: orderGroupId.trim(),
  });
  return mapCombinedOrderAddonOffer(data);
};

export const markPostOrderAddonOfferViewed = async (
  orderGroupId: string,
): Promise<void> => {
  await invokeCombinedOrder({
    action: "view",
    orderGroupId: orderGroupId.trim(),
  });
};

export const quotePostOrderAddon = async (input: {
  orderGroupId: string;
  merchantId: string;
  items: readonly CombinedOrderAddonItemInput[];
  idempotencyKey: string;
}): Promise<CombinedOrderAddonQuote> => {
  const data = await invokeCombinedOrder({
    action: "quote",
    orderGroupId: input.orderGroupId.trim(),
    merchantId: input.merchantId.trim(),
    items: input.items,
    idempotencyKey: input.idempotencyKey,
  });
  const quote = mapCombinedOrderAddonQuote(data);
  if (!quote) throw new Error("Не удалось получить актуальный расчёт заказа.");
  return quote;
};

export const confirmPostOrderAddon = async (input: {
  orderGroupId: string;
  quoteId: string;
  quoteToken: string;
  idempotencyKey: string;
}): Promise<CombinedOrderAddonConfirmation> => {
  const data = await invokeCombinedOrder({
    action: "confirm",
    orderGroupId: input.orderGroupId.trim(),
    quoteId: input.quoteId.trim(),
    quoteToken: input.quoteToken,
    idempotencyKey: input.idempotencyKey,
  });
  const confirmation = mapCombinedOrderAddonConfirmation(data);
  if (!confirmation)
    throw new Error(
      "Заказ добавлен, но подтверждение не удалось прочитать. Обновите статус заказа.",
    );
  return confirmation;
};

export const getCombinedOrderSummary = async (
  orderId: string,
): Promise<CombinedOrderSummary | null> => {
  const sessionToken = getStoredClientSessionToken();
  if (!supabase || !sessionToken || !orderId.trim()) return null;
  const { data, error } = await supabase.rpc(
    "get_client_combined_order_summary",
    {
      target_order_id: orderId.trim(),
      client_session_token: sessionToken,
    },
  );
  if (error) {
    if (rpcIsUnavailable(error.message ?? "")) return null;
    throw error;
  }
  return mapCombinedOrderSummary(data);
};

export const subscribeCombinedOrderSummary = (
  orderGroupId: string,
  deliveryId: string | null,
  onChange: () => void,
) => {
  const realtimeClient = supabase;
  if (!realtimeClient || !orderGroupId) return () => undefined;
  const channel = realtimeClient
    .channel(`combined-order-summary-${orderGroupId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "order_groups",
        filter: `id=eq.${orderGroupId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `order_group_id=eq.${orderGroupId}`,
      },
      onChange,
    );
  if (deliveryId) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "delivery_stops",
        filter: `delivery_id=eq.${deliveryId}`,
      },
      onChange,
    );
  }
  channel.subscribe();
  return () => {
    void realtimeClient.removeChannel(channel);
  };
};
