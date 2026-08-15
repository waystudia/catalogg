-- Server-owned candidate discovery, quote persistence and atomic addon confirm.

alter table public.restaurant_delivery_settings
  add column if not exists addon_assembly_minutes integer not null default 5;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'restaurant_delivery_settings_addon_assembly_check'
  ) then
    alter table public.restaurant_delivery_settings
      add constraint restaurant_delivery_settings_addon_assembly_check
      check (addon_assembly_minutes between 1 and 60);
  end if;
end;
$$;

create table if not exists public.combined_order_request_log (
  id bigint generated always as identity primary key,
  order_group_id uuid not null references public.order_groups(id) on delete cascade,
  client_account_id uuid not null references public.client_accounts(id) on delete cascade,
  request_type text not null check (request_type in ('offer', 'view', 'quote', 'confirm')),
  created_at timestamptz not null default now()
);

create index if not exists combined_order_request_log_window_idx
  on public.combined_order_request_log(order_group_id, client_account_id, request_type, created_at desc);

alter table public.combined_order_request_log enable row level security;
revoke all on table public.combined_order_request_log from public, anon, authenticated;
grant all on table public.combined_order_request_log to service_role;

create or replace function public.wayyaam_distance_km(
  lat_a numeric,
  lng_a numeric,
  lat_b numeric,
  lng_b numeric
)
returns numeric
language sql
immutable
strict
set search_path = ''
as $$
  select 6371::numeric * 2 * pg_catalog.asin(
    pg_catalog.sqrt(
      pg_catalog.power(pg_catalog.sin(pg_catalog.radians((lat_b - lat_a)::double precision) / 2), 2)
      + pg_catalog.cos(pg_catalog.radians(lat_a::double precision))
        * pg_catalog.cos(pg_catalog.radians(lat_b::double precision))
        * pg_catalog.power(pg_catalog.sin(pg_catalog.radians((lng_b - lng_a)::double precision) / 2), 2)
    )
  )
$$;

create or replace function public.wayyaam_point_to_segment_km(
  start_lat numeric,
  start_lng numeric,
  end_lat numeric,
  end_lng numeric,
  point_lat numeric,
  point_lng numeric
)
returns numeric
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  longitude_scale double precision := 111.32 * pg_catalog.cos(
    pg_catalog.radians(((start_lat + end_lat + point_lat) / 3)::double precision)
  );
  end_x double precision := (end_lng - start_lng)::double precision * longitude_scale;
  end_y double precision := (end_lat - start_lat)::double precision * 110.574;
  point_x double precision := (point_lng - start_lng)::double precision * longitude_scale;
  point_y double precision := (point_lat - start_lat)::double precision * 110.574;
  segment_length_squared double precision;
  projection double precision;
begin
  segment_length_squared := end_x * end_x + end_y * end_y;
  projection := case
    when segment_length_squared = 0 then 0
    else greatest(0, least(1, (point_x * end_x + point_y * end_y) / segment_length_squared))
  end;
  return pg_catalog.sqrt(
    pg_catalog.power(point_x - projection * end_x, 2)
    + pg_catalog.power(point_y - projection * end_y, 2)
  )::numeric;
end;
$$;

