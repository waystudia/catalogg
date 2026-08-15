begin;

create or replace function public.get_combined_order_dispatch_readiness(
  target_order_id uuid,
  target_catalog_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  is_combined boolean := false;
  pending_merchants jsonb := '[]'::jsonb;
begin
  if not (
    public.is_platform_admin()
    or public.is_catalog_member(
      target_catalog_id,
      array['owner','admin','editor']::public.catalog_role[]
    )
  ) then
    raise exception 'Merchant order access is required';
  end if;

  select merchant_order.* into target_order
  from public.orders merchant_order
  where merchant_order.id = target_order_id
    and merchant_order.catalog_id = target_catalog_id;

  if target_order.id is null then
    raise exception 'Order was not found';
  end if;

  select target_order.order_group_id is not null and exists (
    select 1
    from public.orders addon_order
    where addon_order.order_group_id = target_order.order_group_id
      and addon_order.is_addon
      and addon_order.status::text not in ('cancelled', 'canceled')
  ) into is_combined;

  if not is_combined then
    return jsonb_build_object(
      'is_combined', false,
      'can_dispatch', target_order.status::text in (
        'ready', 'waiting_driver', 'driver_assigned', 'assigned_driver',
        'picked_up', 'on_the_way', 'delivered', 'completed'
      ),
      'pending_merchants', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', merchant_order.id,
      'name', coalesce(nullif(catalog.name, ''), 'Заведение'),
      'status', merchant_order.status,
      'is_addon', merchant_order.is_addon
    ) order by merchant_order.is_addon, merchant_order.created_at
  ), '[]'::jsonb) into pending_merchants
  from public.orders merchant_order
  join public.catalogs catalog on catalog.id = merchant_order.catalog_id
  where merchant_order.order_group_id = target_order.order_group_id
    and merchant_order.status::text not in ('cancelled', 'canceled')
    and merchant_order.status::text not in (
      'ready', 'waiting_driver', 'driver_assigned', 'assigned_driver',
      'picked_up', 'on_the_way', 'delivered', 'completed'
    );

  return jsonb_build_object(
    'is_combined', true,
    'can_dispatch', jsonb_array_length(pending_merchants) = 0,
    'pending_merchants', pending_merchants
  );
end;
$$;

revoke all on function public.get_combined_order_dispatch_readiness(uuid, uuid)
  from public, anon;
grant execute on function public.get_combined_order_dispatch_readiness(uuid, uuid)
  to authenticated;

