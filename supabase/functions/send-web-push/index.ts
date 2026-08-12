import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { selectPriorityDriverSubscriptions } from './premiumDispatch.ts';
import { getRussianPushStatus } from './pushMessages.ts';

type WebhookEvent = {
  type?: string;
  table?: string;
  record?: Record<string, unknown>;
  old_record?: Record<string, unknown>;
};

type Subscription = {
  id: string;
  driver_id?: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('WEB_PUSH_ALLOWED_ORIGIN')?.trim() || 'https://wayyaam.ru',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

const asString = (value: unknown) => typeof value === 'string' ? value : '';
const asId = (value: unknown) => asString(value).trim();
const normalizePlace = (value: unknown) => asString(value).trim().toLocaleLowerCase('ru-RU');

const driverServesDeliveryLocation = (
  driver: { city_name?: unknown; service_settlements?: unknown },
  city: unknown,
  settlement: unknown
) => {
  const servedPlaces = [
    normalizePlace(driver.city_name),
    ...(Array.isArray(driver.service_settlements) ? driver.service_settlements.map(normalizePlace) : [])
  ].filter(Boolean);
  if (servedPlaces.length === 0) return true;
  const deliveryPlaces = new Set([normalizePlace(city), normalizePlace(settlement)].filter(Boolean));
  return servedPlaces.some((place) => deliveryPlaces.has(place));
};

const appBaseUrl = () => {
  const value = Deno.env.get('PUBLIC_APP_URL')?.trim() || 'https://studia95.github.io/catalogg/';
  return value.endsWith('/') ? value : `${value}/`;
};

const orderUrl = (slug: string, orderId: string) =>
  `${appBaseUrl()}#/${encodeURIComponent(slug)}/orders?order=${encodeURIComponent(orderId)}`;

const uniqueSubscriptions = (items: Subscription[]) =>
  Array.from(new Map(items.map((item) => [item.endpoint, item])).values());

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const webhookSecret = Deno.env.get('WEB_PUSH_WEBHOOK_SECRET')?.trim();
  if (!webhookSecret) {
    return jsonResponse({ error: 'Web Push webhook secret is not configured.' }, 503);
  }
  if (request.headers.get('x-webhook-secret') !== webhookSecret) {
    return jsonResponse({ error: 'Invalid webhook secret' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('CATALOGG_SERVICE_ROLE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

  if (!supabaseUrl || !serviceRoleKey || !vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    return jsonResponse({ error: 'Web Push secrets are not configured.' }, 500);
  }

  try {
    const event = await request.json() as WebhookEvent;
    const record = event.record ?? {};
    const admin = createClient(supabaseUrl, serviceRoleKey);
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    let subscriptions: Subscription[] = [];
    let title = 'WayCatalog';
    let body = 'Есть новое обновление';
    let url = `${appBaseUrl()}#/`;
    let tag = 'waycatalog-update';

    if (event.table === 'test') {
      const role = asString(record.role) || 'super_admin';
      title = asString(record.title) || 'WayCatalog push работает';
      body = asString(record.body) || 'Тестовое уведомление успешно дошло до сервера.';
      url = asString(record.url) || `${appBaseUrl()}#/`;
      tag = `web-push-test-${role}`;

      let query = admin.from('web_push_subscriptions').select('id, endpoint, p256dh, auth').eq('role', role);
      const driverId = asId(record.driver_id);
      const catalogId = asId(record.catalog_id);
      if (role === 'driver' && driverId) query = query.eq('driver_id', driverId);
      if (role === 'restaurant' && catalogId) query = query.eq('catalog_id', catalogId);
      const { data } = await query;
      subscriptions = (data ?? []) as Subscription[];
    }

    if (event.table === 'orders') {
      const orderId = asId(record.id);
      const catalogId = asId(record.catalog_id);
      const { data: catalog } = await admin.from('catalogs').select('slug').eq('id', catalogId).maybeSingle();
      const slug = asString(catalog?.slug);
      const status = asString(record.status) || 'new';
      const isNew = event.type === 'INSERT' || status === 'new';
      title = isNew ? `Новый заказ #${orderId.slice(0, 8).toUpperCase()}` : `Статус заказа #${orderId.slice(0, 8).toUpperCase()}`;
      body = isNew
        ? `${asString(record.client_name || record.customer_name) || 'Клиент'} оформил заказ`
        : `Статус изменён: ${getRussianPushStatus(status)}`;
      url = slug ? orderUrl(slug, orderId) : `${appBaseUrl()}#/`;
      tag = `order-${orderId}`;

      const [{ data: restaurantSubscriptions }, { data: adminSubscriptions }] = await Promise.all([
        admin.from('web_push_subscriptions').select('id, endpoint, p256dh, auth').eq('role', 'restaurant').eq('catalog_id', catalogId),
        admin.from('web_push_subscriptions').select('id, endpoint, p256dh, auth').eq('role', 'super_admin')
      ]);
      subscriptions = [...(restaurantSubscriptions ?? []), ...(adminSubscriptions ?? [])] as Subscription[];
    }

    if (event.table === 'deliveries') {
      const deliveryId = asId(record.id);
      const orderId = asId(record.order_id);
      const [{ data: order }, { data: delivery }] = await Promise.all([
        admin.from('orders').select('catalog_id, restaurant_id, id, delivery_city, delivery_settlement, is_test_order').eq('id', orderId).maybeSingle(),
        admin.from('deliveries').select('driver_id, status, delivery_provider').eq('id', deliveryId).maybeSingle()
      ]);
      const catalogId = asId(order?.catalog_id);
      const driverId = asId(delivery?.driver_id);
      title = event.type === 'INSERT' || record.status === 'waiting_courier' ? 'Новая доставка' : 'Обновление доставки';
      body = `Заказ #${orderId.slice(0, 8).toUpperCase()} · ${getRussianPushStatus(record.status || delivery?.status)}`;
      url = `${appBaseUrl()}#/driver/orders/${encodeURIComponent(deliveryId)}`;
      tag = `delivery-${deliveryId}`;

      let driverSubscriptions: Subscription[] = [];
      if (driverId) {
        const { data } = await admin
          .from('web_push_subscriptions')
          .select('id, endpoint, p256dh, auth')
          .eq('role', 'driver')
          .eq('driver_id', driverId);
        driverSubscriptions = (data ?? []) as Subscription[];
      } else {
        const { data: onlineDrivers } = await admin
          .from('drivers')
          .select('id, city_name, service_settlements, max_active_deliveries, is_premium, is_test')
          .eq('is_active', true)
          .eq('is_online', true);
        const onlineDriverRows = onlineDrivers ?? [];
        const candidateIds = onlineDriverRows.map((driver) => driver.id).filter(Boolean);
        const { data: activeDeliveries } = candidateIds.length > 0
          ? await admin
            .from('deliveries')
            .select('driver_id')
            .in('driver_id', candidateIds)
            .in('status', ['assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client'])
          : { data: [] };
        const activeCounts = new Map<string, number>();
        for (const activeDelivery of activeDeliveries ?? []) {
          const activeDriverId = asId(activeDelivery.driver_id);
          if (activeDriverId) activeCounts.set(activeDriverId, (activeCounts.get(activeDriverId) ?? 0) + 1);
        }

        let restaurantCourierIds: Set<string> | null = null;
        if (asString(delivery?.delivery_provider) === 'restaurant') {
          const restaurantId = asId(order?.restaurant_id);
          const { data: restaurants } = restaurantId
            ? { data: [{ id: restaurantId }] }
            : await admin.from('restaurants').select('id').eq('catalog_id', catalogId);
          const restaurantIds = (restaurants ?? []).map((restaurant) => restaurant.id).filter(Boolean);
          const { data: restaurantCouriers } = restaurantIds.length > 0
            ? await admin
              .from('restaurant_couriers')
              .select('driver_id')
              .in('restaurant_id', restaurantIds)
              .eq('is_active', true)
            : { data: [] };
          restaurantCourierIds = new Set((restaurantCouriers ?? []).map((courier) => asId(courier.driver_id)).filter(Boolean));
        }

        const eligibleDrivers = onlineDriverRows
          .filter((driver) => Boolean(driver.is_test) === Boolean(order?.is_test_order))
          .filter((driver) => driverServesDeliveryLocation(driver, order?.delivery_city, order?.delivery_settlement))
          .filter((driver) => (activeCounts.get(driver.id) ?? 0) < Number(driver.max_active_deliveries ?? 1))
          .filter((driver) => restaurantCourierIds === null || restaurantCourierIds.has(driver.id));
        const onlineDriverIds = eligibleDrivers
          .map((driver) => driver.id)
          .filter(Boolean);
        if (onlineDriverIds.length > 0) {
          const { data } = await admin
            .from('web_push_subscriptions')
            .select('id, driver_id, endpoint, p256dh, auth')
            .eq('role', 'driver')
            .in('driver_id', onlineDriverIds);
          driverSubscriptions = selectPriorityDriverSubscriptions(
            eligibleDrivers,
            (data ?? []) as Subscription[]
          );
        }
      }

      const { data: adminSubscriptions } = await admin
        .from('web_push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('role', 'super_admin');
      subscriptions = [...driverSubscriptions, ...((adminSubscriptions ?? []) as Subscription[])];

      if (catalogId && event.type === 'UPDATE' && record.status === 'delivered') {
        const { data: restaurantSubscriptions } = await admin
          .from('web_push_subscriptions')
          .select('id, endpoint, p256dh, auth')
          .eq('role', 'restaurant')
          .eq('catalog_id', catalogId);
        subscriptions.push(...((restaurantSubscriptions ?? []) as Subscription[]));
      }
    }

    const payload = JSON.stringify({ title, body, url, tag });
    let sent = 0;
    for (const subscription of uniqueSubscriptions(subscriptions)) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload
        );
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('web_push_subscriptions').delete().eq('id', subscription.id);
        }
      }
    }

    return jsonResponse({ ok: true, sent });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to send Web Push' }, 500);
  }
});