revoke all on function public.wayyaam_distance_km(numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.wayyaam_point_to_segment_km(numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.wayyaam_distance_km(numeric, numeric, numeric, numeric) to service_role;
grant execute on function public.wayyaam_point_to_segment_km(numeric, numeric, numeric, numeric, numeric, numeric) to service_role;

create or replace function public.consume_combined_order_rate_limit(
  target_order_group_id uuid,
  client_session_token text,
  target_request_type text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_client_account_id uuid;
  request_limit integer;
  request_count integer;
begin
  if target_request_type not in ('offer', 'view', 'quote', 'confirm') then
    return false;
  end if;

  select order_group.client_account_id
    into target_client_account_id
  from public.order_groups order_group
  join public.client_account_sessions client_session
    on client_session.account_id = order_group.client_account_id
  where order_group.id = target_order_group_id
    and client_session.token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256')
    and client_session.expires_at > pg_catalog.now();

  if target_client_account_id is null then
    return false;
  end if;

  select case
    when target_request_type = 'confirm' then config.confirm_rate_limit_per_minute
    else config.quote_rate_limit_per_minute
  end
    into request_limit
  from public.post_order_addon_config config
  where config.id = 'global';

  select pg_catalog.count(*)::integer
    into request_count
  from public.combined_order_request_log request_log
  where request_log.order_group_id = target_order_group_id
    and request_log.client_account_id = target_client_account_id
    and request_log.request_type = target_request_type
    and request_log.created_at >= pg_catalog.date_trunc('minute', pg_catalog.now());

  if request_limit is null or request_count >= request_limit then
    return false;
  end if;

  insert into public.combined_order_request_log (
    order_group_id,
    client_account_id,
    request_type
  ) values (
    target_order_group_id,
    target_client_account_id,
    target_request_type
  );

  return true;
end;
$$;

revoke all on function public.consume_combined_order_rate_limit(uuid, text, text) from public, anon, authenticated;
grant execute on function public.consume_combined_order_rate_limit(uuid, text, text) to service_role;

create or replace function public.get_post_order_addon_context(
  target_order_group_id uuid,
  client_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_group public.order_groups%rowtype;
  primary_order public.orders%rowtype;
  primary_catalog public.catalogs%rowtype;
  primary_restaurant public.restaurants%rowtype;
  primary_settings public.restaurant_delivery_settings%rowtype;
  offer public.addon_offers%rowtype;
  config public.post_order_addon_config%rowtype;
  delivery public.deliveries%rowtype;
  client_account_id uuid;
  completed_pickups integer := 0;
  additional_merchant_count integer := 0;
  candidate_list jsonb := '[]'::jsonb;
  close_reason text;
begin
  select group_record.*
    into order_group
  from public.order_groups group_record
  where group_record.id = target_order_group_id;

  select group_record.client_account_id
    into client_account_id
  from public.order_groups group_record
  join public.client_account_sessions client_session
    on client_session.account_id = group_record.client_account_id
  where group_record.id = target_order_group_id
    and client_session.token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256')
    and client_session.expires_at > pg_catalog.now();

  if order_group.id is null or client_account_id is null then
    return jsonb_build_object('available', false, 'reason', 'access_denied');
  end if;

  select order_record.* into primary_order
  from public.orders order_record
  where order_record.id = order_group.primary_order_id;
  select catalog_record.* into primary_catalog
  from public.catalogs catalog_record
  where catalog_record.id = primary_order.catalog_id;
  select restaurant_record.* into primary_restaurant
  from public.restaurants restaurant_record
  where restaurant_record.catalog_id = primary_order.catalog_id
  order by restaurant_record.created_at
  limit 1;
  select settings_record.* into primary_settings
  from public.restaurant_delivery_settings settings_record
  where settings_record.catalog_id = primary_order.catalog_id;
  select offer_record.* into offer
  from public.addon_offers offer_record
  where offer_record.order_group_id = target_order_group_id;
  select config_record.* into config
  from public.post_order_addon_config config_record
  where config_record.id = offer.config_id;
  select delivery_record.* into delivery
  from public.deliveries delivery_record
  where delivery_record.order_group_id = target_order_group_id
     or delivery_record.order_id = primary_order.id
  order by (delivery_record.order_group_id = target_order_group_id) desc, delivery_record.created_at desc
  limit 1;

  if delivery.id is not null then
    select pg_catalog.count(*)::integer into completed_pickups
    from public.delivery_stops delivery_stop
    where delivery_stop.delivery_id = delivery.id
      and delivery_stop.stop_type = 'pickup'
      and delivery_stop.status = 'completed';
  end if;
  select pg_catalog.count(*)::integer into additional_merchant_count
  from public.orders merchant_order
  where merchant_order.order_group_id = target_order_group_id
    and merchant_order.is_addon
    and merchant_order.status::text not in ('cancelled', 'canceled');

  close_reason := case
    when config.id is null or not config.enabled then 'feature_disabled'
    when order_group.status <> 'active' then 'main_order_inactive'
    when offer.id is null then 'offer_not_available'
    when offer.expires_at <= pg_catalog.now() then 'offer_expired'
    when offer.status = 'used' then 'addon_already_created'
    when offer.status in ('expired', 'ineligible', 'cancelled') then coalesce(offer.closed_reason, 'offer_not_available')
    when primary_order.status::text in ('picked_up', 'on_the_way', 'delivered', 'completed', 'cancelled', 'canceled') then 'main_order_inactive'
    when completed_pickups > 0 then 'delivery_critical_point_passed'
    when delivery.status in ('handed_over', 'on_the_way', 'arrived_to_client', 'delivered', 'failed', 'canceled', 'cancelled') then 'delivery_critical_point_passed'
    when additional_merchant_count >= config.max_additional_merchants then 'merchant_limit_reached'
    else null
  end;

  if close_reason is not null then
    if offer.id is not null and offer.status not in ('used', 'cancelled') then
      update public.addon_offers
      set status = case when close_reason = 'offer_expired' then 'expired' else 'ineligible' end,
          closed_reason = close_reason
      where id = offer.id;
    end if;
    return jsonb_build_object(
      'available', false,
      'reason', close_reason,
      'order_group_id', target_order_group_id,
      'offer_id', offer.id,
      'expires_at', offer.expires_at
    );
  end if;

  select coalesce(jsonb_agg(candidate.payload order by candidate.rank_distance, candidate.merchant_id), '[]'::jsonb)
    into candidate_list
  from (
    select
      catalog.id as merchant_id,
      least(
        public.wayyaam_distance_km(
          primary_restaurant.lat, primary_restaurant.lng,
          merchant.lat, merchant.lng
        ),
        public.wayyaam_point_to_segment_km(
          primary_restaurant.lat, primary_restaurant.lng,
          primary_order.delivery_lat, primary_order.delivery_lng,
          merchant.lat, merchant.lng
        )
      ) as rank_distance,
      jsonb_build_object(
        'id', catalog.id,
        'slug', catalog.slug,
        'name', coalesce(nullif(merchant.name, ''), catalog.name),
        'business_type', catalog.business_type,
        'logo_url', coalesce(nullif(merchant.logo_url, ''), catalog.logo_url),
        'rating', coalesce(merchant.rating, 5),
        'latitude', merchant.lat,
        'longitude', merchant.lng,
        'address', coalesce(nullif(merchant.address_line, ''), catalog.address, ''),
        'assembly_minutes', settings.addon_assembly_minutes,
        'straight_line_distance_from_restaurant_km', public.wayyaam_distance_km(
          primary_restaurant.lat, primary_restaurant.lng,
          merchant.lat, merchant.lng
        ),
        'distance_to_route_corridor_km', public.wayyaam_point_to_segment_km(
          primary_restaurant.lat, primary_restaurant.lng,
          primary_order.delivery_lat, primary_order.delivery_lng,
          merchant.lat, merchant.lng
        )
      ) as payload
    from public.catalogs catalog
    join public.restaurants merchant on merchant.catalog_id = catalog.id
    join public.restaurant_delivery_settings settings on settings.catalog_id = catalog.id
    where catalog.status::text = 'published'
      and not coalesce(catalog.is_template, false)
      and catalog.business_type = any (config.eligible_addon_business_types)
      and merchant.is_active
      and merchant.allow_delivery
      and merchant.lat is not null and merchant.lng is not null
      and settings.enable_orders
      and settings.enable_delivery
      and settings.use_platform_drivers
      and (
        settings.delivery_hours_start is null
        or settings.delivery_hours_end is null
        or case
          when settings.delivery_hours_start <= settings.delivery_hours_end then
            (pg_catalog.now() at time zone coalesce(nullif(catalog.timezone, ''), 'Europe/Moscow'))::time
              between settings.delivery_hours_start and settings.delivery_hours_end
          else
            (pg_catalog.now() at time zone coalesce(nullif(catalog.timezone, ''), 'Europe/Moscow'))::time >= settings.delivery_hours_start
            or (pg_catalog.now() at time zone coalesce(nullif(catalog.timezone, ''), 'Europe/Moscow'))::time <= settings.delivery_hours_end
        end
      )
      and (
        cardinality(config.allowed_addon_merchant_ids) = 0
        or catalog.id = any (config.allowed_addon_merchant_ids)
      )
      and (
        not config.test_only
        or coalesce(catalog.is_test, false)
        or catalog.id = any (config.allowed_addon_merchant_ids)
      )
      and exists (
        select 1
        from public.products product
        where product.catalog_id = catalog.id
          and product.status::text = 'active'
          and (product.is_unlimited or product.stock_quantity >= product.minimum_quantity)
      )
      and (
        public.wayyaam_distance_km(
          primary_restaurant.lat, primary_restaurant.lng,
          merchant.lat, merchant.lng
        ) <= config.candidate_store_radius_km
        or public.wayyaam_point_to_segment_km(
          primary_restaurant.lat, primary_restaurant.lng,
          primary_order.delivery_lat, primary_order.delivery_lng,
          merchant.lat, merchant.lng
        ) <= config.route_corridor_km
      )
    order by rank_distance, catalog.id
    limit config.max_route_candidates
  ) candidate;

  return jsonb_build_object(
    'available', true,
    'order_group_id', order_group.id,
    'client_account_id', order_group.client_account_id,
    'offer', jsonb_build_object(
      'id', offer.id,
      'status', offer.status,
      'expires_at', offer.expires_at,
      'addon_delivery_fee', offer.addon_delivery_fee
    ),
    'config', jsonb_build_object(
      'max_extra_distance_km', config.max_extra_distance_km,
      'max_extra_time_minutes', config.max_extra_time_minutes,
      'max_post_main_pickup_delay_minutes', config.max_post_main_pickup_delay_minutes,
      'max_route_candidates', config.max_route_candidates,
      'max_shown_merchants', config.max_shown_merchants,
      'quote_ttl_seconds', config.quote_ttl_seconds
    ),
    'primary_order', jsonb_build_object(
      'id', primary_order.id,
      'catalog_id', primary_order.catalog_id,
      'status', primary_order.status,
      'customer_name', primary_order.customer_name,
      'customer_phone', primary_order.customer_phone,
      'delivery_address', primary_order.delivery_address,
      'delivery_city', primary_order.delivery_city,
      'delivery_settlement', primary_order.delivery_settlement,
      'delivery_latitude', primary_order.delivery_lat,
      'delivery_longitude', primary_order.delivery_lng,
      'primary_latitude', primary_restaurant.lat,
      'primary_longitude', primary_restaurant.lng,
      'estimated_ready_at', coalesce(
        primary_order.estimated_ready_at,
        primary_order.created_at + make_interval(mins => coalesce(primary_settings.default_preparation_minutes, 25))
      )
    ),
    'delivery', jsonb_build_object(
      'id', delivery.id,
      'status', coalesce(delivery.status, 'not_created'),
      'driver_id', delivery.driver_id,
      'courier_latitude', (
        select driver.last_lat from public.drivers driver where driver.id = delivery.driver_id
      ),
      'courier_longitude', (
        select driver.last_lng from public.drivers driver where driver.id = delivery.driver_id
      ),
      'completed_pickups', completed_pickups
    ),
    'candidates', candidate_list
  );
end;
$$;

revoke all on function public.get_post_order_addon_context(uuid, text) from public, anon, authenticated;
grant execute on function public.get_post_order_addon_context(uuid, text) to service_role;

create or replace function public.create_post_order_addon_quote(
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
  offer public.addon_offers%rowtype;
  config public.post_order_addon_config%rowtype;
  target_quote_id uuid;
  computed_subtotal numeric(12,2) := 0;
  item jsonb;
  quote_expires_at timestamptz;
begin
  if not public.is_order_group_client(target_order_group_id, client_session_token) then
    raise exception 'access_denied';
  end if;
  if nullif(pg_catalog.btrim(coalesce(quote_token, '')), '') is null
     or nullif(pg_catalog.btrim(coalesce(quote_idempotency_key, '')), '') is null then
    raise exception 'quote_invalid';
  end if;
  if pg_catalog.jsonb_typeof(target_items_snapshot) <> 'array'
     or pg_catalog.jsonb_array_length(target_items_snapshot) = 0 then
    raise exception 'items_changed';
  end if;
  if target_route_sequence not in (
    '["store","primary","customer"]'::jsonb,
    '["primary","store","customer"]'::jsonb
  ) then
    raise exception 'route_ineligible';
  end if;

  select offer_record.* into offer
  from public.addon_offers offer_record
  where offer_record.id = target_offer_id
    and offer_record.order_group_id = target_order_group_id
  for update;
  select config_record.* into config
  from public.post_order_addon_config config_record
  where config_record.id = offer.config_id;

  if offer.id is null or offer.status not in ('available', 'viewed')
     or offer.expires_at <= pg_catalog.now() then
    raise exception 'offer_expired';
  end if;
  if target_extra_distance_km < 0 or target_extra_distance_km > config.max_extra_distance_km
     or target_extra_time_minutes < 0 or target_extra_time_minutes > config.max_extra_time_minutes then
    raise exception 'route_ineligible';
  end if;
  if not exists (
    select 1
    from pg_catalog.jsonb_array_elements(offer.candidate_snapshot) candidate
    where candidate->>'id' = target_merchant_id::text
  ) then
    raise exception 'merchant_unavailable';
  end if;

  for item in select value from pg_catalog.jsonb_array_elements(target_items_snapshot)
  loop
    if coalesce((item->>'line_total')::numeric, -1) < 0 then
      raise exception 'items_changed';
    end if;
    computed_subtotal := computed_subtotal + (item->>'line_total')::numeric;
  end loop;

  quote_expires_at := least(
    offer.expires_at,
    pg_catalog.now() + make_interval(secs => config.quote_ttl_seconds)
  );

  select quote.id into target_quote_id
  from public.addon_quotes quote
  where quote.order_group_id = target_order_group_id
    and quote.idempotency_key = pg_catalog.btrim(quote_idempotency_key)
  for update;

  if target_quote_id is null then
    insert into public.addon_quotes (
      offer_id,
      order_group_id,
      merchant_id,
      idempotency_key,
      quote_token_digest,
      items_snapshot,
      items_subtotal_amount,
      addon_delivery_fee,
      total_amount,
      extra_distance_km,
      extra_time_minutes,
      route_sequence,
      route_provider,
      route_cache_key,
      expires_at
    ) values (
      offer.id,
      target_order_group_id,
      target_merchant_id,
      pg_catalog.btrim(quote_idempotency_key),
      extensions.digest(quote_token, 'sha256'),
      target_items_snapshot,
      computed_subtotal,
      offer.addon_delivery_fee,
      computed_subtotal + offer.addon_delivery_fee,
      target_extra_distance_km,
      target_extra_time_minutes,
      target_route_sequence,
      coalesce(nullif(pg_catalog.btrim(target_route_provider), ''), 'osrm'),
      target_route_cache_key,
      quote_expires_at
    ) returning id into target_quote_id;
  else
    update public.addon_quotes
    set merchant_id = target_merchant_id,
        status = 'active',
        quote_token_digest = extensions.digest(quote_token, 'sha256'),
        items_snapshot = target_items_snapshot,
        items_subtotal_amount = computed_subtotal,
        addon_delivery_fee = offer.addon_delivery_fee,
        total_amount = computed_subtotal + offer.addon_delivery_fee,
        extra_distance_km = target_extra_distance_km,
        extra_time_minutes = target_extra_time_minutes,
        route_sequence = target_route_sequence,
        route_provider = coalesce(nullif(pg_catalog.btrim(target_route_provider), ''), 'osrm'),
        route_cache_key = target_route_cache_key,
        expires_at = quote_expires_at
    where id = target_quote_id
      and confirmed_order_id is null;
    if not found then
      raise exception 'addon_already_created';
    end if;
  end if;

  return jsonb_build_object(
    'quote_id', target_quote_id,
    'items_subtotal', computed_subtotal,
    'addon_delivery_fee', offer.addon_delivery_fee,
    'total', computed_subtotal + offer.addon_delivery_fee,
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

alter table public.deliveries drop constraint if exists deliveries_status_check;
alter table public.deliveries add constraint deliveries_status_check
  check (status in (
    'planning', 'waiting_driver', 'waiting_courier', 'assigned',
    'arrived_to_restaurant', 'handed_over', 'on_the_way',
    'arrived_to_client', 'delivered', 'failed', 'canceled', 'cancelled'
  ));

create or replace function public.activate_planned_combined_delivery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'planning'
     and new.status = 'planning'
     and exists (
       select 1 from public.orders primary_order
       where primary_order.id = new.order_id
         and primary_order.status::text in ('ready', 'waiting_driver')
     ) then
    new.status := 'waiting_courier';
  end if;
  return new;
end;
$$;

revoke all on function public.activate_planned_combined_delivery() from public, anon, authenticated;
drop trigger if exists deliveries_activate_planned_combined on public.deliveries;
create trigger deliveries_activate_planned_combined
before update on public.deliveries
for each row execute function public.activate_planned_combined_delivery();

create or replace function public.confirm_post_order_addon(
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
  offer public.addon_offers%rowtype;
  config public.post_order_addon_config%rowtype;
  order_group public.order_groups%rowtype;
  primary_order public.orders%rowtype;
  merchant public.catalogs%rowtype;
  merchant_location public.restaurants%rowtype;
  merchant_settings public.restaurant_delivery_settings%rowtype;
  delivery public.deliveries%rowtype;
  item jsonb;
  product_record public.products%rowtype;
  requested_quantity integer;
  item_quantity integer;
  line_total integer;
  computed_subtotal integer := 0;
  remaining_stock integer;
  addon_order_id uuid;
  target_delivery_id uuid;
  stop_name text;
  stop_sequence integer := 0;
  merchant_subtotal numeric(12,2);
  final_total numeric(12,2);
begin
  if nullif(pg_catalog.btrim(coalesce(confirm_idempotency_key, '')), '') is null then
    raise exception 'confirm_invalid';
  end if;
  if revalidated_route_sequence not in (
    '["store","primary","customer"]'::jsonb,
    '["primary","store","customer"]'::jsonb
  ) then
    raise exception 'route_ineligible';
  end if;

  select quote_record.* into quote
  from public.addon_quotes quote_record
  where quote_record.id = target_quote_id
  for update;
  if quote.id is null
     or quote.quote_token_digest <> extensions.digest(coalesce(quote_token, ''), 'sha256') then
    raise exception 'access_denied';
  end if;
  if not public.is_order_group_client(quote.order_group_id, client_session_token) then
    raise exception 'access_denied';
  end if;

  select group_record.* into order_group
  from public.order_groups group_record
  where group_record.id = quote.order_group_id
  for update;
  select offer_record.* into offer
  from public.addon_offers offer_record
  where offer_record.id = quote.offer_id
  for update;
  select config_record.* into config
  from public.post_order_addon_config config_record
  where config_record.id = offer.config_id;
  select order_record.* into primary_order
  from public.orders order_record
  where order_record.id = order_group.primary_order_id
  for update;

  if quote.confirmed_order_id is not null then
    select delivery_record.id into target_delivery_id
    from public.deliveries delivery_record
    where delivery_record.order_group_id = order_group.id
       or delivery_record.order_id = primary_order.id
    order by (delivery_record.order_group_id = order_group.id) desc
    limit 1;
    return jsonb_build_object(
      'order_group_id', order_group.id,
      'merchant_order_id', quote.confirmed_order_id,
      'delivery_id', target_delivery_id,
      'idempotent', true
    );
  end if;

  select existing_order.id into addon_order_id
  from public.orders existing_order
  where existing_order.order_group_id = order_group.id
    and existing_order.is_addon
    and existing_order.idempotency_key = pg_catalog.btrim(confirm_idempotency_key);
  if addon_order_id is not null then
    update public.addon_quotes
    set status = 'confirmed', confirmed_order_id = addon_order_id
    where id = quote.id;
    return jsonb_build_object(
      'order_group_id', order_group.id,
      'merchant_order_id', addon_order_id,
      'idempotent', true
    );
  end if;

  if not config.enabled or order_group.status <> 'active'
     or offer.status not in ('available', 'viewed')
     or offer.expires_at <= pg_catalog.now()
     or quote.status <> 'active'
     or quote.expires_at <= pg_catalog.now() then
    raise exception 'offer_expired';
  end if;
  if primary_order.status::text in ('picked_up', 'on_the_way', 'delivered', 'completed', 'cancelled', 'canceled') then
    raise exception 'offer_expired';
  end if;
  if revalidated_extra_distance_km < 0
     or revalidated_extra_distance_km > config.max_extra_distance_km
     or revalidated_extra_time_minutes < 0
     or revalidated_extra_time_minutes > config.max_extra_time_minutes then
    raise exception 'route_ineligible';
  end if;
  if (
    select pg_catalog.count(*)
    from public.orders merchant_order
    where merchant_order.order_group_id = order_group.id
      and merchant_order.is_addon
      and merchant_order.status::text not in ('cancelled', 'canceled')
  ) >= config.max_additional_merchants then
    raise exception 'addon_already_created';
  end if;

  select delivery_record.* into delivery
  from public.deliveries delivery_record
  where delivery_record.order_group_id = order_group.id
     or delivery_record.order_id = primary_order.id
  order by (delivery_record.order_group_id = order_group.id) desc, delivery_record.created_at desc
  limit 1
  for update;
  if delivery.status in ('handed_over', 'on_the_way', 'arrived_to_client', 'delivered', 'failed', 'canceled', 'cancelled')
     or exists (
       select 1 from public.delivery_stops stop
       where stop.delivery_id = delivery.id
         and stop.stop_type = 'pickup'
         and stop.status = 'completed'
     ) then
    raise exception 'route_ineligible';
  end if;

  select catalog.* into merchant
  from public.catalogs catalog
  where catalog.id = quote.merchant_id
    and catalog.status::text = 'published'
    and not coalesce(catalog.is_template, false)
    and catalog.business_type = any (config.eligible_addon_business_types);
  select location.* into merchant_location
  from public.restaurants location
  where location.catalog_id = quote.merchant_id
    and location.is_active
    and location.allow_delivery
  order by location.created_at
  limit 1;
  select settings.* into merchant_settings
  from public.restaurant_delivery_settings settings
  where settings.catalog_id = quote.merchant_id
    and settings.enable_orders
    and settings.enable_delivery
    and settings.use_platform_drivers;

  if merchant.id is null or merchant_location.id is null or merchant_settings.catalog_id is null
     or merchant_location.lat is null or merchant_location.lng is null
     or not exists (
       select 1 from pg_catalog.jsonb_array_elements(offer.candidate_snapshot) candidate
       where candidate->>'id' = quote.merchant_id::text
     ) then
    raise exception 'merchant_unavailable';
  end if;
  if merchant_settings.delivery_hours_start is not null
     and merchant_settings.delivery_hours_end is not null
     and not (case
       when merchant_settings.delivery_hours_start <= merchant_settings.delivery_hours_end then
         (pg_catalog.now() at time zone coalesce(nullif(merchant.timezone, ''), 'Europe/Moscow'))::time
           between merchant_settings.delivery_hours_start and merchant_settings.delivery_hours_end
       else
         (pg_catalog.now() at time zone coalesce(nullif(merchant.timezone, ''), 'Europe/Moscow'))::time >= merchant_settings.delivery_hours_start
         or (pg_catalog.now() at time zone coalesce(nullif(merchant.timezone, ''), 'Europe/Moscow'))::time <= merchant_settings.delivery_hours_end
     end) then
    raise exception 'merchant_unavailable';
  end if;

  if pg_catalog.jsonb_typeof(quote.items_snapshot) <> 'array'
     or pg_catalog.jsonb_array_length(quote.items_snapshot) = 0 then
    raise exception 'items_changed';
  end if;

  for item in select value from pg_catalog.jsonb_array_elements(quote.items_snapshot)
  loop
    select product.* into product_record
    from public.products product
    where product.id = (item->>'product_id')::uuid
      and product.catalog_id = quote.merchant_id
      and product.status::text = 'active'
    for update;
    if product_record.id is null then raise exception 'items_changed'; end if;

    item_quantity := greatest(1, coalesce((item->>'quantity')::integer, 1));
    requested_quantity := case
      when product_record.sale_unit = 'weight' then coalesce((item->>'requested_quantity')::integer, 0)
      else item_quantity
    end;
    if requested_quantity < product_record.minimum_quantity
       or mod(requested_quantity - product_record.minimum_quantity, product_record.quantity_step) <> 0 then
      raise exception 'items_changed';
    end if;
    if not product_record.is_unlimited and product_record.stock_quantity < requested_quantity then
      raise exception 'items_changed';
    end if;
    line_total := pg_catalog.round(
      product_record.price::numeric * requested_quantity / product_record.price_basis_quantity
    )::integer;
    if line_total <> coalesce((item->>'line_total')::integer, -1)
       or product_record.price <> coalesce((item->>'unit_price')::integer, -1) then
      raise exception 'items_changed';
    end if;
    computed_subtotal := computed_subtotal + line_total;
  end loop;

  if computed_subtotal <> quote.items_subtotal_amount then
    raise exception 'items_changed';
  end if;

  insert into public.orders (
    catalog_id,
    status,
    customer_name,
    customer_phone,
    comment,
    subtotal,
    discount,
    delivery_fee,
    total,
    fulfillment_type,
    cabin_label,
    delivery_address,
    delivery_city,
    delivery_settlement,
    client_address_comment,
    delivery_lat,
    delivery_lng,
    client_lat,
    client_lng,
    client_accuracy_m,
    delivery_address_id,
    delivery_address_snapshot,
    delivery_entrance_snapshot,
    delivery_floor_snapshot,
    delivery_apartment_snapshot,
    delivery_intercom_snapshot,
    delivery_landmark_snapshot,
    delivery_comment_snapshot,
    client_id,
    order_type,
    payment_status,
    delivery_provider,
    client_name,
    client_phone,
    subtotal_amount,
    total_amount,
    restaurant_lat_snapshot,
    restaurant_lng_snapshot,
    restaurant_address_snapshot,
    idempotency_key,
    is_test_order,
    order_group_id,
    is_addon,
    source,
    estimated_ready_at
  ) values (
    quote.merchant_id,
    'new',
    primary_order.customer_name,
    primary_order.customer_phone,
    concat('[combined_order_addon:', order_group.id, ']'),
    computed_subtotal,
    0,
    0,
    computed_subtotal,
    'delivery',
    '',
    primary_order.delivery_address,
    primary_order.delivery_city,
    primary_order.delivery_settlement,
    primary_order.client_address_comment,
    primary_order.delivery_lat,
    primary_order.delivery_lng,
    primary_order.client_lat,
    primary_order.client_lng,
    primary_order.client_accuracy_m,
    primary_order.delivery_address_id,
    primary_order.delivery_address_snapshot,
    primary_order.delivery_entrance_snapshot,
    primary_order.delivery_floor_snapshot,
    primary_order.delivery_apartment_snapshot,
    primary_order.delivery_intercom_snapshot,
    primary_order.delivery_landmark_snapshot,
    primary_order.delivery_comment_snapshot,
    primary_order.client_id,
    'delivery',
    'unpaid',
    'platform',
    primary_order.client_name,
    primary_order.client_phone,
    computed_subtotal,
    computed_subtotal,
    merchant_location.lat,
    merchant_location.lng,
    coalesce(nullif(merchant_location.address_line, ''), merchant.address, ''),
    pg_catalog.btrim(confirm_idempotency_key),
    primary_order.is_test_order,
    order_group.id,
    true,
    'post_order_addon',
    pg_catalog.now() + make_interval(mins => merchant_settings.addon_assembly_minutes)
  ) returning id into addon_order_id;

  for item in select value from pg_catalog.jsonb_array_elements(quote.items_snapshot)
  loop
    select product.* into product_record
    from public.products product
    where product.id = (item->>'product_id')::uuid
      and product.catalog_id = quote.merchant_id
    for update;
    item_quantity := greatest(1, coalesce((item->>'quantity')::integer, 1));
    requested_quantity := case
      when product_record.sale_unit = 'weight' then (item->>'requested_quantity')::integer
      else item_quantity
    end;
    line_total := pg_catalog.round(
      product_record.price::numeric * requested_quantity / product_record.price_basis_quantity
    )::integer;

    insert into public.order_items (
      catalog_id,
      order_id,
      product_id,
      title,
      quantity,
      requested_quantity,
      unit_price,
      options,
      line_total,
      sale_unit_snapshot,
      quantity_unit_snapshot,
      price_basis_quantity_snapshot,
      product_snapshot
    ) values (
      quote.merchant_id,
      addon_order_id,
      product_record.id,
      product_record.title,
      case when product_record.sale_unit = 'weight' then 1 else item_quantity end,
      requested_quantity,
      product_record.price,
      coalesce(item->'options', '[]'::jsonb),
      line_total,
      product_record.sale_unit,
      product_record.quantity_unit,
      product_record.price_basis_quantity,
      jsonb_build_object(
        'sku', product_record.sku,
        'barcode', product_record.barcode,
        'title', product_record.title
      )
    );

    if not product_record.is_unlimited then
      remaining_stock := product_record.stock_quantity - requested_quantity;
      update public.products product
      set stock_quantity = remaining_stock,
          stock_count = case
            when product_record.sale_unit = 'weight'
              then pg_catalog.ceil(remaining_stock::numeric / 1000)::integer
            else remaining_stock
          end,
          status = case
            when remaining_stock < product_record.minimum_quantity
              then 'sold_out'::public.product_status
            else product.status
          end,
          updated_at = pg_catalog.now()
      where product.id = product_record.id;
    end if;
  end loop;

  if delivery.id is null then
    insert into public.deliveries (
      order_id,
      delivery_provider,
      status,
      estimated_time_min,
      estimated_time_max,
      offered_fee,
      pricing_status,
      is_test,
      order_group_id,
      route_version,
      addon_delivery_fee_amount
    ) values (
      primary_order.id,
      'platform',
      case when primary_order.status::text in ('ready', 'waiting_driver') then 'waiting_courier' else 'planning' end,
      20,
      40,
      greatest(coalesce(primary_order.delivery_fee, 0), 0) + offer.addon_delivery_fee,
      'offered',
      primary_order.is_test_order,
      order_group.id,
      1,
      offer.addon_delivery_fee
    ) returning id into target_delivery_id;
  else
    update public.deliveries
    set order_group_id = order_group.id,
        offered_fee = greatest(coalesce(primary_order.delivery_fee, 0), 0) + offer.addon_delivery_fee,
        addon_delivery_fee_amount = offer.addon_delivery_fee,
        route_version = route_version + 1,
        updated_at = pg_catalog.now()
    where id = delivery.id
    returning id into target_delivery_id;
  end if;

  delete from public.delivery_stops stop
  where stop.delivery_id = target_delivery_id
    and stop.status in ('pending', 'arrived');

  for stop_name in
    select value #>> '{}' from pg_catalog.jsonb_array_elements(revalidated_route_sequence)
  loop
    stop_sequence := stop_sequence + 1;
    if stop_name = 'store' then
      insert into public.delivery_stops (
        delivery_id, merchant_order_id, stop_type, sequence,
        latitude, longitude, address, route_version, metadata
      ) values (
        target_delivery_id, addon_order_id, 'pickup', stop_sequence,
        merchant_location.lat, merchant_location.lng,
        coalesce(nullif(merchant_location.address_line, ''), merchant.address, ''),
        coalesce(delivery.route_version, 0) + 1,
        jsonb_build_object('merchant_name', merchant.name, 'kind', 'addon')
      );
    elsif stop_name = 'primary' then
      insert into public.delivery_stops (
        delivery_id, merchant_order_id, stop_type, sequence,
        latitude, longitude, address, route_version, metadata
      ) values (
        target_delivery_id, primary_order.id, 'pickup', stop_sequence,
        primary_order.restaurant_lat_snapshot, primary_order.restaurant_lng_snapshot,
        coalesce(primary_order.restaurant_address_snapshot, ''),
        coalesce(delivery.route_version, 0) + 1,
        jsonb_build_object('kind', 'primary')
      );
    elsif stop_name = 'customer' then
      insert into public.delivery_stops (
        delivery_id, merchant_order_id, stop_type, sequence,
        latitude, longitude, address, route_version, metadata
      ) values (
        target_delivery_id, null, 'dropoff', stop_sequence,
        primary_order.delivery_lat, primary_order.delivery_lng,
        coalesce(primary_order.delivery_address, ''),
        coalesce(delivery.route_version, 0) + 1,
        jsonb_build_object('customer_name', primary_order.customer_name)
      );
    end if;
  end loop;

  if stop_sequence <> 3 then raise exception 'route_ineligible'; end if;

  select coalesce(pg_catalog.sum(coalesce(merchant_order.subtotal_amount, merchant_order.subtotal)), 0)
    into merchant_subtotal
  from public.orders merchant_order
  where merchant_order.order_group_id = order_group.id
    and merchant_order.status::text not in ('cancelled', 'canceled');
  final_total := merchant_subtotal + order_group.base_delivery_fee_amount + offer.addon_delivery_fee;

  update public.order_groups
  set merchant_subtotal_amount = merchant_subtotal,
      addon_delivery_fee_amount = offer.addon_delivery_fee,
      grand_total_amount = final_total
  where id = order_group.id;
  update public.addon_quotes
  set status = 'confirmed',
      confirmed_order_id = addon_order_id,
      route_sequence = revalidated_route_sequence,
      extra_distance_km = revalidated_extra_distance_km,
      extra_time_minutes = revalidated_extra_time_minutes
  where id = quote.id;
  update public.addon_offers
  set status = 'used', used_at = pg_catalog.now()
  where id = offer.id;

  insert into public.order_group_events (
    order_group_id, merchant_order_id, delivery_id, event_type, actor_type, actor_id, metadata
  ) values
  (
    order_group.id, addon_order_id, target_delivery_id, 'ADDON_CREATED', 'client', order_group.client_account_id,
    jsonb_build_object('merchant_id', quote.merchant_id, 'subtotal', computed_subtotal, 'addon_delivery_fee', offer.addon_delivery_fee)
  ),
  (
    order_group.id, addon_order_id, target_delivery_id, 'ROUTE_CALCULATED', 'system', null,
    jsonb_build_object(
      'sequence', revalidated_route_sequence,
      'extra_distance_km', revalidated_extra_distance_km,
      'extra_time_minutes', revalidated_extra_time_minutes,
      'provider', quote.route_provider
    )
  );

  insert into public.notifications (
    recipient_client_account_id,
    notification_type,
    title,
    body,
    action_url,
    dedupe_key,
    metadata
  ) values (
    order_group.client_account_id,
    'POST_ORDER_ADDON_CREATED',
    'Заказ добавлен к доставке',
    coalesce(nullif(merchant.name, ''), 'Магазин') || ' соберёт товары для общей доставки.',
    '/open-order/' || order_group.id::text,
    'combined-order-addon-created:' || order_group.id::text,
    jsonb_build_object('order_group_id', order_group.id, 'merchant_order_id', addon_order_id)
  ) on conflict do nothing;

  return jsonb_build_object(
    'order_group_id', order_group.id,
    'merchant_order_id', addon_order_id,
    'delivery_id', target_delivery_id,
    'merchant_subtotal', merchant_subtotal,
    'base_delivery_fee', order_group.base_delivery_fee_amount,
    'addon_delivery_fee', offer.addon_delivery_fee,
    'grand_total', final_total,
    'idempotent', false
  );
end;
$$;

revoke all on function public.confirm_post_order_addon(
  uuid, text, text, text, jsonb, numeric, integer
) from public, anon, authenticated;
grant execute on function public.confirm_post_order_addon(
  uuid, text, text, text, jsonb, numeric, integer
) to service_role;

create or replace function public.get_client_combined_order_summary(
  target_order_id uuid,
  client_session_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_group public.order_groups%rowtype;
  target_delivery public.deliveries%rowtype;
begin
  select order_group.* into target_group
  from public.orders merchant_order
  join public.order_groups order_group on order_group.id = merchant_order.order_group_id
  where merchant_order.id = target_order_id;

  if target_group.id is null then return null; end if;
  if not public.is_order_group_client(target_group.id, client_session_token) then
    raise exception 'access_denied';
  end if;

  select delivery.* into target_delivery
  from public.deliveries delivery
  where delivery.order_group_id = target_group.id
     or delivery.order_id = target_group.primary_order_id
  order by (delivery.order_group_id = target_group.id) desc, delivery.created_at desc
  limit 1;

  return jsonb_build_object(
    'order_group_id', target_group.id,
    'primary_order_id', target_group.primary_order_id,
    'status', target_group.status,
    'merchant_subtotal', target_group.merchant_subtotal_amount,
    'base_delivery_fee', target_group.base_delivery_fee_amount,
    'addon_delivery_fee', target_group.addon_delivery_fee_amount,
    'grand_total', target_group.grand_total_amount,
    'merchant_orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', merchant_order.id,
          'merchant_id', merchant_order.catalog_id,
          'merchant_name', coalesce(nullif(catalog.name, ''), 'Продавец'),
          'merchant_type', catalog.business_type,
          'is_addon', merchant_order.is_addon,
          'status', merchant_order.status,
          'subtotal', coalesce(merchant_order.subtotal_amount, merchant_order.subtotal, 0),
          'estimated_ready_at', merchant_order.estimated_ready_at,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', order_item.id,
                'title', order_item.title,
                'quantity', coalesce(order_item.requested_quantity, order_item.quantity),
                'line_total', order_item.line_total
              ) order by order_item.id
            )
            from public.order_items order_item
            where order_item.order_id = merchant_order.id
          ), '[]'::jsonb)
        ) order by merchant_order.is_addon, merchant_order.created_at
      )
      from public.orders merchant_order
      join public.catalogs catalog on catalog.id = merchant_order.catalog_id
      where merchant_order.order_group_id = target_group.id
    ), '[]'::jsonb),
    'delivery', case when target_delivery.id is null then null else jsonb_build_object(
      'id', target_delivery.id,
      'status', target_delivery.status,
      'route_version', target_delivery.route_version,
      'stops', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', stop.id,
            'merchant_order_id', stop.merchant_order_id,
            'type', stop.stop_type,
            'sequence', stop.sequence,
            'status', stop.status,
            'address', stop.address,
            'merchant_name', coalesce(nullif(stop_catalog.name, ''), '')
          ) order by stop.sequence
        )
        from public.delivery_stops stop
        left join public.orders stop_order on stop_order.id = stop.merchant_order_id
        left join public.catalogs stop_catalog on stop_catalog.id = stop_order.catalog_id
        where stop.delivery_id = target_delivery.id
      ), '[]'::jsonb)
    ) end
  );
