-- Make driver actions idempotent and independent from direct table RLS.
-- No data is rewritten here; only RPC behavior changes.

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
  existing_driver_id uuid;
  current_status text;
  can_serve boolean := false;
  next_qr text := encode(gen_random_bytes(32), 'hex');
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  if target_driver_id is distinct from viewer_driver_id then
    raise exception 'Driver cannot accept a delivery for another account';
  end if;

  select d.order_id, d.driver_id, d.status
    into target_order_id, existing_driver_id, current_status
  from public.deliveries d
  where d.id = target_delivery_id
  for update;

  if target_order_id is null then
    raise exception 'Delivery is not available';
  end if;

  if existing_driver_id is not null and existing_driver_id is distinct from viewer_driver_id then
    raise exception 'Delivery is not available';
  end if;

  if current_status not in ('waiting_courier', 'waiting_driver', 'assigned') then
    raise exception 'Delivery is not available';
  end if;

  if existing_driver_id is null then
    select public.driver_serves_delivery_location(viewer_driver_id, o.delivery_city, o.delivery_settlement)
      into can_serve
    from public.orders o
    where o.id = target_order_id;

    if not coalesce(can_serve, false) then
      raise exception 'Delivery is not available';
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

create or replace function public.accept_available_delivery(target_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  return public.accept_available_delivery(target_delivery_id, viewer_driver_id);
end;
$$;

revoke all on function public.accept_available_delivery(uuid) from public, anon;
grant execute on function public.accept_available_delivery(uuid) to authenticated;

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

  if next_status = 'handed_over' and current_status not in ('arrived_to_restaurant', 'handed_over') then
    raise exception 'Driver cannot mark pickup from current status';
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
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  select order_id, status
    into target_order_id, current_status
  from public.deliveries
  where id = target_delivery_id
    and driver_id = viewer_driver_id
  for update;

  if target_order_id is null then
    return false;
  end if;

  if current_status = 'handed_over' then
    return true;
  end if;

  if current_status <> 'arrived_to_restaurant' then
    return false;
  end if;

  perform public.update_current_driver_delivery_status(target_delivery_id, 'handed_over');
  return true;
end;
$$;

revoke all on function public.confirm_driver_pickup(uuid) from public, anon;
grant execute on function public.confirm_driver_pickup(uuid) to authenticated;

create or replace function public.complete_driver_delivery(
  target_delivery_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  viewer_driver_id uuid := public.current_driver_id();
  payout numeric(12,2);
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  select d.order_id, coalesce(o.delivery_fee, 0)
    into target_order_id, payout
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  where d.id = target_delivery_id
    and d.driver_id = viewer_driver_id
    and d.status in ('handed_over', 'on_the_way', 'arrived_to_client')
  for update;

  if target_order_id is null then
    raise exception 'Delivery cannot be completed';
  end if;

  update public.deliveries
  set status = 'delivered',
      delivered_at = now(),
      updated_at = now()
  where id = target_delivery_id;

  update public.orders
  set status = 'completed',
      completed_at = now()
  where id = target_order_id;

  update public.drivers
  set status = 'online',
      is_online = true,
      updated_at = now()
  where id = viewer_driver_id;

  insert into public.delivery_status_history (delivery_id, status, comment)
  values (target_delivery_id, 'delivered', 'driver completed delivery');

  insert into public.earnings (driver_id, delivery_id, amount, commission)
  values (viewer_driver_id, target_delivery_id, payout, 0)
  on conflict (delivery_id) do nothing;

  return target_delivery_id;
end;
$$;

revoke all on function public.complete_driver_delivery(uuid) from public, anon;
grant execute on function public.complete_driver_delivery(uuid) to authenticated;
