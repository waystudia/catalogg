-- Superadmin-managed distance tiers for the additional pickup fee.
-- Existing quotes keep their snapshotted fee; new quotes are priced on the server.

begin;

create table if not exists public.post_order_addon_fee_tiers (
  id uuid primary key default gen_random_uuid(),
  config_id text not null references public.post_order_addon_config(id) on delete cascade,
  max_extra_distance_km numeric(8,3) not null,
  fee numeric(12,2) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_order_addon_fee_tiers_distance_check check (max_extra_distance_km > 0),
  constraint post_order_addon_fee_tiers_fee_check check (fee >= 0),
  constraint post_order_addon_fee_tiers_sort_check check (sort_order >= 0),
  constraint post_order_addon_fee_tiers_distance_unique unique (config_id, max_extra_distance_km)
);

create index if not exists post_order_addon_fee_tiers_lookup_idx
  on public.post_order_addon_fee_tiers (config_id, max_extra_distance_km);

insert into public.post_order_addon_fee_tiers (
  config_id,
  max_extra_distance_km,
  fee,
  sort_order
)
select defaults.config_id, defaults.max_distance, defaults.fee, defaults.sort_order
from (values
  ('global'::text, 1::numeric, 40::numeric, 0),
  ('global'::text, 2::numeric, 50::numeric, 1),
  ('global'::text, 3::numeric, 100::numeric, 2)
) as defaults(config_id, max_distance, fee, sort_order)
where not exists (
  select 1
  from public.post_order_addon_fee_tiers existing
  where existing.config_id = defaults.config_id
);

drop trigger if exists post_order_addon_fee_tiers_updated_at on public.post_order_addon_fee_tiers;
create trigger post_order_addon_fee_tiers_updated_at
before update on public.post_order_addon_fee_tiers
for each row execute function public.set_updated_at();

alter table public.post_order_addon_fee_tiers enable row level security;

revoke all on table public.post_order_addon_fee_tiers from public, anon, authenticated;
grant all on table public.post_order_addon_fee_tiers to service_role;
grant select on table public.post_order_addon_fee_tiers to authenticated;

drop policy if exists "post order addon fee tiers admins read" on public.post_order_addon_fee_tiers;
create policy "post order addon fee tiers admins read" on public.post_order_addon_fee_tiers
for select to authenticated
using ((select public.is_platform_admin()));

create or replace function public.calculate_post_order_addon_fee(
  target_config_id text,
  target_extra_distance_km numeric
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select tier.fee
  from public.post_order_addon_fee_tiers tier
  where tier.config_id = target_config_id
    and target_extra_distance_km >= 0
    and target_extra_distance_km <= tier.max_extra_distance_km
  order by tier.max_extra_distance_km, tier.sort_order, tier.id
  limit 1
$$;

revoke all on function public.calculate_post_order_addon_fee(text, numeric) from public, anon, authenticated;
grant execute on function public.calculate_post_order_addon_fee(text, numeric) to service_role;

create or replace function public.save_post_order_addon_fee_tiers(target_tiers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config public.post_order_addon_config%rowtype;
  tier jsonb;
  tier_index integer := 0;
  tier_count integer;
  max_distance numeric;
  tier_fee numeric;
  previous_distance numeric := 0;
  saved_tiers jsonb;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'access_denied';
  end if;
  if pg_catalog.jsonb_typeof(target_tiers) <> 'array' then
    raise exception 'invalid_fee_tiers';
  end if;

  tier_count := pg_catalog.jsonb_array_length(target_tiers);
  if tier_count < 1 or tier_count > 10 then
    raise exception 'invalid_fee_tiers';
  end if;

  select config_record.* into config
  from public.post_order_addon_config config_record
  where config_record.id = 'global'
  for update;
  if config.id is null then
    raise exception 'addon_config_missing';
  end if;

  delete from public.post_order_addon_fee_tiers
  where config_id = config.id;

  for tier in select value from pg_catalog.jsonb_array_elements(target_tiers)
  loop
    if pg_catalog.jsonb_typeof(tier) <> 'object' then
      raise exception 'invalid_fee_tiers';
    end if;
    max_distance := (tier->>'maxExtraDistanceKm')::numeric;
    tier_fee := (tier->>'fee')::numeric;
    if max_distance <= previous_distance or tier_fee < 0 then
      raise exception 'invalid_fee_tiers';
    end if;

    insert into public.post_order_addon_fee_tiers (
      config_id,
      max_extra_distance_km,
      fee,
      sort_order
    ) values (
      config.id,
      max_distance,
      tier_fee,
      tier_index
    );
    previous_distance := max_distance;
    tier_index := tier_index + 1;
  end loop;

  if previous_distance < config.max_extra_distance_km then
    raise exception 'fee_tiers_do_not_cover_max_distance';
  end if;

  update public.post_order_addon_config
  set addon_delivery_fee = (
    select fee
    from public.post_order_addon_fee_tiers
    where config_id = config.id
    order by max_extra_distance_km, sort_order
    limit 1
  )
  where id = config.id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', saved.id,
        'maxExtraDistanceKm', saved.max_extra_distance_km,
        'fee', saved.fee
      ) order by saved.max_extra_distance_km, saved.sort_order
    ),
    '[]'::jsonb
  ) into saved_tiers
  from public.post_order_addon_fee_tiers saved
  where saved.config_id = config.id;

  return jsonb_build_object(
    'configId', config.id,
    'maxExtraDistanceKm', config.max_extra_distance_km,
    'tiers', saved_tiers
  );
