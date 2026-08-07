-- Turn the permanent E2E fixture into a production-parity copy of Mangal while
-- retaining its own auth identities, test flags, ledgers and order history.
do $$
declare
  source_catalog_id uuid;
  target_catalog_id uuid;
  source_restaurant_id uuid;
  target_restaurant_id uuid;
begin
  select id into source_catalog_id from public.catalogs where slug = 'mangal' and is_test is not true;
  select id into target_catalog_id from public.catalogs where slug = 'wayyaam-test-restaurant' and is_test is true;

  if source_catalog_id is null or target_catalog_id is null then
    raise notice 'Mangal or permanent E2E fixture is absent; clone skipped';
    return;
  end if;

  update public.catalogs target
  set name = 'Мангал тест',
      description = source.description,
      status = 'published',
      logo_url = source.logo_url,
      banner_url = source.banner_url,
      address = source.address,
      map_url = source.map_url,
      whatsapp = '+79000000002',
      instagram_url = '',
      currency = source.currency,
      language = source.language,
      timezone = source.timezone,
      order_settings = source.order_settings,
      booking_settings = source.booking_settings,
      seo = source.seo,
      pwa = source.pwa,
      business_type = source.business_type,
      template_type = source.template_type,
      is_template = false,
      template_name = null,
      is_test = true,
      updated_at = now()
  from public.catalogs source
  where target.id = target_catalog_id and source.id = source_catalog_id;

  update public.catalog_sections target
  set title = source.title,
      enabled = source.enabled,
      sort_order = source.sort_order,
      settings = source.settings
  from public.catalog_sections source
  where source.catalog_id = source_catalog_id
    and target.catalog_id = target_catalog_id
    and target.key = source.key;

  insert into public.catalog_sections (catalog_id, key, title, enabled, sort_order, settings)
  select target_catalog_id, source.key, source.title, source.enabled, source.sort_order, source.settings
  from public.catalog_sections source
  where source.catalog_id = source_catalog_id
    and not exists (
      select 1 from public.catalog_sections target
      where target.catalog_id = target_catalog_id and target.key = source.key
    );

  update public.catalog_sections target set enabled = false
  where target.catalog_id = target_catalog_id
    and not exists (
      select 1 from public.catalog_sections source
      where source.catalog_id = source_catalog_id and source.key = target.key
    );

  update public.catalog_theme_settings target
  set settings = source.settings, updated_at = now()
  from public.catalog_theme_settings source
  where target.catalog_id = target_catalog_id and source.catalog_id = source_catalog_id;

  insert into public.catalog_theme_settings (catalog_id, settings, updated_at)
  select target_catalog_id, source.settings, now()
  from public.catalog_theme_settings source
  where source.catalog_id = source_catalog_id
    and not exists (select 1 from public.catalog_theme_settings where catalog_id = target_catalog_id);

  insert into public.categories (
    catalog_id, parent_id, name, slug, description, image_url, icon, is_hidden, sort_order, created_at, updated_at
  )
  select target_catalog_id, null, source.name, source.slug, source.description, source.image_url,
         source.icon, source.is_hidden, source.sort_order, now(), now()
  from public.categories source
  where source.catalog_id = source_catalog_id
  on conflict (catalog_id, slug) do update set
    name = excluded.name, description = excluded.description, image_url = excluded.image_url,
    icon = excluded.icon, is_hidden = excluded.is_hidden, sort_order = excluded.sort_order,
    updated_at = now();

  update public.categories target
  set parent_id = target_parent.id
  from public.categories source
  left join public.categories source_parent on source_parent.id = source.parent_id
  left join public.categories target_parent
    on target_parent.catalog_id = target_catalog_id and target_parent.slug = source_parent.slug
  where source.catalog_id = source_catalog_id
    and target.catalog_id = target_catalog_id
    and target.slug = source.slug;

  update public.categories target set is_hidden = true, updated_at = now()
  where target.catalog_id = target_catalog_id
    and not exists (
      select 1 from public.categories source
      where source.catalog_id = source_catalog_id and source.slug = target.slug
    );

  insert into public.products (
    catalog_id, category_id, title, slug, sku, status, price, old_price, cost_price,
    description, ingredients, weight, serving, stock_count, is_unlimited, is_popular,
    is_new, is_promo, seo, custom_fields, sort_order, created_at, updated_at
  )
  select target_catalog_id, target_category.id, source.title, source.slug, source.sku,
         source.status, source.price, source.old_price, source.cost_price, source.description,
         source.ingredients, source.weight, source.serving, source.stock_count, source.is_unlimited,
         source.is_popular, source.is_new, source.is_promo, source.seo, source.custom_fields,
         source.sort_order, now(), now()
  from public.products source
  left join public.categories source_category on source_category.id = source.category_id
  left join public.categories target_category
    on target_category.catalog_id = target_catalog_id and target_category.slug = source_category.slug
  where source.catalog_id = source_catalog_id
  on conflict (catalog_id, slug) do update set
    category_id = excluded.category_id, title = excluded.title, sku = excluded.sku,
    status = excluded.status, price = excluded.price, old_price = excluded.old_price,
    cost_price = excluded.cost_price, description = excluded.description,
    ingredients = excluded.ingredients, weight = excluded.weight, serving = excluded.serving,
    stock_count = excluded.stock_count, is_unlimited = excluded.is_unlimited,
    is_popular = excluded.is_popular, is_new = excluded.is_new, is_promo = excluded.is_promo,
    seo = excluded.seo, custom_fields = excluded.custom_fields, sort_order = excluded.sort_order,
    updated_at = now();

  update public.products target set status = 'archived', updated_at = now()
  where target.catalog_id = target_catalog_id
    and not exists (
      select 1 from public.products source
      where source.catalog_id = source_catalog_id and source.slug = target.slug
    );

  delete from public.product_images target
  using public.products product
  where target.product_id = product.id
    and product.catalog_id = target_catalog_id
    and exists (
      select 1 from public.products source
      where source.catalog_id = source_catalog_id and source.slug = product.slug
    );

  insert into public.product_images (catalog_id, product_id, url, alt, sort_order)
  select target_catalog_id, target_product.id, image.url, image.alt, image.sort_order
  from public.product_images image
  join public.products source_product on source_product.id = image.product_id
  join public.products target_product
    on target_product.catalog_id = target_catalog_id and target_product.slug = source_product.slug
  where source_product.catalog_id = source_catalog_id;

  select id into source_restaurant_id from public.restaurants where catalog_id = source_catalog_id;
  select id into target_restaurant_id from public.restaurants where catalog_id = target_catalog_id;

  update public.restaurants target
  set name = 'Мангал тест',
      description = source.description,
      city_id = source.city_id,
      logo_url = source.logo_url,
      cover_url = source.cover_url,
      rating = source.rating,
      min_order_amount = source.min_order_amount,
      free_delivery_from = source.free_delivery_from,
      delivery_time_from = source.delivery_time_from,
      delivery_time_to = source.delivery_time_to,
      delivery_provider = source.delivery_provider,
      allow_dine_in = source.allow_dine_in,
      allow_pickup = source.allow_pickup,
      allow_delivery = source.allow_delivery,
      is_active = true,
      theme_id = source.theme_id,
      address_line = source.address_line,
      lat = source.lat,
      lng = source.lng,
      is_test = true,
      updated_at = now()
  from public.restaurants source
  where target.id = target_restaurant_id and source.id = source_restaurant_id;

  update public.restaurant_delivery_settings target
  set enable_orders = source.enable_orders,
      enable_delivery = source.enable_delivery,
      enable_pickup = source.enable_pickup,
      enable_hall_orders = source.enable_hall_orders,
      use_own_courier = source.use_own_courier,
      use_platform_drivers = source.use_platform_drivers,
      own_courier_wait_minutes = source.own_courier_wait_minutes,
      fallback_to_platform_drivers = source.fallback_to_platform_drivers,
      qr_required = true,
      minimum_order_amount = source.minimum_order_amount,
      free_delivery_from = source.free_delivery_from,
      default_preparation_minutes = source.default_preparation_minutes,
      delivery_radius_km = source.delivery_radius_km,
      delivery_hours_start = source.delivery_hours_start,
      delivery_hours_end = source.delivery_hours_end,
      out_of_hours_mode = source.out_of_hours_mode,
      delivery_area_mode = source.delivery_area_mode,
      primary_city = source.primary_city,
      service_settlements = source.service_settlements,
      updated_at = now()
  from public.restaurant_delivery_settings source
  where target.catalog_id = target_catalog_id and source.catalog_id = source_catalog_id;

  update public.restaurant_modules target
  set package_code = source.package_code,
      pos_enabled = source.pos_enabled,
      warehouse_enabled = source.warehouse_enabled,
      recipes_enabled = source.recipes_enabled,
      finance_enabled = source.finance_enabled,
      promotions_enabled = source.promotions_enabled,
      loyalty_enabled = source.loyalty_enabled,
      max_cashiers = source.max_cashiers,
      max_devices = source.max_devices,
      max_locations = source.max_locations,
      max_warehouses = source.max_warehouses,
      updated_at = now()
  from public.restaurant_modules source
  where target.catalog_id = target_catalog_id and source.catalog_id = source_catalog_id;

  -- Keep E2E auth, contact details, debt, payout data and live location isolated.
  update public.drivers target
  set name = 'Дукат тест',
      vehicle_info = source.vehicle_info,
      city_id = source.city_id,
      photo_url = source.photo_url,
      rating = source.rating,
      city_name = source.city_name,
      service_settlements = source.service_settlements,
      max_active_deliveries = source.max_active_deliveries,
      is_active = true,
      is_online = true,
      status = 'online',
      is_test = true,
      updated_at = now()
  from public.drivers source
  where target.id = 'ad684470-11b9-4b52-ba45-c002b487da87'
    and source.id = '734d6501-03ad-497d-809d-1c99f8448ff4';

  -- The test address follows the cloned restaurant's service area without using
  -- a private residence or copying a production customer's address.
  update public.client_addresses
  set address_line = 'Тестовая доставка WayYaam', lat = 43.247359, lng = 45.980500,
      accuracy_m = 10, is_test = true, updated_at = now()
  where user_id = '01c46094-0007-4fa1-9670-3ab0b2dbacec' and title = 'Тестовый адрес';
end
$$;

-- Preserve the cloned menu on reset: legacy fixture products stay archived,
-- while products in the copied visible Mangal categories are made available.
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
  update public.products product
  set status = 'active', is_unlimited = true, updated_at = now()
  where product.catalog_id = target_catalog_id
    and exists (
      select 1 from public.categories category
      where category.id = product.category_id and category.is_hidden is false
    );

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
