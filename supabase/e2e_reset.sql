-- Administrative preflight for the permanent WayYaam E2E fixture.
-- It never deletes accounts, the restaurant, the catalog, products, orders, or ledger rows.
do $$
declare
  target_catalog_id uuid;
  target_driver_id uuid;
begin
  select catalog.id into target_catalog_id
  from public.catalogs catalog
  where catalog.slug = 'wayyaam-test-restaurant' and catalog.is_test;
  select driver.id into target_driver_id
  from public.drivers driver
  where lower(driver.email) = 'e2e.driver@wayyaam.ru' and driver.is_test;
  if target_catalog_id is null or target_driver_id is null then
    raise exception 'e2e_fixture_missing';
  end if;

  update public.deliveries delivery
  set status = 'canceled', updated_at = now()
  from public.orders order_row
  where order_row.id = delivery.order_id
    and order_row.catalog_id = target_catalog_id
    and order_row.is_test_order
    and delivery.status not in ('delivered', 'failed', 'canceled', 'cancelled');

  update public.orders
  set status = 'canceled', cancellation_reason = 'e2e_preflight_cleanup', updated_at = now()
  where catalog_id = target_catalog_id
    and is_test_order
    and status not in ('completed', 'delivered', 'canceled', 'cancelled');

  update public.drivers
  set is_active = true, is_online = true, status = 'online', updated_at = now()
  where id = target_driver_id and is_test;
  update public.catalogs
  set status = 'published', updated_at = now()
  where id = target_catalog_id and is_test;
  update public.restaurants
  set is_active = true, allow_delivery = true, allow_pickup = true, allow_dine_in = true, updated_at = now()
  where catalog_id = target_catalog_id and is_test;
  update public.restaurant_delivery_settings
  set enable_orders = true, enable_delivery = true, enable_pickup = true,
      enable_hall_orders = true, qr_required = true, updated_at = now()
  where catalog_id = target_catalog_id;
  update public.products
  set status = 'active', is_unlimited = true, updated_at = now()
  where catalog_id = target_catalog_id;
end;
$$;
