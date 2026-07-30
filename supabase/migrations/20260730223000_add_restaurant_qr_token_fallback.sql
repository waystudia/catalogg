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
    or exists (
      select 1
      from public.clients client
      where client.catalog_id = target_catalog_id
        and client.owner_user_id = auth.uid()
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

create or replace function public.refresh_current_driver_pickup_qr(
  target_delivery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  result jsonb;
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  update public.deliveries
  set pickup_qr_token = encode(gen_random_bytes(32), 'hex'),
      pickup_qr_expires_at = now() + interval '30 minutes',
      updated_at = now()
  where id = target_delivery_id
    and driver_id = viewer_driver_id
    and status = 'arrived_to_restaurant'
    and (
      pickup_qr_token is null
      or pickup_qr_expires_at is null
      or pickup_qr_expires_at <= now()
    );

  select jsonb_build_object(
    'token', d.pickup_qr_token,
    'expires_at', d.pickup_qr_expires_at
  )
  into result
  from public.deliveries d
  where d.id = target_delivery_id
    and d.driver_id = viewer_driver_id
    and d.status = 'arrived_to_restaurant';

  if result is null then
    raise exception 'Active restaurant pickup was not found';
  end if;

  return result;
end;
$$;

revoke all on function public.refresh_current_driver_pickup_qr(uuid) from public, anon;
grant execute on function public.refresh_current_driver_pickup_qr(uuid) to authenticated;

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

create or replace function public.get_restaurant_assigned_drivers(
  target_catalog_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not (
    public.is_platform_admin()
    or public.is_catalog_member(
      target_catalog_id,
      array['owner','admin','editor']::public.catalog_role[]
    )
    or exists (
      select 1
      from public.clients client
      where client.catalog_id = target_catalog_id
        and client.owner_user_id = auth.uid()
    )
  ) then
    raise exception 'Restaurant access is required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', dr.id,
        'order_id', o.id,
        'name', dr.name,
        'phone', dr.phone,
        'vehicle_info', dr.vehicle_info,
        'car_number', dr.car_number,
        'photo_url', dr.photo_url,
        'last_lat', dr.last_lat,
        'last_lng', dr.last_lng,
        'last_location_at', dr.last_location_at
      )
      order by o.created_at desc
    ),
    '[]'::jsonb
  )
  into result
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  join public.drivers dr on dr.id = d.driver_id
  where o.catalog_id = target_catalog_id;

  return result;
end;
$$;

revoke all on function public.get_restaurant_assigned_drivers(uuid) from public, anon;
grant execute on function public.get_restaurant_assigned_drivers(uuid) to authenticated;
