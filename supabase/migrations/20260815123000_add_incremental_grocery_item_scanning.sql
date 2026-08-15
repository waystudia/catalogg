create or replace function public.scan_catalog_order_item(
  target_order_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_record public.order_items%rowtype;
  requested_quantity integer;
  current_quantity integer;
  next_quantity integer;
  next_state text;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;

  select item.*
  into item_record
  from public.order_items item
  where item.id = target_order_item_id
  for update;

  if item_record.id is null then raise exception 'catalog_order_item_not_found'; end if;
  if not public.can_work_catalog_order(item_record.order_id, item_record.catalog_id) then
    raise exception 'accepted_catalog_order_assignment_required';
  end if;
  if item_record.sale_unit_snapshot <> 'piece' then
    raise exception 'catalog_order_item_scan_requires_piece_unit';
  end if;
  if item_record.fulfillment_state <> 'pending' then
    raise exception 'catalog_order_item_already_resolved';
  end if;

  requested_quantity := greatest(coalesce(item_record.requested_quantity, item_record.quantity), 1);
  current_quantity := greatest(coalesce(item_record.fulfilled_quantity, 0), 0);
  if current_quantity >= requested_quantity then
    raise exception 'catalog_order_item_already_resolved';
  end if;

  next_quantity := least(requested_quantity, current_quantity + 1);
  next_state := case
    when next_quantity = requested_quantity then 'picked'
    else 'pending'
  end;

  update public.order_items item
  set fulfilled_quantity = next_quantity,
      fulfillment_state = next_state
  where item.id = item_record.id;

  if next_state = 'picked' then
    perform public.recalculate_catalog_order_totals(item_record.order_id, item_record.catalog_id);
    insert into public.order_messages (
      catalog_id, order_id, sender_auth_user_id, sender_kind, message_type, body
    ) values (
      item_record.catalog_id,
      item_record.order_id,
      (select auth.uid()),
      'system',
      'picking_event',
      concat('Собрано: ', item_record.title)
    );
  end if;

  return jsonb_build_object(
    'fulfilled_quantity', next_quantity,
    'requested_quantity', requested_quantity,
    'state', next_state
  );
end;
$$;

revoke all on function public.scan_catalog_order_item(uuid) from public, anon;
grant execute on function public.scan_catalog_order_item(uuid) to authenticated, service_role;
