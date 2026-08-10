-- Keep explicit E2E catalogs isolated, but let ordinary restaurants run the
-- complete production order and delivery flow before legal activation.

create or replace function public.can_catalog_accept_preactivation_orders(target_catalog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients client
    join public.catalogs catalog on catalog.id = client.catalog_id
    where client.catalog_id = target_catalog_id
      and catalog.is_test is false
      and client.status = 'active'
      and client.legal_activation_status = any(array[
        'draft','configured','awaiting_acceptance','legacy_review_required','reacceptance_required'
      ])
      and not public.billing_debt_is_blocked('restaurant', client.id)
  );
$$;

revoke all on function public.can_catalog_accept_preactivation_orders(uuid) from public;
grant execute on function public.can_catalog_accept_preactivation_orders(uuid) to anon, authenticated;

create or replace function public.can_catalog_accept_real_orders(target_catalog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients client
    join public.catalogs catalog on catalog.id = client.catalog_id
    where client.catalog_id = target_catalog_id
      and catalog.is_test is false
      and client.status = 'active'
      and client.legal_activation_status = 'active'
      and not public.billing_debt_is_blocked('restaurant', client.id)
  ) or public.can_catalog_accept_preactivation_orders(target_catalog_id);
$$;

revoke all on function public.can_catalog_accept_real_orders(uuid) from public;
grant execute on function public.can_catalog_accept_real_orders(uuid) to anon, authenticated;

-- This compatibility function now describes only explicit test catalogs.
create or replace function public.can_catalog_accept_test_orders(target_catalog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.catalogs catalog
    where catalog.id = target_catalog_id
      and catalog.is_test is true
  );
$$;

revoke all on function public.can_catalog_accept_test_orders(uuid) from public;
grant execute on function public.can_catalog_accept_test_orders(uuid) to anon, authenticated;

create or replace function public.enforce_order_test_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog_is_test boolean;
  actor_is_test boolean := public.current_actor_is_test();
  privileged boolean := public.is_platform_admin()
    or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
begin
  select catalog.is_test
  into catalog_is_test
  from public.catalogs catalog
  where catalog.id = new.catalog_id;

  if catalog_is_test is null then
    raise exception 'catalog_not_found';
  end if;
  if not privileged and catalog_is_test is distinct from actor_is_test then
    raise exception 'order_test_scope_mismatch';
  end if;

  new.is_test_order := catalog_is_test;
  return new;
end;
$$;

revoke all on function public.enforce_order_test_scope() from public, anon, authenticated;

drop trigger if exists orders_enforce_test_scope on public.orders;
create trigger orders_enforce_test_scope
before insert or update of catalog_id, is_test_order on public.orders
for each row execute function public.enforce_order_test_scope();

create or replace function public.enforce_restaurant_order_activation_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_catalog_accept_real_orders(new.catalog_id) then
    raise exception 'restaurant_activation_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_restaurant_order_activation_gate() from public, anon, authenticated;

drop trigger if exists orders_require_active_restaurant on public.orders;
create trigger orders_require_active_restaurant
before insert on public.orders
for each row execute function public.enforce_restaurant_order_activation_gate();

-- Older restaurant-driver links predate the required courier classification.
-- The billing implementation already treats a missing value as independent;
-- persist that default so direct assignment is not rejected by the classifier.
update public.restaurant_couriers courier
set courier_type = 'independent'
from public.restaurants restaurant,
     public.catalogs catalog
where restaurant.id = courier.restaurant_id
  and catalog.id = restaurant.catalog_id
  and catalog.is_test is false
  and courier.is_active is true
  and courier.courier_type is null;

-- Pre-activation orders are now normal production-scope rows. Explicit test
-- catalogs remain untouched because their catalog-level flag is authoritative.
update public.orders order_row
set is_test_order = false
from public.catalogs catalog, public.clients client
where catalog.id = order_row.catalog_id
  and client.catalog_id = order_row.catalog_id
  and order_row.is_test_order is true
  and catalog.is_test is false
  and client.legal_activation_status = any(array[
    'draft','configured','awaiting_acceptance','legacy_review_required','reacceptance_required'
  ]);

