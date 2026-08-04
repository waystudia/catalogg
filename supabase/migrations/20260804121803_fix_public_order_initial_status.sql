-- A delivery order stays in the restaurant-controlled status until the
-- restaurant explicitly dispatches it and a delivery row exists.
create or replace function public.get_public_restaurant_order_status(
  target_order_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'id', o.id,
    'catalog_id', o.catalog_id,
    'customer_name', o.customer_name,
    'customer_phone', o.customer_phone,
    'fulfillment_type', o.fulfillment_type,
    'delivery_address', coalesce(o.delivery_address, ''),
    'delivery_lat', o.delivery_lat,
    'delivery_lng', o.delivery_lng,
    'client_accuracy_m', o.client_accuracy_m,
    'restaurant_name', coalesce(c.name, ''),
    'restaurant_address', coalesce(o.restaurant_address_snapshot, ''),
    'restaurant_lat', o.restaurant_lat_snapshot,
    'restaurant_lng', o.restaurant_lng_snapshot,
    'status', o.status,
    'payment_status', coalesce(o.payment_status, 'unpaid'),
    'delivery_status', d.status,
    'driver_name', drv.name,
    'driver_phone', drv.phone,
    'subtotal', coalesce(o.subtotal, 0),
    'delivery_fee', coalesce(o.delivery_fee, 0),
    'total', coalesce(o.total, 0),
    'created_at', o.created_at,
    'accepted_at', o.accepted_at,
    'ready_at', o.ready_at,
    'completed_at', o.completed_at,
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'title', oi.title,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'line_total', oi.line_total
          )
          order by oi.id
        )
        from public.order_items oi
        where oi.order_id = o.id
      ),
      '[]'::jsonb
    )
  )
  from public.orders o
  left join public.deliveries d on d.order_id = o.id
  left join public.drivers drv on drv.id = d.driver_id
  left join public.catalogs c on c.id = o.catalog_id
  where o.id = target_order_id;
$$;

revoke all on function public.get_public_restaurant_order_status(uuid) from public;
grant execute on function public.get_public_restaurant_order_status(uuid) to anon, authenticated;
