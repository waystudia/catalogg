-- A platform driver has no restaurant_couriers row. Treat that missing
-- relationship as the existing independent-driver business case so a
-- restaurant-funded free delivery still pays the driver.
create or replace function public.normalize_restaurant_courier_earning()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_courier_type text;
  threshold_reached boolean;
  configured_commission numeric(12,2);
  configured_payout numeric(12,2);
begin
  select courier.courier_type,
    (coalesce(settings.free_delivery_from, 0) > 0
      and order_row.subtotal >= settings.free_delivery_from
      and coalesce(order_row.delivery_fee, 0) = 0),
    coalesce(tariff.driver_commission_amount, policy.delivery_commission, 30),
    policy.free_delivery_driver_payout
  into resolved_courier_type, threshold_reached, configured_commission, configured_payout
  from public.deliveries delivery
  join public.orders order_row on order_row.id = delivery.order_id
  left join public.restaurants restaurant on restaurant.catalog_id = order_row.catalog_id
  left join public.restaurant_couriers courier
    on courier.restaurant_id = restaurant.id
    and courier.driver_id = new.driver_id
    and courier.is_active
  left join public.restaurant_delivery_settings settings on settings.catalog_id = order_row.catalog_id
  left join public.clients client on client.catalog_id = order_row.catalog_id
  left join lateral (
    select candidate.driver_commission_amount
    from public.restaurant_tariffs candidate
    where candidate.client_id = client.id and candidate.status = 'published'
    order by candidate.published_at desc
    limit 1
  ) tariff on true
  cross join public.platform_financial_policy_settings policy
  where delivery.id = new.delivery_id and policy.id = 'global';

  resolved_courier_type := coalesce(resolved_courier_type, 'independent');
  if resolved_courier_type = 'staff_salaried' then
    new.amount := 0;
    new.commission := 0;
  elsif resolved_courier_type = 'independent' then
    new.commission := configured_commission;
    if threshold_reached then
      new.amount := configured_payout;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_restaurant_courier_earning() from public, anon, authenticated;

-- Repair only the permanent isolated E2E fixture. Historical production money
-- remains untouched and can be audited separately before any correction.
update public.earnings earning
set amount = policy.free_delivery_driver_payout,
    commission = coalesce(tariff.driver_commission_amount, policy.delivery_commission, 30)
from public.deliveries delivery
join public.orders order_row on order_row.id = delivery.order_id
join public.clients client on client.catalog_id = order_row.catalog_id
left join public.restaurants restaurant on restaurant.catalog_id = order_row.catalog_id
left join public.restaurant_couriers courier
  on courier.restaurant_id = restaurant.id
  and courier.driver_id = delivery.driver_id
  and courier.is_active
left join public.restaurant_delivery_settings settings on settings.catalog_id = order_row.catalog_id
left join lateral (
  select candidate.driver_commission_amount
  from public.restaurant_tariffs candidate
  where candidate.client_id = client.id and candidate.status = 'published'
  order by candidate.published_at desc
  limit 1
) tariff on true
cross join public.platform_financial_policy_settings policy
where earning.delivery_id = delivery.id
  and earning.is_test is true
  and delivery.is_test is true
  and order_row.is_test_order is true
  and delivery.status = 'delivered'
  and earning.amount = 0
  and coalesce(courier.courier_type, 'independent') = 'independent'
  and coalesce(order_row.delivery_fee, 0) = 0
  and policy.id = 'global';

insert into public.billing_ledger_entries(
  event_key, ledger_scope, entry_type, account_type, account_id,
  counterparty_type, counterparty_id, order_id, delivery_id, reason, amount, is_test
)
select
  'delivery:' || delivery.id || ':free_delivery_driver_payout',
  'courier_payable', 'payout', 'restaurant', client.id,
  'driver', delivery.driver_id, order_row.id, delivery.id,
  'free_delivery_driver_payout', policy.free_delivery_driver_payout, true
from public.deliveries delivery
join public.orders order_row on order_row.id = delivery.order_id
join public.clients client on client.catalog_id = order_row.catalog_id
join public.earnings earning on earning.delivery_id = delivery.id
left join public.restaurants restaurant on restaurant.catalog_id = order_row.catalog_id
left join public.restaurant_couriers courier
  on courier.restaurant_id = restaurant.id
  and courier.driver_id = delivery.driver_id
  and courier.is_active
