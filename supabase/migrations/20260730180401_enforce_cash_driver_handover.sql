alter table public.deliveries
  add column if not exists pickup_qr_confirmed_at timestamptz;

create or replace function public.confirm_restaurant_cash_payment(
  target_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_catalog_id uuid;
  target_comment text;
  target_delivery_status text;
begin
  select o.catalog_id, coalesce(o.comment, ''), d.status
    into target_catalog_id, target_comment, target_delivery_status
  from public.orders o
  join public.deliveries d on d.order_id = o.id
  where o.id = target_order_id
  for update of o, d;

  if target_catalog_id is null then
    return false;
  end if;

  if not (
    public.is_platform_admin()
    or public.is_catalog_member(
      target_catalog_id,
      array['owner','admin','editor']::public.catalog_role[]
    )
  ) then
    raise exception 'Restaurant access is required';
  end if;

  if target_comment !~* '\[payment_method:cash\]' then
    raise exception 'Cash confirmation is only available for cash orders';
  end if;

  if target_delivery_status <> 'arrived_to_restaurant' then
    raise exception 'Driver must arrive at the restaurant before cash confirmation';
  end if;

  update public.orders
  set restaurant_payment_confirmed_at = coalesce(restaurant_payment_confirmed_at, now())
  where id = target_order_id;

  return true;
end;
$$;

revoke all on function public.confirm_restaurant_cash_payment(uuid) from public, anon;
grant execute on function public.confirm_restaurant_cash_payment(uuid) to authenticated;

create or replace function public.confirm_delivery_pickup_qr(
  target_delivery_id uuid,
  presented_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  target_catalog_id uuid;
  target_comment text;
  payment_confirmed_at timestamptz;
begin
  select d.order_id, o.catalog_id, coalesce(o.comment, ''), o.restaurant_payment_confirmed_at
    into target_order_id, target_catalog_id, target_comment, payment_confirmed_at
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  where d.id = target_delivery_id
    and d.status = 'arrived_to_restaurant'
    and d.pickup_qr_token = trim(presented_token)
    and d.pickup_qr_expires_at > now()
  for update of d, o;

  if target_order_id is null then
    return false;
  end if;

  if not (
    public.is_platform_admin()
    or public.is_catalog_member(
      target_catalog_id,
      array['owner','admin','editor']::public.catalog_role[]
    )
  ) then
    raise exception 'Restaurant access is required';
  end if;

  if target_comment ~* '\[payment_method:cash\]' and payment_confirmed_at is null then
    raise exception 'Сначала подтвердите оплату заказа водителем';
  end if;

  update public.deliveries
  set pickup_qr_confirmed_at = now(),
      updated_at = now()
  where id = target_delivery_id;

  insert into public.delivery_status_history (delivery_id, status, comment)
  values (target_delivery_id, 'arrived_to_restaurant', 'restaurant verified driver QR');

  return true;
end;
$$;

revoke all on function public.confirm_delivery_pickup_qr(uuid, text) from public, anon;
grant execute on function public.confirm_delivery_pickup_qr(uuid, text) to authenticated;

create or replace function public.confirm_delivery_pickup_qr_by_token(
  target_catalog_slug text,
  presented_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_delivery_id uuid;
begin
  select d.id
    into target_delivery_id
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  join public.catalogs c on c.id = o.catalog_id
  where lower(c.slug) = lower(trim(target_catalog_slug))
    and d.status = 'arrived_to_restaurant'
    and d.pickup_qr_token = trim(presented_token)
    and d.pickup_qr_expires_at > now()
  order by d.updated_at desc nulls last, d.created_at desc
  limit 1;

  if target_delivery_id is null then
    return false;
  end if;

  return public.confirm_delivery_pickup_qr(target_delivery_id, presented_token);
end;
$$;

revoke all on function public.confirm_delivery_pickup_qr_by_token(text, text) from public, anon;
grant execute on function public.confirm_delivery_pickup_qr_by_token(text, text) to authenticated;

create or replace function public.update_current_driver_delivery_status(
  target_delivery_id uuid,
  next_status text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  target_order_id uuid;
  current_status text;
  qr_confirmed_at timestamptz;
  target_comment text;
  payment_confirmed_at timestamptz;
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  if next_status not in ('arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client') then
    raise exception 'Unsupported driver delivery status';
  end if;

  select d.order_id, d.status, d.pickup_qr_confirmed_at,
         coalesce(o.comment, ''), o.restaurant_payment_confirmed_at
    into target_order_id, current_status, qr_confirmed_at,
         target_comment, payment_confirmed_at
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  where d.id = target_delivery_id
    and d.driver_id = viewer_driver_id
  for update of d, o;

  if target_order_id is null then
    raise exception 'Delivery is not assigned to current driver';
  end if;

  if next_status = 'arrived_to_restaurant' and current_status not in ('assigned', 'arrived_to_restaurant') then
    raise exception 'Driver cannot mark restaurant arrival from current status';
  end if;

  if next_status = 'handed_over' then
    if current_status not in ('arrived_to_restaurant', 'handed_over') then
      raise exception 'Driver cannot mark pickup from current status';
    end if;
    if current_status <> 'handed_over' and qr_confirmed_at is null then
      raise exception 'Ресторан должен отсканировать QR-код водителя';
    end if;
    if current_status <> 'handed_over'
      and target_comment ~* '\[payment_method:cash\]'
      and payment_confirmed_at is null then
      raise exception 'Ресторан должен подтвердить оплату наличного заказа';
    end if;
  end if;

  if next_status = 'on_the_way' and current_status not in ('handed_over', 'on_the_way') then
    raise exception 'Driver cannot start client route from current status';
  end if;

  if next_status = 'arrived_to_client' and current_status not in ('on_the_way', 'arrived_to_client') then
    raise exception 'Driver cannot mark client arrival from current status';
  end if;

  update public.deliveries
  set status = next_status,
      driver_arrived_restaurant_at = case
        when next_status = 'arrived_to_restaurant' then coalesce(driver_arrived_restaurant_at, now())
        else driver_arrived_restaurant_at
      end,
      picked_up_at = case
        when next_status in ('handed_over', 'on_the_way') then coalesce(picked_up_at, now())
        else picked_up_at
      end,
      driver_arrived_client_at = case
        when next_status = 'arrived_to_client' then coalesce(driver_arrived_client_at, now())
        else driver_arrived_client_at
      end,
      updated_at = now()
  where id = target_delivery_id;

  update public.orders
  set status = case
        when next_status in ('handed_over', 'on_the_way') then 'picked_up'::public.order_status
        when next_status = 'arrived_to_client' then 'on_the_way'::public.order_status
        else status
      end
  where id = target_order_id;

  update public.drivers
  set status = case
        when next_status = 'arrived_to_restaurant' then 'at_restaurant'
        when next_status in ('handed_over', 'on_the_way') then 'heading_to_client'
        when next_status = 'arrived_to_client' then 'at_client'
        else status
      end,
      is_online = true,
      updated_at = now()
  where id = viewer_driver_id;

  insert into public.delivery_status_history (delivery_id, status, comment)
  values (target_delivery_id, next_status, 'driver updated delivery status');

  return target_delivery_id;
end;
$$;

revoke all on function public.update_current_driver_delivery_status(uuid, text) from public, anon;
grant execute on function public.update_current_driver_delivery_status(uuid, text) to authenticated;

create or replace function public.confirm_driver_pickup(
  target_delivery_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  viewer_driver_id uuid := public.current_driver_id();
  current_status text;
  qr_confirmed_at timestamptz;
  target_comment text;
  payment_confirmed_at timestamptz;
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  select d.order_id, d.status, d.pickup_qr_confirmed_at,
         coalesce(o.comment, ''), o.restaurant_payment_confirmed_at
    into target_order_id, current_status, qr_confirmed_at,
         target_comment, payment_confirmed_at
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  where d.id = target_delivery_id
    and d.driver_id = viewer_driver_id
  for update of d, o;

  if target_order_id is null then
    return false;
  end if;

  if current_status = 'handed_over' then
    return true;
  end if;

  if current_status <> 'arrived_to_restaurant' then
    return false;
  end if;

  if qr_confirmed_at is null then
    raise exception 'Ресторан должен отсканировать QR-код водителя';
  end if;

  if target_comment ~* '\[payment_method:cash\]' and payment_confirmed_at is null then
    raise exception 'Ресторан должен подтвердить оплату наличного заказа';
  end if;

  perform public.update_current_driver_delivery_status(target_delivery_id, 'handed_over');
  return true;
end;
$$;

revoke all on function public.confirm_driver_pickup(uuid) from public, anon;
grant execute on function public.confirm_driver_pickup(uuid) to authenticated;

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

  with assigned_deliveries as (
    select d.*
    from public.deliveries d
    where d.driver_id = viewer_driver_id
      and d.status in ('assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client')
  ),
  open_deliveries as (
    select d.*
    from public.deliveries d
    join public.orders o on o.id = d.order_id
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
      ) < (
        select coalesce(dr.max_active_deliveries, 1)
        from public.drivers dr
        where dr.id = viewer_driver_id
      )
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