end;
$$;

revoke all on function public.save_post_order_addon_fee_tiers(jsonb) from public, anon, authenticated;
grant execute on function public.save_post_order_addon_fee_tiers(jsonb) to authenticated;

-- Keep the already-reviewed quote function as a compatibility implementation,
-- then wrap it so the persisted quote and returned total use the distance tier.
alter function public.create_post_order_addon_quote(
  uuid, uuid, uuid, text, text, text, jsonb, numeric, integer, jsonb, text, text
) rename to create_post_order_addon_quote_flat_fee_legacy;

create function public.create_post_order_addon_quote(
  target_order_group_id uuid,
  target_offer_id uuid,
  target_merchant_id uuid,
  client_session_token text,
  quote_token text,
  quote_idempotency_key text,
  target_items_snapshot jsonb,
  target_extra_distance_km numeric,
  target_extra_time_minutes integer,
  target_route_sequence jsonb,
  target_route_provider text,
  target_route_cache_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_result jsonb;
  target_quote_id uuid;
  target_config_id text;
  calculated_fee numeric(12,2);
  items_subtotal numeric(12,2);
  quote_expires_at timestamptz;
begin
  legacy_result := public.create_post_order_addon_quote_flat_fee_legacy(
    target_order_group_id,
    target_offer_id,
    target_merchant_id,
    client_session_token,
    quote_token,
    quote_idempotency_key,
    target_items_snapshot,
    target_extra_distance_km,
    target_extra_time_minutes,
    target_route_sequence,
    target_route_provider,
    target_route_cache_key
  );

  target_quote_id := (legacy_result->>'quote_id')::uuid;
  select offer.config_id into target_config_id
  from public.addon_offers offer
  where offer.id = target_offer_id;
  calculated_fee := public.calculate_post_order_addon_fee(
    target_config_id,
    target_extra_distance_km
  );
  if calculated_fee is null then
    raise exception 'route_ineligible';
  end if;

  update public.addon_quotes quote
  set addon_delivery_fee = calculated_fee,
      total_amount = quote.items_subtotal_amount + calculated_fee
  where quote.id = target_quote_id
    and quote.confirmed_order_id is null
  returning quote.items_subtotal_amount, quote.expires_at
    into items_subtotal, quote_expires_at;
  if not found then
    raise exception 'addon_already_created';
  end if;

  return jsonb_build_object(
    'quote_id', target_quote_id,
    'items_subtotal', items_subtotal,
    'addon_delivery_fee', calculated_fee,
    'total', items_subtotal + calculated_fee,
    'expires_at', quote_expires_at
  );
end;
$$;

revoke all on function public.create_post_order_addon_quote(
  uuid, uuid, uuid, text, text, text, jsonb, numeric, integer, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.create_post_order_addon_quote(
  uuid, uuid, uuid, text, text, text, jsonb, numeric, integer, jsonb, text, text
) to service_role;

-- The legacy confirmation function is still the single order/delivery mutation
-- path. The wrapper locks in the server-created quote fee before it runs.
alter function public.confirm_post_order_addon(
  uuid, text, text, text, jsonb, numeric, integer
) rename to confirm_post_order_addon_flat_fee_legacy;

create function public.confirm_post_order_addon(
  target_quote_id uuid,
  client_session_token text,
  quote_token text,
  confirm_idempotency_key text,
  revalidated_route_sequence jsonb,
  revalidated_extra_distance_km numeric,
  revalidated_extra_time_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  quote public.addon_quotes%rowtype;
begin
  select quote_record.* into quote
  from public.addon_quotes quote_record
  where quote_record.id = target_quote_id
  for update;
  if quote.id is null then
    raise exception 'access_denied';
  end if;

  update public.addon_offers offer
  set addon_delivery_fee = quote.addon_delivery_fee
  where offer.id = quote.offer_id;

  return public.confirm_post_order_addon_flat_fee_legacy(
    target_quote_id,
    client_session_token,
    quote_token,
    confirm_idempotency_key,
    revalidated_route_sequence,
    revalidated_extra_distance_km,
    revalidated_extra_time_minutes
  );
end;
$$;

revoke all on function public.confirm_post_order_addon(
  uuid, text, text, text, jsonb, numeric, integer
) from public, anon, authenticated;
grant execute on function public.confirm_post_order_addon(
  uuid, text, text, text, jsonb, numeric, integer
) to service_role;

commit;
