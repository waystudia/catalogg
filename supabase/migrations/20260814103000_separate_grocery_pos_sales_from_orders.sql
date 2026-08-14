-- Store-counter sales are completed immediately and never enter the remote
-- delivery/takeaway conversation or grocery-picking workflow.

create or replace function public.is_grocery_store_pos_order(
  target_order_id uuid,
  target_catalog_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders order_record
    join public.catalogs catalog on catalog.id = order_record.catalog_id
    where order_record.id = target_order_id
      and order_record.catalog_id = target_catalog_id
      and catalog.business_type = 'grocery'
      and order_record.fulfillment_type::text <> 'delivery'
      and coalesce(order_record.comment, '') ~* '(^|\n)[[:space:]]*Касса магазина([[:space:]]|·|$)'
  );
$$;

create or replace function public.can_access_order_conversation(
  target_order_id uuid,
  target_catalog_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not public.is_grocery_store_pos_order(target_order_id, target_catalog_id)
    and (
      public.is_current_order_client(target_order_id, target_catalog_id)
      or public.can_work_catalog_order(target_order_id, target_catalog_id)
      or exists (
        select 1
        from public.order_work_assignments assignment
        where assignment.order_id = target_order_id
          and assignment.catalog_id = target_catalog_id
          and assignment.assignee_user_id = (select auth.uid())
          and assignment.state = 'offered'
      )
    );
$$;

create or replace function public.send_order_message(
  target_order_id uuid,
  target_catalog_id uuid,
  target_body text,
  client_session_token text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_body text := trim(coalesce(target_body, ''));
  resolved_sender_kind text;
  created_message_id uuid;
begin
  if public.is_grocery_store_pos_order(target_order_id, target_catalog_id) then
    raise exception 'store_pos_order_conversation_not_available';
  end if;
  if char_length(normalized_body) < 1 or char_length(normalized_body) > 2000 then
    raise exception 'order_message_body_invalid';
  end if;
  if public.is_current_order_client(target_order_id, target_catalog_id)
    or public.is_client_session_order_client(target_order_id, target_catalog_id, client_session_token) then
    resolved_sender_kind := 'client';
  elsif public.can_access_order_conversation(target_order_id, target_catalog_id) then
    resolved_sender_kind := 'staff';
  else
    raise exception 'order_conversation_access_required';
  end if;

  insert into public.order_messages (
    catalog_id, order_id, sender_auth_user_id, sender_kind, message_type, body
  ) values (
    target_catalog_id,
    target_order_id,
    (select auth.uid()),
    resolved_sender_kind,
    'text',
    normalized_body
  ) returning id into created_message_id;

  return created_message_id;
end;
$$;

create or replace function public.get_order_conversation(
  target_order_id uuid,
  target_catalog_id uuid,
  client_session_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_kind text;
begin
  if public.is_grocery_store_pos_order(target_order_id, target_catalog_id) then
    raise exception 'store_pos_order_conversation_not_available';
  end if;
  if not (
    public.can_access_order_conversation(target_order_id, target_catalog_id)
    or public.is_client_session_order_client(target_order_id, target_catalog_id, client_session_token)
  ) then
    raise exception 'order_conversation_access_required';
  end if;
  viewer_kind := case
    when public.is_current_order_client(target_order_id, target_catalog_id)
      or public.is_client_session_order_client(target_order_id, target_catalog_id, client_session_token) then 'client'
    else 'staff'
  end;

  return jsonb_build_object(
    'viewerKind', viewer_kind,
    'substitutions', coalesce((
      select jsonb_agg(to_jsonb(request) order by request.proposed_at, request.id)
      from public.order_substitution_requests request
      where request.order_id = target_order_id
        and request.catalog_id = target_catalog_id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(message) order by message.created_at, message.id)
      from public.order_messages message
      where message.order_id = target_order_id
        and message.catalog_id = target_catalog_id
    ), '[]'::jsonb),
    'adjustments', coalesce((
      select jsonb_agg(to_jsonb(adjustment) order by adjustment.created_at, adjustment.id)
      from public.order_payment_adjustments adjustment
      where adjustment.order_id = target_order_id
        and adjustment.catalog_id = target_catalog_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.complete_grocery_pos_order(
  target_order_id uuid,
  target_catalog_id uuid
)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_status public.order_status;
  changed_at timestamptz := now();
begin
  if (select auth.uid()) is null then raise exception 'authentication_required'; end if;
  if not (
    public.is_platform_admin()
    or public.is_catalog_member(target_catalog_id, array['owner','admin','editor']::public.catalog_role[])
    or exists (
      select 1 from public.clients client
      where client.catalog_id = target_catalog_id
        and client.owner_user_id = (select auth.uid())
    )
  ) then
    raise exception 'store_pos_access_required';
  end if;
  if not public.is_grocery_store_pos_order(target_order_id, target_catalog_id) then
    raise exception 'grocery_store_pos_order_required';
  end if;

  select order_record.status into previous_status
  from public.orders order_record
  where order_record.id = target_order_id
    and order_record.catalog_id = target_catalog_id
  for update;

  update public.orders
  set status = 'completed',
      payment_status = 'confirmed',
      restaurant_payment_confirmed_at = coalesce(restaurant_payment_confirmed_at, changed_at),
      completed_at = coalesce(completed_at, changed_at)
  where id = target_order_id
    and catalog_id = target_catalog_id;

  if previous_status is distinct from 'completed'::public.order_status then
    insert into public.order_status_history (catalog_id, order_id, from_status, to_status, reason)
    values (target_catalog_id, target_order_id, previous_status, 'completed', 'store_pos_sale');
  end if;
  return 'completed'::public.order_status;
end;
$$;

revoke all on function public.is_grocery_store_pos_order(uuid, uuid) from public, anon;
revoke all on function public.complete_grocery_pos_order(uuid, uuid) from public, anon;
grant execute on function public.is_grocery_store_pos_order(uuid, uuid) to authenticated, service_role;
grant execute on function public.complete_grocery_pos_order(uuid, uuid) to authenticated, service_role;

drop trigger if exists route_new_grocery_order on public.orders;
create trigger route_new_grocery_order
after insert on public.orders
for each row
when (not (new.fulfillment_type::text <> 'delivery' and coalesce(new.comment, '') ~* '(^|\n)[[:space:]]*Касса магазина([[:space:]]|·|$)'))
execute function public.route_new_grocery_order();

drop trigger if exists order_status_chat_message on public.orders;
create trigger order_status_chat_message
after insert or update of status on public.orders
for each row
when (not (new.fulfillment_type::text <> 'delivery' and coalesce(new.comment, '') ~* '(^|\n)[[:space:]]*Касса магазина([[:space:]]|·|$)'))
execute function public.record_order_status_chat_message();

delete from public.order_messages message
using public.orders order_record, public.catalogs catalog
where message.order_id = order_record.id
  and message.catalog_id = order_record.catalog_id
  and catalog.id = order_record.catalog_id
  and catalog.business_type = 'grocery'
  and order_record.fulfillment_type::text <> 'delivery'
  and coalesce(order_record.comment, '') ~* '(^|\n)[[:space:]]*Касса магазина([[:space:]]|·|$)';

delete from public.order_work_assignments assignment
using public.orders order_record, public.catalogs catalog
where assignment.order_id = order_record.id
  and assignment.catalog_id = order_record.catalog_id
  and catalog.id = order_record.catalog_id
  and catalog.business_type = 'grocery'
  and order_record.fulfillment_type::text <> 'delivery'
  and coalesce(order_record.comment, '') ~* '(^|\n)[[:space:]]*Касса магазина([[:space:]]|·|$)';

update public.orders order_record
set status = 'completed',
    payment_status = 'confirmed',
    restaurant_payment_confirmed_at = coalesce(order_record.restaurant_payment_confirmed_at, now()),
    completed_at = coalesce(order_record.completed_at, now())
from public.catalogs catalog
where catalog.id = order_record.catalog_id
  and catalog.business_type = 'grocery'
  and order_record.fulfillment_type::text <> 'delivery'
  and coalesce(order_record.comment, '') ~* '(^|\n)[[:space:]]*Касса магазина([[:space:]]|·|$)'
  and order_record.status::text not in ('completed', 'delivered', 'cancelled', 'canceled');
