-- Expose and advance generic delivery stops without changing the legacy
-- single-pickup delivery workflow. Combined deliveries remain one assignment.

begin;

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

create or replace function public.update_current_driver_delivery_stop(
  target_delivery_id uuid,
  target_stop_id uuid,
  next_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  current_delivery public.deliveries%rowtype;
  current_stop public.delivery_stops%rowtype;
  primary_order public.orders%rowtype;
  active_stop_id uuid;
  remaining_pickups integer;
  event_type text;
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;
  if next_status not in ('arrived', 'completed') then
    raise exception 'Unsupported delivery stop status';
  end if;

  select delivery.* into current_delivery
  from public.deliveries delivery
  where delivery.id = target_delivery_id
    and delivery.driver_id = viewer_driver_id
    and delivery.status::text in (
      'assigned', 'arrived_to_restaurant', 'handed_over',
      'on_the_way', 'arrived_to_client'
    )
  for update;

  if current_delivery.id is null then
    raise exception 'Delivery is not assigned to current driver';
  end if;

  select delivery_stop.* into current_stop
  from public.delivery_stops delivery_stop
  where delivery_stop.id = target_stop_id
    and delivery_stop.delivery_id = target_delivery_id
  for update;

  if current_stop.id is null then
    raise exception 'Delivery stop is not available';
  end if;
  if current_stop.status in ('completed', 'skipped', 'cancelled') then
    return jsonb_build_object(
      'delivery_id', current_delivery.id,
      'stop_id', current_stop.id,
      'stop_status', current_stop.status,
      'delivery_status', current_delivery.status,
      'idempotent', true
    );
  end if;

  select candidate_stop.id into active_stop_id
  from public.delivery_stops candidate_stop
  where candidate_stop.delivery_id = target_delivery_id
    and candidate_stop.status in ('pending', 'arrived')
  order by candidate_stop.sequence
  limit 1
  for update;

  if active_stop_id <> target_stop_id then
    raise exception 'Complete the previous delivery stop first';
  end if;
  if next_status = 'completed' and current_stop.status <> 'arrived' then
    raise exception 'Mark arrival before completing the delivery stop';
  end if;

  select order_row.* into primary_order
  from public.orders order_row
  where order_row.id = current_delivery.order_id
  for update;

  if next_status = 'arrived' then
    update public.delivery_stops
    set status = 'arrived',
        arrived_at = coalesce(arrived_at, now()),
        updated_at = now()
    where id = current_stop.id;

    if current_stop.stop_type = 'pickup'
      and current_stop.merchant_order_id = current_delivery.order_id then
      update public.deliveries
      set status = 'arrived_to_restaurant',
          driver_arrived_restaurant_at = coalesce(driver_arrived_restaurant_at, now()),
          updated_at = now()
      where id = current_delivery.id;
    elsif current_stop.stop_type = 'dropoff' then
      update public.deliveries
      set status = 'arrived_to_client',
          driver_arrived_client_at = coalesce(driver_arrived_client_at, now()),
          updated_at = now()
      where id = current_delivery.id;
    end if;

    update public.drivers
    set status = case
          when current_stop.stop_type = 'dropoff' then 'at_client'
          else 'at_restaurant'
        end,
        is_online = true,
        updated_at = now()
    where id = viewer_driver_id;

    event_type := 'DELIVERY_STOP_ARRIVED';
  else
    if current_stop.stop_type = 'pickup'
      and current_stop.merchant_order_id = current_delivery.order_id then
      if current_delivery.pickup_qr_confirmed_at is null then
        raise exception 'Ресторан должен отсканировать QR-код водителя';
      end if;
      if coalesce(primary_order.comment, '') ~* '\[payment_method:cash\]'
        and primary_order.restaurant_payment_confirmed_at is null then
        raise exception 'Ресторан должен подтвердить оплату наличного заказа';
      end if;
      if greatest(coalesce(primary_order.delivery_fee, 0), 0) = 0
        and greatest(coalesce(current_delivery.offered_fee, 0), 0) > 0
        and current_delivery.driver_restaurant_delivery_payout_received_at is null then
        raise exception 'Сначала подтвердите получение оплаты доставки от ресторана';
      end if;
    end if;

    update public.delivery_stops
    set status = 'completed',
        arrived_at = coalesce(arrived_at, now()),
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = current_stop.id;

    if current_stop.stop_type = 'pickup' then
      update public.orders
      set status = 'picked_up'::public.order_status,
          updated_at = now()
      where id = current_stop.merchant_order_id
        and status::text not in ('completed', 'delivered', 'cancelled', 'canceled');

      select count(*) into remaining_pickups
      from public.delivery_stops delivery_stop
      where delivery_stop.delivery_id = current_delivery.id
        and delivery_stop.stop_type = 'pickup'
        and delivery_stop.status in ('pending', 'arrived');

      update public.deliveries
      set status = case when remaining_pickups = 0 then 'on_the_way' else 'assigned' end,
          picked_up_at = case
            when remaining_pickups = 0 then coalesce(picked_up_at, now())
            else picked_up_at
          end,
          updated_at = now()
      where id = current_delivery.id;

      update public.drivers
      set status = case
            when remaining_pickups = 0 then 'heading_to_client'
            else 'heading_to_restaurant'
          end,
          is_online = true,
          updated_at = now()
      where id = viewer_driver_id;

      event_type := 'COURIER_PICKED_UP';
    else
      if exists (
        select 1
        from public.delivery_stops delivery_stop
        where delivery_stop.delivery_id = current_delivery.id
          and delivery_stop.stop_type = 'pickup'
          and delivery_stop.status not in ('completed', 'skipped', 'cancelled')
      ) then
        raise exception 'Complete every pickup before customer dropoff';
      end if;

      update public.deliveries
      set status = 'arrived_to_client',
          driver_arrived_client_at = coalesce(driver_arrived_client_at, now()),
          updated_at = now()
      where id = current_delivery.id;

      perform public.complete_driver_delivery(target_delivery_id);

      update public.orders merchant_order
      set status = 'completed'::public.order_status,
          completed_at = coalesce(merchant_order.completed_at, now()),
          updated_at = now()
      where merchant_order.order_group_id = current_delivery.order_group_id
        and merchant_order.status::text not in ('cancelled', 'canceled');

      update public.order_groups
      set status = 'completed',
          completed_at = coalesce(completed_at, now()),
          updated_at = now()
      where id = current_delivery.order_group_id;

      event_type := 'DELIVERY_COMPLETED';
    end if;
  end if;

  if current_delivery.order_group_id is not null then
    insert into public.order_group_events (
      order_group_id,
      merchant_order_id,
      delivery_id,
      event_type,
      actor_type,
      actor_id,
      metadata
    ) values (
      current_delivery.order_group_id,
      current_stop.merchant_order_id,
      current_delivery.id,
      event_type,
      'courier',
      viewer_driver_id,
      jsonb_build_object(
        'stop_id', current_stop.id,
        'sequence', current_stop.sequence,
        'stop_type', current_stop.stop_type,
        'next_status', next_status
      )
    );
  end if;

  return jsonb_build_object(
    'delivery_id', current_delivery.id,
    'stop_id', current_stop.id,
    'stop_status', next_status,
    'delivery_status', (
      select delivery.status from public.deliveries delivery where delivery.id = current_delivery.id
    ),
    'idempotent', false
  );
end;
$$;

revoke all on function public.update_current_driver_delivery_stop(uuid, uuid, text)
  from public, anon;
grant execute on function public.update_current_driver_delivery_stop(uuid, uuid, text)
  to authenticated;

commit;
