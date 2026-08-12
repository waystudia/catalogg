import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('background web push contract', () => {
  it('contains a push-aware service worker and notification click routing', async () => {
    const source = await read('src/sw.ts');
    assert.match(source, /addEventListener\(['"]push['"]/);
    assert.match(source, /showNotification/);
    assert.match(source, /notificationclick/);
    assert.match(source, /clients\.openWindow/);
  });

  it('registers a persistent push-only worker instead of waiting for a missing worker', async () => {
    const [main, registration, webPush] = await Promise.all([
      read('src/main.tsx'),
      read('src/shared/pushServiceWorker.ts'),
      read('src/shared/webPush.ts')
    ]);
    assert.match(main, /ensurePushServiceWorkerRegistration/);
    assert.match(registration, /navigator\.serviceWorker\.register/);
    assert.match(registration, /sw\.js\?mode=push/);
    assert.doesNotMatch(registration, /controllerchange|location\.reload/);
    assert.match(webPush, /ensurePushServiceWorkerRegistration/);
    assert.doesNotMatch(webPush, /navigator\.serviceWorker\.ready/);
  });

  it('keeps map tiles out of service-worker storage while retaining push support', async () => {
    const source = await read('src/sw.ts');
    assert.doesNotMatch(source, /CacheFirst|ExpirationPlugin|catalog-map-tiles/);
    assert.doesNotMatch(source, /tile\.openstreetmap\.org|arcgisonline\.com/);
    assert.match(source, /caches\.keys\(\)/);
    assert.match(source, /showNotification/);
  });

  it('stores subscriptions with an upsert key and protects them with RLS', async () => {
    const source = await read('supabase/web_push.sql');
    assert.match(source, /create table if not exists public\.web_push_subscriptions/);
    assert.match(source, /unique \(user_id, endpoint\)/);
    assert.match(source, /enable row level security/);
    assert.match(source, /upsert_web_push_subscription/);
    assert.match(source, /Only platform administrators can register super-admin push/);
    assert.match(source, /Only the driver can register this driver push subscription/);
    assert.match(source, /Only catalog members can register restaurant push subscriptions/);
    assert.match(source, /Only the order client can register this client push subscription/);
    assert.match(source, /platform_user\.auth_user_id = auth\.uid\(\)/);
    assert.match(source, /upsert_client_order_push_subscription/);
    assert.match(source, /client_account_sessions/);
    assert.match(source, /client_push_order_ownership_required/);
    assert.match(source, /app_base_url/);
    const browserSource = await read('src/shared/webPush.ts');
    assert.match(browserSource, /getStoredClientSessionToken/);
    assert.match(browserSource, /upsert_client_order_push_subscription/);
    assert.match(browserSource, /app_base_url_input/);
  });

  it('has a server-side sender that signs Web Push requests with VAPID secrets', async () => {
    const source = await read('supabase/functions/send-web-push/index.ts');
    assert.match(source, /VAPID_PRIVATE_KEY/);
    assert.match(source, /npm:web-push@3\.6\.7/);
    assert.match(source, /webpush\.setVapidDetails\(/);
    assert.match(source, /webpush\.sendNotification\(/);
    assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(source, /event\.table === 'test'/);
  });

  it('recreates browser subscriptions when the stored VAPID key is stale', async () => {
    const source = await read('src/shared/webPush.ts');
    assert.match(source, /subscriptionUsesPublicKey/);
    assert.match(source, /unsubscribe\(\)/);
    assert.match(source, /createPushSubscription/);
  });

  it('revalidates the iPhone PWA subscription after returning online or from the background', async () => {
    const driverApp = await read('src/pages/driver/DriverApp.tsx');
    const notifications = await read('src/shared/restaurantOrderNotifications.ts');
    assert.match(driverApp, /visibilitychange/);
    assert.match(driverApp, /pageshow/);
    assert.match(driverApp, /window\.addEventListener\(['"]online['"]/);
    assert.match(driverApp, /restoreRestaurantOrderNotificationSubscription/);
    assert.match(driverApp, /10_000/);
    assert.match(notifications, /registered \? 'granted' : 'default'/);
  });

  it('notifies only online drivers who serve the delivery city or settlement', async () => {
    const source = await read('supabase/functions/send-web-push/index.ts');
    assert.match(source, /delivery_city, delivery_settlement/);
    assert.match(source, /city_name, service_settlements/);
    assert.match(source, /driverServesDeliveryLocation/);
    assert.match(source, /\.filter\(\(driver\) => driverServesDeliveryLocation/);
  });

  it('connects order and delivery changes to the sender through pg_net', async () => {
    const source = await read('supabase/web_push_triggers.sql');
    assert.match(source, /net\.http_post/);
    assert.match(source, /web_push_orders_event/);
    assert.match(source, /web_push_deliveries_event/);
    assert.match(source, /web_push_order_work_assignment_event/);
    assert.match(source, /web_push_order_substitution_event/);
    assert.match(source, /web_push_order_message_event/);
  });

  it('routes staff assignments, substitution decisions and chat to exact participants', async () => {
    const source = await read('supabase/functions/send-web-push/index.ts');
    assert.match(source, /event\.table === 'order_work_assignments'/);
    assert.match(source, /event\.table === 'order_substitution_requests'/);
    assert.match(source, /event\.table === 'order_messages'/);
    assert.match(source, /\.eq\('user_id', assigneeUserId\)/);
    assert.match(source, /\.eq\('order_id', orderId\)/);
    assert.match(source, /Товара нет в наличии/);
    assert.match(source, /subscriptionUrl/);
    assert.match(source, /#\/\$\{encodeURIComponent\(slug\)\}\/order\//);
  });
});
