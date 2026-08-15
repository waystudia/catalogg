import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationName = readdirSync(resolve(repoRoot, 'supabase/migrations'))
  .find((name) => name.endsWith('_combined_order_notifications.sql'));
const migration = migrationName
  ? readFileSync(resolve(repoRoot, 'supabase/migrations', migrationName), 'utf8')
  : '';
const push = readFileSync(resolve(repoRoot, 'supabase/functions/send-web-push/index.ts'), 'utf8');
const combinedEdge = readFileSync(resolve(repoRoot, 'supabase/functions/combined-order/index.ts'), 'utf8');
const api = readFileSync(resolve(repoRoot, 'src/shared/api/clientNotificationsApi.ts'), 'utf8');
const component = readFileSync(resolve(repoRoot, 'src/features/client-notifications/ClientNotificationCenter.tsx'), 'utf8');

describe('combined-order notifications contract', () => {
  it('expires stale offers and exposes only token-owned non-expired notifications', () => {
    assert.ok(migrationName, 'combined-order notification migration must exist');
    assert.match(migration, /create or replace function public\.expire_stale_post_order_addons/i);
    assert.match(migration, /expires_at <= now\(\)/i);
    assert.match(migration, /'ADDON_EXPIRED'/i);
    assert.match(migration, /create or replace function public\.get_client_notifications/i);
    assert.match(migration, /client_account_sessions[\s\S]*?extensions\.digest/i);
    assert.match(migration, /notification\.recipient_client_account_id = target_account_id/i);
    assert.match(migration, /notification\.expires_at > now\(\)/i);
  });

  it('marks only the owner notification as read and dispatches inserts through existing Web Push', () => {
    assert.match(migration, /create or replace function public\.mark_client_notification_read/i);
    assert.match(migration, /notification\.recipient_client_account_id = target_account_id/i);
    assert.match(migration, /web_push_combined_order_notification/i);
    assert.match(migration, /public\.enqueue_web_push_event\(\)/i);
  });

  it('does not push an offer that was opened, read, expired, or used', () => {
    assert.match(push, /event\.table === ['"]notifications['"]/);
    assert.match(push, /POST_ORDER_ADDON_AVAILABLE/);
    assert.match(push, /offer\.status !== ['"]available['"]/);
    assert.match(push, /notification\.read_at/);
    assert.match(push, /expires_at/);
    assert.match(push, /web_push_subscriptions/);
    assert.match(push, /role['"], ['"]client|eq\(['"]role['"], ['"]client['"]\)/);
  });

  it('marks the in-app notification read as soon as the offer opens', () => {
    assert.match(combinedEdge, /post-order-addon:/);
    assert.match(combinedEdge, /notifications/);
    assert.match(combinedEdge, /read_at/);
  });

  it('uses the custom client session in a mobile notification center', () => {
    assert.match(api, /getStoredClientSessionToken/);
    assert.match(api, /get_client_notifications/);
    assert.match(api, /mark_client_notification_read/);
    assert.match(component, /requestRestaurantOrderNotificationPermission/);
    assert.match(component, /role: ['"]client['"]/);
    assert.match(component, /navigate\(notification\.actionUrl\)/);
    assert.match(component, /aria-label=['"]Уведомления['"]/);
  });
});
