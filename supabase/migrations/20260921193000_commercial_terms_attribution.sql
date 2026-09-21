-- Flexible commercial terms for every catalog. Financial facts are immutable
-- order snapshots; current profiles are only used for future orders.

create table if not exists public.commercial_source_types (
  code text primary key check (code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  name text not null,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.commercial_source_types (code, name, is_system)
values
  ('PARTNER', 'Клиент бизнеса', true),
  ('WAYYAAM', 'Прямой вход через WayYaam', true),
  ('WAYYAAM_AD', 'Реклама WayYaam', true)
on conflict (code) do update set name = excluded.name, is_system = true;

create table if not exists public.commercial_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  attribution_window_days integer not null default 30 check (attribution_window_days between 1 and 365),
  attribution_strategy text not null default 'last_valid_touch' check (attribution_strategy in ('last_valid_touch', 'first_valid_touch')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists commercial_profiles_active_name_key
  on public.commercial_profiles (lower(name)) where status = 'active';

create table if not exists public.commercial_profile_rules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.commercial_profiles(id) on delete cascade,
  source_type_code text not null references public.commercial_source_types(code) on delete restrict,
  fee_type text not null check (fee_type in ('free', 'fixed', 'percent', 'fixed_percent')),
  fixed_amount numeric(12,2) not null default 0 check (fixed_amount >= 0),
  percent_rate numeric(7,4) not null default 0 check (percent_rate >= 0 and percent_rate <= 100),
  minimum_amount numeric(12,2) check (minimum_amount is null or minimum_amount >= 0),
  maximum_amount numeric(12,2) check (maximum_amount is null or maximum_amount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, source_type_code),
  check (maximum_amount is null or minimum_amount is null or maximum_amount >= minimum_amount),
  check ((fee_type = 'free' and fixed_amount = 0 and percent_rate = 0)
      or (fee_type = 'fixed' and fixed_amount >= 0 and percent_rate = 0)
      or (fee_type = 'percent' and fixed_amount = 0 and percent_rate >= 0)
      or (fee_type = 'fixed_percent' and fixed_amount >= 0 and percent_rate >= 0))
);

create table if not exists public.commercial_profile_assignments (
  catalog_id uuid primary key references public.catalogs(id) on delete cascade,
  profile_id uuid not null references public.commercial_profiles(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null,
  assignment_reason text not null default '',
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_campaigns (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  channel text not null default 'other',
  source_name text not null default '',
  ad_cost numeric(12,2) check (ad_cost is null or ad_cost >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.commercial_tracking_links (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{8,96}$'),
  source_type_code text not null references public.commercial_source_types(code) on delete restrict,
  campaign_id uuid references public.commercial_campaigns(id) on delete set null,
  label text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source_type_code = 'WAYYAAM_AD') = (campaign_id is not null)),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create unique index if not exists commercial_partner_link_per_catalog
  on public.commercial_tracking_links (catalog_id)
  where source_type_code = 'PARTNER' and is_active;

create index if not exists commercial_tracking_links_catalog_idx
  on public.commercial_tracking_links (catalog_id, is_active, starts_at, ends_at);

create table if not exists public.commercial_attribution_events (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  tracking_link_id uuid not null references public.commercial_tracking_links(id) on delete restrict,
  source_type_code text not null references public.commercial_source_types(code) on delete restrict,
  campaign_id uuid references public.commercial_campaigns(id) on delete set null,
  anonymous_session_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists commercial_attribution_session_catalog_idx
  on public.commercial_attribution_events (anonymous_session_id, catalog_id, occurred_at desc);
create index if not exists commercial_attribution_link_idx
  on public.commercial_attribution_events (tracking_link_id, occurred_at desc);

create table if not exists public.commercial_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('profile', 'assignment', 'campaign', 'tracking_link')),
  entity_id uuid not null,
  catalog_id uuid references public.catalogs(id) on delete set null,
  action text not null,
  previous_value jsonb,
  next_value jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.order_commercial_snapshots (
  order_id uuid primary key references public.orders(id) on delete restrict,
  catalog_id uuid not null references public.catalogs(id) on delete restrict,
  profile_id uuid references public.commercial_profiles(id) on delete set null,
  profile_name text not null,
  source_type_code text not null,
  tracking_link_id uuid references public.commercial_tracking_links(id) on delete set null,
  campaign_id uuid references public.commercial_campaigns(id) on delete set null,
  commission_type text not null,
  commission_rate numeric(7,4) not null default 0,
  commission_fixed numeric(12,2) not null default 0,
  commission_min numeric(12,2),
  commission_max numeric(12,2),
  commission_base_amount numeric(12,2) not null,
  commission_amount numeric(12,2) not null,
  commission_status text not null default 'pending' check (commission_status in ('pending', 'accrued', 'cancelled', 'refunded')),
  attribution_strategy text not null,
  attribution_window_days integer not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  unique (order_id)
);

create index if not exists order_commercial_snapshots_catalog_source_idx
  on public.order_commercial_snapshots (catalog_id, source_type_code, created_at desc);
create index if not exists order_commercial_snapshots_campaign_idx
  on public.order_commercial_snapshots (campaign_id, created_at desc) where campaign_id is not null;

-- One system profile keeps existing businesses working until an admin assigns a tailored one.
insert into public.commercial_profiles (id, name, description, attribution_window_days, attribution_strategy)
values ('00000000-0000-4000-8000-000000000101', 'Стандарт WayYaam', 'Стартовые условия. Меняются из раздела Финансы.', 30, 'last_valid_touch')
on conflict (id) do nothing;

insert into public.commercial_profile_rules (profile_id, source_type_code, fee_type, fixed_amount, percent_rate)
values
  ('00000000-0000-4000-8000-000000000101', 'PARTNER', 'fixed', 30, 0),
  ('00000000-0000-4000-8000-000000000101', 'WAYYAAM', 'percent', 0, 10),
  ('00000000-0000-4000-8000-000000000101', 'WAYYAAM_AD', 'percent', 0, 10)
on conflict (profile_id, source_type_code) do nothing;

insert into public.commercial_profile_assignments (catalog_id, profile_id, assignment_reason)
select c.id, '00000000-0000-4000-8000-000000000101', 'initial migration'
from public.catalogs c
on conflict (catalog_id) do nothing;

create or replace function public.ensure_catalog_commercial_defaults()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare partner_token text;
begin
  insert into public.commercial_profile_assignments (catalog_id, profile_id, assignment_reason)
  values (new.id, '00000000-0000-4000-8000-000000000101', 'catalog created')
  on conflict (catalog_id) do nothing;
  partner_token := encode(gen_random_bytes(9), 'hex');
  insert into public.commercial_tracking_links (catalog_id, token, source_type_code, label)
  values (new.id, partner_token, 'PARTNER', 'Партнёрская ссылка')
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.ensure_catalog_commercial_defaults() from public, anon, authenticated;
drop trigger if exists catalogs_ensure_commercial_defaults on public.catalogs;
create trigger catalogs_ensure_commercial_defaults
after insert on public.catalogs for each row execute function public.ensure_catalog_commercial_defaults();

insert into public.commercial_tracking_links (catalog_id, token, source_type_code, label)
select c.id, encode(gen_random_bytes(9), 'hex'), 'PARTNER', 'Партнёрская ссылка'
from public.catalogs c
where not exists (
  select 1 from public.commercial_tracking_links link
  where link.catalog_id = c.id and link.source_type_code = 'PARTNER' and link.is_active
);

create or replace function public.commercial_write_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare row_catalog_id uuid := null; action_name text;
begin
  action_name := case when tg_op = 'INSERT' then 'created' when tg_op = 'DELETE' then 'deleted' else 'updated' end;
  row_catalog_id := nullif(coalesce(to_jsonb(new)->>'catalog_id', to_jsonb(old)->>'catalog_id'), '')::uuid;
  insert into public.commercial_audit_log (entity_type, entity_id, catalog_id, action, previous_value, next_value, actor_id)
  values (
    case tg_table_name
      when 'commercial_profiles' then 'profile'
      when 'commercial_profile_assignments' then 'assignment'
      when 'commercial_campaigns' then 'campaign'
      else 'tracking_link'
    end,
    coalesce(nullif(to_jsonb(new)->>'id', '')::uuid, nullif(to_jsonb(old)->>'id', '')::uuid, row_catalog_id), row_catalog_id, action_name,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    auth.uid()
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.commercial_write_audit() from public, anon, authenticated;

drop trigger if exists commercial_profiles_audit on public.commercial_profiles;
create trigger commercial_profiles_audit after insert or update or delete on public.commercial_profiles for each row execute function public.commercial_write_audit();
drop trigger if exists commercial_assignments_audit on public.commercial_profile_assignments;
create trigger commercial_assignments_audit after insert or update or delete on public.commercial_profile_assignments for each row execute function public.commercial_write_audit();
drop trigger if exists commercial_campaigns_audit on public.commercial_campaigns;
create trigger commercial_campaigns_audit after insert or update or delete on public.commercial_campaigns for each row execute function public.commercial_write_audit();
drop trigger if exists commercial_tracking_links_audit on public.commercial_tracking_links;
create trigger commercial_tracking_links_audit after insert or update or delete on public.commercial_tracking_links for each row execute function public.commercial_write_audit();

create or replace function public.record_commercial_attribution(
  target_catalog_id uuid,
  tracking_token text,
  client_session_id uuid
)
returns boolean language plpgsql security definer set search_path = public as $$
declare link_record public.commercial_tracking_links;
begin
  if client_session_id is null or nullif(trim(coalesce(tracking_token, '')), '') is null then return false; end if;
  select * into link_record from public.commercial_tracking_links
  where catalog_id = target_catalog_id
    and token = trim(tracking_token)
    and is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  limit 1;
  if not found then return false; end if;
  insert into public.commercial_attribution_events
    (catalog_id, tracking_link_id, source_type_code, campaign_id, anonymous_session_id, user_id)
  values (target_catalog_id, link_record.id, link_record.source_type_code, link_record.campaign_id, client_session_id, auth.uid());
  return true;
end;
$$;
revoke all on function public.record_commercial_attribution(uuid, text, uuid) from public;
grant execute on function public.record_commercial_attribution(uuid, text, uuid) to anon, authenticated;

create or replace function public.capture_order_commercial_snapshot(target_order_id uuid, client_session_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare order_record public.orders; assignment_record public.commercial_profile_assignments; profile_record public.commercial_profiles;
  rule_record public.commercial_profile_rules; event_record public.commercial_attribution_events;
  source_code text := 'WAYYAAM'; base_amount numeric(12,2); raw_amount numeric(12,2); final_amount numeric(12,2);
begin
  if exists (select 1 from public.order_commercial_snapshots where order_id = target_order_id) then return; end if;
  select * into order_record from public.orders where id = target_order_id;
  if not found then raise exception 'order_not_found'; end if;
  select a.* into assignment_record from public.commercial_profile_assignments a where a.catalog_id = order_record.catalog_id;
  if not found then raise exception 'commercial_profile_not_assigned'; end if;
  select * into profile_record from public.commercial_profiles where id = assignment_record.profile_id and status = 'active';
  if not found then raise exception 'commercial_profile_unavailable'; end if;
  if client_session_id is not null then
    select event.* into event_record from public.commercial_attribution_events event
    join public.commercial_tracking_links link on link.id = event.tracking_link_id
    where event.catalog_id = order_record.catalog_id and event.anonymous_session_id = client_session_id
      and event.occurred_at >= now() - make_interval(days => profile_record.attribution_window_days)
      and link.is_active and (link.starts_at is null or link.starts_at <= now()) and (link.ends_at is null or link.ends_at > now())
    order by case when profile_record.attribution_strategy = 'first_valid_touch' then event.occurred_at end asc,
             case when profile_record.attribution_strategy = 'last_valid_touch' then event.occurred_at end desc
    limit 1;
    if found then source_code := event_record.source_type_code; end if;
  end if;
  select * into rule_record from public.commercial_profile_rules
  where profile_id = profile_record.id and source_type_code = source_code and is_active limit 1;
  if not found then
    select * into rule_record from public.commercial_profile_rules
    where profile_id = profile_record.id and source_type_code = 'WAYYAAM' and is_active limit 1;
    source_code := 'WAYYAAM'; event_record := null;
  end if;
  if not found then raise exception 'commercial_rule_missing'; end if;
  base_amount := greatest(coalesce(order_record.total, order_record.subtotal, 0), 0);
  raw_amount := case rule_record.fee_type
    when 'free' then 0
    when 'fixed' then rule_record.fixed_amount
    when 'percent' then round(base_amount * rule_record.percent_rate / 100, 2)
    else rule_record.fixed_amount + round(base_amount * rule_record.percent_rate / 100, 2)
  end;
  final_amount := greatest(raw_amount, coalesce(rule_record.minimum_amount, 0));
  if rule_record.maximum_amount is not null then final_amount := least(final_amount, rule_record.maximum_amount); end if;
  insert into public.order_commercial_snapshots (
    order_id, catalog_id, profile_id, profile_name, source_type_code, tracking_link_id, campaign_id,
    commission_type, commission_rate, commission_fixed, commission_min, commission_max,
    commission_base_amount, commission_amount, attribution_strategy, attribution_window_days
  ) values (
    target_order_id, order_record.catalog_id, profile_record.id, profile_record.name, source_code,
    event_record.tracking_link_id, event_record.campaign_id, rule_record.fee_type, rule_record.percent_rate,
    rule_record.fixed_amount, rule_record.minimum_amount, rule_record.maximum_amount, base_amount, final_amount,
    profile_record.attribution_strategy, profile_record.attribution_window_days
  );
end;
$$;
revoke all on function public.capture_order_commercial_snapshot(uuid, uuid) from public, anon, authenticated;

-- New overloads preserve the old public functions for a staged frontend rollout.
create or replace function public.create_public_restaurant_order(
  target_catalog_id uuid, customer_name text, customer_phone text, fulfillment_type text, cabin_label text,
  delivery_address text, delivery_city text, delivery_settlement text, client_address_comment text,
  comment text, items jsonb, idempotency_key text, commercial_session_id uuid
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare created_order_id uuid;
begin
  select public.create_public_restaurant_order(target_catalog_id, customer_name, customer_phone, fulfillment_type, cabin_label,
    delivery_address, delivery_city, delivery_settlement, client_address_comment, comment, items, idempotency_key) into created_order_id;
  perform public.capture_order_commercial_snapshot(created_order_id, commercial_session_id);
  return created_order_id;
end;
$$;
revoke all on function public.create_public_restaurant_order(uuid, text, text, text, text, text, text, text, text, text, jsonb, text, uuid) from public;
grant execute on function public.create_public_restaurant_order(uuid, text, text, text, text, text, text, text, text, text, jsonb, text, uuid) to anon, authenticated;

create or replace function public.create_legacy_public_restaurant_order(
  target_catalog_id uuid, customer_name text, customer_phone text, fulfillment_type text, cabin_label text,
  delivery_address text, delivery_city text, delivery_settlement text, client_address_comment text,
  comment text, items jsonb, idempotency_key text, commercial_session_id uuid
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare created_order_id uuid;
begin
  select public.create_legacy_public_restaurant_order(target_catalog_id, customer_name, customer_phone, fulfillment_type, cabin_label,
    delivery_address, delivery_city, delivery_settlement, client_address_comment, comment, items, idempotency_key) into created_order_id;
  perform public.capture_order_commercial_snapshot(created_order_id, commercial_session_id);
  return created_order_id;
end;
$$;
revoke all on function public.create_legacy_public_restaurant_order(uuid, text, text, text, text, text, text, text, text, text, jsonb, text, uuid) from public;
grant execute on function public.create_legacy_public_restaurant_order(uuid, text, text, text, text, text, text, text, text, text, jsonb, text, uuid) to anon, authenticated;

create or replace function public.record_restaurant_order_commission()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_client_id uuid; snapshot_amount numeric(12,2);
begin
  if new.accepted_at is not null and old.accepted_at is null and coalesce(new.is_test_order, false) = false
     and public.can_catalog_accept_real_orders(new.catalog_id) then
    select commission_amount into snapshot_amount from public.order_commercial_snapshots where order_id = new.id;
    if snapshot_amount is null then return new; end if;
    select c.id into target_client_id from public.clients c where c.catalog_id = new.catalog_id limit 1;
    if target_client_id is null then return new; end if;
    insert into public.billing_ledger_entries(event_key, ledger_scope, entry_type, account_type, account_id, counterparty_type, order_id, reason, amount)
    values ('order:' || new.id || ':restaurant_order_commission', 'platform_debt', 'charge', 'restaurant', target_client_id, 'platform', new.id, 'restaurant_order_commission', snapshot_amount)
    on conflict (event_key) do nothing;
    update public.order_commercial_snapshots set commission_status = 'accrued', accepted_at = new.accepted_at where order_id = new.id;
  end if;
  if new.status = 'canceled' and old.status is distinct from 'canceled' then
    update public.order_commercial_snapshots set commission_status = 'cancelled', cancelled_at = now() where order_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.record_restaurant_order_commission() from public, anon, authenticated;

create or replace view public.commercial_business_finance as
select snapshot.catalog_id, snapshot.source_type_code,
  count(*) as orders_count,
  coalesce(sum(snapshot.commission_base_amount), 0) as gmv,
  coalesce(sum(snapshot.commission_amount) filter (where snapshot.commission_status <> 'cancelled'), 0) as commission_amount
from public.order_commercial_snapshots snapshot
group by snapshot.catalog_id, snapshot.source_type_code;

alter table public.commercial_source_types enable row level security;
alter table public.commercial_profiles enable row level security;
alter table public.commercial_profile_rules enable row level security;
alter table public.commercial_profile_assignments enable row level security;
alter table public.commercial_campaigns enable row level security;
alter table public.commercial_tracking_links enable row level security;
alter table public.commercial_attribution_events enable row level security;
alter table public.commercial_audit_log enable row level security;
alter table public.order_commercial_snapshots enable row level security;

revoke all on table public.commercial_source_types, public.commercial_profiles, public.commercial_profile_rules,
  public.commercial_profile_assignments, public.commercial_campaigns, public.commercial_tracking_links,
  public.commercial_attribution_events, public.commercial_audit_log, public.order_commercial_snapshots from public, anon, authenticated;

create policy "platform admins manage commercial source types" on public.commercial_source_types for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy "platform admins manage commercial profiles" on public.commercial_profiles for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy "platform admins manage commercial profile rules" on public.commercial_profile_rules for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy "platform admins manage commercial assignments" on public.commercial_profile_assignments for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy "platform admins manage commercial campaigns" on public.commercial_campaigns for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy "platform admins manage commercial tracking links" on public.commercial_tracking_links for all to authenticated using ((select public.is_platform_admin())) with check ((select public.is_platform_admin()));
create policy "platform admins read commercial attribution" on public.commercial_attribution_events for select to authenticated using ((select public.is_platform_admin()));
create policy "platform admins read commercial audit" on public.commercial_audit_log for select to authenticated using ((select public.is_platform_admin()));
create policy "platform admins read commercial snapshots" on public.order_commercial_snapshots for select to authenticated using ((select public.is_platform_admin()));

grant select, insert, update, delete on public.commercial_source_types, public.commercial_profiles, public.commercial_profile_rules,
  public.commercial_profile_assignments, public.commercial_campaigns, public.commercial_tracking_links to authenticated;
grant select on public.commercial_attribution_events, public.commercial_audit_log, public.order_commercial_snapshots to authenticated;