end;
$$;

revoke all on function public.get_client_combined_order_summary(uuid, text) from public;
grant execute on function public.get_client_combined_order_summary(uuid, text) to anon, authenticated, service_role;

drop policy if exists "order groups linked clients read" on public.order_groups;
create policy "order groups linked clients read" on public.order_groups
for select to authenticated
using (exists (
  select 1 from public.client_accounts client
  where client.id = order_groups.client_account_id
    and client.auth_user_id = (select auth.uid())
));

drop policy if exists "delivery stops linked clients read" on public.delivery_stops;
create policy "delivery stops linked clients read" on public.delivery_stops
for select to authenticated
using (exists (
  select 1
  from public.deliveries delivery
  join public.order_groups order_group on order_group.id = delivery.order_group_id
  join public.client_accounts client on client.id = order_group.client_account_id
  where delivery.id = delivery_stops.delivery_id
    and client.auth_user_id = (select auth.uid())
));

drop policy if exists "addon offers linked clients read" on public.addon_offers;
create policy "addon offers linked clients read" on public.addon_offers
for select to authenticated
using (exists (
  select 1
  from public.order_groups order_group
  join public.client_accounts client on client.id = order_group.client_account_id
  where order_group.id = addon_offers.order_group_id
    and client.auth_user_id = (select auth.uid())
));

