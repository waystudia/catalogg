-- Combined Order foundation.
-- Existing public.orders rows remain the merchant-order source of truth and
-- existing public.deliveries.order_id remains the primary-order compatibility link.

begin;

create extension if not exists pgcrypto;

create table if not exists public.post_order_addon_config (
  id text primary key,
  enabled boolean not null default false,
  test_only boolean not null default true,
  offer_window_minutes integer not null default 5,
  addon_delivery_fee numeric(12,2) not null default 40,
  max_extra_distance_km numeric(8,3) not null default 3,
  max_extra_time_minutes integer not null default 10,
  max_post_main_pickup_delay_minutes integer not null default 3,
  max_additional_merchants integer not null default 1,
  candidate_store_radius_km numeric(8,3) not null default 2,
  route_corridor_km numeric(8,3) not null default 1.5,
  max_route_candidates integer not null default 15,
  max_shown_merchants integer not null default 5,
  quote_ttl_seconds integer not null default 120,
  quote_rate_limit_per_minute integer not null default 12,
  confirm_rate_limit_per_minute integer not null default 6,
  eligible_primary_business_types text[] not null default array['restaurant', 'coffee_shop', 'confectionery']::text[],
  eligible_addon_business_types text[] not null default array['grocery']::text[],
  allowed_settlement_ids uuid[] not null default '{}'::uuid[],
  allowed_primary_merchant_ids uuid[] not null default '{}'::uuid[],
  allowed_addon_merchant_ids uuid[] not null default '{}'::uuid[],
  allowed_client_account_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_order_addon_config_window_check check (offer_window_minutes between 1 and 60),
  constraint post_order_addon_config_fee_check check (addon_delivery_fee >= 0),
  constraint post_order_addon_config_distance_check check (
    max_extra_distance_km > 0 and candidate_store_radius_km > 0 and route_corridor_km > 0
  ),
  constraint post_order_addon_config_time_check check (
    max_extra_time_minutes > 0 and max_post_main_pickup_delay_minutes >= 0
  ),
  constraint post_order_addon_config_cardinality_check check (
    max_additional_merchants between 1 and 10
    and max_route_candidates between 1 and 50
    and max_shown_merchants between 1 and max_route_candidates
  ),
  constraint post_order_addon_config_rate_check check (
    quote_ttl_seconds between 30 and 900
    and quote_rate_limit_per_minute between 1 and 120
    and confirm_rate_limit_per_minute between 1 and 60
  )
);

insert into public.post_order_addon_config (id)
values ('global')
on conflict (id) do nothing;

