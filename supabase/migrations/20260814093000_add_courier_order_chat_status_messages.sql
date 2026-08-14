-- Add the assigned courier to the existing per-order conversation and record
-- idempotent system messages for order/delivery lifecycle transitions.

alter table public.order_messages
  add column if not exists event_key text;

alter table public.order_messages
  drop constraint if exists order_messages_sender_kind_check;
alter table public.order_messages
  add constraint order_messages_sender_kind_check
  check (sender_kind in ('client', 'staff', 'driver', 'system'));

alter table public.order_messages
  drop constraint if exists order_messages_type_check;
alter table public.order_messages
  add constraint order_messages_type_check
  check (message_type in ('text', 'substitution_offer', 'substitution_decision', 'picking_event', 'status_event'));

create unique index if not exists order_messages_order_event_key_idx
  on public.order_messages(order_id, event_key)
  where event_key is not null;

create or replace function public.is_current_order_driver(
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
    from public.deliveries delivery
    join public.orders order_record on order_record.id = delivery.order_id
    where order_record.id = target_order_id
      and order_record.catalog_id = target_catalog_id
      and delivery.driver_id = public.current_driver_id()
  );
$$;

create or replace function public.send_driver_order_message(
  target_order_id uuid,
  target_catalog_id uuid,
  target_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_body text := trim(coalesce(target_body, ''));
  created_message_id uuid;
begin
  if char_length(normalized_body) < 1 or char_length(normalized_body) > 2000 then
    raise exception 'order_message_body_invalid';
  end if;
  if not public.is_current_order_driver(target_order_id, target_catalog_id) then
    raise exception 'assigned_driver_order_conversation_required';
  end if;

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
    'driver',
    'text',
    normalized_body
  ) returning id into created_message_id;

  return created_message_id;
end;
$$;

