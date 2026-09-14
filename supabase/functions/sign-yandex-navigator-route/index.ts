import { Buffer } from 'node:buffer';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('WEB_PUSH_ALLOWED_ORIGIN')?.trim() || 'https://wayyaam.ru',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

const finiteCoordinate = (value: unknown, limit: number) => {
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
};

const appendPoint = (
  params: URLSearchParams,
  prefix: 'from' | 'to' | 'via_0',
  lat: number | null,
  lon: number | null
) => {
  if (lat === null || lon === null) return false;
  params.set(`lat_${prefix}`, String(lat));
  params.set(`lon_${prefix}`, String(lon));
  return true;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || Deno.env.get('CATALOGG_SERVICE_ROLE_KEY')?.trim();
  const navigatorClient = Deno.env.get('YANDEX_NAVIGATOR_CLIENT_ID')?.trim();
  const navigatorPrivateKey = Deno.env.get('YANDEX_NAVIGATOR_PRIVATE_KEY')?.replace(/\\n/g, '\n').trim();
  const configuredDailyLimit = Number(Deno.env.get('YANDEX_NAVIGATOR_DAILY_TRANSITION_LIMIT') ?? '5000');
  const dailyLimit = Number.isInteger(configuredDailyLimit) && configuredDailyLimit > 0 ? configuredDailyLimit : 5000;
  const authorization = request.headers.get('Authorization')?.trim() || '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !navigatorClient || !navigatorPrivateKey) {
    return jsonResponse({ error: 'Yandex Navigator signing is not configured' }, 503);
  }
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'Driver authentication is required' }, 401);
  }

  try {
    const body = await request.json() as { delivery_id?: unknown; rebuild_reason?: unknown };
    const deliveryId = typeof body.delivery_id === 'string' ? body.delivery_id.trim() : '';
    const rebuildReason = typeof body.rebuild_reason === 'string' ? body.rebuild_reason.trim().slice(0, 200) : '';
    if (!deliveryId) return jsonResponse({ error: 'delivery_id is required' }, 400);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: driverId, error: driverError } = await userClient.rpc('current_driver_id');
    if (driverError || typeof driverId !== 'string' || !driverId) {
      return jsonResponse({ error: 'Driver authentication is required' }, 403);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: delivery, error: deliveryError } = await admin
      .from('deliveries')
      .select('id, order_id, driver_id, status')
      .eq('id', deliveryId)
      .eq('driver_id', driverId)
      .maybeSingle();
    if (deliveryError || !delivery) return jsonResponse({ error: 'Delivery is unavailable' }, 404);

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, catalog_id, restaurant_id, restaurant_lat_snapshot, restaurant_lng_snapshot, delivery_lat, delivery_lng')
      .eq('id', delivery.order_id)
      .maybeSingle();
    if (orderError || !order) return jsonResponse({ error: 'Order is unavailable' }, 404);

    let businessLat = finiteCoordinate(order.restaurant_lat_snapshot, 90);
    let businessLon = finiteCoordinate(order.restaurant_lng_snapshot, 180);
    if (businessLat === null || businessLon === null) {
      let restaurantQuery = admin.from('restaurants').select('lat, lng');
      restaurantQuery = order.restaurant_id
        ? restaurantQuery.eq('id', order.restaurant_id)
        : restaurantQuery.eq('catalog_id', order.catalog_id);
      const { data: restaurant } = await restaurantQuery.limit(1).maybeSingle();
      businessLat = finiteCoordinate(restaurant?.lat, 90);
      businessLon = finiteCoordinate(restaurant?.lng, 180);
    }

    const clientLat = finiteCoordinate(order.delivery_lat, 90);
    const clientLon = finiteCoordinate(order.delivery_lng, 180);
    if (clientLat === null || clientLon === null) {
      return jsonResponse({ error: 'Client coordinates are missing' }, 409);
    }

    const { data: driver } = await admin
      .from('drivers')
      .select('last_lat, last_lng')
      .eq('id', driverId)
      .maybeSingle();
    const driverLat = finiteCoordinate(driver?.last_lat, 90);
    const driverLon = finiteCoordinate(driver?.last_lng, 180);
    const includeBusiness = ['assigned', 'arrived_to_restaurant'].includes(String(delivery.status));
    if (includeBusiness && (businessLat === null || businessLon === null)) {
      return jsonResponse({ error: 'Business coordinates are missing' }, 409);
    }

    const routeShape = JSON.stringify({
      deliveryId,
      stage: includeBusiness ? 'business_then_client' : 'client',
      driverLat,
      driverLon,
      businessLat: includeBusiness ? businessLat : null,
      businessLon: includeBusiness ? businessLon : null,
      clientLat,
      clientLon
    });
    const routeFingerprint = createHash('sha256').update(routeShape).digest('hex');
    const { data: existing } = await admin
      .from('yandex_navigator_route_sessions')
      .select('route_fingerprint, signed_url, signed_route_build_count')
      .eq('delivery_id', deliveryId)
      .maybeSingle();
    if (!rebuildReason && typeof existing?.signed_url === 'string') {
      return jsonResponse({ url: existing.signed_url, reused: true, build_count: existing.signed_route_build_count });
    }

    const params = new URLSearchParams();
    appendPoint(params, 'from', driverLat, driverLon);
    if (includeBusiness) appendPoint(params, 'via_0', businessLat, businessLon);
    appendPoint(params, 'to', clientLat, clientLon);
    params.set('client', navigatorClient);
    const unsignedUrl = `yandexnavi://build_route_on_map?${params.toString()}`;
    const signature = sign('RSA-SHA256', Buffer.from(unsignedUrl), createPrivateKey(navigatorPrivateKey)).toString('base64');
    const signedUrl = `${unsignedUrl}&signature=${encodeURIComponent(signature)}`;
    const nextBuildCount = Number(existing?.signed_route_build_count ?? 0) + 1;

    const { data: dailyUsed, error: reservationError } = await admin.rpc('reserve_yandex_navigator_transition', {
      target_delivery_id: deliveryId,
      target_driver_id: driverId,
      target_transition_kind: existing ? 'rebuild' : 'initial',
      daily_limit: dailyLimit
    });
    if (reservationError) {
      if (/yandex_navigator_daily_limit_reached/i.test(reservationError.message)) {
        return jsonResponse({ error: 'Yandex Navigator daily transition limit reached' }, 429);
      }
      throw reservationError;
    }

    const { error: sessionError } = await admin.from('yandex_navigator_route_sessions').upsert({
      delivery_id: deliveryId,
      driver_id: driverId,
      route_fingerprint: routeFingerprint,
      signed_url: signedUrl,
      signed_route_build_count: nextBuildCount,
      last_rebuild_reason: rebuildReason,
      updated_at: new Date().toISOString()
    });
    if (sessionError) throw sessionError;

    return jsonResponse({
      url: signedUrl,
      reused: false,
      build_count: nextBuildCount,
      daily_used: Number(dailyUsed ?? 0),
      daily_limit: dailyLimit
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to sign Navigator route' }, 500);
  }
});
