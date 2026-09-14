alter table public.deliveries
  add column if not exists driver_handed_to_client_at timestamptz,
  add column if not exists client_received_at timestamptz;

alter table public.deliveries
  drop constraint if exists deliveries_client_receipt_requires_driver_handoff;

alter table public.deliveries
  add constraint deliveries_client_receipt_requires_driver_handoff
    check (client_received_at is null or driver_handed_to_client_at is not null);

create table if not exists public.yandex_navigator_route_sessions (
  delivery_id uuid primary key references public.deliveries(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  route_fingerprint text not null,
  signed_url text not null,
  signed_route_build_count integer not null default 1 check (signed_route_build_count > 0),
  last_rebuild_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.yandex_navigator_route_sessions enable row level security;
revoke all on table public.yandex_navigator_route_sessions from public, anon, authenticated;

create table if not exists public.yandex_navigator_transition_events (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  transition_kind text not null check (transition_kind in ('initial', 'rebuild')),
  created_at timestamptz not null default now()
);

create index if not exists yandex_navigator_transition_events_created_at_idx
  on public.yandex_navigator_transition_events (created_at desc);

alter table public.yandex_navigator_transition_events enable row level security;
revoke all on table public.yandex_navigator_transition_events from public, anon, authenticated;

create or replace function public.reserve_yandex_navigator_transition(
  target_delivery_id uuid,
  target_driver_id uuid,
  target_transition_kind text,
  daily_limit integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  transitions_today integer;
begin
  if target_transition_kind not in ('initial', 'rebuild') or daily_limit < 1 then
    raise exception 'invalid_yandex_navigator_transition';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('yandex_navigator_daily_transition'));

  select count(*)::integer
    into transitions_today
  from public.yandex_navigator_transition_events event
  where event.created_at >= pg_catalog.date_trunc('day', pg_catalog.now());

  if transitions_today >= daily_limit then
    raise exception 'yandex_navigator_daily_limit_reached';
  end if;

  insert into public.yandex_navigator_transition_events (delivery_id, driver_id, transition_kind)
  values (target_delivery_id, target_driver_id, target_transition_kind);

  return transitions_today + 1;
end;
$$;

revoke all on function public.reserve_yandex_navigator_transition(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_yandex_navigator_transition(uuid, uuid, text, integer) to service_role;

create or replace function public.get_current_driver_delivery_handoffs()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'delivery_id', d.id,
        'driver_handed_to_client_at', d.driver_handed_to_client_at,
        'client_received_at', d.client_received_at
      )
      order by d.updated_at desc nulls last, d.created_at desc
    ),
    '[]'::jsonb
  )
  from public.deliveries d
  where d.driver_id = public.current_driver_id()
    and d.status in ('assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client');
$$;

revoke all on function public.get_current_driver_delivery_handoffs() from public, anon;
grant execute on function public.get_current_driver_delivery_handoffs() to authenticated;

