create or replace function public.hydrate_grocery_business_from_template(
  target_catalog_id uuid,
  source_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_catalog public.catalogs%rowtype;
  source_catalog public.catalogs%rowtype;
  target_client public.clients%rowtype;
  resolved_primary_city text;
  resolved_settlements text[];
  hydrated_products integer := 0;
begin
  if not (
    public.is_platform_admin()
    or coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') = 'service_role'
  ) then
    raise exception 'platform_admin_required';
  end if;

  select catalog.* into target_catalog
  from public.catalogs catalog
  where catalog.id = target_catalog_id and catalog.is_template = false
  for update;

  select catalog.* into source_catalog
  from public.catalogs catalog
  where catalog.id = source_template_id and catalog.is_template = true
  for share;

  if target_catalog.id is null or source_catalog.id is null then
    raise exception 'grocery_hydration_catalog_not_found';
  end if;
  if target_catalog.business_type <> 'grocery' or source_catalog.business_type <> 'grocery' then
    raise exception 'grocery_hydration_type_mismatch';
  end if;

  select client.* into target_client
  from public.clients client
  where client.catalog_id = target_catalog_id
  for update;
  if target_client.id is null then raise exception 'grocery_hydration_client_not_found'; end if;

  update public.products target_product
  set barcode = source_product.barcode,
      sale_unit = source_product.sale_unit,
      quantity_unit = source_product.quantity_unit,
      price_basis_quantity = source_product.price_basis_quantity,
      minimum_quantity = source_product.minimum_quantity,
      quantity_step = source_product.quantity_step,
      stock_quantity = source_product.stock_quantity,
      stock_count = source_product.stock_count,
      allow_substitution = source_product.allow_substitution,
      updated_at = pg_catalog.now()
  from public.products source_product
  where target_product.catalog_id = target_catalog_id
    and source_product.catalog_id = source_template_id
    and target_product.slug = source_product.slug;
  get diagnostics hydrated_products = row_count;
  if hydrated_products = 0 then raise exception 'grocery_hydration_products_missing'; end if;

  resolved_primary_city := coalesce(nullif(pg_catalog.btrim(target_client.primary_city), ''), 'Цоци-Юрт');
  resolved_settlements := case
    when pg_catalog.cardinality(target_client.service_settlements) > 0 then target_client.service_settlements
    else array[resolved_primary_city]::text[]
  end;

  insert into public.restaurant_delivery_settings (
    catalog_id, enable_orders, enable_delivery, enable_pickup, enable_hall_orders,
    use_own_courier, use_platform_drivers, fallback_to_platform_drivers,
    minimum_order_amount, free_delivery_from, default_preparation_minutes,
    delivery_area_mode, primary_city, service_settlements
  )
  select
    target_catalog_id, true, source.enable_delivery, source.enable_pickup, false,
    false, true, true, source.minimum_order_amount, source.free_delivery_from,
    source.default_preparation_minutes, 'settlements', resolved_primary_city, resolved_settlements
  from public.restaurant_delivery_settings source
  where source.catalog_id = source_template_id
  on conflict (catalog_id) do update set
    enable_orders = excluded.enable_orders,
    enable_delivery = excluded.enable_delivery,
    enable_pickup = excluded.enable_pickup,
    enable_hall_orders = excluded.enable_hall_orders,
    use_own_courier = excluded.use_own_courier,
    use_platform_drivers = excluded.use_platform_drivers,
    fallback_to_platform_drivers = excluded.fallback_to_platform_drivers,
    minimum_order_amount = excluded.minimum_order_amount,
    free_delivery_from = excluded.free_delivery_from,
    default_preparation_minutes = excluded.default_preparation_minutes,
    delivery_area_mode = excluded.delivery_area_mode,
    primary_city = excluded.primary_city,
    service_settlements = excluded.service_settlements,
    updated_at = pg_catalog.now();

  insert into public.restaurants (
    catalog_id, name, slug, description, logo_url, cover_url,
    min_order_amount, free_delivery_from, delivery_time_from, delivery_time_to,
    delivery_provider, allow_dine_in, allow_pickup, allow_delivery, is_active, address_line
  ) values (
    target_catalog_id, target_catalog.name, target_catalog.slug, target_catalog.description,
    target_catalog.logo_url, target_catalog.banner_url, 500, 2000, 35, 50,
    'platform', false, true, true, true, resolved_primary_city
  )
  on conflict (slug) do update set
    catalog_id = excluded.catalog_id,
    name = excluded.name,
    description = excluded.description,
    logo_url = excluded.logo_url,
    cover_url = excluded.cover_url,
    min_order_amount = excluded.min_order_amount,
    free_delivery_from = excluded.free_delivery_from,
    delivery_time_from = excluded.delivery_time_from,
    delivery_time_to = excluded.delivery_time_to,
    delivery_provider = excluded.delivery_provider,
    allow_dine_in = excluded.allow_dine_in,
    allow_pickup = excluded.allow_pickup,
    allow_delivery = excluded.allow_delivery,
    is_active = excluded.is_active,
    address_line = excluded.address_line,
    updated_at = pg_catalog.now();

  insert into public.restaurant_payments (
    restaurant_id, enable_transfer, allow_cash, require_confirmation, comment
  ) values (
    target_catalog_id, false, true, false, 'Оплата продуктов при получении'
  )
  on conflict (restaurant_id) do update set
    allow_cash = true,
    require_confirmation = false,
    comment = excluded.comment,
    updated_at = pg_catalog.now();

  update public.catalogs catalog
  set status = case when target_client.status = 'active'
        then 'published'::public.catalog_status else 'draft'::public.catalog_status end,
      updated_at = pg_catalog.now()
  where catalog.id = target_catalog_id;

  insert into public.audit_logs (catalog_id, actor_id, action, entity_table, entity_id, payload)
  values (
    target_catalog_id, (select auth.uid()), 'grocery.template_hydrated', 'catalogs', target_catalog_id,
    pg_catalog.jsonb_build_object(
      'source_template_id', source_template_id,
      'products', hydrated_products,
      'primary_city', resolved_primary_city
    )
  );

  return pg_catalog.jsonb_build_object(
    'catalogId', target_catalog_id,
    'products', hydrated_products,
    'published', target_client.status = 'active'
  );
end;
$$;

revoke all on function public.hydrate_grocery_business_from_template(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.hydrate_grocery_business_from_template(uuid, uuid)
to service_role;
