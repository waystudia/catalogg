-- Signed Navigator URLs and the daily counter are server-only. Neither the
-- browser nor a normal authenticated database role can read these rows.
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

create index if not exists yandex_navigator_transition_events_driver_created_at_idx
  on public.yandex_navigator_transition_events (driver_id, created_at desc);

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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('yandex_navigator_daily_transition:' || target_driver_id::text)
  );

  select count(*)::integer
    into transitions_today
  from public.yandex_navigator_transition_events event
  where event.driver_id = target_driver_id
    and event.created_at >= pg_catalog.date_trunc('day', pg_catalog.now());

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