create or replace function public.dispatch_restaurant_order_to_delivery(
  target_order_id uuid,
  target_catalog_id uuid,
  route_to_restaurant_url_input text,
  route_to_client_url_input text,
  offered_fee_input numeric,
  pricing_status_input text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  dispatch_order public.orders%rowtype;
  primary_order public.orders%rowtype;
  target_group public.order_groups%rowtype;
  current_delivery public.deliveries%rowtype;
  target_restaurant_id uuid;
  created_delivery_id uuid;
  has_restaurant_couriers boolean := false;
  next_provider text := 'platform';
  is_combined boolean := false;
  pending_merchant_names text[] := array[]::text[];
  dispatch_offered_fee numeric := 0;
begin
  if not (
    public.is_platform_admin()
    or public.is_catalog_member(
      target_catalog_id,
      array['owner','admin']::public.catalog_role[]
    )
  ) then
    raise exception 'Restaurant delivery dispatch is not authorized';
  end if;

  select merchant_order.* into target_order
  from public.orders merchant_order
  where merchant_order.id = target_order_id
    and merchant_order.catalog_id = target_catalog_id
  for update;

  if target_order.id is null then raise exception 'Order not found'; end if;
  if target_order.fulfillment_type <> 'delivery' then
    raise exception 'Order does not require delivery';
  end if;

  dispatch_order := target_order;

  if target_order.order_group_id is not null then
    select order_group.* into target_group
    from public.order_groups order_group
    where order_group.id = target_order.order_group_id
    for update;

    select target_group.id is not null and exists (
      select 1
      from public.orders addon_order
      where addon_order.order_group_id = target_group.id
        and addon_order.is_addon
        and addon_order.status::text not in ('cancelled', 'canceled')
    ) into is_combined;
  end if;

  if is_combined then
    select merchant_order.* into primary_order
    from public.orders merchant_order
    where merchant_order.id = target_group.primary_order_id
      and merchant_order.order_group_id = target_group.id
    for update;

    if primary_order.id is null then
      raise exception 'Combined order primary merchant is missing';
    end if;
    dispatch_order := primary_order;

    select coalesce(array_agg(coalesce(nullif(catalog.name, ''), 'Заведение')), array[]::text[])
      into pending_merchant_names
    from public.orders merchant_order
    join public.catalogs catalog on catalog.id = merchant_order.catalog_id
    where merchant_order.order_group_id = target_group.id
      and merchant_order.status::text not in ('cancelled', 'canceled')
      and merchant_order.status::text not in (
        'ready', 'waiting_driver', 'driver_assigned', 'assigned_driver',
        'picked_up', 'on_the_way', 'delivered', 'completed'
      );

    if cardinality(pending_merchant_names) > 0 then
      raise exception 'combined_delivery_merchants_not_ready'
        using detail = array_to_string(pending_merchant_names, ', ');
    end if;

    if exists (
      select 1
      from public.orders merchant_order
      where merchant_order.order_group_id = target_group.id
        and merchant_order.status::text not in ('cancelled', 'canceled')
        and coalesce(merchant_order.payment_status, 'unpaid') not in ('unpaid', 'confirmed')
    ) then
      raise exception 'Combined order payment is not ready for delivery';
    end if;
  elsif coalesce(target_order.payment_status, 'unpaid') not in ('unpaid', 'confirmed') then
    raise exception 'Order payment is not ready for delivery';
  end if;

  if target_order.status::text not in ('ready', 'waiting_driver') then
    raise exception 'Order is not ready for delivery';
  end if;

  select coalesce(
    dispatch_order.restaurant_id,
    (
      select restaurant.id
      from public.restaurants restaurant
      where restaurant.catalog_id = dispatch_order.catalog_id
      order by restaurant.created_at
      limit 1
    )
  ) into target_restaurant_id;

  select exists (
    select 1
    from public.restaurant_couriers restaurant_courier
    join public.drivers driver on driver.id = restaurant_courier.driver_id
    where restaurant_courier.restaurant_id = target_restaurant_id
      and restaurant_courier.is_active
      and driver.is_active
  ) into has_restaurant_couriers;

  next_provider := case when has_restaurant_couriers then 'restaurant' else 'platform' end;

  select delivery.* into current_delivery
  from public.deliveries delivery
  where (
      is_combined
      and delivery.order_group_id = target_group.id
    ) or delivery.order_id = dispatch_order.id
  order by (delivery.order_group_id = target_group.id) desc, delivery.created_at desc
  limit 1
  for update;

  if current_delivery.id is not null
     and current_delivery.status::text in (
       'waiting_courier', 'waiting_driver', 'assigned', 'arrived_to_restaurant',
       'handed_over', 'on_the_way', 'arrived_to_client', 'delivered'
     )
     and target_order.status::text = 'waiting_driver' then
    return current_delivery.id;
  end if;

  dispatch_offered_fee := greatest(
    0,
    coalesce(offered_fee_input, dispatch_order.delivery_fee, 0)
  );
  if is_combined then
    dispatch_offered_fee := greatest(
      dispatch_offered_fee,
      coalesce(target_group.base_delivery_fee_amount, 0)
        + coalesce(target_group.addon_delivery_fee_amount, 0),
      coalesce(current_delivery.offered_fee, 0)
    );
  end if;

  if current_delivery.id is null then
    insert into public.deliveries (
      order_id,
      delivery_provider,
      status,
      route_to_restaurant_url,
      route_to_client_url,
      offered_fee,
      pricing_status,
      estimated_time_min,
      estimated_time_max,
      order_group_id,
      addon_delivery_fee_amount
    ) values (
      dispatch_order.id,
      next_provider,
      'waiting_courier',
      coalesce(route_to_restaurant_url_input, ''),
      coalesce(route_to_client_url_input, ''),
      dispatch_offered_fee,
      case when pricing_status_input = 'offered' then 'offered' else 'pending' end,
      20,
      40,
      case when is_combined then target_group.id else null end,
      case when is_combined then target_group.addon_delivery_fee_amount else 0 end
    )
    on conflict (order_id) do update set
      delivery_provider = case
        when public.deliveries.driver_id is null then excluded.delivery_provider
        else public.deliveries.delivery_provider
      end,
      status = case
        when public.deliveries.status::text in ('planning', 'waiting_courier', 'waiting_driver')
          then 'waiting_courier'
        else public.deliveries.status
      end,
      route_to_restaurant_url = excluded.route_to_restaurant_url,
      route_to_client_url = excluded.route_to_client_url,
      offered_fee = greatest(public.deliveries.offered_fee, excluded.offered_fee),
      pricing_status = excluded.pricing_status,
      order_group_id = coalesce(public.deliveries.order_group_id, excluded.order_group_id),
      addon_delivery_fee_amount = greatest(
        public.deliveries.addon_delivery_fee_amount,
        excluded.addon_delivery_fee_amount
      ),
      updated_at = now()
    returning id into created_delivery_id;
  else
    update public.deliveries delivery
    set delivery_provider = case
          when delivery.driver_id is null then next_provider
          else delivery.delivery_provider
        end,
        status = case
          when delivery.status::text in ('planning', 'waiting_courier', 'waiting_driver')
            then 'waiting_courier'
          else delivery.status
        end,
        route_to_restaurant_url = coalesce(
          nullif(route_to_restaurant_url_input, ''),
          delivery.route_to_restaurant_url
        ),
        route_to_client_url = coalesce(
          nullif(route_to_client_url_input, ''),
          delivery.route_to_client_url
        ),
        offered_fee = greatest(coalesce(delivery.offered_fee, 0), dispatch_offered_fee),
        pricing_status = case
          when pricing_status_input = 'offered' then 'offered'
          else delivery.pricing_status
        end,
        order_group_id = case when is_combined then target_group.id else delivery.order_group_id end,
        addon_delivery_fee_amount = case
          when is_combined then target_group.addon_delivery_fee_amount
          else delivery.addon_delivery_fee_amount
        end,
        updated_at = now()
    where delivery.id = current_delivery.id
    returning delivery.id into created_delivery_id;
  end if;

  insert into public.delivery_tasks (
    catalog_id, order_id, delivery_status, address, city, settlement, qr_required
  ) values (
    dispatch_order.catalog_id,
    dispatch_order.id,
    'waiting_driver',
    coalesce(dispatch_order.delivery_address, ''),
    coalesce(dispatch_order.delivery_city, ''),
    coalesce(dispatch_order.delivery_settlement, ''),
    dispatch_order.qr_token is not null or dispatch_order.verification_code is not null
  )
  on conflict (order_id) do update set
    delivery_status = excluded.delivery_status,
    address = excluded.address,
    city = excluded.city,
    settlement = excluded.settlement,
    qr_required = excluded.qr_required,
    updated_at = now();

  if is_combined then
    insert into public.order_status_history (
      catalog_id, order_id, from_status, to_status, reason
    )
    select
      merchant_order.catalog_id,
      merchant_order.id,
      merchant_order.status,
      'waiting_driver',
      'combined_merchants_ready_delivery_dispatch'
    from public.orders merchant_order
    where merchant_order.order_group_id = target_group.id
      and merchant_order.status::text = 'ready';

    update public.orders merchant_order
    set status = 'waiting_driver',
        ready_at = coalesce(merchant_order.ready_at, now())
    where merchant_order.order_group_id = target_group.id
      and merchant_order.status::text = 'ready';

    insert into public.order_group_events (
      order_group_id, merchant_order_id, delivery_id,
      event_type, actor_type, actor_id, metadata
    ) values (
      target_group.id,
      target_order.id,
      created_delivery_id,
      'DELIVERY_DISPATCHED',
      'merchant',
      auth.uid(),
      jsonb_build_object('all_merchants_ready', true)
    );
  else
    insert into public.order_status_history (
      catalog_id, order_id, from_status, to_status, reason
    ) values (
      target_order.catalog_id,
      target_order.id,
      target_order.status,
      'waiting_driver',
      case when has_restaurant_couriers
        then 'restaurant_priority_couriers'
        else 'restaurant_dispatched_delivery'
      end
    );

    update public.orders
    set status = 'waiting_driver',
        ready_at = coalesce(ready_at, now())
    where id = target_order.id;
  end if;

  return created_delivery_id;
end;
$$;

revoke all on function public.dispatch_restaurant_order_to_delivery(
  uuid, uuid, text, text, numeric, text
) from public, anon;
grant execute on function public.dispatch_restaurant_order_to_delivery(
  uuid, uuid, text, text, numeric, text
) to authenticated;

commit;
