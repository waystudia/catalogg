-- A restaurant may first offer a ready order to its own courier. If that
-- courier is offline or at capacity, the restaurant can safely reopen the
-- same unassigned delivery to eligible platform drivers.
create or replace function public.redispatch_restaurant_order_to_platform(
  target_order_id uuid,
  target_catalog_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  target_delivery public.deliveries%rowtype;
begin
  if not (
    public.is_platform_admin()
    or public.is_catalog_member(target_catalog_id, array['owner', 'admin']::public.catalog_role[])
  ) then
    raise exception 'Restaurant delivery dispatch is not authorized';
  end if;

  select merchant_order.* into target_order
  from public.orders merchant_order
  where merchant_order.id = target_order_id
    and merchant_order.catalog_id = target_catalog_id
  for update;

  if target_order.id is null then raise exception 'Order not found'; end if;
  if target_order.fulfillment_type <> 'delivery' then
    raise exception 'Order does not require delivery';
  end if;
  if target_order.status::text <> 'waiting_driver' then
    raise exception 'Order is not waiting for a driver';
  end if;

  select delivery.* into target_delivery
  from public.deliveries delivery
  where delivery.order_id = target_order.id
  order by delivery.created_at desc
  limit 1
  for update;

  if target_delivery.id is null then
    raise exception 'Delivery task not found';
  end if;
  if target_delivery.driver_id is not null then
    raise exception 'Delivery has already been accepted by a driver';
  end if;
  if target_delivery.status::text not in ('planning', 'waiting_courier', 'waiting_driver') then
    raise exception 'Delivery can no longer be offered to another driver';
  end if;

  update public.deliveries delivery
  set driver_id = null,
      delivery_provider = 'platform',
      status = 'waiting_courier',
      assigned_at = null,
      pickup_qr_token = null,
      pickup_qr_expires_at = null,
      updated_at = now()
  where delivery.id = target_delivery.id;

  update public.delivery_tasks task
  set delivery_status = 'waiting_driver',
      updated_at = now()
  where task.order_id = target_order.id;

  insert into public.order_status_history (catalog_id, order_id, from_status, to_status, reason)
  values (
    target_order.catalog_id,
    target_order.id,
    target_order.status,
    'waiting_driver',
    'restaurant_redispatched_platform'
  );

  return target_delivery.id;
end;
$$;

revoke all on function public.redispatch_restaurant_order_to_platform(uuid, uuid) from public, anon;
grant execute on function public.redispatch_restaurant_order_to_platform(uuid, uuid) to authenticated;
