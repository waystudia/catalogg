import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import {
  calculateMerchantRouteEligibility,
  type CombinedRouteEligibility,
  type Coordinate,
  type RouteMatrix,
} from "../_shared/combinedOrderEngine.ts";

type Action = "offer" | "view" | "quote" | "confirm";

type RequestPayload = {
  action?: Action;
  orderGroupId?: string;
  merchantId?: string;
  items?: Array<{
    productId?: string;
    quantity?: number;
    requestedQuantity?: number;
    options?: unknown;
  }>;
  idempotencyKey?: string;
  quoteId?: string;
  quoteToken?: string;
};

type Candidate = {
  id: string;
  slug: string;
  name: string;
  business_type: string;
  logo_url: string;
  rating: number;
  latitude: number;
  longitude: number;
  address: string;
  assembly_minutes: number;
  straight_line_distance_from_restaurant_km: number;
  distance_to_route_corridor_km: number;
};

type OfferContext = {
  available: boolean;
  reason?: string;
  order_group_id: string;
  client_account_id: string;
  offer: {
    id: string;
    status: string;
    expires_at: string;
    addon_delivery_fee: number;
  };
  config: {
    max_extra_distance_km: number;
    max_extra_time_minutes: number;
    max_post_main_pickup_delay_minutes: number;
    max_route_candidates: number;
    max_shown_merchants: number;
    quote_ttl_seconds: number;
  };
  primary_order: {
    id: string;
    catalog_id: string;
    status: string;
    delivery_latitude: number;
    delivery_longitude: number;
    primary_latitude: number;
    primary_longitude: number;
    estimated_ready_at: string;
  };
  delivery: {
    id: string | null;
    status: string;
    driver_id: string | null;
    courier_latitude: number | null;
    courier_longitude: number | null;
    completed_pickups: number;
  };
  candidates: Candidate[];
};

type EligibleCandidate = Candidate & {
  route: Extract<CombinedRouteEligibility, { eligible: true }>;
};

type AdminClient = ReturnType<typeof createClient>;

const allowedOrigins = new Set([
  "https://wayyaam.ru",
  "https://www.wayyaam.ru",
  ...(Deno.env.get("COMBINED_ORDER_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
]);

const corsHeaders = (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  const developmentOrigin =
    /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin);
  return {
    "Access-Control-Allow-Origin":
      allowedOrigins.has(origin) || developmentOrigin
        ? origin
        : "https://wayyaam.ru",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-wayyaam-client-session",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
};

const jsonResponse = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });

const asId = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const asCoordinate = (lat: unknown, lng: unknown): Coordinate | null => {
  if (lat === null || lat === undefined || lng === null || lng === undefined)
    return null;
  const coordinate = {
    lat: asNumber(lat, Number.NaN),
    lng: asNumber(lng, Number.NaN),
  };
  return Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.lng)
    ? coordinate
    : null;
};

const getErrorText = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error)
    return String(error.message);
  return String(error ?? "unknown");
};

const customerMessage = (error: unknown) => {
  const text = getErrorText(error).toLowerCase();
  if (text.includes("access_denied"))
    return "Не удалось подтвердить владельца заказа.";
  if (text.includes("offer_expired"))
    return "К этой доставке уже нельзя добавить ещё один заказ.";
  if (text.includes("addon_already_created"))
    return "Заказ магазина уже был добавлен.";
  if (text.includes("merchant_unavailable"))
    return "Магазин сейчас не принимает заказы.";
  if (text.includes("items_changed"))
    return "Наличие или цена товаров изменились. Проверьте корзину.";
  if (text.includes("route_ineligible"))
    return "Этот магазин уже нельзя добавить к текущей доставке.";
  return "Не удалось добавить заказ. Попробуйте ещё раз.";
};

