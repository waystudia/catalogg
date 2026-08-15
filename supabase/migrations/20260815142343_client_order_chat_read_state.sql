-- Track client unread state on the existing order-scoped conversation. The
-- customer relationship is still verified through the mature order/session
-- authorization helpers; no parallel chat ownership model is introduced.

alter table public.order_messages
  add column if not exists client_read_at timestamptz;

-- Existing history predates unread badges and must not appear as newly unread
-- on the first release.
update public.order_messages message
set client_read_at = message.created_at
where message.client_read_at is null
  and message.sender_kind in ('staff', 'driver');

create index if not exists order_messages_client_unread_idx
  on public.order_messages(order_id, catalog_id, created_at)
  where client_read_at is null
    and sender_kind in ('staff', 'driver')
    and message_type = 'text';

create or replace function public.get_client_order_chat_unread_counts(
  target_order_ids uuid[],
  client_session_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requested_count integer := coalesce(pg_catalog.cardinality(target_order_ids), 0);
  result jsonb;
begin
  if requested_count = 0 then return '[]'::jsonb; end if;
  if requested_count > 200 then raise exception 'too_many_order_chat_ids'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id', order_record.id,
    'unread_count', (
      select count(*)
      from public.order_messages message
      where message.order_id = order_record.id
        and message.catalog_id = order_record.catalog_id
        and message.sender_kind in ('staff', 'driver')
        and message.message_type = 'text'
        and message.client_read_at is null
    )
  ) order by order_record.created_at desc), '[]'::jsonb)
  into result
  from public.orders order_record
  where order_record.id = any(target_order_ids)
    and not public.is_grocery_store_pos_order(order_record.id, order_record.catalog_id)
    and (
      public.is_current_order_client(order_record.id, order_record.catalog_id)
      or public.is_client_session_order_client(
        order_record.id,
        order_record.catalog_id,
        client_session_token
      )
    );

  return result;
end;
$$;

create or replace function public.mark_client_order_chat_read(
  target_order_id uuid,
  target_catalog_id uuid,
  client_session_token text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  marked_count integer;
begin
  if public.is_grocery_store_pos_order(target_order_id, target_catalog_id) then
    raise exception 'store_pos_order_conversation_not_available';
  end if;
  if not (
    public.is_current_order_client(target_order_id, target_catalog_id)
    or public.is_client_session_order_client(
      target_order_id,
      target_catalog_id,
      client_session_token
    )
  ) then
    raise exception 'order_conversation_access_required';
  end if;

  update public.order_messages message
  set client_read_at = coalesce(message.client_read_at, now())
  where message.order_id = target_order_id
    and message.catalog_id = target_catalog_id
    and message.sender_kind in ('staff', 'driver')
    and message.client_read_at is null;

  get diagnostics marked_count = row_count;
  return marked_count;
end;
$$;

revoke all on function public.get_client_order_chat_unread_counts(uuid[], text)
  from public, anon, authenticated;
revoke all on function public.mark_client_order_chat_read(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_client_order_chat_unread_counts(uuid[], text)
  to anon, authenticated, service_role;
grant execute on function public.mark_client_order_chat_read(uuid, uuid, text)
  to anon, authenticated, service_role;