drop policy if exists "addon quotes linked clients read" on public.addon_quotes;
create policy "addon quotes linked clients read" on public.addon_quotes
for select to authenticated
using (exists (
  select 1
  from public.order_groups order_group
  join public.client_accounts client on client.id = order_group.client_account_id
  where order_group.id = addon_quotes.order_group_id
    and client.auth_user_id = (select auth.uid())
));

drop policy if exists "order group events linked clients read" on public.order_group_events;
create policy "order group events linked clients read" on public.order_group_events
for select to authenticated
using (exists (
  select 1
  from public.order_groups order_group
  join public.client_accounts client on client.id = order_group.client_account_id
  where order_group.id = order_group_events.order_group_id
    and client.auth_user_id = (select auth.uid())
));

drop policy if exists "notifications linked clients read" on public.notifications;
create policy "notifications linked clients read" on public.notifications
for select to authenticated
using (exists (
  select 1 from public.client_accounts client
  where client.id = notifications.recipient_client_account_id
    and client.auth_user_id = (select auth.uid())
));

drop policy if exists "notifications linked clients mark read" on public.notifications;
create policy "notifications linked clients mark read" on public.notifications
for update to authenticated
using (exists (
  select 1 from public.client_accounts client
  where client.id = notifications.recipient_client_account_id
    and client.auth_user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.client_accounts client
  where client.id = notifications.recipient_client_account_id
    and client.auth_user_id = (select auth.uid())
));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_groups'
     ) then
    alter publication supabase_realtime add table public.order_groups;
  end if;
end;
$$;
