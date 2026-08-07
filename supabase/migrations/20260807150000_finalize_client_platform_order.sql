-- Finalize public client orders inside the same security-definer boundary as
-- creation. The previous browser-side UPDATE was silently filtered by orders
-- RLS, leaving delivery orders with the legacy dine_in defaults and a zero fee.

create or replace function public.finalize_created_client_platform_order(
  created_order_id uuid,
  selected_payment_method text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  platform_user_id uuid;
  settings public.restaurant_delivery_settings%rowtype;
  restaurant_row public.restaurants%rowtype;
  resolved_order_type text;
  resolved_delivery_provider text;
  resolved_delivery_fee numeric(12,2);
begin
  if selected_payment_method not in ('cash', 'bank_transfer', 'qr') then
    raise exception 'Unsupported payment method';
  end if;

  select * into order_row from public.orders where id = created_order_id for update;
  if order_row.id is null then raise exception 'Order does not exist'; end if;

  select * into settings
  from public.restaurant_delivery_settings
  where catalog_id = order_row.catalog_id;

  select * into restaurant_row
  from public.restaurants
  where catalog_id = order_row.catalog_id
  order by created_at
  limit 1;

  select id into platform_user_id
  from public.users
  where auth_user_id = auth.uid()
  order by created_at
  limit 1;

  resolved_order_type := case order_row.fulfillment_type
    when 'delivery' then 'delivery'
    when 'takeaway' then 'pickup'
    else 'dine_in'
  end;
  resolved_delivery_provider := case
    when resolved_order_type = 'pickup' then 'pickup'
    when resolved_order_type = 'dine_in' then 'dine_in'
    when coalesce(settings.use_platform_drivers, false) then 'platform'
    else 'restaurant'
  end;
  resolved_delivery_fee := case
    when resolved_order_type <> 'delivery' then 0
    when coalesce(settings.free_delivery_from, 0) > 0
      and order_row.subtotal >= settings.free_delivery_from then 0
    else 120
  end;

  -- An idempotent retry may return an order that has already advanced. Never
  -- rewrite lifecycle or money after the restaurant has started processing it.
  if order_row.accepted_at is null and order_row.status::text in ('new', 'waiting_payment_confirmation') then
    update public.orders
    set client_id = coalesce(client_id, platform_user_id),
        order_type = resolved_order_type,
        status = case
          when resolved_order_type = 'delivery' and selected_payment_method <> 'cash'
            then 'waiting_payment_confirmation'::public.order_status
          else 'new'::public.order_status
        end,
        payment_status = case
          when selected_payment_method = 'cash' then 'unpaid'
          else 'waiting_confirmation'
        end,
        delivery_provider = resolved_delivery_provider,
        client_name = customer_name,
        client_phone = customer_phone,
        delivery_fee = resolved_delivery_fee,
        subtotal_amount = subtotal,
        total_amount = subtotal + resolved_delivery_fee,
        total = subtotal + resolved_delivery_fee,
        restaurant_address_snapshot = coalesce(nullif(restaurant_row.address_line, ''), restaurant_row.description, ''),
        restaurant_lat_snapshot = restaurant_row.lat,
        restaurant_lng_snapshot = restaurant_row.lng,
        comment = case
          when selected_payment_method = 'cash' and coalesce(comment, '') !~* '\[payment_method:cash\]'
            then concat_ws(E'\n', nullif(comment, ''), '[payment_method:cash]')
          else comment
        end
    where id = created_order_id;
  end if;

  return created_order_id;
end;
$$;

revoke all on function public.finalize_created_client_platform_order(uuid, text) from public, anon, authenticated;

create or replace function public.create_client_platform_restaurant_order(
  target_catalog_id uuid, customer_name text, customer_phone text,
  fulfillment_type text, cabin_label text, delivery_address text,
  delivery_city text, delivery_settlement text, client_address_comment text,
  comment text, items jsonb, idempotency_key text, payment_method text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare created_order_id uuid;
begin
  created_order_id := public.create_public_restaurant_order(
    target_catalog_id, customer_name, customer_phone, fulfillment_type,
    cabin_label, delivery_address, delivery_city, delivery_settlement,
    client_address_comment, comment, items, idempotency_key
  );
  return public.finalize_created_client_platform_order(created_order_id, payment_method);
end;
$$;

create or replace function public.create_client_platform_legacy_restaurant_order(
  target_catalog_id uuid, customer_name text, customer_phone text,
  fulfillment_type text, cabin_label text, delivery_address text,
  delivery_city text, delivery_settlement text, client_address_comment text,
  comment text, items jsonb, idempotency_key text, payment_method text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare created_order_id uuid;
begin
  created_order_id := public.create_legacy_public_restaurant_order(
    target_catalog_id, customer_name, customer_phone, fulfillment_type,
    cabin_label, delivery_address, delivery_city, delivery_settlement,
    client_address_comment, comment, items, idempotency_key
  );
  return public.finalize_created_client_platform_order(created_order_id, payment_method);
end;
$$;

revoke all on function public.create_client_platform_restaurant_order(uuid,text,text,text,text,text,text,text,text,text,jsonb,text,text) from public;
revoke all on function public.create_client_platform_legacy_restaurant_order(uuid,text,text,text,text,text,text,text,text,text,jsonb,text,text) from public;
grant execute on function public.create_client_platform_restaurant_order(uuid,text,text,text,text,text,text,text,text,text,jsonb,text,text) to anon, authenticated;
grant execute on function public.create_client_platform_legacy_restaurant_order(uuid,text,text,text,text,text,text,text,text,text,jsonb,text,text) to anon, authenticated;

-- Repair only completed isolated E2E orders affected before this fix.
update public.earnings earning
set amount = policy.free_delivery_driver_payout,
    commission = coalesce(earning.commission, policy.delivery_commission, 30)
from public.deliveries delivery
join public.orders order_row on order_row.id = delivery.order_id
cross join public.platform_financial_policy_settings policy
where earning.delivery_id = delivery.id
  and earning.is_test is true and delivery.is_test is true and order_row.is_test_order is true
  and delivery.status = 'delivered' and earning.amount = 0
  and coalesce(order_row.delivery_fee, 0) = 0 and policy.id = 'global';

insert into public.billing_ledger_entries(
  event_key, ledger_scope, entry_type, account_type, account_id,
  counterparty_type, counterparty_id, order_id, delivery_id, reason, amount, is_test
)
select 'delivery:' || delivery.id || ':free_delivery_driver_payout',
  'courier_payable', 'payout', 'restaurant', client.id,
  'driver', delivery.driver_id, order_row.id, delivery.id,
  'free_delivery_driver_payout', earning.amount, true
from public.deliveries delivery
join public.orders order_row on order_row.id = delivery.order_id
join public.clients client on client.catalog_id = order_row.catalog_id
join public.earnings earning on earning.delivery_id = delivery.id
where earning.is_test is true and delivery.is_test is true and order_row.is_test_order is true
  and delivery.status = 'delivered' and coalesce(order_row.delivery_fee, 0) = 0
  and earning.amount > 0
on conflict (event_key) do nothing;
