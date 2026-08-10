-- Persist the two-sided cash settlement between an assigned driver and restaurant.
alter table public.deliveries
  add column if not exists driver_restaurant_order_payment_confirmed_at timestamptz,
  add column if not exists driver_restaurant_order_payment_amount numeric(12,2),
  add column if not exists driver_restaurant_delivery_payout_received_at timestamptz,
  add column if not exists driver_restaurant_delivery_payout_received_amount numeric(12,2);

alter table public.deliveries
  drop constraint if exists deliveries_driver_restaurant_order_payment_amount_check;
alter table public.deliveries
  add constraint deliveries_driver_restaurant_order_payment_amount_check
  check (driver_restaurant_order_payment_amount is null or driver_restaurant_order_payment_amount >= 0);

alter table public.deliveries
  drop constraint if exists deliveries_driver_restaurant_delivery_payout_amount_check;
alter table public.deliveries
  add constraint deliveries_driver_restaurant_delivery_payout_amount_check
  check (
    driver_restaurant_delivery_payout_received_amount is null
    or driver_restaurant_delivery_payout_received_amount > 0
  );

create or replace function public.confirm_current_driver_restaurant_order_payment(
  target_delivery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  target_order_id uuid;
  target_status text;
  target_comment text;
  client_total numeric(12,2);
  client_delivery_fee numeric(12,2);
  courier_payout numeric(12,2);
  restaurant_order_amount numeric(12,2);
  confirmed_at timestamptz;
  confirmed_amount numeric(12,2);
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  select
    delivery.order_id,
    delivery.status,
    coalesce(order_row.comment, ''),
    greatest(coalesce(order_row.total, order_row.total_amount, 0), 0),
    greatest(coalesce(order_row.delivery_fee, 0), 0),
    greatest(coalesce(delivery.offered_fee, 0), 0),
    delivery.driver_restaurant_order_payment_confirmed_at,
    delivery.driver_restaurant_order_payment_amount
  into
    target_order_id,
    target_status,
    target_comment,
    client_total,
    client_delivery_fee,
    courier_payout,
    confirmed_at,
    confirmed_amount
  from public.deliveries delivery
  join public.orders order_row on order_row.id = delivery.order_id
  where delivery.id = target_delivery_id
    and delivery.driver_id = viewer_driver_id
  for update of delivery, order_row;

  if target_order_id is null then
    raise exception 'Delivery is not assigned to current driver';
  end if;
  if target_status <> 'arrived_to_restaurant' then
    raise exception 'Сначала отметьте прибытие в ресторан';
  end if;
  if target_comment !~* '\[payment_method:cash\]' then
    raise exception 'Передача суммы заказа требуется только при оплате наличными';
  end if;

  restaurant_order_amount := case
    when client_delivery_fee = 0 and courier_payout > 0 then client_total
    else greatest(client_total - courier_payout, 0)
  end;

  if confirmed_at is null then
    update public.deliveries
    set driver_restaurant_order_payment_confirmed_at = now(),
        driver_restaurant_order_payment_amount = restaurant_order_amount,
        updated_at = now()
    where id = target_delivery_id;

    insert into public.delivery_status_history(delivery_id, status, comment)
    values (
      target_delivery_id,
      'arrived_to_restaurant',
      'driver confirmed restaurant order payment: ' || restaurant_order_amount::text
    );

    confirmed_at := now();
    confirmed_amount := restaurant_order_amount;
  end if;

  return jsonb_build_object(
    'confirmed_at', confirmed_at,
    'amount', coalesce(confirmed_amount, restaurant_order_amount)
  );
end;
$$;

revoke all on function public.confirm_current_driver_restaurant_order_payment(uuid)
from public, anon;
grant execute on function public.confirm_current_driver_restaurant_order_payment(uuid)
to authenticated;

create or replace function public.confirm_current_driver_restaurant_delivery_payout(
  target_delivery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  target_order_id uuid;
  target_client_id uuid;
  target_status text;
  target_comment text;
  client_delivery_fee numeric(12,2);
  courier_payout numeric(12,2);
  order_payment_confirmed_at timestamptz;
  restaurant_payment_confirmed_at timestamptz;
  payout_received_at timestamptz;
  payout_received_amount numeric(12,2);
  target_is_test boolean;
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  select
    delivery.order_id,
    client.id,
    delivery.status,
    coalesce(order_row.comment, ''),
    greatest(coalesce(order_row.delivery_fee, 0), 0),
    greatest(coalesce(delivery.offered_fee, 0), 0),
    delivery.driver_restaurant_order_payment_confirmed_at,
    order_row.restaurant_payment_confirmed_at,
    delivery.driver_restaurant_delivery_payout_received_at,
    delivery.driver_restaurant_delivery_payout_received_amount,
    coalesce(delivery.is_test, false)
  into
    target_order_id,
    target_client_id,
    target_status,
    target_comment,
    client_delivery_fee,
    courier_payout,
    order_payment_confirmed_at,
    restaurant_payment_confirmed_at,
    payout_received_at,
    payout_received_amount,
    target_is_test
  from public.deliveries delivery
  join public.orders order_row on order_row.id = delivery.order_id
  join public.clients client on client.catalog_id = order_row.catalog_id
  where delivery.id = target_delivery_id
    and delivery.driver_id = viewer_driver_id
  order by client.created_at
  limit 1
  for update of delivery, order_row;

  if target_order_id is null then
    raise exception 'Delivery is not assigned to current driver';
  end if;
  if target_status <> 'arrived_to_restaurant' then
    raise exception 'Сначала отметьте прибытие в ресторан';
  end if;
  if client_delivery_fee > 0 or courier_payout <= 0 then
    raise exception 'Эту доставку оплачивает клиент, отдельная выплата ресторана не требуется';
  end if;
  if target_comment ~* '\[payment_method:cash\]' then
    if order_payment_confirmed_at is null then
      raise exception 'Сначала отметьте передачу суммы заказа ресторану';
    end if;
    if restaurant_payment_confirmed_at is null then
      raise exception 'Сначала ресторан должен подтвердить получение суммы заказа';
    end if;
  end if;

  if payout_received_at is null then
    insert into public.billing_ledger_entries(
      event_key,
      ledger_scope,
      entry_type,
      account_type,
      account_id,
      counterparty_type,
      counterparty_id,
      order_id,
      delivery_id,
      reason,
      amount,
      is_test
    ) values (
      'delivery:' || target_delivery_id || ':free_delivery_driver_payout',
      'courier_payable',
      'payout',
      'restaurant',
      target_client_id,
      'driver',
      viewer_driver_id,
      target_order_id,
      target_delivery_id,
      'free_delivery_driver_payout',
      courier_payout,
      target_is_test
    ) on conflict (event_key) do nothing;

    insert into public.billing_ledger_entries(
      event_key,
      ledger_scope,
      entry_type,
      account_type,
      account_id,
      counterparty_type,
      counterparty_id,
      order_id,
      delivery_id,
      reason,
      amount,
      is_test
    ) values (
      'delivery:' || target_delivery_id || ':free_delivery_driver_payout_received',
      'courier_payable',
      'payment',
      'restaurant',
      target_client_id,
      'driver',
      viewer_driver_id,
      target_order_id,
      target_delivery_id,
      'free_delivery_driver_payout_received',
      courier_payout,
      target_is_test
    ) on conflict (event_key) do nothing;

    update public.deliveries
    set driver_restaurant_delivery_payout_received_at = now(),
        driver_restaurant_delivery_payout_received_amount = courier_payout,
        updated_at = now()
    where id = target_delivery_id;

    insert into public.delivery_status_history(delivery_id, status, comment)
    values (
      target_delivery_id,
      'arrived_to_restaurant',
      'driver confirmed restaurant delivery payout: ' || courier_payout::text
    );

    payout_received_at := now();
    payout_received_amount := courier_payout;
  end if;

  return jsonb_build_object(
    'received_at', payout_received_at,
    'amount', coalesce(payout_received_amount, courier_payout)
  );
end;
$$;

revoke all on function public.confirm_current_driver_restaurant_delivery_payout(uuid)
from public, anon;
grant execute on function public.confirm_current_driver_restaurant_delivery_payout(uuid)
to authenticated;

create or replace function public.confirm_restaurant_cash_payment(
  target_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_catalog_id uuid;
  target_comment text;
  target_delivery_status text;
  driver_order_payment_confirmed_at timestamptz;
begin
  select
    order_row.catalog_id,
    coalesce(order_row.comment, ''),
    delivery.status,
    delivery.driver_restaurant_order_payment_confirmed_at
  into
    target_catalog_id,
    target_comment,
    target_delivery_status,
    driver_order_payment_confirmed_at
  from public.orders order_row
  join public.deliveries delivery on delivery.order_id = order_row.id
  where order_row.id = target_order_id
  order by delivery.updated_at desc nulls last, delivery.created_at desc
  limit 1
  for update of order_row, delivery;

  if target_catalog_id is null then return false; end if;
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
    raise exception 'Restaurant access is required';
  end if;
  if target_comment !~* '\[payment_method:cash\]' then
    raise exception 'Cash confirmation is only available for cash orders';
  end if;
  if target_delivery_status <> 'arrived_to_restaurant' then
    raise exception 'Driver must arrive at the restaurant before cash confirmation';
  end if;
  if driver_order_payment_confirmed_at is null then
    raise exception 'Сначала водитель должен отметить передачу суммы заказа';
  end if;

  update public.orders
  set restaurant_payment_confirmed_at = coalesce(restaurant_payment_confirmed_at, now())
  where id = target_order_id;

  return true;
end;
$$;

revoke all on function public.confirm_restaurant_cash_payment(uuid) from public, anon;
grant execute on function public.confirm_restaurant_cash_payment(uuid) to authenticated;

create or replace function public.confirm_delivery_pickup_qr(
  target_delivery_id uuid,
  presented_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order_id uuid;
  target_catalog_id uuid;
  target_comment text;
  payment_confirmed_at timestamptz;
  client_delivery_fee numeric(12,2);
  courier_payout numeric(12,2);
  payout_received_at timestamptz;
begin
  select
    delivery.order_id,
    order_row.catalog_id,
    coalesce(order_row.comment, ''),
    order_row.restaurant_payment_confirmed_at,
    greatest(coalesce(order_row.delivery_fee, 0), 0),
    greatest(coalesce(delivery.offered_fee, 0), 0),
    delivery.driver_restaurant_delivery_payout_received_at
  into
    target_order_id,
    target_catalog_id,
    target_comment,
    payment_confirmed_at,
    client_delivery_fee,
    courier_payout,
    payout_received_at
  from public.deliveries delivery
  join public.orders order_row on order_row.id = delivery.order_id
  where delivery.id = target_delivery_id
    and delivery.status = 'arrived_to_restaurant'
    and delivery.pickup_qr_confirmed_at is null
    and delivery.pickup_qr_token = trim(presented_token)
    and delivery.pickup_qr_expires_at > now()
  for update of delivery, order_row;

  if target_order_id is null then return false; end if;
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
    raise exception 'Restaurant access is required';
  end if;
  if target_comment ~* '\[payment_method:cash\]' and payment_confirmed_at is null then
    raise exception 'Сначала подтвердите получение суммы заказа от водителя';
  end if;
  if client_delivery_fee = 0 and courier_payout > 0 and payout_received_at is null then
    raise exception 'Сначала водитель должен подтвердить получение оплаты доставки от ресторана';
  end if;

  update public.deliveries
  set pickup_qr_confirmed_at = now(), updated_at = now()
  where id = target_delivery_id and pickup_qr_confirmed_at is null;
  if not found then return false; end if;

  insert into public.delivery_status_history(delivery_id, status, comment)
  values(target_delivery_id, 'arrived_to_restaurant', 'restaurant verified driver QR');

  return true;
end;
$$;

revoke all on function public.confirm_delivery_pickup_qr(uuid, text) from public, anon;
grant execute on function public.confirm_delivery_pickup_qr(uuid, text) to authenticated;

create or replace function public.get_driver_delivery_offers()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(scoped.offer), '[]'::jsonb)
  from (
    select
      offer || jsonb_build_object(
        'client_delivery_fee', greatest(coalesce(order_row.delivery_fee, 0), 0),
        'restaurant_funds_delivery',
          greatest(coalesce(order_row.delivery_fee, 0), 0) = 0
          and greatest(coalesce(delivery.offered_fee, 0), 0) > 0,
        'restaurant_delivery_payout_amount', case
          when greatest(coalesce(order_row.delivery_fee, 0), 0) = 0
            then greatest(coalesce(delivery.offered_fee, 0), 0)
          else 0
        end,
        'driver_restaurant_order_payment_confirmed_at', case
          when delivery.driver_id = viewer_driver.id
            then delivery.driver_restaurant_order_payment_confirmed_at
          else null
        end,
        'driver_restaurant_order_payment_amount', case
          when delivery.driver_id = viewer_driver.id
            then delivery.driver_restaurant_order_payment_amount
          else null
        end,
        'driver_restaurant_delivery_payout_received_at', case
          when delivery.driver_id = viewer_driver.id
            then delivery.driver_restaurant_delivery_payout_received_at
          else null
        end,
        'driver_restaurant_delivery_payout_received_amount', case
          when delivery.driver_id = viewer_driver.id
            then delivery.driver_restaurant_delivery_payout_received_amount
          else null
        end
      ) as offer
    from jsonb_array_elements(public.get_driver_delivery_offers_unscoped()) offer
    join public.deliveries delivery on delivery.id = (offer ->> 'id')::uuid
    join public.orders order_row on order_row.id = delivery.order_id
    join public.drivers viewer_driver on viewer_driver.id = public.current_driver_id()
    where coalesce(order_row.is_test_order, false) = coalesce(viewer_driver.is_test, false)
    order by
      case when offer ->> 'driver_id' = viewer_driver.id::text then 0 else 1 end,
      offer ->> 'created_at' desc
  ) scoped;
$$;

revoke all on function public.get_driver_delivery_offers() from public, anon;
grant execute on function public.get_driver_delivery_offers() to authenticated;

create or replace function public.get_restaurant_assigned_drivers(
  target_catalog_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
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
    raise exception 'Restaurant access is required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', driver.id,
        'order_id', order_row.id,
        'delivery_id', delivery.id,
        'delivery_status', delivery.status,
        'delivery_updated_at', delivery.updated_at,
        'pickup_qr_confirmed_at', delivery.pickup_qr_confirmed_at,
        'restaurant_payment_confirmed_at', order_row.restaurant_payment_confirmed_at,
        'driver_restaurant_order_payment_confirmed_at',
          delivery.driver_restaurant_order_payment_confirmed_at,
        'driver_restaurant_order_payment_amount',
          delivery.driver_restaurant_order_payment_amount,
        'driver_restaurant_delivery_payout_received_at',
          delivery.driver_restaurant_delivery_payout_received_at,
        'driver_restaurant_delivery_payout_received_amount',
          delivery.driver_restaurant_delivery_payout_received_amount,
        'restaurant_funds_delivery',
          greatest(coalesce(order_row.delivery_fee, 0), 0) = 0
          and greatest(coalesce(delivery.offered_fee, 0), 0) > 0,
        'restaurant_delivery_payout_amount', case
          when greatest(coalesce(order_row.delivery_fee, 0), 0) = 0
            then greatest(coalesce(delivery.offered_fee, 0), 0)
          else 0
        end,
        'name', driver.name,
        'phone', driver.phone,
        'vehicle_info', driver.vehicle_info,
        'car_number', driver.car_number,
        'photo_url', driver.photo_url,
        'last_lat', driver.last_lat,
        'last_lng', driver.last_lng,
        'last_location_at', driver.last_location_at
      )
      order by order_row.created_at desc, delivery.updated_at desc nulls last
    ),
    '[]'::jsonb
  )
  into result
  from public.deliveries delivery
  join public.orders order_row on order_row.id = delivery.order_id
  join public.drivers driver on driver.id = delivery.driver_id
  where order_row.catalog_id = target_catalog_id;

  return result;
end;
$$;

revoke all on function public.get_restaurant_assigned_drivers(uuid) from public, anon;
grant execute on function public.get_restaurant_assigned_drivers(uuid) to authenticated;