update public.deliveries delivery
set is_test = false,
    status = delivery.status,
    updated_at = now()
from public.orders order_row
where order_row.id = delivery.order_id
  and order_row.is_test_order is false
  and delivery.is_test is true;

update public.earnings earning
set is_test = false
from public.deliveries delivery
where delivery.id = earning.delivery_id
  and delivery.is_test is false
  and earning.is_test is true;

update public.billing_ledger_entries ledger
set is_test = false
from public.orders order_row
where order_row.id = ledger.order_id
  and order_row.is_test_order is false
  and ledger.is_test is true;

with policy as (
  select debt_limit_amount
  from public.platform_financial_policy_settings
  where id = 'global'
), balances as (
  select
    client.id,
    coalesce(sum(case when ledger.is_test is false and ledger.entry_type = 'charge' then ledger.amount
                      when ledger.is_test is false then -ledger.amount else 0 end), 0) as debt_amount,
    coalesce(sum(case when ledger.is_test is true and ledger.entry_type = 'charge' then ledger.amount
                      when ledger.is_test is true then -ledger.amount else 0 end), 0) as test_debt_amount
  from public.clients client
  left join public.billing_ledger_entries ledger
    on ledger.ledger_scope = 'platform_debt'
   and ledger.account_type = 'restaurant'
   and ledger.account_id = client.id
  group by client.id
)
update public.clients client
set debt_amount = balances.debt_amount,
    test_debt_amount = balances.test_debt_amount,
    debt_limit_reached_at = case
      when balances.debt_amount < policy.debt_limit_amount then null
      else coalesce(client.debt_limit_reached_at, now())
    end,
    debt_blocked_at = case
      when balances.debt_amount < policy.debt_limit_amount then null
      else client.debt_blocked_at
    end
from balances, policy
where client.id = balances.id;

with policy as (
  select debt_limit_amount
  from public.platform_financial_policy_settings
  where id = 'global'
), balances as (
  select
    driver.id,
    coalesce(sum(case when ledger.is_test is false and ledger.entry_type = 'charge' then ledger.amount
                      when ledger.is_test is false then -ledger.amount else 0 end), 0) as debt_amount,
    coalesce(sum(case when ledger.is_test is true and ledger.entry_type = 'charge' then ledger.amount
                      when ledger.is_test is true then -ledger.amount else 0 end), 0) as test_debt_amount
  from public.drivers driver
  left join public.billing_ledger_entries ledger
    on ledger.ledger_scope = 'platform_debt'
   and ledger.account_type = 'driver'
   and ledger.account_id = driver.id
  group by driver.id
)
update public.drivers driver
set debt_amount = balances.debt_amount,
    test_debt_amount = balances.test_debt_amount,
    debt_limit_reached_at = case
      when balances.debt_amount < policy.debt_limit_amount then null
      else coalesce(driver.debt_limit_reached_at, now())
    end,
    debt_blocked_at = case
      when balances.debt_amount < policy.debt_limit_amount then null
      else driver.debt_blocked_at
    end,
    updated_at = now()
from balances, policy
where driver.id = balances.id;

drop trigger if exists clients_require_no_test_orders_before_activation on public.clients;

