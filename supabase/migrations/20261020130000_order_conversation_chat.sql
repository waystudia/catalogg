-- One shared conversation per order. Every RPC verifies the caller before reading or writing.
create table if not exists public.order_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sender_role text not null check (sender_role in ('client', 'restaurant', 'driver')),
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists order_conversation_messages_order_created_idx on public.order_conversation_messages(order_id, created_at);
alter table public.order_conversation_messages enable row level security;
revoke all on table public.order_conversation_messages from public, anon, authenticated;

create or replace function public.order_conversation_for_client(client_session_token text, target_order_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare account_phone text;
begin
  select account.phone_normalized into account_phone from public.client_account_sessions session join public.client_accounts account on account.id = session.account_id where session.token_hash = extensions.digest(coalesce(client_session_token, ''), 'sha256') and session.expires_at > now() limit 1;
  return account_phone is not null and exists (select 1 from public.orders o where o.id = target_order_id and public.normalize_client_phone(coalesce(nullif(o.client_phone, ''), o.customer_phone)) = account_phone);
end; $$;

create or replace function public.get_client_order_conversation(client_session_token text, target_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.order_conversation_for_client(client_session_token, target_order_id) then raise exception 'order_chat_access_denied'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'sender_role', m.sender_role, 'body', m.body, 'created_at', m.created_at) order by m.created_at) from public.order_conversation_messages m where m.order_id = target_order_id), '[]'::jsonb);
end; $$;
create or replace function public.send_client_order_conversation(client_session_token text, target_order_id uuid, message_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare row public.order_conversation_messages%rowtype;
begin
  if not public.order_conversation_for_client(client_session_token, target_order_id) then raise exception 'order_chat_access_denied'; end if;
  insert into public.order_conversation_messages(order_id, sender_role, body) values(target_order_id, 'client', trim(coalesce(message_body, ''))) returning * into row;
  return jsonb_build_object('id', row.id, 'sender_role', row.sender_role, 'body', row.body, 'created_at', row.created_at);
end; $$;

create or replace function public.order_conversation_for_restaurant(target_order_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_restaurant_client_id() is not null and exists (select 1 from public.orders o join public.clients c on c.catalog_id = o.catalog_id where o.id = target_order_id and c.id = public.current_restaurant_client_id())
$$;
create or replace function public.get_restaurant_order_conversation(target_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.order_conversation_for_restaurant(target_order_id) then raise exception 'order_chat_access_denied'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'sender_role', m.sender_role, 'body', m.body, 'created_at', m.created_at) order by m.created_at) from public.order_conversation_messages m where m.order_id = target_order_id), '[]'::jsonb);
end; $$;
create or replace function public.send_restaurant_order_conversation(target_order_id uuid, message_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare row public.order_conversation_messages%rowtype;
begin
  if not public.order_conversation_for_restaurant(target_order_id) then raise exception 'order_chat_access_denied'; end if;
  insert into public.order_conversation_messages(order_id, sender_role, body) values(target_order_id, 'restaurant', trim(coalesce(message_body, ''))) returning * into row;
  return jsonb_build_object('id', row.id, 'sender_role', row.sender_role, 'body', row.body, 'created_at', row.created_at);
end; $$;

create or replace function public.order_conversation_for_driver(target_order_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_driver_id() is not null and exists (select 1 from public.deliveries d where d.order_id = target_order_id and d.driver_id = public.current_driver_id())
$$;
create or replace function public.get_driver_order_conversation(target_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.order_conversation_for_driver(target_order_id) then raise exception 'order_chat_access_denied'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'sender_role', m.sender_role, 'body', m.body, 'created_at', m.created_at) order by m.created_at) from public.order_conversation_messages m where m.order_id = target_order_id), '[]'::jsonb);
end; $$;
create or replace function public.send_driver_order_conversation(target_order_id uuid, message_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare row public.order_conversation_messages%rowtype;
begin
  if not public.order_conversation_for_driver(target_order_id) then raise exception 'order_chat_access_denied'; end if;
  insert into public.order_conversation_messages(order_id, sender_role, body) values(target_order_id, 'driver', trim(coalesce(message_body, ''))) returning * into row;
  return jsonb_build_object('id', row.id, 'sender_role', row.sender_role, 'body', row.body, 'created_at', row.created_at);
end; $$;
revoke all on function public.order_conversation_for_client(text, uuid), public.order_conversation_for_restaurant(uuid), public.order_conversation_for_driver(uuid) from public, anon, authenticated;
revoke all on function public.get_client_order_conversation(text, uuid), public.send_client_order_conversation(text, uuid, text), public.get_restaurant_order_conversation(uuid), public.send_restaurant_order_conversation(uuid, text), public.get_driver_order_conversation(uuid), public.send_driver_order_conversation(uuid, text) from public;
grant execute on function public.get_client_order_conversation(text, uuid), public.send_client_order_conversation(text, uuid, text) to anon, authenticated;
grant execute on function public.get_restaurant_order_conversation(uuid), public.send_restaurant_order_conversation(uuid, text), public.get_driver_order_conversation(uuid), public.send_driver_order_conversation(uuid, text) to authenticated;
