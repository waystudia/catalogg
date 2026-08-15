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
  user_id?: string | null;
  driver_id?: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  app_base_url?: string | null;
  target_url?: string;
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

const clientOrderUrl = (slug: string, orderId: string) =>
  `${appBaseUrl()}#/${encodeURIComponent(slug)}/order/${encodeURIComponent(orderId)}?conversation=1`;

const clientAddonOrderUrl = (slug: string, orderId: string) =>
  `${appBaseUrl()}#/${encodeURIComponent(slug)}/order/${encodeURIComponent(orderId)}?addon=1`;

const driverOrderUrl = (deliveryId: string) =>
  `${appBaseUrl()}#/driver/orders/${encodeURIComponent(deliveryId)}`;

const withTargetUrl = (items: unknown[] | null, targetUrl: string): Subscription[] =>
  (items ?? []).map((item) => ({ ...(item as Subscription), target_url: targetUrl }));

const subscriptionUrl = (fallbackUrl: string, subscription: Subscription) => {
  const base = asString(subscription.app_base_url).replace(/\/$/, '');
  if (!base || !/^https:\/\//i.test(base)) return fallbackUrl;
  try {
    const target = new URL(fallbackUrl);
    return target.hash ? `${base}/${target.hash}` : fallbackUrl;
  } catch {
    return fallbackUrl;
  }
};

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

      let query = admin.from('web_push_subscriptions').select('id, endpoint, p256dh, auth, app_base_url').eq('role', role);
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
      const { data: catalog } = await admin.from('catalogs').select('slug, business_type').eq('id', catalogId).maybeSingle();
      const slug = asString(catalog?.slug);
      const isStorePosSale = asString(catalog?.business_type) === 'grocery'
        && asString(record.fulfillment_type) !== 'delivery'
        && /(?:^|\n)\s*Касса магазина(?:\s|·|$)/iu.test(asString(record.comment));
      if (isStorePosSale) return jsonResponse({ ok: true, sent: 0, skipped: 'store_pos_sale' });
      const status = asString(record.status) || 'new';
      const isNew = event.type === 'INSERT' || status === 'new';
      title = isNew ? `Новый заказ #${orderId.slice(0, 8).toUpperCase()}` : `Статус заказа #${orderId.slice(0, 8).toUpperCase()}`;
      body = isNew
        ? `${asString(record.client_name || record.customer_name) || 'Клиент'} оформил заказ`
        : `Статус изменён: ${getRussianPushStatus(status)}`;
      url = slug ? orderUrl(slug, orderId) : `${appBaseUrl()}#/`;
      tag = `order-${orderId}`;

      const [{ data: restaurantSubscriptions }, { data: adminSubscriptions }] = await Promise.all([
        admin.from('web_push_subscriptions').select('id, endpoint, p256dh, auth, app_base_url').eq('role', 'restaurant').eq('catalog_id', catalogId),
        admin.from('web_push_subscriptions').select('id, endpoint, p256dh, auth, app_base_url').eq('role', 'super_admin')
      ]);
      subscriptions = [...(restaurantSubscriptions ?? []), ...(adminSubscriptions ?? [])] as Subscription[];
    }

    if (event.table === 'order_work_assignments') {
      const orderId = asId(record.order_id);
      const catalogId = asId(record.catalog_id);
      const assigneeUserId = asId(record.assignee_user_id);
      const state = asString(record.state);
      const [{ data: catalog }, { data: order }] = await Promise.all([
        admin.from('catalogs').select('slug').eq('id', catalogId).maybeSingle(),
        admin.from('orders').select('client_name, customer_name').eq('id', orderId).maybeSingle()
      ]);
      const slug = asString(catalog?.slug);
      title = state === 'offered' ? 'Новый заказ на сборку' : 'Назначение заказа обновлено';
      body = `${asString(order?.client_name || order?.customer_name) || 'Клиент'} · заказ #${orderId.slice(0, 8).toUpperCase()}`;
      url = slug ? orderUrl(slug, orderId) : `${appBaseUrl()}#/`;
      tag = `order-assignment-${orderId}`;

      if (assigneeUserId && ['offered', 'accepted'].includes(state)) {
        const { data } = await admin
          .from('web_push_subscriptions')
          .select('id, endpoint, p256dh, auth, app_base_url')
          .eq('role', 'restaurant')
          .eq('catalog_id', catalogId)
          .eq('user_id', assigneeUserId);
        subscriptions = (data ?? []) as Subscription[];
      }
    }

    if (event.table === 'order_substitution_requests') {
      const orderId = asId(record.order_id);
      const catalogId = asId(record.catalog_id);
      const state = asString(record.state);
      const { data: catalog } = await admin.from('catalogs').select('slug').eq('id', catalogId).maybeSingle();
      const slug = asString(catalog?.slug);
      tag = `order-substitution-${asId(record.id) || orderId}`;

      if (state === 'pending') {
        const proposedTitle = asString(record.proposed_title_snapshot) || 'Предложена замена';
        const priceDelta = Number(record.price_delta ?? 0);
        title = 'Товара нет в наличии';
        body = `${proposedTitle}${priceDelta === 0 ? ' · цена не изменится' : priceDelta > 0 ? ` · доплата ${priceDelta} ₽` : ` · возврат ${Math.abs(priceDelta)} ₽`}`;
        url = slug ? clientOrderUrl(slug, orderId) : `${appBaseUrl()}#/`;
        const { data } = await admin
          .from('web_push_subscriptions')
          .select('id, endpoint, p256dh, auth, app_base_url')
          .eq('role', 'client')
          .eq('order_id', orderId);
        subscriptions = (data ?? []) as Subscription[];
      } else if (['accepted', 'removed', 'alternative_requested'].includes(state)) {
        title = 'Решение по замене';
        body = state === 'accepted'
          ? 'Клиент принял предложенную замену'
          : state === 'removed'
            ? 'Клиент попросил убрать товар'
            : 'Клиент попросил предложить другой товар';
        url = slug ? orderUrl(slug, orderId) : `${appBaseUrl()}#/`;
        const { data: activeAssignment } = await admin
          .from('order_work_assignments')
          .select('assignee_user_id')
          .eq('order_id', orderId)
          .eq('state', 'accepted')
          .maybeSingle();
        const assigneeUserId = asId(activeAssignment?.assignee_user_id);
        let query = admin
          .from('web_push_subscriptions')
          .select('id, endpoint, p256dh, auth, app_base_url')
          .eq('role', 'restaurant')
          .eq('catalog_id', catalogId);
        if (assigneeUserId) query = query.eq('user_id', assigneeUserId);
        const { data } = await query;
        subscriptions = (data ?? []) as Subscription[];
      }
    }

    if (event.table === 'order_messages') {
      const orderId = asId(record.order_id);
      const catalogId = asId(record.catalog_id);
      const senderKind = asString(record.sender_kind);
      const messageType = asString(record.message_type);
      const senderAuthUserId = asId(record.sender_auth_user_id);
      const [{ data: catalog }, { data: activeDelivery }] = await Promise.all([
        admin.from('catalogs').select('slug').eq('id', catalogId).maybeSingle(),
        admin
          .from('deliveries')
          .select('id, driver_id')
          .eq('order_id', orderId)
          .not('driver_id', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);
      const slug = asString(catalog?.slug);
      const deliveryId = asId(activeDelivery?.id);
      const driverId = asId(activeDelivery?.driver_id);
      const restaurantTargetUrl = slug ? orderUrl(slug, orderId) : `${appBaseUrl()}#/`;
      const clientTargetUrl = slug ? clientOrderUrl(slug, orderId) : `${appBaseUrl()}#/`;
      const driverTargetUrl = deliveryId ? driverOrderUrl(deliveryId) : `${appBaseUrl()}#/driver/active`;
      title = senderKind === 'system' ? 'Статус заказа обновлён' : 'Новое сообщение по заказу';
      body = asString(record.body) || 'Откройте заказ, чтобы прочитать сообщение';
      tag = `order-message-${orderId}`;

      if (senderKind !== 'system' || messageType === 'status_event') {
        const [{ data: clientSubscriptions }, { data: restaurantSubscriptions }, { data: driverSubscriptions }] = await Promise.all([
          admin
            .from('web_push_subscriptions')
            .select('id, user_id, endpoint, p256dh, auth, app_base_url')
            .eq('role', 'client')
            .eq('order_id', orderId),
          admin
            .from('web_push_subscriptions')
            .select('id, user_id, endpoint, p256dh, auth, app_base_url')
            .eq('role', 'restaurant')
            .eq('catalog_id', catalogId),
          driverId
            ? admin
              .from('web_push_subscriptions')
              .select('id, user_id, driver_id, endpoint, p256dh, auth, app_base_url')
              .eq('role', 'driver')
              .eq('driver_id', driverId)
            : Promise.resolve({ data: [] })
        ]);

        if (senderKind === 'client') {
          subscriptions = [
            ...withTargetUrl(restaurantSubscriptions, restaurantTargetUrl),
            ...withTargetUrl(driverSubscriptions, driverTargetUrl)
          ];
        } else if (senderKind === 'staff') {
          subscriptions = [
            ...withTargetUrl(clientSubscriptions, clientTargetUrl),
            ...withTargetUrl(driverSubscriptions, driverTargetUrl)
          ];
        } else if (senderKind === 'driver') {
          subscriptions = [
            ...withTargetUrl(clientSubscriptions, clientTargetUrl),
            ...withTargetUrl(restaurantSubscriptions, restaurantTargetUrl)
          ];
        } else if (messageType === 'status_event') {
          subscriptions = [
            ...withTargetUrl(clientSubscriptions, clientTargetUrl),
            ...withTargetUrl(restaurantSubscriptions, restaurantTargetUrl),
            ...withTargetUrl(driverSubscriptions, driverTargetUrl)
          ];
        }

        if (senderAuthUserId) {
          subscriptions = subscriptions.filter((subscription) => subscription.user_id !== senderAuthUserId);
        }
      }
    }

    if (event.table === 'notifications') {
      const notificationId = asId(record.id);
      const { data: notification } = await admin
        .from('notifications')
        .select('id, recipient_client_account_id, recipient_auth_user_id, notification_type, title, body, action_url, dedupe_key, read_at, expires_at, metadata')
        .eq('id', notificationId)
        .maybeSingle();
      const expiresAt = asString(notification?.expires_at);
      if (
        !notification ||
        notification.read_at ||
        (expiresAt && Date.parse(expiresAt) <= Date.now())
      ) {
        return jsonResponse({ ok: true, sent: 0, skipped: 'notification_inactive' });
      }

      const notificationType = asString(notification.notification_type);
      const metadata = notification.metadata && typeof notification.metadata === 'object'
        ? notification.metadata as Record<string, unknown>
        : {};
      const orderGroupId = asId(metadata.order_group_id);
      const offerId = asId(metadata.offer_id);
      if (notificationType === 'POST_ORDER_ADDON_AVAILABLE') {
        const { data: offer } = await admin
          .from('addon_offers')
          .select('status, expires_at, viewed_at')
          .eq('id', offerId)
          .eq('order_group_id', orderGroupId)
          .maybeSingle();
        if (
          !offer ||
          offer.status !== 'available' ||
          offer.viewed_at ||
          Date.parse(asString(offer.expires_at)) <= Date.now()
        ) {
          return jsonResponse({ ok: true, sent: 0, skipped: 'addon_offer_opened_or_expired' });
        }
      }

      const { data: orderGroup } = orderGroupId
        ? await admin
          .from('order_groups')
          .select('primary_order_id')
          .eq('id', orderGroupId)
          .maybeSingle()
        : { data: null };
      const primaryOrderId = asId(metadata.primary_order_id) || asId(orderGroup?.primary_order_id);
      const { data: primaryOrder } = primaryOrderId
        ? await admin
          .from('orders')
          .select('catalog_id')
          .eq('id', primaryOrderId)
          .maybeSingle()
        : { data: null };
      const catalogId = asId(primaryOrder?.catalog_id);
      const { data: catalog } = catalogId
        ? await admin.from('catalogs').select('slug').eq('id', catalogId).maybeSingle()
        : { data: null };
      const slug = asString(catalog?.slug);

      title = asString(notification.title) || 'Обновление заказа';
      body = asString(notification.body) || 'Откройте заказ, чтобы посмотреть подробности.';
      url = slug && primaryOrderId
        ? clientAddonOrderUrl(slug, primaryOrderId)
        : `${appBaseUrl()}#/`;
      tag = asString(notification.dedupe_key) || `client-notification-${notificationId}`;

      const recipientClientAccountId = asId(notification.recipient_client_account_id);
      const recipientAuthUserId = asId(notification.recipient_auth_user_id);
      const { data: clientAccount } = recipientClientAccountId
        ? await admin
          .from('client_accounts')
          .select('auth_user_id')
          .eq('id', recipientClientAccountId)
          .maybeSingle()
        : { data: null };
      const recipientIds = Array.from(new Set([
        recipientClientAccountId,
        recipientAuthUserId,
        asId(clientAccount?.auth_user_id)
      ].filter(Boolean)));

      const [byOrder, byUser] = await Promise.all([
        primaryOrderId
          ? admin
            .from('web_push_subscriptions')
            .select('id, user_id, endpoint, p256dh, auth, app_base_url')
            .eq('role', 'client')
            .eq('order_id', primaryOrderId)
          : Promise.resolve({ data: [] }),
        recipientIds.length > 0
          ? admin
            .from('web_push_subscriptions')
            .select('id, user_id, endpoint, p256dh, auth, app_base_url')
            .eq('role', 'client')
            .in('user_id', recipientIds)
          : Promise.resolve({ data: [] })
      ]);
      subscriptions = uniqueSubscriptions([
        ...withTargetUrl(byOrder.data, url),
        ...withTargetUrl(byUser.data, url)
      ]);
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
          .select('id, endpoint, p256dh, auth, app_base_url')
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
        .select('id, endpoint, p256dh, auth, app_base_url')
        .eq('role', 'super_admin');
      subscriptions = [...driverSubscriptions, ...((adminSubscriptions ?? []) as Subscription[])];

      if (catalogId && event.type === 'UPDATE' && record.status === 'delivered') {
        const { data: restaurantSubscriptions } = await admin
          .from('web_push_subscriptions')
          .select('id, endpoint, p256dh, auth, app_base_url')
          .eq('role', 'restaurant')
          .eq('catalog_id', catalogId);
        subscriptions.push(...((restaurantSubscriptions ?? []) as Subscription[]));
      }
    }

    let sent = 0;
    for (const subscription of uniqueSubscriptions(subscriptions)) {
      try {
        const payload = JSON.stringify({
          title,
          body,
          url: subscriptionUrl(subscription.target_url ?? url, subscription),
          tag
        });
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
