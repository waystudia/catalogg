-- Attach a just-created restaurant order to the Combined Order model without
-- adding route latency to the existing checkout transaction.

create or replace function public.initialize_post_order_addon(
  target_order_id uuid,
  client_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  primary_order public.orders%rowtype;
  primary_catalog public.catalogs%rowtype;
  primary_restaurant public.restaurants%rowtype;
  client_account_row public.client_accounts%rowtype;
  addon_config public.post_order_addon_config%rowtype;
  target_group_id uuid;
  target_offer_id uuid;
  offer_expires_at timestamptz;
  group_created boolean := false;
  offer_created boolean := false;
begin
  select merchant_order.*
    into primary_order
  from public.orders merchant_order
  where merchant_order.id = target_order_id
  for update;

  if primary_order.id is null then
    return jsonb_build_object('available', false, 'reason', 'access_denied');
  end if;

  select client_account.*
    into client_account_row
  from public.client_account_sessions client_session
  join public.client_accounts client_account on client_account.id = client_session.account_id
  where client_session.token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256')
    and client_session.expires_at > pg_catalog.now()
    and client_account.phone_normalized = public.normalize_client_phone(primary_order.customer_phone)
  limit 1;

  if client_account_row.id is null then
    return jsonb_build_object('available', false, 'reason', 'access_denied');
  end if;

  select config.*
    into addon_config
  from public.post_order_addon_config config
  where config.id = 'global';

  if addon_config.id is null or not addon_config.enabled then
    return jsonb_build_object('available', false, 'reason', 'feature_disabled');
  end if;

  select catalog.*
    into primary_catalog
  from public.catalogs catalog
  where catalog.id = primary_order.catalog_id;

  if primary_catalog.id is null
     or primary_catalog.status::text <> 'published'
     or coalesce(primary_catalog.is_template, false)
     or not (primary_catalog.business_type = any (addon_config.eligible_primary_business_types)) then
    return jsonb_build_object('available', false, 'reason', 'primary_merchant_ineligible');
  end if;

  if addon_config.test_only and not primary_order.is_test_order then
    return jsonb_build_object('available', false, 'reason', 'pilot_scope_mismatch');
  end if;

  if cardinality(addon_config.allowed_primary_merchant_ids) > 0
     and not (primary_order.catalog_id = any (addon_config.allowed_primary_merchant_ids)) then
    return jsonb_build_object('available', false, 'reason', 'pilot_scope_mismatch');
  end if;

  if cardinality(addon_config.allowed_client_account_ids) > 0
     and not (client_account_row.id = any (addon_config.allowed_client_account_ids)) then
    return jsonb_build_object('available', false, 'reason', 'pilot_scope_mismatch');
  end if;

  if cardinality(addon_config.allowed_settlement_ids) > 0
     and not exists (
       select 1
       from public.delivery_settlements settlement
       where settlement.id = any (addon_config.allowed_settlement_ids)
         and settlement.is_active
         and (
           lower(pg_catalog.btrim(settlement.settlement_name)) = lower(pg_catalog.btrim(primary_order.delivery_settlement))
           or lower(pg_catalog.btrim(settlement.city_name)) = lower(pg_catalog.btrim(primary_order.delivery_city))
         )
     ) then
    return jsonb_build_object('available', false, 'reason', 'pilot_scope_mismatch');
  end if;

  if primary_order.is_addon
     or primary_order.source <> 'standard'
     or primary_order.fulfillment_type <> 'delivery'
     or primary_order.order_type <> 'delivery'
     or primary_order.delivery_provider not in ('platform', 'hybrid')
     or primary_order.status::text in ('picked_up', 'on_the_way', 'delivered', 'completed', 'cancelled', 'canceled') then
    return jsonb_build_object('available', false, 'reason', 'primary_order_ineligible');
  end if;

  select restaurant.*
    into primary_restaurant
  from public.restaurants restaurant
  where restaurant.catalog_id = primary_order.catalog_id
    and restaurant.is_active
  order by restaurant.created_at
  limit 1;

  if primary_restaurant.id is null
     or primary_restaurant.lat is null or primary_restaurant.lng is null
     or primary_order.delivery_lat is null or primary_order.delivery_lng is null then
    return jsonb_build_object('available', false, 'reason', 'coordinates_missing');
  end if;

  offer_expires_at := primary_order.created_at
    + make_interval(mins => addon_config.offer_window_minutes);
  if offer_expires_at <= pg_catalog.now() then
    return jsonb_build_object('available', false, 'reason', 'offer_expired');
  end if;

  insert into public.order_groups (
    client_account_id,
    primary_order_id,
    merchant_subtotal_amount,
    base_delivery_fee_amount,
    grand_total_amount,
    metadata
  )
  values (
    client_account_row.id,
    primary_order.id,
    greatest(coalesce(primary_order.subtotal_amount, primary_order.subtotal, 0), 0),
    greatest(coalesce(primary_order.delivery_fee, 0), 0),
    greatest(coalesce(primary_order.subtotal_amount, primary_order.subtotal, 0), 0)
      + greatest(coalesce(primary_order.delivery_fee, 0), 0),
    jsonb_build_object(
      'primary_merchant_id', primary_order.catalog_id,
      'primary_business_type', primary_catalog.business_type,
      'is_test', primary_order.is_test_order
    )
  )
  on conflict (primary_order_id) do nothing
  returning id into target_group_id;

  group_created := target_group_id is not null;
  if target_group_id is null then
    select order_group.id
      into target_group_id
    from public.order_groups order_group
    where order_group.primary_order_id = primary_order.id;
  end if;

  if target_group_id is null then
    raise exception 'order_group_initialization_failed';
  end if;

  update public.orders
  set order_group_id = target_group_id
  where id = primary_order.id
    and order_group_id is distinct from target_group_id;

  insert into public.addon_offers (
    order_group_id,
    config_id,
    status,
    expires_at,
    addon_delivery_fee,
    config_snapshot
  )
  values (
    target_group_id,
    addon_config.id,
    'evaluating',
    offer_expires_at,
    addon_config.addon_delivery_fee,
    jsonb_build_object(
      'offer_window_minutes', addon_config.offer_window_minutes,
      'addon_delivery_fee', addon_config.addon_delivery_fee,
      'max_extra_distance_km', addon_config.max_extra_distance_km,
      'max_extra_time_minutes', addon_config.max_extra_time_minutes,
      'max_post_main_pickup_delay_minutes', addon_config.max_post_main_pickup_delay_minutes,
      'max_additional_merchants', addon_config.max_additional_merchants,
      'candidate_store_radius_km', addon_config.candidate_store_radius_km,
      'route_corridor_km', addon_config.route_corridor_km,
      'max_route_candidates', addon_config.max_route_candidates,
      'max_shown_merchants', addon_config.max_shown_merchants
    )
  )
  on conflict (order_group_id) do nothing
  returning id into target_offer_id;

  offer_created := target_offer_id is not null;
  if target_offer_id is null then
    select offer.id, offer.expires_at
      into target_offer_id, offer_expires_at
    from public.addon_offers offer
    where offer.order_group_id = target_group_id;
  end if;

  if group_created then
    insert into public.order_group_events (
      order_group_id,
      merchant_order_id,
      event_type,
      actor_type,
      actor_id,
      metadata
    ) values (
      target_group_id,
      primary_order.id,
      'ORDER_CREATED',
      'client',
      client_account_row.id,
      jsonb_build_object('source', 'restaurant_checkout')
    );
  end if;

  if offer_created then
    insert into public.order_group_events (
      order_group_id,
      merchant_order_id,
      event_type,
      actor_type,
      actor_id,
      metadata
    ) values (
      target_group_id,
      primary_order.id,
      'ADDON_OFFER_CREATED',
      'system',
      null,
      jsonb_build_object('expires_at', offer_expires_at)
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'status', 'evaluating',
    'order_group_id', target_group_id,
    'offer_id', target_offer_id,
    'expires_at', offer_expires_at,
    'addon_delivery_fee', addon_config.addon_delivery_fee
  );
end;
$$;

revoke all on function public.initialize_post_order_addon(uuid, text) from public;
grant execute on function public.initialize_post_order_addon(uuid, text) to anon, authenticated, service_role;
