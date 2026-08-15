-- Accept a merchant order and persist the readiness estimate atomically.

create or replace function public.accept_merchant_order_with_ready_estimate(
  target_order_id uuid,
  target_catalog_id uuid,
  ready_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.order_status;
  target_order_group_id uuid;
  changed_at timestamptz := pg_catalog.now();
  ready_at_value timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if ready_minutes not in (10, 15, 20, 30) then
    raise exception 'Unsupported ready estimate';
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
    raise exception 'Merchant access is required';
  end if;

  select merchant_order.status, merchant_order.order_group_id
    into current_status, target_order_group_id
  from public.orders merchant_order
  where merchant_order.id = target_order_id
    and merchant_order.catalog_id = target_catalog_id
  for update;

  if current_status is null then
    raise exception 'Order was not found';
  end if;

  if current_status not in ('new', 'waiting_payment_confirmation', 'payment_confirmed') then
    raise exception 'Order can no longer be accepted';
  end if;

  ready_at_value := changed_at + make_interval(mins => ready_minutes);

  update public.orders
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, changed_at),
      estimated_ready_at = ready_at_value
  where id = target_order_id
    and catalog_id = target_catalog_id;

  insert into public.order_status_history (
    catalog_id,
    order_id,
    from_status,
    to_status,
    reason
  ) values (
    target_catalog_id,
    target_order_id,
    current_status,
    'accepted',
    'merchant_ready_estimate:' || ready_minutes::text
  );

  if target_order_group_id is not null then
    insert into public.order_group_events (
      order_group_id,
      merchant_order_id,
      event_type,
      actor_type,
      actor_id,
      metadata
    ) values (
      target_order_group_id,
      target_order_id,
      'MERCHANT_ACCEPTED',
      'merchant',
      auth.uid(),
      jsonb_build_object(
        'ready_minutes', ready_minutes,
        'estimated_ready_at', ready_at_value
      )
    );
  end if;

  return jsonb_build_object(
    'status', 'accepted',
    'estimated_ready_at', ready_at_value
  );
end;
$$;

revoke all on function public.accept_merchant_order_with_ready_estimate(uuid, uuid, integer) from public, anon;
grant execute on function public.accept_merchant_order_with_ready_estimate(uuid, uuid, integer) to authenticated;
