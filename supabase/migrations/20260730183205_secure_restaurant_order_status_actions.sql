create or replace function public.update_restaurant_order_status(
  target_order_id uuid,
  target_catalog_id uuid,
  next_status text,
  status_reason text default ''
)
returns public.order_status
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status public.order_status;
  persisted_status public.order_status;
  changed_at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if next_status not in (
    'new', 'waiting_payment_confirmation', 'payment_confirmed',
    'accepted', 'confirmed', 'preparing', 'cooking', 'ready',
    'waiting_driver', 'driver_assigned', 'assigned_driver',
    'picked_up', 'on_the_way', 'delivered', 'completed',
    'cancelled', 'canceled'
  ) then
    raise exception 'Unsupported restaurant order status';
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

  select o.status
    into current_status
  from public.orders o
  where o.id = target_order_id
    and o.catalog_id = target_catalog_id
  for update;

  if current_status is null then
    raise exception 'Order was not found';
  end if;

  persisted_status := case
    when next_status = 'cancelled' then 'canceled'::public.order_status
    else next_status::public.order_status
  end;

  update public.orders
  set status = persisted_status,
      accepted_at = case
        when persisted_status in ('accepted', 'confirmed') then coalesce(accepted_at, changed_at)
        else accepted_at
      end,
      ready_at = case
        when persisted_status in ('ready', 'waiting_driver') then coalesce(ready_at, changed_at)
        else ready_at
      end,
      completed_at = case
        when persisted_status in ('completed', 'delivered') then coalesce(completed_at, changed_at)
        else completed_at
      end,
      cancellation_reason = case
        when persisted_status in ('cancelled', 'canceled') then coalesce(nullif(trim(status_reason), ''), 'restaurant_cancelled')
        else cancellation_reason
      end
  where id = target_order_id
    and catalog_id = target_catalog_id;

  insert into public.order_status_history (
    catalog_id, order_id, from_status, to_status, reason
  )
  values (
    target_catalog_id, target_order_id, current_status, persisted_status, status_reason
  );

  return persisted_status;
end;
$$;

revoke all on function public.update_restaurant_order_status(uuid, uuid, text, text) from public, anon;
grant execute on function public.update_restaurant_order_status(uuid, uuid, text, text) to authenticated;
