-- Narrow control plane for the permanent visual E2E fixture. It exposes no PII,
-- cannot be called by ordinary users, and never mutates production rows.
create or replace function public.is_wayyaam_e2e_actor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'e2e.client@wayyaam.ru',
    'e2e.restaurant@wayyaam.ru',
    'e2e.driver@wayyaam.ru'
  );
$$;

revoke all on function public.is_wayyaam_e2e_actor() from public, anon;
grant execute on function public.is_wayyaam_e2e_actor() to authenticated;

create or replace function public.get_wayyaam_e2e_production_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_wayyaam_e2e_actor() then raise exception 'e2e_actor_required'; end if;

  select jsonb_build_object(
    'orders_count', count(*),
    'completed_orders_count', count(*) filter (where status::text in ('completed', 'delivered')),
    'gmv', coalesce(sum(total), 0)
  ) into result
  from public.orders
  where not coalesce(is_test_order, false);

  return result || jsonb_build_object(
    'deliveries_count', (select count(*) from public.deliveries where not coalesce(is_test, false)),
    'ledger_rows_count', (select count(*) from public.billing_ledger_entries where not coalesce(is_test, false)),
    'ledger_net', (
      select coalesce(sum(case when entry_type = 'charge' then amount else -amount end), 0)
      from public.billing_ledger_entries where not coalesce(is_test, false)
    ),
    'restaurant_real_debt', (select coalesce(sum(debt_amount), 0) from public.clients),
    'driver_real_debt', (select coalesce(sum(debt_amount), 0) from public.drivers)
  );
end;
$$;

revoke all on function public.get_wayyaam_e2e_production_snapshot() from public, anon;
grant execute on function public.get_wayyaam_e2e_production_snapshot() to authenticated;

create or replace function public.reset_wayyaam_e2e_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_catalog_id uuid;
  target_driver_id uuid;
  canceled_orders integer := 0;
  canceled_deliveries integer := 0;
begin
  if not public.is_wayyaam_e2e_actor() then raise exception 'e2e_actor_required'; end if;

  select id into target_catalog_id from public.catalogs
  where slug = 'wayyaam-test-restaurant' and is_test is true;
  select id into target_driver_id from public.drivers
  where lower(email) = 'e2e.driver@wayyaam.ru' and is_test is true;
  if target_catalog_id is null or target_driver_id is null then raise exception 'e2e_fixture_missing'; end if;

  update public.deliveries delivery
  set status = 'canceled', updated_at = now()
  from public.orders order_row
  where order_row.id = delivery.order_id
    and order_row.catalog_id = target_catalog_id
    and order_row.is_test_order is true
    and delivery.status::text not in ('delivered', 'failed', 'canceled', 'cancelled');
  get diagnostics canceled_deliveries = row_count;

  update public.orders
  set status = 'canceled', cancellation_reason = 'e2e_preflight_cleanup', updated_at = now()
  where catalog_id = target_catalog_id and is_test_order is true
    and status::text not in ('completed', 'delivered', 'canceled', 'cancelled');
  get diagnostics canceled_orders = row_count;

  update public.drivers set is_active = true, is_online = true, status = 'online', updated_at = now()
  where id = target_driver_id and is_test is true;
  update public.catalogs set status = 'published', updated_at = now()
  where id = target_catalog_id and is_test is true;
  update public.restaurants
  set is_active = true, allow_delivery = true, allow_pickup = true, allow_dine_in = true, updated_at = now()
  where catalog_id = target_catalog_id and is_test is true;
  update public.restaurant_delivery_settings
  set enable_orders = true, enable_delivery = true, enable_pickup = true,
      enable_hall_orders = true, qr_required = true, updated_at = now()
  where catalog_id = target_catalog_id;
  update public.products set status = 'active', is_unlimited = true, updated_at = now()
  where catalog_id = target_catalog_id;

  return jsonb_build_object(
    'catalog_id', target_catalog_id,
    'driver_id', target_driver_id,
    'canceled_orders', canceled_orders,
    'canceled_deliveries', canceled_deliveries
  );
end;
$$;

revoke all on function public.reset_wayyaam_e2e_state() from public, anon;
grant execute on function public.reset_wayyaam_e2e_state() to authenticated;
