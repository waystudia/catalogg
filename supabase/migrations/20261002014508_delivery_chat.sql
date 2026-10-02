create table public.delivery_chat_messages (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  sender_role text not null check (sender_role in ('driver', 'client')),
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index delivery_chat_messages_delivery_created_idx
  on public.delivery_chat_messages (delivery_id, created_at);

alter table public.delivery_chat_messages enable row level security;
revoke all on table public.delivery_chat_messages from public, anon, authenticated;

create or replace function public.get_driver_delivery_chat(target_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
begin
  if viewer_driver_id is null or not exists (
    select 1 from public.deliveries d where d.id = target_delivery_id and d.driver_id = viewer_driver_id
  ) then
    raise exception 'delivery_chat_access_denied';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'sender_role', m.sender_role, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
    from public.delivery_chat_messages m where m.delivery_id = target_delivery_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.send_driver_delivery_chat(target_delivery_id uuid, message_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  message_row public.delivery_chat_messages%rowtype;
begin
  if viewer_driver_id is null or not exists (
    select 1 from public.deliveries d where d.id = target_delivery_id and d.driver_id = viewer_driver_id
  ) then
    raise exception 'delivery_chat_access_denied';
  end if;

  insert into public.delivery_chat_messages (delivery_id, sender_role, body)
  values (target_delivery_id, 'driver', trim(coalesce(message_body, '')))
  returning * into message_row;

  return jsonb_build_object('id', message_row.id, 'sender_role', message_row.sender_role, 'body', message_row.body, 'created_at', message_row.created_at);
end;
$$;

revoke all on function public.get_driver_delivery_chat(uuid) from public, anon;
revoke all on function public.send_driver_delivery_chat(uuid, text) from public, anon;
grant execute on function public.get_driver_delivery_chat(uuid) to authenticated;
grant execute on function public.send_driver_delivery_chat(uuid, text) to authenticated;

create or replace function public.get_client_delivery_chat(client_session_token text, target_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  account_phone text;
  target_delivery_id uuid;
begin
  select account.phone_normalized into account_phone
  from public.client_account_sessions session
  join public.client_accounts account on account.id = session.account_id
  where session.token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256')
    and session.expires_at > now()
  limit 1;

  select d.id into target_delivery_id
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  where d.order_id = target_order_id
    and public.normalize_client_phone(coalesce(nullif(o.client_phone, ''), o.customer_phone)) = account_phone;

  if account_phone is null or target_delivery_id is null then raise exception 'delivery_chat_access_denied'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'sender_role', m.sender_role, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
    from public.delivery_chat_messages m where m.delivery_id = target_delivery_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.send_client_delivery_chat(client_session_token text, target_order_id uuid, message_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_phone text;
  target_delivery_id uuid;
  message_row public.delivery_chat_messages%rowtype;
begin
  select account.phone_normalized into account_phone
  from public.client_account_sessions session
  join public.client_accounts account on account.id = session.account_id
  where session.token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256')
    and session.expires_at > now()
  limit 1;

  select d.id into target_delivery_id
  from public.deliveries d join public.orders o on o.id = d.order_id
  where d.order_id = target_order_id
    and public.normalize_client_phone(coalesce(nullif(o.client_phone, ''), o.customer_phone)) = account_phone;

  if account_phone is null or target_delivery_id is null then raise exception 'delivery_chat_access_denied'; end if;

  insert into public.delivery_chat_messages (delivery_id, sender_role, body)
  values (target_delivery_id, 'client', trim(coalesce(message_body, '')))
  returning * into message_row;
  return jsonb_build_object('id', message_row.id, 'sender_role', message_row.sender_role, 'body', message_row.body, 'created_at', message_row.created_at);
end;
$$;

revoke all on function public.get_client_delivery_chat(text, uuid) from public, anon, authenticated;
revoke all on function public.send_client_delivery_chat(text, uuid, text) from public, anon, authenticated;
grant execute on function public.get_client_delivery_chat(text, uuid) to anon, authenticated;
grant execute on function public.send_client_delivery_chat(text, uuid, text) to anon, authenticated;