cross join public.platform_financial_policy_settings policy
where earning.is_test is true
  and delivery.is_test is true
  and order_row.is_test_order is true
  and delivery.status = 'delivered'
  and coalesce(order_row.delivery_fee, 0) = 0
  and earning.amount = policy.free_delivery_driver_payout
  and coalesce(courier.courier_type, 'independent') = 'independent'
  and policy.id = 'global'
on conflict (event_key) do nothing;

-- Narrow, read-only post-condition for the visual E2E actor. It exposes no PII
-- and prevents a zero payout or duplicate ledger event from producing PASS.
create or replace function public.get_wayyaam_e2e_order_finance(target_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_wayyaam_e2e_actor() then
    raise exception 'e2e_actor_required';
  end if;
  if not exists (
    select 1
    from public.orders order_row
    join public.catalogs catalog on catalog.id = order_row.catalog_id
    where order_row.id = target_order_id
      and order_row.is_test_order is true
      and catalog.is_test is true
      and catalog.slug = 'wayyaam-test-restaurant'
  ) then
    raise exception 'e2e_test_order_required';
  end if;

  select jsonb_build_object(
    'order_is_test', order_row.is_test_order,
    'delivery_is_test', delivery.is_test,
    'delivery_fee', order_row.delivery_fee,
    'offered_fee', delivery.offered_fee,
    'restaurant_charge_count', (
      select count(*) from public.billing_ledger_entries ledger
      where ledger.order_id = order_row.id
        and ledger.reason = 'restaurant_order_commission'
        and ledger.entry_type = 'charge'
        and ledger.is_test is true
    ),
    'restaurant_charge_amount', (
      select coalesce(sum(ledger.amount), 0) from public.billing_ledger_entries ledger
      where ledger.order_id = order_row.id
        and ledger.reason = 'restaurant_order_commission'
        and ledger.entry_type = 'charge'
        and ledger.is_test is true
    ),
    'driver_charge_count', (
      select count(*) from public.billing_ledger_entries ledger
      where ledger.delivery_id = delivery.id
        and ledger.reason = 'driver_delivery_commission'
        and ledger.entry_type = 'charge'
        and ledger.is_test is true
    ),
    'driver_charge_amount', (
      select coalesce(sum(ledger.amount), 0) from public.billing_ledger_entries ledger
      where ledger.delivery_id = delivery.id
        and ledger.reason = 'driver_delivery_commission'
        and ledger.entry_type = 'charge'
        and ledger.is_test is true
    ),
    'driver_payout_count', (
      select count(*) from public.billing_ledger_entries ledger
      where ledger.delivery_id = delivery.id
        and ledger.reason = 'free_delivery_driver_payout'
        and ledger.entry_type = 'payout'
        and ledger.is_test is true
    ),
    'driver_payout_amount', (
      select coalesce(sum(ledger.amount), 0) from public.billing_ledger_entries ledger
      where ledger.delivery_id = delivery.id
        and ledger.reason = 'free_delivery_driver_payout'
        and ledger.entry_type = 'payout'
        and ledger.is_test is true
    ),
    'earning_count', count(earning.id),
    'earning_amount', coalesce(sum(earning.amount), 0),
    'earning_commission', coalesce(sum(earning.commission), 0),
    'earning_net_amount', coalesce(sum(earning.net_amount), 0),
    'earning_is_test', coalesce(bool_and(earning.is_test), false),
    'expected_free_delivery_driver_payout', policy.free_delivery_driver_payout,
    'expected_earning_amount', case
      when coalesce(delivery.offered_fee, 0) > 0 then delivery.offered_fee
      when coalesce(order_row.delivery_fee, 0) > 0 then order_row.delivery_fee
      else policy.free_delivery_driver_payout
    end
  ) into result
  from public.orders order_row
  join public.deliveries delivery on delivery.order_id = order_row.id
  left join public.earnings earning on earning.delivery_id = delivery.id
  cross join public.platform_financial_policy_settings policy
  where order_row.id = target_order_id and policy.id = 'global'
  group by order_row.id, order_row.is_test_order, order_row.delivery_fee,
           delivery.id, delivery.is_test, delivery.offered_fee, policy.free_delivery_driver_payout;

  if result is null then raise exception 'e2e_delivery_missing'; end if;
  return result;
end;
$$;

revoke all on function public.get_wayyaam_e2e_order_finance(uuid) from public, anon;
grant execute on function public.get_wayyaam_e2e_order_finance(uuid) to authenticated;
