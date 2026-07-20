alter table public.deliveries drop constraint if exists deliveries_status_check;

alter table public.deliveries add constraint deliveries_status_check
  check (status in (
    'not_required',
    'waiting_courier',
    'waiting_driver',
    'assigned',
    'arrived_to_restaurant',
    'handed_over',
    'on_the_way',
    'arrived_to_client',
    'delivered',
    'failed',
    'canceled',
    'cancelled'
  ));

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
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  if next_status not in ('arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client') then
    raise exception 'Unsupported driver delivery status';
  end if;

  select d.order_id, d.status
    into target_order_id, current_status
  from public.deliveries d
  where d.id = target_delivery_id
    and d.driver_id = viewer_driver_id
  for update;

  if target_order_id is null then
    raise exception 'Delivery is not assigned to current driver';
  end if;

  if next_status = 'arrived_to_restaurant' and current_status not in ('assigned', 'arrived_to_restaurant') then
    raise exception 'Driver cannot mark restaurant arrival from current status';
  end if;

  if next_status = 'handed_over' and current_status not in ('arrived_to_restaurant', 'handed_over', 'on_the_way', 'arrived_to_client') then
    raise exception 'Driver cannot mark pickup from current status';
  end if;

  if next_status = 'on_the_way' and current_status not in ('handed_over', 'on_the_way', 'arrived_to_client') then
    raise exception 'Driver cannot start client route from current status';
  end if;

  if next_status = 'arrived_to_client' and current_status not in ('handed_over', 'on_the_way', 'arrived_to_client') then
    raise exception 'Driver cannot mark client arrival from current status';
  end if;

  update public.deliveries
  set status = next_status,
      driver_arrived_restaurant_at = case
        when next_status = 'arrived_to_restaurant' then coalesce(driver_arrived_restaurant_at, now())
        else driver_arrived_restaurant_at
      end,
      picked_up_at = case
        when next_status in ('handed_over', 'on_the_way', 'arrived_to_client') then coalesce(picked_up_at, now())
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
