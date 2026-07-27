-- Restore driver offers after restaurants.map_url was removed from the live schema.
-- External navigation remains available from catalogs.map_url.

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
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

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
