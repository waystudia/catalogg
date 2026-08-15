import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationName = readdirSync(resolve(repoRoot, 'supabase/migrations'))
  .find((name) => name.endsWith('_combined_order_foundation.sql'));
const migration = migrationName
  ? readFileSync(resolve(repoRoot, 'supabase/migrations', migrationName), 'utf8')
  : '';

describe('combined order database foundation', () => {
  it('extends the current orders and deliveries instead of creating a parallel merchant-order system', () => {
    assert.ok(migrationName, 'combined order foundation migration must exist');
    assert.match(migration, /alter table public\.orders[\s\S]*?add column if not exists order_group_id uuid/i);
    assert.match(migration, /add column if not exists is_addon boolean not null default false/i);
    assert.match(migration, /add column if not exists source text not null default 'standard'/i);
    assert.match(migration, /add column if not exists estimated_ready_at timestamptz/i);
    assert.match(migration, /alter table public\.deliveries[\s\S]*?add column if not exists order_group_id uuid/i);
    assert.doesNotMatch(migration, /create table(?: if not exists)? public\.merchant_orders/i);
    assert.doesNotMatch(migration, /drop (?:table|column|constraint)\s+(?!if exists deliveries_status_check)/i);
  });

  it('stores one customer order group with separately auditable merchant and delivery money', () => {
    assert.match(migration, /create table(?: if not exists)? public\.order_groups/i);
    assert.match(migration, /client_account_id uuid not null references public\.client_accounts/i);
    assert.match(migration, /primary_order_id uuid not null unique references public\.orders/i);
    assert.match(migration, /merchant_subtotal_amount numeric\(12,2\)/i);
    assert.match(migration, /base_delivery_fee_amount numeric\(12,2\)/i);
    assert.match(migration, /addon_delivery_fee_amount numeric\(12,2\)/i);
    assert.match(migration, /grand_total_amount numeric\(12,2\)/i);
  });

  it('models generic N-stop delivery routes rather than restaurant/store-specific columns', () => {
    assert.match(migration, /create table(?: if not exists)? public\.delivery_stops/i);
    assert.match(migration, /merchant_order_id uuid references public\.orders/i);
    assert.match(migration, /stop_type text not null[\s\S]*?'pickup'[\s\S]*?'dropoff'/i);
    assert.match(migration, /sequence integer not null/i);
    assert.match(migration, /estimated_arrival_at timestamptz/i);
    assert.match(migration, /completed_at timestamptz/i);
    assert.match(migration, /unique \(delivery_id, sequence\)[\s\S]*?deferrable initially deferred/i);
    assert.doesNotMatch(migration, /restaurant_pickup|store_pickup|restaurantPickup|storePickup/i);
  });

  it('persists expiring offers, server quotes, events, and deduplicated notifications', () => {
    for (const table of ['addon_offers', 'addon_quotes', 'order_group_events', 'notifications']) {
      assert.match(migration, new RegExp(`create table(?: if not exists)? public\\.${table}`, 'i'));
    }
    assert.match(migration, /addon_offers[\s\S]*?expires_at timestamptz not null/i);
    assert.match(migration, /addon_quotes[\s\S]*?items_snapshot jsonb not null/i);
    assert.match(migration, /order_group_events[\s\S]*?event_type text not null/i);
    assert.match(migration, /notifications[\s\S]*?dedupe_key text/i);
    assert.match(migration, /create unique index(?: if not exists)? notifications_recipient_dedupe_idx/i);
  });

  it('keeps every product limit in one disabled-by-default configuration row', () => {
    assert.match(migration, /create table(?: if not exists)? public\.post_order_addon_config/i);
    assert.match(migration, /enabled boolean not null default false/i);
    assert.match(migration, /offer_window_minutes integer not null default 5/i);
    assert.match(migration, /addon_delivery_fee numeric\(12,2\) not null default 40/i);
    assert.match(migration, /max_extra_distance_km numeric\(8,3\) not null default 3/i);
    assert.match(migration, /max_extra_time_minutes integer not null default 10/i);
    assert.match(migration, /max_post_main_pickup_delay_minutes integer not null default 3/i);
    assert.match(migration, /max_additional_merchants integer not null default 1/i);
    assert.match(migration, /candidate_store_radius_km numeric\(8,3\) not null default 2/i);
    assert.match(migration, /route_corridor_km numeric\(8,3\) not null default 1\.5/i);
    assert.match(migration, /max_route_candidates integer not null default 15/i);
    assert.match(migration, /allowed_primary_merchant_ids uuid\[\]/i);
    assert.match(migration, /allowed_addon_merchant_ids uuid\[\]/i);
    assert.match(migration, /allowed_client_account_ids uuid\[\]/i);
  });

  it('enforces ownership, tenant isolation, and server-managed writes', () => {
    for (const table of [
      'order_groups',
      'delivery_stops',
      'addon_offers',
      'addon_quotes',
      'order_group_events',
      'notifications',
      'post_order_addon_config'
    ]) {
      assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
      assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
      assert.match(migration, new RegExp(`grant all on table public\\.${table} to service_role`, 'i'));
    }
    assert.match(migration, /create or replace function public\.is_order_group_client[\s\S]*?security definer[\s\S]*?set search_path = ''/i);
    assert.match(migration, /extensions\.digest\(coalesce\(client_session_token, ''\), 'sha256'\)/i);
    assert.match(migration, /public\.is_catalog_member\(\s*merchant_order\.catalog_id/i);
    assert.match(migration, /delivery\.driver_id = public\.current_driver_id\(\)/i);
    assert.match(migration, /create trigger orders_protect_combined_order_fields/i);
  });

  it('indexes hot lookups and makes addon confirmation idempotent per order group', () => {
    for (const index of [
      'order_groups_client_status_idx',
      'orders_order_group_status_idx',
      'deliveries_order_group_status_idx',
      'delivery_stops_delivery_sequence_idx',
      'addon_offers_status_expires_idx',
      'addon_quotes_group_merchant_idx',
      'order_group_events_group_created_idx',
      'notifications_client_unread_idx'
    ]) {
      assert.match(migration, new RegExp(`create (?:unique )?index(?: if not exists)? ${index}`, 'i'));
    }
    assert.match(migration, /create unique index(?: if not exists)? orders_addon_group_idempotency_idx/i);
    assert.match(migration, /on public\.orders\(order_group_id, idempotency_key\)[\s\S]*?where is_addon/i);
  });

  it('publishes only realtime state needed by clients and couriers', () => {
    assert.match(migration, /alter publication supabase_realtime add table public\.addon_offers/i);
    assert.match(migration, /alter publication supabase_realtime add table public\.delivery_stops/i);
    assert.match(migration, /alter publication supabase_realtime add table public\.notifications/i);
  });
});