const loadOfferContext = async (
  admin: AdminClient,
  orderGroupId: string,
  clientSessionToken: string,
): Promise<OfferContext> => {
  const { data, error } = await admin.rpc("get_post_order_addon_context", {
    target_order_group_id: orderGroupId,
    client_session_token: clientSessionToken,
  });
  if (error) throw error;
  return data as OfferContext;
};

const consumeRateLimit = async (
  admin: AdminClient,
  orderGroupId: string,
  clientSessionToken: string,
  action: Action,
) => {
  const { data, error } = await admin.rpc("consume_combined_order_rate_limit", {
    target_order_group_id: orderGroupId,
    client_session_token: clientSessionToken,
    target_request_type: action,
  });
  if (error) throw error;
  if (data !== true) throw new Error("rate_limit_exceeded");
};

const routeMatrix = async (coordinates: Coordinate[]): Promise<RouteMatrix> => {
  const routeBase = (
    Deno.env.get("ROAD_ROUTER_URL") ?? "https://router.project-osrm.org"
  ).replace(/\/$/, "");
  const coordinatePath = coordinates
    .map(({ lng, lat }) => `${lng},${lat}`)
    .join(";");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(
      `${routeBase}/table/v1/driving/${coordinatePath}?annotations=distance,duration`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );
    if (!response.ok) throw new Error(`route_matrix_http_${response.status}`);
    const data = (await response.json()) as {
      code?: string;
      distances?: unknown;
      durations?: unknown;
    };
    if (
      data.code !== "Ok" ||
      !Array.isArray(data.distances) ||
      !Array.isArray(data.durations)
    ) {
      throw new Error("route_matrix_unavailable");
    }
    return {
      distances: data.distances as Array<Array<number | null>>,
      durations: data.durations as Array<Array<number | null>>,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const calculateRoutes = async (
  context: OfferContext,
  requestedCandidates: Candidate[],
): Promise<EligibleCandidate[]> => {
  const primary = asCoordinate(
    context.primary_order.primary_latitude,
    context.primary_order.primary_longitude,
  );
  const customer = asCoordinate(
    context.primary_order.delivery_latitude,
    context.primary_order.delivery_longitude,
  );
  const courier = asCoordinate(
    context.delivery.courier_latitude,
    context.delivery.courier_longitude,
  );
  if (!primary || !customer || requestedCandidates.length === 0) return [];

  const candidates = requestedCandidates
    .slice(0, Math.max(1, Math.floor(context.config.max_route_candidates)))
    .filter((candidate) =>
      asCoordinate(candidate.latitude, candidate.longitude),
    );
  const coordinates = [
    primary,
    customer,
    ...candidates.map((candidate) => ({
      lat: candidate.latitude,
      lng: candidate.longitude,
    })),
  ];
  const courierIndex = courier ? coordinates.push(courier) - 1 : undefined;
  const matrix = await routeMatrix(coordinates);
  const nowMs = Date.now();
  const primaryReadyAtMs = Date.parse(context.primary_order.estimated_ready_at);

  return candidates
    .flatMap((candidate, index) => {
      const route = calculateMerchantRouteEligibility({
        matrix,
        primaryIndex: 0,
        customerIndex: 1,
        storeIndex: index + 2,
        courierIndex,
        nowMs,
        primaryReadyAtMs: Number.isFinite(primaryReadyAtMs)
          ? primaryReadyAtMs
          : nowMs,
        storeAssemblyMinutes: Math.max(
          1,
          asNumber(candidate.assembly_minutes, 5),
        ),
        limits: {
          maxExtraDistanceKm: asNumber(context.config.max_extra_distance_km),
          maxExtraTimeMinutes: asNumber(context.config.max_extra_time_minutes),
          maxPostMainPickupDelayMinutes: asNumber(
            context.config.max_post_main_pickup_delay_minutes,
          ),
        },
      });
      return route.eligible ? [{ ...candidate, route }] : [];
    })
    .sort(
      (left, right) =>
        left.route.extraTimeMinutes - right.route.extraTimeMinutes ||
        left.route.extraDistanceKm - right.route.extraDistanceKm ||
        left.assembly_minutes - right.assembly_minutes ||
        right.rating - left.rating ||
        left.id.localeCompare(right.id),
    );
};

const publishOffer = async (
  admin: AdminClient,
  context: OfferContext,
  eligible: EligibleCandidate[],
) => {
  const shown = eligible.slice(
    0,
    Math.max(1, Math.floor(context.config.max_shown_merchants)),
  );
  const candidateSnapshot = shown.map(({ route, ...merchant }) => ({
    ...merchant,
    route_sequence: route.sequence,
    extra_distance_km: route.extraDistanceKm,
    extra_time_minutes: route.extraTimeMinutes,
    customer_arrival_at: new Date(route.customerArrivalAtMs).toISOString(),
  }));
  const status = shown.length > 0 ? "available" : "ineligible";
  const updatePayload = {
    status,
    candidate_snapshot: candidateSnapshot,
    closed_reason: shown.length > 0 ? null : "no_eligible_merchants",
  };
  const updateResult =
    context.offer.status === "evaluating"
      ? await admin
          .from("addon_offers")
          .update(updatePayload)
          .eq("id", context.offer.id)
          .eq("status", "evaluating")
          .select("id")
          .maybeSingle()
      : await admin
          .from("addon_offers")
          .update(updatePayload)
          .eq("id", context.offer.id)
          .in("status", ["available", "viewed"])
          .select("id")
          .maybeSingle();
  const { error } = updateResult;
  if (error) throw error;

  if (
    shown.length > 0 &&
    context.offer.status === "evaluating" &&
    updateResult.data
  ) {
    const [eventResult, notificationResult] = await Promise.all([
      admin.from("order_group_events").insert({
        order_group_id: context.order_group_id,
        event_type: "ADDON_OFFER_AVAILABLE",
        actor_type: "system",
        metadata: { candidate_count: shown.length },
      }),
      admin.from("notifications").insert({
        recipient_client_account_id: context.client_account_id,
        notification_type: "POST_ORDER_ADDON_AVAILABLE",
        title: "Добавить к доставке? 🥤",
        body: `Напитки и снеки из магазина по пути — +${context.offer.addon_delivery_fee} ₽`,
        action_url: `/open-order/${context.order_group_id}/addons`,
        dedupe_key: `post-order-addon:${context.order_group_id}`,
        expires_at: context.offer.expires_at,
        metadata: {
          order_group_id: context.order_group_id,
          offer_id: context.offer.id,
        },
      }),
    ]);
    if (eventResult.error) throw eventResult.error;
    if (notificationResult.error) throw notificationResult.error;
  }
  return shown;
};

const handleOffer = async (admin: AdminClient, context: OfferContext) => {
  const eligible = await calculateRoutes(context, context.candidates ?? []);
  const merchants = await publishOffer(admin, context, eligible);
  return {
    available: merchants.length > 0,
    reason: merchants.length > 0 ? "" : "no_eligible_merchants",
    orderGroupId: context.order_group_id,
    offerId: context.offer.id,
    expiresAt: context.offer.expires_at,
    addonDeliveryFee: context.offer.addon_delivery_fee,
    merchants: merchants.map(({ route, ...merchant }) => ({
      ...merchant,
      extraDistanceKm: route.extraDistanceKm,
      extraTimeMinutes: route.extraTimeMinutes,
      routeSequence: route.sequence,
    })),
  };
};

const handleView = async (admin: AdminClient, context: OfferContext) => {
  const { data, error } = await admin
    .from("addon_offers")
    .update({ status: "viewed", viewed_at: new Date().toISOString() })
    .eq("id", context.offer.id)
    .eq("status", "available")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (data) {
    const { error: eventError } = await admin
      .from("order_group_events")
      .insert({
        order_group_id: context.order_group_id,
        event_type: "ADDON_OFFER_VIEWED",
        actor_type: "client",
        actor_id: context.client_account_id,
        metadata: {},
      });
    if (eventError) throw eventError;
  }
  return { viewed: true, orderGroupId: context.order_group_id };
};

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
};

const handleQuote = async (
  admin: AdminClient,
  context: OfferContext,
  clientSessionToken: string,
  requestPayload: RequestPayload,
) => {
  const merchantId = asId(requestPayload.merchantId);
  const candidate = context.candidates.find((item) => item.id === merchantId);
  if (!candidate) throw new Error("merchant_unavailable");
  const eligible = await calculateRoutes(context, [candidate]);
  const route = eligible[0]?.route;
  if (!route) throw new Error("route_ineligible");

  const requestedItems = Array.isArray(requestPayload.items)
    ? requestPayload.items
    : [];
  const productIds = Array.from(
    new Set(requestedItems.map((item) => asId(item.productId)).filter(Boolean)),
  );
  if (productIds.length === 0 || productIds.length !== requestedItems.length)
    throw new Error("items_changed");
  const { data: products, error: productsError } = await admin
    .from("products")
    .select(
      "id, catalog_id, title, sku, barcode, status, price, sale_unit, quantity_unit, price_basis_quantity, minimum_quantity, quantity_step, stock_quantity, is_unlimited",
    )
    .eq("catalog_id", merchantId)
    .in("id", productIds)
    .eq("status", "active");
  if (productsError) throw productsError;
  if ((products ?? []).length !== productIds.length)
    throw new Error("items_changed");
  const productsById = new Map(
    (products ?? []).map((product) => [String(product.id), product]),
  );
  const itemsSnapshot = requestedItems.map((requested) => {
    const product = productsById.get(asId(requested.productId));
    if (!product) throw new Error("items_changed");
    const saleUnit = String(product.sale_unit ?? "piece");
    const quantity = Math.max(1, Math.floor(asNumber(requested.quantity, 1)));
    const requestedQuantity =
      saleUnit === "weight"
        ? Math.floor(asNumber(requested.requestedQuantity, 0))
        : quantity;
    const minimum = Math.max(1, asNumber(product.minimum_quantity, 1));
    const step = Math.max(1, asNumber(product.quantity_step, 1));
    const stock = Math.max(0, asNumber(product.stock_quantity, 0));
    if (
      requestedQuantity < minimum ||
      (requestedQuantity - minimum) % step !== 0
    ) {
      throw new Error("items_changed");
    }
    if (product.is_unlimited !== true && stock < requestedQuantity)
      throw new Error("items_changed");
    const price = Math.max(0, Math.round(asNumber(product.price)));
    const priceBasis = Math.max(
      1,
      Math.round(asNumber(product.price_basis_quantity, 1)),
    );
    return {
      product_id: product.id,
      title: product.title,
      sku: product.sku,
      barcode: product.barcode,
      quantity: saleUnit === "weight" ? 1 : quantity,
      requested_quantity: requestedQuantity,
      unit_price: price,
      price_basis_quantity: priceBasis,
      sale_unit: saleUnit,
      quantity_unit: product.quantity_unit ?? "piece",
      options: Array.isArray(requested.options) ? requested.options : [],
      line_total: Math.round((price * requestedQuantity) / priceBasis),
    };
  });

  const quoteToken = randomToken();
  const idempotencyKey =
    asId(requestPayload.idempotencyKey) || crypto.randomUUID();
  const { data, error } = await admin.rpc("create_post_order_addon_quote", {
    target_order_group_id: context.order_group_id,
    target_offer_id: context.offer.id,
    target_merchant_id: merchantId,
    client_session_token: clientSessionToken,
    quote_token: quoteToken,
    quote_idempotency_key: idempotencyKey,
    target_items_snapshot: itemsSnapshot,
    target_extra_distance_km: route.extraDistanceKm,
    target_extra_time_minutes: Math.ceil(route.extraTimeMinutes),
    target_route_sequence: route.sequence,
    target_route_provider: "osrm",
    target_route_cache_key: null,
  });
  if (error) throw error;
  return {
    ...(data as Record<string, unknown>),
    quoteToken,
    merchantId,
    items: itemsSnapshot,
  };
};

const handleConfirm = async (
  admin: AdminClient,
  context: OfferContext,
  clientSessionToken: string,
  requestPayload: RequestPayload,
) => {
  const quoteId = asId(requestPayload.quoteId);
  const quoteToken = asId(requestPayload.quoteToken);
  if (!quoteId || !quoteToken) throw new Error("access_denied");
  const { data: quote, error: quoteError } = await admin
    .from("addon_quotes")
    .select("id, order_group_id, merchant_id")
    .eq("id", quoteId)
    .eq("order_group_id", context.order_group_id)
    .maybeSingle();
  if (quoteError || !quote) throw quoteError ?? new Error("access_denied");
  const candidate = context.candidates.find(
    (item) => item.id === quote.merchant_id,
  );
  if (!candidate) throw new Error("merchant_unavailable");
  const eligible = await calculateRoutes(context, [candidate]);
  const route = eligible[0]?.route;
  if (!route) throw new Error("route_ineligible");

  const { data, error } = await admin.rpc("confirm_post_order_addon", {
    target_quote_id: quoteId,
    client_session_token: clientSessionToken,
    quote_token: quoteToken,
    confirm_idempotency_key:
      asId(requestPayload.idempotencyKey) || crypto.randomUUID(),
    revalidated_route_sequence: route.sequence,
    revalidated_extra_distance_km: route.extraDistanceKm,
    revalidated_extra_time_minutes: Math.ceil(route.extraTimeMinutes),
  });
  if (error) throw error;
  return data;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST")
    return jsonResponse(request, { error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("CATALOGG_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      request,
      { error: "Combined Order is not configured." },
      503,
    );
  }

  try {
    const requestPayload = (await request.json()) as RequestPayload;
    const action = requestPayload.action;
    const orderGroupId = asId(requestPayload.orderGroupId);
    const clientSessionToken = asId(
      request.headers.get("x-wayyaam-client-session"),
    );
    if (
      !action ||
      !["offer", "view", "quote", "confirm"].includes(action) ||
      !orderGroupId ||
      !clientSessionToken
    ) {
      return jsonResponse(request, { error: "Некорректный запрос." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await consumeRateLimit(admin, orderGroupId, clientSessionToken, action);
    const context = await loadOfferContext(
      admin,
      orderGroupId,
      clientSessionToken,
    );
    if (!context.available) {
      return jsonResponse(
        request,
        {
          available: false,
          reason: context.reason,
          message: customerMessage(context.reason),
        },
        409,
      );
    }

    if (action === "offer")
      return jsonResponse(request, await handleOffer(admin, context));
    if (action === "view")
      return jsonResponse(request, await handleView(admin, context));
    if (action === "quote") {
      return jsonResponse(
        request,
        await handleQuote(admin, context, clientSessionToken, requestPayload),
      );
    }
    if (action === "confirm") {
      return jsonResponse(
        request,
        await handleConfirm(admin, context, clientSessionToken, requestPayload),
      );
    }
    return jsonResponse(request, { error: "Некорректное действие." }, 400);
  } catch (error) {
    const text = getErrorText(error).toLowerCase();
    const status = text.includes("rate_limit_exceeded")
      ? 429
      : text.includes("access_denied")
        ? 403
        : text.includes("offer_expired") ||
            text.includes("already") ||
            text.includes("route_")
          ? 409
          : 400;
    return jsonResponse(
      request,
      { error: customerMessage(error), code: text.split(/[\s:]/)[0] },
      status,
    );
  }
});