create or replace function public.confirm_driver_delivery_handoff(target_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  handoff_at timestamptz;
begin
  if viewer_driver_id is null then
    raise exception 'driver_auth_required';
  end if;

  update public.deliveries d
  set driver_handed_to_client_at = coalesce(d.driver_handed_to_client_at, now()),
      updated_at = now()
  where d.id = target_delivery_id
    and d.driver_id = viewer_driver_id
    and d.status = 'arrived_to_client'
  returning d.driver_handed_to_client_at into handoff_at;

  if handoff_at is null then
    raise exception 'delivery_handoff_not_allowed';
  end if;

  if not exists (
    select 1
    from public.delivery_status_history h
    where h.delivery_id = target_delivery_id
      and h.comment = 'driver confirmed client handoff'
  ) then
    insert into public.delivery_status_history (delivery_id, status, comment)
    values (target_delivery_id, 'arrived_to_client', 'driver confirmed client handoff');
  end if;

  return jsonb_build_object(
    'delivery_id', target_delivery_id,
    'driver_handed_to_client_at', handoff_at
  );
end;
$$;

revoke all on function public.confirm_driver_delivery_handoff(uuid) from public, anon;
grant execute on function public.confirm_driver_delivery_handoff(uuid) to authenticated;

create or replace function public.get_client_order_handoff_state(
  client_session_token text,
  target_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  account_phone text;
  order_phone text;
  handoff_state jsonb;
begin
  select account.phone_normalized
    into account_phone
  from public.client_account_sessions session
  join public.client_accounts account on account.id = session.account_id
  where session.token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256')
    and session.expires_at > now()
  limit 1;

  if account_phone is null then
    raise exception 'client_handoff_auth_required';
  end if;

  select public.normalize_client_phone(coalesce(nullif(o.client_phone, ''), o.customer_phone))
    into order_phone
  from public.orders o
  where o.id = target_order_id;

  if order_phone is null then
    raise exception 'client_handoff_order_not_found';
  end if;

  if order_phone <> account_phone then
    raise exception 'client_handoff_order_forbidden';
  end if;

  select jsonb_build_object(
    'delivery_id', d.id,
    'delivery_status', d.status,
    'driver_handed_to_client_at', d.driver_handed_to_client_at,
    'client_received_at', d.client_received_at
  )
    into handoff_state
  from public.deliveries d
  where d.order_id = target_order_id
  order by d.updated_at desc nulls last, d.created_at desc
  limit 1;

  return coalesce(handoff_state, jsonb_build_object(
    'delivery_id', null,
    'delivery_status', null,
    'driver_handed_to_client_at', null,
    'client_received_at', null
  ));
end;
$$;

revoke all on function public.get_client_order_handoff_state(text, uuid) from public;
grant execute on function public.get_client_order_handoff_state(text, uuid) to anon, authenticated;

create or replace function public.confirm_client_order_receipt(
  client_session_token text,
  target_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid;
  account_phone text;
  order_phone text;
  target_delivery_id uuid;
  receipt_at timestamptz;
begin
  select account.id, account.phone_normalized
    into account_id, account_phone
  from public.client_account_sessions session
  join public.client_accounts account on account.id = session.account_id
  where session.token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256')
    and session.expires_at > now()
  limit 1;

  if account_id is null then
    raise exception 'client_handoff_auth_required';
  end if;

  select public.normalize_client_phone(coalesce(nullif(o.client_phone, ''), o.customer_phone))
    into order_phone
  from public.orders o
  where o.id = target_order_id;

  if order_phone is null then
    raise exception 'client_handoff_order_not_found';
  end if;

  if order_phone <> account_phone then
    raise exception 'client_handoff_order_forbidden';
  end if;

  update public.deliveries d
  set client_received_at = coalesce(d.client_received_at, now()),
      updated_at = now()
  where d.id = (
      select candidate.id
      from public.deliveries candidate
      where candidate.order_id = target_order_id
      order by candidate.updated_at desc nulls last, candidate.created_at desc
      limit 1
    )
    and d.status = 'arrived_to_client'
    and d.driver_handed_to_client_at is not null
  returning d.id, d.client_received_at into target_delivery_id, receipt_at;

  if target_delivery_id is null then
    raise exception 'client_receipt_not_allowed';
  end if;

  if not exists (
    select 1
    from public.delivery_status_history h
    where h.delivery_id = target_delivery_id
      and h.comment = 'client confirmed order receipt'
  ) then
    insert into public.delivery_status_history (delivery_id, status, comment)
    values (target_delivery_id, 'arrived_to_client', 'client confirmed order receipt');
  end if;

  update public.client_account_sessions session
  set last_used_at = now()
  where session.account_id = account_id
    and session.token_hash = extensions.digest(client_session_token, 'sha256');

  return jsonb_build_object(
    'delivery_id', target_delivery_id,
    'driver_handed_to_client_at', (
      select d.driver_handed_to_client_at from public.deliveries d where d.id = target_delivery_id
    ),
    'client_received_at', receipt_at
  );
end;
$$;

revoke all on function public.confirm_client_order_receipt(text, uuid) from public;
grant execute on function public.confirm_client_order_receipt(text, uuid) to anon, authenticated;

create or replace function public.complete_driver_delivery(target_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid;
  viewer_driver_id uuid := public.current_driver_id();
  payout numeric(12,2);
  resolved_tariff_type text := 'percent';
  resolved_tariff_percent numeric(5,2) := 0;
  resolved_tariff_fixed numeric(12,2) := 0;
  commission_amount numeric(12,2) := 0;
begin
  if viewer_driver_id is null then
    raise exception 'driver_auth_required';
  end if;

  select d.order_id, coalesce(nullif(d.offered_fee, 0), nullif(o.delivery_fee, 0), 0)
    into target_order_id, payout
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  where d.id = target_delivery_id
    and d.driver_id = viewer_driver_id
    and d.status = 'arrived_to_client'
    and d.driver_handed_to_client_at is not null
    and d.client_received_at is not null
  for update;

  if target_order_id is null then
    raise exception 'delivery_completion_confirmation_required';
  end if;

  select
    coalesce(custom.tariff_type, settings.driver_tariff_type, 'percent'),
    coalesce(custom.tariff_percent, settings.driver_tariff_percent, 0),
    coalesce(custom.tariff_fixed, settings.driver_tariff_fixed, 0)
  into resolved_tariff_type, resolved_tariff_percent, resolved_tariff_fixed
  from public.platform_billing_settings settings
  left join lateral (
    select tariff.tariff_type, tariff.tariff_percent, tariff.tariff_fixed
    from public.platform_custom_tariffs tariff
    where tariff.subject_type = 'driver'
      and tariff.subject_id = viewer_driver_id
      and tariff.is_active
    limit 1
  ) custom on true
  where settings.id = 'global';

  commission_amount := round(greatest(
    0,
    case
      when resolved_tariff_type = 'fixed' then resolved_tariff_fixed
      else payout * resolved_tariff_percent / 100
    end
  ), 2);

  update public.deliveries
  set status = 'delivered', delivered_at = now(), updated_at = now()
  where id = target_delivery_id;

  update public.orders
  set status = 'completed', completed_at = now()
  where id = target_order_id;

  update public.drivers
  set status = 'online', is_online = true, updated_at = now()
  where id = viewer_driver_id;

  insert into public.delivery_status_history (delivery_id, status, comment)
  values (target_delivery_id, 'delivered', 'driver completed delivery after mutual confirmation');

  insert into public.earnings (driver_id, delivery_id, amount, commission)
  values (viewer_driver_id, target_delivery_id, payout, commission_amount)
  on conflict (delivery_id) do update
  set amount = excluded.amount,
      commission = excluded.commission;

  return target_delivery_id;
end;
$$;

revoke all on function public.complete_driver_delivery(uuid) from public, anon;
grant execute on function public.complete_driver_delivery(uuid) to authenticated;