create table if not exists public.order_groups (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.client_accounts(id) on delete restrict,
  primary_order_id uuid not null unique references public.orders(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'completed', 'cancelled')),
  merchant_subtotal_amount numeric(12,2) not null default 0 check (merchant_subtotal_amount >= 0),
  base_delivery_fee_amount numeric(12,2) not null default 0 check (base_delivery_fee_amount >= 0),
  addon_delivery_fee_amount numeric(12,2) not null default 0 check (addon_delivery_fee_amount >= 0),
  grand_total_amount numeric(12,2) not null default 0 check (grand_total_amount >= 0),
  currency text not null default 'RUB' check (char_length(currency) = 3),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists order_group_id uuid references public.order_groups(id) on delete set null,
  add column if not exists is_addon boolean not null default false,
  add column if not exists source text not null default 'standard',
  add column if not exists estimated_ready_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_combined_source_check'
  ) then
    alter table public.orders add constraint orders_combined_source_check
      check (source in ('standard', 'post_order_addon'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'orders_addon_group_check'
  ) then
    alter table public.orders add constraint orders_addon_group_check
      check (not is_addon or (order_group_id is not null and source = 'post_order_addon'));
  end if;
end;
$$;

alter table public.deliveries
  add column if not exists order_group_id uuid references public.order_groups(id) on delete set null,
  add column if not exists route_version integer not null default 1,
  add column if not exists addon_delivery_fee_amount numeric(12,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deliveries_route_version_check'
  ) then
    alter table public.deliveries add constraint deliveries_route_version_check
      check (route_version > 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'deliveries_addon_fee_check'
  ) then
    alter table public.deliveries add constraint deliveries_addon_fee_check
      check (addon_delivery_fee_amount >= 0);
  end if;
end;
$$;

create table if not exists public.delivery_stops (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  merchant_order_id uuid references public.orders(id) on delete restrict,
  stop_type text not null check (stop_type in ('pickup', 'dropoff')),
  sequence integer not null check (sequence > 0),
  status text not null default 'pending'
    check (status in ('pending', 'arrived', 'completed', 'skipped', 'cancelled')),
  latitude numeric(10,7) not null check (latitude between -90 and 90),
  longitude numeric(10,7) not null check (longitude between -180 and 180),
  address text not null,
  estimated_arrival_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  route_version integer not null default 1 check (route_version > 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_stops_pickup_order_check check (
    (stop_type = 'pickup' and merchant_order_id is not null)
    or (stop_type = 'dropoff' and merchant_order_id is null)
  ),
  constraint delivery_stops_delivery_sequence_key
    unique (delivery_id, sequence) deferrable initially deferred
);

create table if not exists public.addon_offers (
  id uuid primary key default gen_random_uuid(),
  order_group_id uuid not null unique references public.order_groups(id) on delete cascade,
  config_id text not null default 'global' references public.post_order_addon_config(id) on delete restrict,
  status text not null default 'evaluating'
    check (status in ('evaluating', 'available', 'viewed', 'used', 'expired', 'ineligible', 'cancelled')),
  expires_at timestamptz not null,
  addon_delivery_fee numeric(12,2) not null check (addon_delivery_fee >= 0),
  candidate_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(candidate_snapshot) = 'array'),
  config_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(config_snapshot) = 'object'),
  viewed_at timestamptz,
  used_at timestamptz,
  closed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.addon_quotes (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.addon_offers(id) on delete cascade,
  order_group_id uuid not null references public.order_groups(id) on delete cascade,
  merchant_id uuid not null references public.catalogs(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'confirmed', 'expired', 'rejected')),
  idempotency_key text not null,
  quote_token_digest bytea not null unique,
  items_snapshot jsonb not null check (jsonb_typeof(items_snapshot) = 'array'),
  items_subtotal_amount numeric(12,2) not null check (items_subtotal_amount >= 0),
  addon_delivery_fee numeric(12,2) not null check (addon_delivery_fee >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  extra_distance_km numeric(8,3) not null check (extra_distance_km >= 0),
  extra_time_minutes integer not null check (extra_time_minutes >= 0),
  route_sequence jsonb not null check (jsonb_typeof(route_sequence) = 'array'),
  route_provider text not null,
  route_cache_key text,
  expires_at timestamptz not null,
  confirmed_order_id uuid unique references public.orders(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_group_id, idempotency_key)
);

create table if not exists public.order_group_events (
  id uuid primary key default gen_random_uuid(),
  order_group_id uuid not null references public.order_groups(id) on delete cascade,
  merchant_order_id uuid references public.orders(id) on delete set null,
  delivery_id uuid references public.deliveries(id) on delete set null,
  event_type text not null,
  actor_type text not null default 'system'
    check (actor_type in ('system', 'client', 'merchant', 'courier', 'admin')),
  actor_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_client_account_id uuid references public.client_accounts(id) on delete cascade,
  recipient_auth_user_id uuid,
  notification_type text not null,
  title text not null,
  body text not null,
  action_url text,
  dedupe_key text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  read_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_one_recipient_check check (
    (recipient_client_account_id is not null)::integer
    + (recipient_auth_user_id is not null)::integer = 1
  )
);

create index if not exists order_groups_client_status_idx
  on public.order_groups(client_account_id, status, created_at desc);
create index if not exists orders_order_group_status_idx
  on public.orders(order_group_id, status, created_at desc)
  where order_group_id is not null;
create unique index if not exists orders_addon_group_idempotency_idx
  on public.orders(order_group_id, idempotency_key)
  where is_addon and idempotency_key is not null;
create unique index if not exists deliveries_order_group_unique_idx
  on public.deliveries(order_group_id)
  where order_group_id is not null;
create index if not exists deliveries_order_group_status_idx
  on public.deliveries(order_group_id, status, created_at desc)
  where order_group_id is not null;
create index if not exists delivery_stops_delivery_sequence_idx
  on public.delivery_stops(delivery_id, sequence);
create unique index if not exists delivery_stops_pickup_order_idx
  on public.delivery_stops(delivery_id, merchant_order_id)
  where stop_type = 'pickup';
create index if not exists addon_offers_status_expires_idx
  on public.addon_offers(status, expires_at);
create index if not exists addon_quotes_group_merchant_idx
  on public.addon_quotes(order_group_id, merchant_id, created_at desc);
create index if not exists order_group_events_group_created_idx
  on public.order_group_events(order_group_id, created_at desc);
create index if not exists order_group_events_merchant_created_idx
  on public.order_group_events(merchant_order_id, created_at desc)
  where merchant_order_id is not null;
create index if not exists order_group_events_delivery_created_idx
  on public.order_group_events(delivery_id, created_at desc)
  where delivery_id is not null;
create index if not exists notifications_client_unread_idx
  on public.notifications(recipient_client_account_id, created_at desc)
  where recipient_client_account_id is not null and read_at is null;
create index if not exists notifications_auth_unread_idx
  on public.notifications(recipient_auth_user_id, created_at desc)
  where recipient_auth_user_id is not null and read_at is null;
create unique index if not exists notifications_recipient_dedupe_idx
  on public.notifications(
    coalesce(recipient_client_account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(recipient_auth_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    dedupe_key
  )
  where dedupe_key is not null;

create or replace function public.is_order_group_client(
  target_order_group_id uuid,
  client_session_token text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.order_groups order_group
    join public.client_account_sessions client_session
      on client_session.account_id = order_group.client_account_id
    where order_group.id = target_order_group_id
      and client_session.token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256')
      and client_session.expires_at > pg_catalog.now()
  )
$$;

revoke all on function public.is_order_group_client(uuid, text) from public;
grant execute on function public.is_order_group_client(uuid, text) to anon, authenticated, service_role;

create or replace function public.protect_combined_order_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  trusted_writer boolean := current_user in ('postgres', 'supabase_admin', 'service_role')
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
begin
  if trusted_writer then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.order_group_id is not null
       or new.is_addon
       or new.source <> 'standard'
       or new.estimated_ready_at is not null then
      raise exception 'combined_order_fields_are_server_managed';
    end if;
    return new;
  end if;

  if new.order_group_id is distinct from old.order_group_id
     or new.is_addon is distinct from old.is_addon
     or new.source is distinct from old.source
     or new.estimated_ready_at is distinct from old.estimated_ready_at then
    raise exception 'combined_order_fields_are_server_managed';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_combined_order_fields() from public, anon, authenticated;
drop trigger if exists orders_protect_combined_order_fields on public.orders;
create trigger orders_protect_combined_order_fields
before insert or update of order_group_id, is_addon, source, estimated_ready_at
on public.orders
for each row execute function public.protect_combined_order_fields();

drop trigger if exists post_order_addon_config_updated_at on public.post_order_addon_config;
create trigger post_order_addon_config_updated_at
before update on public.post_order_addon_config
for each row execute function public.set_updated_at();
drop trigger if exists order_groups_updated_at on public.order_groups;
create trigger order_groups_updated_at
before update on public.order_groups
for each row execute function public.set_updated_at();
drop trigger if exists delivery_stops_updated_at on public.delivery_stops;
create trigger delivery_stops_updated_at
before update on public.delivery_stops
for each row execute function public.set_updated_at();
drop trigger if exists addon_offers_updated_at on public.addon_offers;
create trigger addon_offers_updated_at
before update on public.addon_offers
for each row execute function public.set_updated_at();
drop trigger if exists addon_quotes_updated_at on public.addon_quotes;
create trigger addon_quotes_updated_at
before update on public.addon_quotes
for each row execute function public.set_updated_at();

alter table public.post_order_addon_config enable row level security;
alter table public.order_groups enable row level security;
alter table public.delivery_stops enable row level security;
alter table public.addon_offers enable row level security;
alter table public.addon_quotes enable row level security;
alter table public.order_group_events enable row level security;
alter table public.notifications enable row level security;

revoke all on table public.post_order_addon_config from public, anon, authenticated;
revoke all on table public.order_groups from public, anon, authenticated;
revoke all on table public.delivery_stops from public, anon, authenticated;
revoke all on table public.addon_offers from public, anon, authenticated;
revoke all on table public.addon_quotes from public, anon, authenticated;
revoke all on table public.order_group_events from public, anon, authenticated;
revoke all on table public.notifications from public, anon, authenticated;

grant all on table public.post_order_addon_config to service_role;
grant all on table public.order_groups to service_role;
grant all on table public.delivery_stops to service_role;
grant all on table public.addon_offers to service_role;
grant all on table public.addon_quotes to service_role;
grant all on table public.order_group_events to service_role;
grant all on table public.notifications to service_role;

grant select, insert, update, delete on table public.post_order_addon_config to authenticated;
grant select on table public.order_groups to authenticated;
grant select on table public.delivery_stops to authenticated;
grant select on table public.addon_offers to authenticated;
grant select on table public.addon_quotes to authenticated;
grant select on table public.order_group_events to authenticated;
grant select, update (read_at) on table public.notifications to authenticated;

drop policy if exists "post order addon config admins read" on public.post_order_addon_config;
create policy "post order addon config admins read" on public.post_order_addon_config
for select to authenticated
using ((select public.is_platform_admin()));
drop policy if exists "post order addon config admins manage" on public.post_order_addon_config;
create policy "post order addon config admins manage" on public.post_order_addon_config
for all to authenticated
using ((select public.is_platform_admin()))
with check ((select public.is_platform_admin()));

drop policy if exists "order groups admins read" on public.order_groups;
create policy "order groups admins read" on public.order_groups
for select to authenticated
using ((select public.is_platform_admin()));

drop policy if exists "delivery stops authorized actors read" on public.delivery_stops;
create policy "delivery stops authorized actors read" on public.delivery_stops
for select to authenticated
using (
  (select public.is_platform_admin())
  or exists (
    select 1
    from public.deliveries delivery
    where delivery.id = delivery_stops.delivery_id
      and delivery.driver_id = public.current_driver_id()
  )
  or exists (
    select 1
    from public.orders merchant_order
    where merchant_order.id = delivery_stops.merchant_order_id
      and public.is_catalog_member(
        merchant_order.catalog_id,
        array['owner', 'admin', 'editor', 'viewer']::public.catalog_role[]
      )
  )
);

drop policy if exists "addon offers admins read" on public.addon_offers;
create policy "addon offers admins read" on public.addon_offers
for select to authenticated
using ((select public.is_platform_admin()));
drop policy if exists "addon quotes admins read" on public.addon_quotes;
create policy "addon quotes admins read" on public.addon_quotes
for select to authenticated
using ((select public.is_platform_admin()));

drop policy if exists "order group events authorized actors read" on public.order_group_events;
create policy "order group events authorized actors read" on public.order_group_events
for select to authenticated
using (
  (select public.is_platform_admin())
  or exists (
    select 1
    from public.orders merchant_order
    where merchant_order.id = order_group_events.merchant_order_id
      and public.is_catalog_member(
        merchant_order.catalog_id,
        array['owner', 'admin', 'editor', 'viewer']::public.catalog_role[]
      )
  )
  or exists (
    select 1
    from public.deliveries delivery
    where delivery.id = order_group_events.delivery_id
      and delivery.driver_id = public.current_driver_id()
  )
);

drop policy if exists "notifications recipients read" on public.notifications;
create policy "notifications recipients read" on public.notifications
for select to authenticated
using (
  recipient_auth_user_id = (select auth.uid())
  or (select public.is_platform_admin())
);
drop policy if exists "notifications recipients mark read" on public.notifications;
create policy "notifications recipients mark read" on public.notifications
for update to authenticated
using (
  recipient_auth_user_id = (select auth.uid())
  or (select public.is_platform_admin())
)
with check (
  recipient_auth_user_id = (select auth.uid())
  or (select public.is_platform_admin())
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'addon_offers'
    ) then
      alter publication supabase_realtime add table public.addon_offers;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'delivery_stops'
    ) then
      alter publication supabase_realtime add table public.delivery_stops;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end;
$$;

commit;
