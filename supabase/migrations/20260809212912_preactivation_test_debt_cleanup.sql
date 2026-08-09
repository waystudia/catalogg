create or replace function public.delete_restaurant_test_order(
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
  impacted_restaurant_ids uuid[];
  impacted_driver_ids uuid[];
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

  select client.id
  into target_client_id
  from public.orders order_row
  join public.clients client on client.catalog_id = order_row.catalog_id
  where order_row.id = target_order_id
    and order_row.catalog_id = target_catalog_id
    and order_row.is_test_order is true;

  if target_client_id is null then
    return false;
  end if;

  select
    array_agg(distinct ledger.account_id) filter (where ledger.account_type = 'restaurant'),
    array_agg(distinct ledger.account_id) filter (where ledger.account_type = 'driver')
  into impacted_restaurant_ids, impacted_driver_ids
  from public.billing_ledger_entries ledger
  where ledger.is_test is true
    and (
      ledger.order_id = target_order_id
      or ledger.delivery_id in (
        select delivery.id
        from public.deliveries delivery
        where delivery.order_id = target_order_id
      )
    );

  impacted_restaurant_ids := array_append(
    coalesce(impacted_restaurant_ids, '{}'::uuid[]),
    target_client_id
  );

  delete from public.billing_ledger_entries
  where is_test is true
    and (
      order_id = target_order_id
      or delivery_id in (
        select delivery.id
        from public.deliveries delivery
        where delivery.order_id = target_order_id
      )
    );

  update public.clients client
  set test_debt_amount = (
    select coalesce(sum(case when ledger.entry_type = 'charge' then ledger.amount else -ledger.amount end), 0)
    from public.billing_ledger_entries ledger
    where ledger.ledger_scope = 'platform_debt'
      and ledger.account_type = 'restaurant'
      and ledger.account_id = client.id
      and ledger.is_test is true
  )
  where client.id = any(impacted_restaurant_ids);

  update public.drivers driver
  set test_debt_amount = (
        select coalesce(sum(case when ledger.entry_type = 'charge' then ledger.amount else -ledger.amount end), 0)
        from public.billing_ledger_entries ledger
        where ledger.ledger_scope = 'platform_debt'
          and ledger.account_type = 'driver'
          and ledger.account_id = driver.id
          and ledger.is_test is true
      ),
      updated_at = now()
  where driver.id = any(coalesce(impacted_driver_ids, '{}'::uuid[]));

  delete from public.orders
  where id = target_order_id
    and catalog_id = target_catalog_id
    and is_test_order is true;

  return found;
end;
$$;

revoke all on function public.delete_restaurant_test_order(uuid, uuid) from public, anon, service_role;
grant execute on function public.delete_restaurant_test_order(uuid, uuid) to authenticated;