create or replace function public.delete_restaurant_preactivation_order(
  target_order_id uuid,
  target_catalog_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_client_id uuid;
  target_legal_status text;
  target_catalog_is_test boolean;
  target_delivery_ids uuid[] := '{}'::uuid[];
  impacted_restaurant_ids uuid[] := '{}'::uuid[];
  impacted_driver_ids uuid[] := '{}'::uuid[];
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

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

  select client.id, client.legal_activation_status, catalog.is_test
  into target_client_id, target_legal_status, target_catalog_is_test
  from public.orders order_row
  join public.clients client on client.catalog_id = order_row.catalog_id
  join public.catalogs catalog on catalog.id = order_row.catalog_id
  where order_row.id = target_order_id
    and order_row.catalog_id = target_catalog_id
  for update of order_row;

  if target_client_id is null then
    return false;
  end if;
  if target_catalog_is_test then
    raise exception 'Use the isolated test-order cleanup for a test catalog';
  end if;
  if target_legal_status = 'active' then
    raise exception 'preactivation_order_deletion_not_allowed';
  end if;

  select coalesce(array_agg(delivery.id), '{}'::uuid[])
  into target_delivery_ids
  from public.deliveries delivery
  where delivery.order_id = target_order_id;

  select
    coalesce(array_agg(distinct ledger.account_id) filter (where ledger.account_type = 'restaurant'), '{}'::uuid[]),
    coalesce(array_agg(distinct ledger.account_id) filter (where ledger.account_type = 'driver'), '{}'::uuid[])
  into impacted_restaurant_ids, impacted_driver_ids
  from public.billing_ledger_entries ledger
  where ledger.order_id = target_order_id
     or ledger.delivery_id = any(target_delivery_ids);

  impacted_restaurant_ids := array_append(impacted_restaurant_ids, target_client_id);
  impacted_driver_ids := impacted_driver_ids || coalesce((
    select array_agg(distinct delivery.driver_id)
    from public.deliveries delivery
    where delivery.id = any(target_delivery_ids)
      and delivery.driver_id is not null
  ), '{}'::uuid[]);

  delete from public.billing_ledger_entries
  where order_id = target_order_id
     or delivery_id = any(target_delivery_ids);

  delete from public.earnings
  where delivery_id = any(target_delivery_ids);

  delete from public.orders
  where id = target_order_id
    and catalog_id = target_catalog_id;

  with policy as (
    select debt_limit_amount
    from public.platform_financial_policy_settings
    where id = 'global'
  ), balances as (
    select
      client.id,
      coalesce(sum(case when ledger.is_test is false and ledger.entry_type = 'charge' then ledger.amount
                        when ledger.is_test is false then -ledger.amount else 0 end), 0) as debt_amount,
      coalesce(sum(case when ledger.is_test is true and ledger.entry_type = 'charge' then ledger.amount
                        when ledger.is_test is true then -ledger.amount else 0 end), 0) as test_debt_amount
    from public.clients client
    left join public.billing_ledger_entries ledger
      on ledger.ledger_scope = 'platform_debt'
     and ledger.account_type = 'restaurant'
     and ledger.account_id = client.id
    where client.id = any(impacted_restaurant_ids)
    group by client.id
  )
  update public.clients client
  set debt_amount = balances.debt_amount,
      test_debt_amount = balances.test_debt_amount,
      debt_limit_reached_at = case
        when balances.debt_amount < policy.debt_limit_amount then null
        else coalesce(client.debt_limit_reached_at, now())
      end,
      debt_blocked_at = case
        when balances.debt_amount < policy.debt_limit_amount then null
        else client.debt_blocked_at
      end
  from balances, policy
  where client.id = balances.id;

  with policy as (
    select debt_limit_amount
    from public.platform_financial_policy_settings
    where id = 'global'
  ), balances as (
    select
      driver.id,
      coalesce(sum(case when ledger.is_test is false and ledger.entry_type = 'charge' then ledger.amount
                        when ledger.is_test is false then -ledger.amount else 0 end), 0) as debt_amount,
      coalesce(sum(case when ledger.is_test is true and ledger.entry_type = 'charge' then ledger.amount
                        when ledger.is_test is true then -ledger.amount else 0 end), 0) as test_debt_amount
    from public.drivers driver
    left join public.billing_ledger_entries ledger
      on ledger.ledger_scope = 'platform_debt'
     and ledger.account_type = 'driver'
     and ledger.account_id = driver.id
    where driver.id = any(impacted_driver_ids)
    group by driver.id
  )
  update public.drivers driver
  set debt_amount = balances.debt_amount,
      test_debt_amount = balances.test_debt_amount,
      debt_limit_reached_at = case
        when balances.debt_amount < policy.debt_limit_amount then null
        else coalesce(driver.debt_limit_reached_at, now())
      end,
      debt_blocked_at = case
        when balances.debt_amount < policy.debt_limit_amount then null
        else driver.debt_blocked_at
      end,
      updated_at = now()
  from balances, policy
  where driver.id = balances.id;

  return true;
end;
$$;

revoke all on function public.delete_restaurant_preactivation_order(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.delete_restaurant_preactivation_order(uuid, uuid) to authenticated;
