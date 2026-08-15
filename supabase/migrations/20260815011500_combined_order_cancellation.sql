-- Keep combined-order cancellation financial, inventory, and route state in sync.
-- Ordinary orders continue through the existing cancellation implementation.

begin;

do $$
begin
  if to_regprocedure('public.cancel_client_catalog_order_uncombined(uuid,uuid,text,text)') is null then
    alter function public.cancel_client_catalog_order(uuid, uuid, text, text)
      rename to cancel_client_catalog_order_uncombined;
  end if;
end;
$$;

revoke all on function public.cancel_client_catalog_order_uncombined(uuid, uuid, text, text)
  from public;

create or replace function public.cancel_client_catalog_order(
  target_order_id uuid,
  target_catalog_id uuid,
  client_session_token text,
  cancellation_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_addon boolean;
begin
  select order_row.is_addon into target_is_addon
  from public.orders order_row
  where order_row.id = target_order_id
    and order_row.catalog_id = target_catalog_id;

  if coalesce(target_is_addon, false) then
    raise exception 'combined_addon_cancellation_requires_group_flow';
  end if;

  return public.cancel_client_catalog_order_uncombined(
    target_order_id,
    target_catalog_id,
    client_session_token,
    cancellation_reason
  );
end;
$$;

revoke all on function public.cancel_client_catalog_order(uuid, uuid, text, text)
  from public;
grant execute on function public.cancel_client_catalog_order(uuid, uuid, text, text)
  to anon, authenticated;

create or replace function public.restore_combined_addon_stock(target_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  addon_order public.orders%rowtype;
  order_group public.order_groups%rowtype;
  target_delivery_id uuid;
  item_record public.order_items%rowtype;
  product_record public.products%rowtype;
  restored_quantity integer;
begin
  select order_row.* into addon_order
  from public.orders order_row
  where order_row.id = target_order_id
    and order_row.is_addon
    and order_row.order_group_id is not null
  for update;

  if addon_order.id is null then return false; end if;

  select group_row.* into order_group
  from public.order_groups group_row
  where group_row.id = addon_order.order_group_id
  for update;

  select delivery.id into target_delivery_id
  from public.deliveries delivery
  where delivery.order_group_id = order_group.id
     or delivery.order_id = order_group.primary_order_id
  order by (delivery.order_group_id = order_group.id) desc, delivery.created_at desc
  limit 1;

  if exists (
    select 1
    from public.order_group_events event
    where event.order_group_id = order_group.id
      and event.merchant_order_id = addon_order.id
      and event.event_type = 'ADDON_STOCK_RESTORED'
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.delivery_stops delivery_stop
    where delivery_stop.delivery_id = target_delivery_id
      and delivery_stop.merchant_order_id = addon_order.id
      and delivery_stop.status = 'completed'
  ) then
    insert into public.order_group_events (
      order_group_id, merchant_order_id, delivery_id,
      event_type, actor_type, metadata
    ) values (
      order_group.id, addon_order.id, target_delivery_id,
      'ADDON_CANCELLED_AFTER_PICKUP', 'system',
      jsonb_build_object('stock_restored', false, 'support_required', true)
    );
    return false;
  end if;

  for item_record in
    select order_item.*
    from public.order_items order_item
    where order_item.order_id = addon_order.id
      and order_item.catalog_id = addon_order.catalog_id
      and order_item.product_id is not null
    for update
  loop
    select product.* into product_record
    from public.products product
    where product.id = item_record.product_id
      and product.catalog_id = addon_order.catalog_id
    for update;

    if product_record.id is null or product_record.is_unlimited then continue; end if;
    restored_quantity := greatest(
      coalesce(item_record.requested_quantity, item_record.quantity),
      1
    );

    update public.products product
    set stock_quantity = product.stock_quantity + restored_quantity,
        stock_count = case
          when product.sale_unit = 'weight'
            then ceil((product.stock_quantity + restored_quantity)::numeric / 1000)::integer
          else product.stock_count + restored_quantity
        end,
        status = case
          when product.status = 'sold_out'::public.product_status
            then 'active'::public.product_status
          else product.status
        end,
        updated_at = now()
    where product.id = product_record.id;
  end loop;

  insert into public.order_group_events (
    order_group_id, merchant_order_id, delivery_id,
    event_type, actor_type, metadata
  ) values (
    order_group.id, addon_order.id, target_delivery_id,
    'ADDON_STOCK_RESTORED', 'system',
    jsonb_build_object('stock_restored', true)
  );

  return true;
end;
$$;

revoke all on function public.restore_combined_addon_stock(uuid)
  from public, anon, authenticated;
grant execute on function public.restore_combined_addon_stock(uuid)
  to service_role;

create or replace function public.reconcile_combined_order_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group public.order_groups%rowtype;
  target_delivery public.deliveries%rowtype;
  active_merchant_subtotal numeric(12,2);
begin
  if new.order_group_id is null
    or new.status::text not in ('cancelled', 'canceled')
    or old.status::text in ('cancelled', 'canceled') then
    return new;
  end if;

  select group_row.* into target_group
  from public.order_groups group_row
  where group_row.id = new.order_group_id
  for update;

  if target_group.id is null then return new; end if;

  select delivery.* into target_delivery
  from public.deliveries delivery
  where delivery.order_group_id = target_group.id
     or delivery.order_id = target_group.primary_order_id
  order by (delivery.order_group_id = target_group.id) desc, delivery.created_at desc
  limit 1
  for update;

  if new.is_addon then
    perform public.restore_combined_addon_stock(new.id);

    update public.delivery_stops
    set status = 'cancelled',
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where delivery_id = target_delivery.id
      and merchant_order_id = new.id
      and status in ('pending', 'arrived');

    set constraints public.delivery_stops_delivery_sequence_key deferred;
    update public.delivery_stops delivery_stop
    set sequence = 100000 + delivery_stop.sequence
    where delivery_stop.delivery_id = target_delivery.id
      and delivery_stop.status in ('cancelled', 'skipped');

    with active_stops as (
      select
        delivery_stop.id,
        row_number() over (order by delivery_stop.sequence)::integer as next_sequence
      from public.delivery_stops delivery_stop
      where delivery_stop.delivery_id = target_delivery.id
        and delivery_stop.status not in ('cancelled', 'skipped')
    )
    update public.delivery_stops delivery_stop
    set sequence = active_stops.next_sequence,
        route_version = target_delivery.route_version + 1,
        updated_at = now()
    from active_stops
    where delivery_stop.id = active_stops.id;

    select coalesce(sum(coalesce(merchant_order.subtotal_amount, merchant_order.subtotal)), 0)
    into active_merchant_subtotal
    from public.orders merchant_order
    where merchant_order.order_group_id = target_group.id
      and merchant_order.status::text not in ('cancelled', 'canceled');

    update public.order_groups
    set merchant_subtotal_amount = active_merchant_subtotal,
        addon_delivery_fee_amount = 0,
        grand_total_amount = active_merchant_subtotal + base_delivery_fee_amount,
        metadata = metadata || jsonb_build_object(
          'addon_refund_required', new.payment_status::text = 'confirmed',
          'addon_cancelled_order_id', new.id
        ),
        updated_at = now()
    where id = target_group.id;

    update public.deliveries
    set offered_fee = greatest(coalesce(offered_fee, 0) - addon_delivery_fee_amount, 0),
        addon_delivery_fee_amount = 0,
        route_version = route_version + 1,
        updated_at = now()
    where id = target_delivery.id;

    insert into public.order_group_events (
      order_group_id, merchant_order_id, delivery_id,
      event_type, actor_type, actor_id, metadata
    ) values (
      target_group.id, new.id, target_delivery.id,
      'ADDON_REJECTED', 'merchant', auth.uid(),
      jsonb_build_object('addon_delivery_fee_removed', target_group.addon_delivery_fee_amount)
    );

    insert into public.notifications (
      recipient_client_account_id, notification_type, title, body,
      action_url, dedupe_key, metadata
    ) values (
      target_group.client_account_id,
      'POST_ORDER_ADDON_CANCELLED',
      'Дополнительный заказ отменён',
      'Основной заказ продолжает выполняться. Доплата к доставке удалена.',
      '/open-order/' || target_group.id::text,
      'combined-order-addon-cancelled:' || new.id::text,
      jsonb_build_object('order_group_id', target_group.id, 'merchant_order_id', new.id)
    ) on conflict do nothing;

    return new;
  end if;

  if new.id = target_group.primary_order_id then
    if target_delivery.picked_up_at is not null then
      raise exception 'combined_primary_cancellation_after_pickup_requires_support';
    end if;

    update public.orders addon_order
    set status = 'canceled'::public.order_status,
        cancellation_reason = coalesce(nullif(addon_order.cancellation_reason, ''), 'primary_order_cancelled'),
        updated_at = now()
    where addon_order.order_group_id = target_group.id
      and addon_order.is_addon
      and addon_order.status::text not in ('cancelled', 'canceled', 'completed', 'delivered');

    update public.delivery_stops
    set status = 'cancelled',
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where delivery_id = target_delivery.id
      and status in ('pending', 'arrived');

    update public.deliveries
    set status = 'canceled',
        offered_fee = 0,
        addon_delivery_fee_amount = 0,
        route_version = route_version + 1,
        updated_at = now()
    where id = target_delivery.id;

    update public.order_groups
    set status = 'cancelled',
        merchant_subtotal_amount = 0,
        base_delivery_fee_amount = 0,
        addon_delivery_fee_amount = 0,
        grand_total_amount = 0,
        cancelled_at = coalesce(cancelled_at, now()),
        metadata = metadata || jsonb_build_object(
          'refund_required', new.payment_status::text = 'confirmed',
          'cancelled_by_primary_order', new.id
        ),
        updated_at = now()
    where id = target_group.id;

    update public.addon_offers
    set status = 'cancelled',
        closed_reason = 'primary_order_cancelled',
        updated_at = now()
    where order_group_id = target_group.id
      and status <> 'cancelled';

    insert into public.order_group_events (
      order_group_id, merchant_order_id, delivery_id,
      event_type, actor_type, actor_id, metadata
    ) values (
      target_group.id, new.id, target_delivery.id,
      'PRIMARY_ORDER_CANCELLED', 'merchant', auth.uid(),
      jsonb_build_object('combined_delivery_cancelled', true)
    );

    insert into public.notifications (
      recipient_client_account_id, notification_type, title, body,
      action_url, dedupe_key, metadata
    ) values (
      target_group.client_account_id,
      'COMBINED_ORDER_CANCELLED',
      'Объединённая доставка отменена',
      'Основное заведение отменило заказ. Магазинный заказ не станет отдельной доставкой.',
      '/open-order/' || target_group.id::text,
      'combined-order-cancelled:' || target_group.id::text,
      jsonb_build_object('order_group_id', target_group.id)
    ) on conflict do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.reconcile_combined_order_cancellation()
  from public, anon, authenticated;

drop trigger if exists orders_reconcile_combined_cancellation on public.orders;
create trigger orders_reconcile_combined_cancellation
after update of status on public.orders
for each row
when (
  new.order_group_id is not null
  and new.status::text in ('cancelled', 'canceled')
  and old.status::text not in ('cancelled', 'canceled')
)
execute function public.reconcile_combined_order_cancellation();

commit;