create or replace function public.get_driver_order_conversation(
  target_order_id uuid,
  target_catalog_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_current_order_driver(target_order_id, target_catalog_id) then
    raise exception 'assigned_driver_order_conversation_required';
  end if;

  return jsonb_build_object(
    'viewerKind', 'driver',
    'substitutions', '[]'::jsonb,
    'messages', coalesce((
      select jsonb_agg(to_jsonb(message) order by message.created_at, message.id)
      from public.order_messages message
      where message.order_id = target_order_id
        and message.catalog_id = target_catalog_id
        and message.message_type in ('text', 'status_event')
    ), '[]'::jsonb),
    'adjustments', '[]'::jsonb
  );
end;
$$;

drop policy if exists "order messages participant read" on public.order_messages;
create policy "order messages participant read"
on public.order_messages for select to authenticated
using (
  public.can_access_order_conversation(order_id, catalog_id)
  or (
    public.is_current_order_driver(order_id, catalog_id)
    and message_type in ('text', 'status_event')
  )
);

revoke all on function public.is_current_order_driver(uuid, uuid) from public, anon;
revoke all on function public.send_driver_order_message(uuid, uuid, text) from public, anon;
revoke all on function public.get_driver_order_conversation(uuid, uuid) from public, anon;
grant execute on function public.is_current_order_driver(uuid, uuid) to authenticated, service_role;
grant execute on function public.send_driver_order_message(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.get_driver_order_conversation(uuid, uuid) to authenticated, service_role;

create or replace function public.record_order_status_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_body text;
  resolved_event_key text;
  resolved_business_type text := 'restaurant';
  preparation_minutes integer := 25;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select
    coalesce(catalog.business_type::text, 'restaurant'),
    greatest(1, coalesce(settings.default_preparation_minutes, 25))
  into resolved_business_type, preparation_minutes
  from public.catalogs catalog
  left join public.restaurant_delivery_settings settings on settings.catalog_id = catalog.id
  where catalog.id = new.catalog_id;

  case new.status::text
    when 'new' then
      resolved_event_key := 'status:new';
      message_body := 'Заказ оформлен. Ожидаем подтверждения заведения.';
    when 'waiting_payment_confirmation' then
      resolved_event_key := 'status:waiting_payment';
      message_body := 'Заказ оформлен. Ожидаем подтверждения оплаты.';
    when 'payment_confirmed' then
      resolved_event_key := 'status:payment_confirmed';
      message_body := 'Оплата подтверждена.';
    when 'accepted' then
      resolved_event_key := 'status:accepted';
      message_body := 'Заказ принят заведением.';
    when 'confirmed' then
      resolved_event_key := 'status:accepted';
      message_body := 'Заказ принят заведением.';
    when 'preparing' then
      resolved_event_key := 'status:preparing';
      message_body := case
        when resolved_business_type = 'grocery'
          then format('Заказ собирается. Ориентировочно %s минут.', preparation_minutes)
        else format('Заказ готовится. Ориентировочно %s минут.', preparation_minutes)
      end;
    when 'cooking' then
      resolved_event_key := 'status:preparing';
      message_body := format('Заказ готовится. Ориентировочно %s минут.', preparation_minutes);
    when 'ready' then
      resolved_event_key := 'status:ready';
      message_body := case when resolved_business_type = 'grocery' then 'Заказ собран.' else 'Заказ готов.' end;
    when 'waiting_driver' then
      resolved_event_key := 'delivery:waiting';
      message_body := 'Ищем курьера для доставки.';
    when 'driver_assigned' then
      resolved_event_key := 'delivery:assigned';
      message_body := 'Курьер назначен.';
    when 'assigned_driver' then
      resolved_event_key := 'delivery:assigned';
      message_body := 'Курьер назначен.';
    when 'picked_up' then
      resolved_event_key := 'delivery:handed_over';
      message_body := 'Курьер забрал заказ.';
    when 'on_the_way' then
      resolved_event_key := 'delivery:on_the_way';
      message_body := 'Курьер в пути к клиенту.';
    when 'delivered' then
      resolved_event_key := 'delivery:delivered';
      message_body := 'Заказ доставлен.';
    when 'completed' then
      resolved_event_key := 'status:completed';
      message_body := 'Заказ выполнен.';
    when 'cancelled' then
      resolved_event_key := 'status:canceled';
      message_body := 'Заказ отменён.';
    when 'canceled' then
      resolved_event_key := 'status:canceled';
      message_body := 'Заказ отменён.';
    else
      return new;
  end case;

  insert into public.order_messages (
    catalog_id,
    order_id,
    sender_auth_user_id,
    sender_kind,
    message_type,
    body,
    event_key
  ) values (
    new.catalog_id,
    new.id,
    (select auth.uid()),
    'system',
    'status_event',
    message_body,
    resolved_event_key
  ) on conflict do nothing;

  return new;
end;
$$;

create or replace function public.record_delivery_status_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_catalog_id uuid;
  driver_name text;
  message_body text;
  resolved_event_key text;
  route_minutes integer := greatest(1, coalesce(new.estimated_time_min, 20));
begin
  if tg_op = 'UPDATE'
    and new.status is not distinct from old.status
    and new.driver_id is not distinct from old.driver_id then
    return new;
  end if;

  select order_record.catalog_id, nullif(trim(driver.name), '')
  into target_catalog_id, driver_name
  from public.orders order_record
  left join public.drivers driver on driver.id = new.driver_id
  where order_record.id = new.order_id;

  if target_catalog_id is null then return new; end if;

  case new.status::text
    when 'waiting_courier' then
      resolved_event_key := 'delivery:waiting';
      message_body := 'Ищем курьера для доставки.';
    when 'waiting_driver' then
      resolved_event_key := 'delivery:waiting';
      message_body := 'Ищем курьера для доставки.';
    when 'assigned' then
      if new.driver_id is null then return new; end if;
      resolved_event_key := concat('delivery:assigned:', new.driver_id::text);
      message_body := case
        when driver_name is null then 'Курьер назначен.'
        else format('Курьер %s назначен.', driver_name)
      end;
    when 'arrived_to_restaurant' then
      resolved_event_key := 'delivery:arrived_to_restaurant';
      message_body := 'Курьер прибыл в заведение.';
    when 'handed_over' then
      resolved_event_key := 'delivery:handed_over';
      message_body := 'Курьер забрал заказ.';
    when 'on_the_way' then
      resolved_event_key := 'delivery:on_the_way';
      message_body := format('Курьер в пути к клиенту. Ориентировочно %s минут.', route_minutes);
    when 'arrived_to_client' then
      resolved_event_key := 'delivery:arrived_to_client';
      message_body := 'Курьер прибыл по адресу.';
    when 'delivered' then
      resolved_event_key := 'delivery:delivered';
      message_body := 'Заказ доставлен.';
    when 'failed' then
      resolved_event_key := 'delivery:failed';
      message_body := 'Возникла проблема с доставкой. Участники заказа уточняют детали.';
    else
      return new;
  end case;

  insert into public.order_messages (
    catalog_id,
    order_id,
    sender_auth_user_id,
    sender_kind,
    message_type,
    body,
    event_key
  ) values (
    target_catalog_id,
    new.order_id,
    (select auth.uid()),
    'system',
    'status_event',
    message_body,
    resolved_event_key
  ) on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.record_order_status_chat_message() from public, anon, authenticated;
revoke all on function public.record_delivery_status_chat_message() from public, anon, authenticated;

drop trigger if exists order_status_chat_message on public.orders;
create trigger order_status_chat_message
after insert or update of status on public.orders
for each row execute function public.record_order_status_chat_message();

drop trigger if exists delivery_status_chat_message on public.deliveries;
create trigger delivery_status_chat_message
after insert or update of status, driver_id on public.deliveries
for each row execute function public.record_delivery_status_chat_message();
