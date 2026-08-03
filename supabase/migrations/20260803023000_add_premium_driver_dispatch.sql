alter table public.drivers
  add column if not exists is_premium boolean not null default false;

create index if not exists drivers_available_premium_idx
  on public.drivers (is_premium, is_active, is_online)
  where is_premium and is_active and is_online;

create or replace function public.protect_driver_premium_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_premium is distinct from new.is_premium
     and not public.is_platform_admin()
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Platform admin access is required';
  end if;
  return new;
end;
$$;

drop trigger if exists drivers_protect_premium_status on public.drivers;
create trigger drivers_protect_premium_status
before update of is_premium on public.drivers
for each row execute function public.protect_driver_premium_status();

create or replace function public.set_driver_premium(
  target_driver_id uuid,
  next_is_premium boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access is required';
  end if;

  update public.drivers
  set is_premium = coalesce(next_is_premium, false),
      updated_at = now()
  where id = target_driver_id;

  if not found then
    raise exception 'Driver was not found';
  end if;

  return coalesce(next_is_premium, false);
end;
$$;

revoke all on function public.set_driver_premium(uuid, boolean) from public, anon;
grant execute on function public.set_driver_premium(uuid, boolean) to authenticated;

create or replace function public.has_available_premium_driver(
  target_order_id uuid,
  target_delivery_provider text,
  target_restaurant_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders premium_order
    join public.drivers premium_driver on true
    where premium_order.id = target_order_id
      and premium_driver.is_premium
      and premium_driver.is_active
      and premium_driver.is_online
      and public.driver_serves_delivery_location(
        premium_driver.id,
        premium_order.delivery_city,
        premium_order.delivery_settlement
      )
      and (
        select count(*)
        from public.deliveries premium_active_delivery
        where premium_active_delivery.driver_id = premium_driver.id
          and premium_active_delivery.status in (
            'assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client'
          )
      ) < coalesce(premium_driver.max_active_deliveries, 1)
      and (
        target_delivery_provider in ('platform', 'hybrid')
        or (
          target_delivery_provider = 'restaurant'
          and exists (
            select 1
            from public.restaurant_couriers premium_restaurant_courier
            where premium_restaurant_courier.driver_id = premium_driver.id
              and premium_restaurant_courier.is_active
              and premium_restaurant_courier.restaurant_id = coalesce(
                target_restaurant_id,
                premium_order.restaurant_id,
                (
                  select premium_restaurant.id
                  from public.restaurants premium_restaurant
                  where premium_restaurant.catalog_id = premium_order.catalog_id
                  order by premium_restaurant.created_at
                  limit 1
                )
              )
          )
        )
      )
  );
$$;

revoke all on function public.has_available_premium_driver(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.accept_available_delivery(
  target_delivery_id uuid,
  target_driver_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  target_order_id uuid;
  target_restaurant_id uuid;
  existing_driver_id uuid;
  current_status text;
  current_provider text;
  can_serve boolean := false;
  is_restaurant_courier boolean := false;
  viewer_is_premium boolean := false;
  active_delivery_count integer := 0;
  driver_capacity integer := 1;
  next_qr text := encode(gen_random_bytes(32), 'hex');
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;
  if target_driver_id is distinct from viewer_driver_id then
    raise exception 'Driver cannot accept a delivery for another account';
  end if;

  select d.order_id, d.driver_id, d.status, d.delivery_provider,
         coalesce(o.restaurant_id, (
           select r.id from public.restaurants r
           where r.catalog_id = o.catalog_id
           order by r.created_at limit 1
         ))
    into target_order_id, existing_driver_id, current_status, current_provider, target_restaurant_id
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  where d.id = target_delivery_id
  for update of d;

  if target_order_id is null then raise exception 'Delivery is not available'; end if;
  if existing_driver_id is not null and existing_driver_id is distinct from viewer_driver_id then
    raise exception 'Delivery is not available';
  end if;
  if current_status not in ('waiting_courier', 'waiting_driver', 'assigned') then
    raise exception 'Delivery is not available';
  end if;

  if existing_driver_id is null then
    select coalesce(dr.max_active_deliveries, 1), coalesce(dr.is_premium, false)
      into driver_capacity, viewer_is_premium
    from public.drivers dr
    where dr.id = viewer_driver_id
      and dr.is_active
      and dr.is_online;

    if driver_capacity is null then raise exception 'Driver is not available'; end if;

    select count(*) into active_delivery_count
    from public.deliveries active_delivery
    where active_delivery.driver_id = viewer_driver_id
      and active_delivery.status in (
        'assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client'
      );

    if active_delivery_count >= driver_capacity then
      raise exception 'Driver active delivery limit reached';
    end if;

    select public.driver_serves_delivery_location(
      viewer_driver_id, o.delivery_city, o.delivery_settlement
    ) into can_serve
    from public.orders o
    where o.id = target_order_id;

    if not coalesce(can_serve, false) then raise exception 'Delivery is not available'; end if;

    if current_provider = 'restaurant' then
      select exists (
        select 1 from public.restaurant_couriers rc
        where rc.restaurant_id = target_restaurant_id
          and rc.driver_id = viewer_driver_id
          and rc.is_active
      ) into is_restaurant_courier;
      if not is_restaurant_courier then raise exception 'Delivery is reserved for restaurant couriers'; end if;
    elsif current_provider not in ('platform', 'hybrid') then
      raise exception 'Delivery is not available';
    end if;

    if not viewer_is_premium
       and public.has_available_premium_driver(target_order_id, current_provider, target_restaurant_id) then
      raise exception 'Delivery is reserved for premium drivers';
    end if;
  end if;

  update public.deliveries
  set driver_id = viewer_driver_id,
      status = 'assigned',
      assigned_at = coalesce(assigned_at, now()),
      pickup_qr_token = coalesce(pickup_qr_token, next_qr),
      pickup_qr_expires_at = greatest(coalesce(pickup_qr_expires_at, now()), now() + interval '2 hours')
  where id = target_delivery_id;

  update public.orders
  set status = 'assigned_driver'
  where id = target_order_id
    and status::text in ('waiting_driver', 'driver_assigned', 'assigned_driver', 'ready');

  update public.drivers
  set is_online = true,
      status = 'heading_to_restaurant',
      updated_at = now()
  where id = viewer_driver_id;

  insert into public.delivery_status_history (delivery_id, status, comment)
  values (target_delivery_id, 'assigned', 'driver accepted delivery')
  on conflict do nothing;

  return target_delivery_id;
end;
$$;

revoke all on function public.accept_available_delivery(uuid, uuid) from public, anon;
grant execute on function public.accept_available_delivery(uuid, uuid) to authenticated;

create or replace function public.get_driver_delivery_offers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  offers jsonb;
begin
  if viewer_driver_id is null then raise exception 'Driver authentication is required'; end if;

  with viewer_driver as (
    select
      driver.id,
      coalesce(driver.is_premium, false) as is_premium,
      coalesce(driver.max_active_deliveries, 1) as max_active_deliveries
    from public.drivers driver
    where driver.id = viewer_driver_id
      and driver.is_active
      and driver.is_online
  ),
  assigned_deliveries as (
    select d.*
    from public.deliveries d
    where d.driver_id = viewer_driver_id
      and d.status in ('assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client')
  ),
  open_deliveries as (
    select d.*
    from public.deliveries d
    join public.orders o on o.id = d.order_id
    cross join viewer_driver
    where d.driver_id is null
      and d.status in ('waiting_courier', 'waiting_driver')
      and public.driver_serves_delivery_location(viewer_driver_id, o.delivery_city, o.delivery_settlement)
      and (
        select count(*)
        from public.deliveries active_delivery
        where active_delivery.driver_id = viewer_driver_id
          and active_delivery.status in (
            'assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client'
          )
      ) < viewer_driver.max_active_deliveries
      and (
        d.delivery_provider in ('platform', 'hybrid')
        or (
          d.delivery_provider = 'restaurant'
          and exists (
            select 1
            from public.restaurant_couriers rc
            join public.restaurants rr on rr.id = rc.restaurant_id
            where rc.driver_id = viewer_driver_id
              and rc.is_active
              and (
                rr.id = o.restaurant_id
                or (o.restaurant_id is null and rr.catalog_id = o.catalog_id)
              )
          )
        )
      )
      and (
        viewer_driver.is_premium
        or not public.has_available_premium_driver(
          d.order_id,
          d.delivery_provider,
          coalesce(
            o.restaurant_id,
            (
              select offer_restaurant.id
              from public.restaurants offer_restaurant
              where offer_restaurant.catalog_id = o.catalog_id
              order by offer_restaurant.created_at
              limit 1
            )
          )
        )
      )
    order by d.created_at desc
    limit 80
  ),
  candidate_deliveries as (
    select * from assigned_deliveries
    union all
    select * from open_deliveries
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'order_id', d.order_id,
      'driver_id', d.driver_id,
      'status', d.status,
      'delivery_provider', d.delivery_provider,
      'pickup_qr_token', case when d.driver_id = viewer_driver_id then d.pickup_qr_token else null end,
      'pickup_qr_expires_at', case when d.driver_id = viewer_driver_id then d.pickup_qr_expires_at else null end,
      'pickup_qr_confirmed_at', case when d.driver_id = viewer_driver_id then d.pickup_qr_confirmed_at else null end,
      'assigned_at', d.assigned_at,
      'route_to_restaurant_url', d.route_to_restaurant_url,
      'route_to_client_url', case when d.driver_id = viewer_driver_id then d.route_to_client_url else null end,
      'estimated_time_min', d.estimated_time_min,
      'estimated_time_max', d.estimated_time_max,
      'offered_fee', d.offered_fee,
      'pricing_status', d.pricing_status,
      'created_at', d.created_at,
      'orders', jsonb_build_object(
        'id', o.id,
        'order_type', case
          when o.fulfillment_type = 'delivery' then 'delivery'
          when o.fulfillment_type = 'takeaway' then 'pickup'
          else 'dine_in'
        end,
        'fulfillment_type', o.fulfillment_type,
        'status', o.status,
        'payment_status', o.payment_status,
        'payment_method', case
          when coalesce(o.comment, '') ~* '\[payment_method:cash\]' then 'cash'
          else 'bank_transfer'
        end,
        'restaurant_payment_confirmed_at', case
          when d.driver_id = viewer_driver_id then o.restaurant_payment_confirmed_at
          else null
        end,
        'client_name', case when d.driver_id = viewer_driver_id then o.client_name else '' end,
        'client_phone', case when d.driver_id = viewer_driver_id then o.client_phone else '' end,
        'customer_name', case when d.driver_id = viewer_driver_id then o.customer_name else '' end,
        'customer_phone', case when d.driver_id = viewer_driver_id then o.customer_phone else '' end,
        'delivery_address', o.delivery_address,
        'delivery_city', o.delivery_city,
        'delivery_settlement', o.delivery_settlement,
        'delivery_lat', o.delivery_lat,
        'delivery_lng', o.delivery_lng,
        'delivery_comment', case when d.driver_id = viewer_driver_id then o.delivery_comment else null end,
        'restaurant_address_snapshot', o.restaurant_address_snapshot,
        'restaurant_lat_snapshot', o.restaurant_lat_snapshot,
        'restaurant_lng_snapshot', o.restaurant_lng_snapshot,
        'delivery_fee', o.delivery_fee,
        'total', o.total,
        'total_amount', o.total_amount,
        'created_at', o.created_at,
        'order_items', coalesce((
          select jsonb_agg(jsonb_build_object('quantity', oi.quantity))
          from public.order_items oi
          where oi.order_id = o.id
        ), '[]'::jsonb),
        'restaurants', jsonb_build_object(
          'name', coalesce(r.name, c.name, 'Ресторан'),
          'logo_url', coalesce(r.logo_url, c.logo_url, ''),
          'cover_url', coalesce(r.cover_url, c.banner_url, ''),
          'description', coalesce(r.description, c.description, ''),
          'address_line', coalesce(r.address_line, o.restaurant_address_snapshot, ''),
          'lat', coalesce(r.lat, o.restaurant_lat_snapshot),
          'lng', coalesce(r.lng, o.restaurant_lng_snapshot),
          'map_url', coalesce(c.map_url, '')
        )
      )
    ) order by
      case when d.driver_id = viewer_driver_id then 0 else 1 end,
      d.updated_at desc nulls last,
      d.created_at desc
  ), '[]'::jsonb) into offers
  from candidate_deliveries d
  join public.orders o on o.id = d.order_id
  left join public.catalogs c on c.id = o.catalog_id
  left join lateral (
    select restaurant.*
    from public.restaurants restaurant
    where restaurant.id = o.restaurant_id
       or restaurant.catalog_id = o.catalog_id
    order by case when restaurant.id = o.restaurant_id then 0 else 1 end
    limit 1
  ) r on true;

  return offers;
end;
$$;

revoke all on function public.get_driver_delivery_offers() from public, anon;
grant execute on function public.get_driver_delivery_offers() to authenticated;
