-- Return the assigned order scope in the protected driver-offers RPC so the
-- client can open the tenant-scoped chat and identify deletable test orders.

create or replace function public.get_driver_delivery_offers()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(scoped.offer), '[]'::jsonb)
  from (
    select
      offer || jsonb_build_object(
        'catalog_id', case
          when delivery.driver_id = viewer_driver.id then order_row.catalog_id
          else null
        end,
        'is_test_order', case
          when delivery.driver_id = viewer_driver.id then order_row.is_test_order
          else false
        end,
        'client_delivery_fee', greatest(coalesce(order_row.delivery_fee, 0), 0),
        'restaurant_funds_delivery',
          greatest(coalesce(order_row.delivery_fee, 0), 0) = 0
          and greatest(coalesce(delivery.offered_fee, 0), 0) > 0,
        'restaurant_delivery_payout_amount', case
          when greatest(coalesce(order_row.delivery_fee, 0), 0) = 0
            then greatest(coalesce(delivery.offered_fee, 0), 0)
          else 0
        end,
        'driver_restaurant_order_payment_confirmed_at', case
          when delivery.driver_id = viewer_driver.id
            then delivery.driver_restaurant_order_payment_confirmed_at
          else null
        end,
        'driver_restaurant_order_payment_amount', case
          when delivery.driver_id = viewer_driver.id
            then delivery.driver_restaurant_order_payment_amount
          else null
        end,
        'driver_restaurant_delivery_payout_received_at', case
          when delivery.driver_id = viewer_driver.id
            then delivery.driver_restaurant_delivery_payout_received_at
          else null
        end,
        'driver_restaurant_delivery_payout_received_amount', case
          when delivery.driver_id = viewer_driver.id
            then delivery.driver_restaurant_delivery_payout_received_amount
          else null
        end,
        'order_group_id', delivery.order_group_id,
        'is_combined', delivery.order_group_id is not null and exists (
          select 1
          from public.orders grouped_order
          where grouped_order.order_group_id = delivery.order_group_id
            and grouped_order.is_addon
            and grouped_order.status::text not in ('cancelled', 'canceled')
        ),
        'delivery_stops', case
          when delivery.driver_id = viewer_driver.id then coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', delivery_stop.id,
                'delivery_id', delivery_stop.delivery_id,
                'merchant_order_id', delivery_stop.merchant_order_id,
                'stop_type', delivery_stop.stop_type,
                'sequence', delivery_stop.sequence,
                'status', delivery_stop.status,
                'latitude', delivery_stop.latitude,
                'longitude', delivery_stop.longitude,
                'address', delivery_stop.address,
                'estimated_arrival_at', delivery_stop.estimated_arrival_at,
                'merchant_name', case
                  when delivery_stop.stop_type = 'dropoff' then 'Клиент'
                  else coalesce(nullif(stop_catalog.name, ''), 'Точка выдачи')
                end,
                'merchant_type', coalesce(stop_catalog.business_type, 'restaurant'),
                'merchant_order_status', stop_order.status,
                'estimated_ready_at', stop_order.estimated_ready_at,
                'is_primary', delivery_stop.merchant_order_id = delivery.order_id
              )
              order by delivery_stop.sequence
            )
            from public.delivery_stops delivery_stop
            left join public.orders stop_order on stop_order.id = delivery_stop.merchant_order_id
            left join public.catalogs stop_catalog on stop_catalog.id = stop_order.catalog_id
            where delivery_stop.delivery_id = delivery.id
          ), '[]'::jsonb)
          else '[]'::jsonb
        end
      ) as offer
    from jsonb_array_elements(public.get_driver_delivery_offers_unscoped()) offer
    join public.deliveries delivery on delivery.id = (offer ->> 'id')::uuid
    join public.orders order_row on order_row.id = delivery.order_id
    join public.drivers viewer_driver on viewer_driver.id = public.current_driver_id()
    where coalesce(order_row.is_test_order, false) = coalesce(viewer_driver.is_test, false)
    order by
      case when offer ->> 'driver_id' = viewer_driver.id::text then 0 else 1 end,
      offer ->> 'created_at' desc
  ) scoped;
$$;

revoke all on function public.get_driver_delivery_offers() from public, anon;
grant execute on function public.get_driver_delivery_offers() to authenticated;
