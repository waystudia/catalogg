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
        'delivery_id', d.id,
        'delivery_status', d.status,
        'delivery_updated_at', d.updated_at,
        'pickup_qr_confirmed_at', d.pickup_qr_confirmed_at,
        'restaurant_payment_confirmed_at', o.restaurant_payment_confirmed_at,
        'name', dr.name,
        'phone', dr.phone,
        'vehicle_info', dr.vehicle_info,
        'car_number', dr.car_number,
        'photo_url', dr.photo_url,
        'last_lat', dr.last_lat,
        'last_lng', dr.last_lng,
        'last_location_at', dr.last_location_at
      )
      order by o.created_at desc, d.updated_at desc nulls last
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
