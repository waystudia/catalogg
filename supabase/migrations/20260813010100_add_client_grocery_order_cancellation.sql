-- Client cancellation is intentionally limited to the period before picking.
-- Once a picker has changed any line, the order must be resolved with staff so
-- weighed or unpacked goods are not silently returned to sellable stock.
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
  order_record public.orders%rowtype;
  item_record public.order_items%rowtype;
  product_record public.products%rowtype;
  restored_quantity integer;
  normalized_reason text := pg_catalog.left(
    coalesce(nullif(pg_catalog.btrim(cancellation_reason), ''), 'Отменено клиентом'),
    500
  );
begin
  select order_row.*
  into order_record
  from public.orders order_row
  where order_row.id = target_order_id
    and order_row.catalog_id = target_catalog_id
  for update;

  if order_record.id is null then raise exception 'catalog_order_not_found'; end if;

  if not exists (
    select 1
    from public.catalogs catalog
    where catalog.id = target_catalog_id
      and catalog.business_type = 'grocery'
  ) then
    raise exception 'catalog_order_cancellation_grocery_only';
  end if;

  if not (
    public.is_current_order_client(target_order_id, target_catalog_id)
    or public.is_client_session_order_client(
      target_order_id,
      target_catalog_id,
      client_session_token
    )
  ) then
    raise exception 'catalog_order_client_required';
  end if;

  if order_record.status::text in ('canceled', 'cancelled') then
    return pg_catalog.jsonb_build_object('cancelled', true, 'status', 'canceled');
  end if;

  if order_record.status::text not in (
    'new', 'waiting_payment_confirmation', 'payment_confirmed', 'accepted'
  ) then
    raise exception 'catalog_order_cancellation_too_late';
  end if;

  if exists (
    select 1
    from public.order_items order_item
    where order_item.order_id = target_order_id
      and order_item.catalog_id = target_catalog_id
      and order_item.fulfillment_state <> 'pending'
  ) or exists (
    select 1
    from public.order_substitution_requests substitution
    where substitution.order_id = target_order_id
      and substitution.catalog_id = target_catalog_id
  ) then
    raise exception 'catalog_order_cancellation_picking_started';
  end if;

  for item_record in
    select order_item.*
    from public.order_items order_item
    where order_item.order_id = target_order_id
      and order_item.catalog_id = target_catalog_id
      and order_item.product_id is not null
    for update
  loop
    select product.*
    into product_record
    from public.products product
    where product.id = item_record.product_id
      and product.catalog_id = target_catalog_id
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
            then pg_catalog.ceil((product.stock_quantity + restored_quantity)::numeric / 1000)::integer
          else product.stock_count + restored_quantity
        end,
        status = case
          when product.status = 'sold_out'::public.product_status
            then 'active'::public.product_status
          else product.status
        end,
        updated_at = pg_catalog.now()
    where product.id = product_record.id;
  end loop;

  update public.order_work_assignments assignment
  set state = 'superseded',
      responded_at = coalesce(assignment.responded_at, pg_catalog.now()),
      updated_at = pg_catalog.now(),
      version = assignment.version + 1
  where assignment.order_id = target_order_id
    and assignment.catalog_id = target_catalog_id
    and assignment.state in ('offered', 'accepted');

  update public.orders order_row
  set status = 'canceled'::public.order_status,
      cancellation_reason = normalized_reason,
      updated_at = pg_catalog.now()
  where order_row.id = target_order_id
    and order_row.catalog_id = target_catalog_id;

  insert into public.order_messages (
    catalog_id,
    order_id,
    sender_auth_user_id,
    sender_kind,
    message_type,
    body
  ) values (
    target_catalog_id,
    target_order_id,
    (select auth.uid()),
    'system',
    'text',
    pg_catalog.concat('Клиент отменил заказ. Причина: ', normalized_reason)
  );

  return pg_catalog.jsonb_build_object(
    'cancelled', true,
    'status', 'canceled',
    'reason', normalized_reason
  );
end;
$$;

revoke all on function public.cancel_client_catalog_order(uuid, uuid, text, text) from public;
grant execute on function public.cancel_client_catalog_order(uuid, uuid, text, text) to anon, authenticated;
