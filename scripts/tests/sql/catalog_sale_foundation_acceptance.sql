\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.product_variants') is null then
    raise exception 'product variants table missing';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'order_items'
      and column_name = 'requested_quantity'
  ) then
    raise exception 'order item sale snapshots missing';
  end if;
end;
$$;

insert into public.products (
  id,
  catalog_id,
  title,
  slug,
  sku,
  barcode,
  status,
  price,
  sale_unit,
  quantity_unit,
  price_basis_quantity,
  minimum_quantity,
  quantity_step,
  stock_count,
  stock_quantity,
  is_unlimited,
  allow_substitution
)
select
  '00000000-0000-4000-8000-000000000301',
  catalog.id,
  'Финики Меджул',
  'dates-medjoul',
  'DATES-MEDJOUL',
  '4601234567890',
  'active',
  289,
  'weight',
  'gram',
  1000,
  100,
  50,
  13,
  12500,
  false,
  true
from public.catalogs catalog
where catalog.slug = 'finiki-ci';

insert into public.products (
  id,
  catalog_id,
  title,
  slug,
  sku,
  barcode,
  status,
  price,
  stock_count,
  stock_quantity
)
select
  '00000000-0000-4000-8000-000000000302',
  catalog.id,
  'Молоко 1 л',
  'milk-1l',
  'MILK-1L',
  '4601234567001',
  'active',
  120,
  8,
  8
from public.catalogs catalog
where catalog.slug = 'finiki-ci';

do $$
begin
  begin
    insert into public.products (
      catalog_id, title, slug, sku, status, price, stock_count, stock_quantity
    )
    select catalog.id, 'Duplicate SKU', 'duplicate-sku', 'milk-1l', 'active', 100, 1, 1
    from public.catalogs catalog
    where catalog.slug = 'finiki-ci';
    raise exception 'expected_duplicate_sku_rejection';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.products (
      catalog_id,
      title,
      slug,
      status,
      price,
      sale_unit,
      quantity_unit,
      price_basis_quantity,
      minimum_quantity,
      quantity_step,
      stock_count,
      stock_quantity
    )
    select catalog.id, 'Broken weight', 'broken-weight', 'active', 100,
      'weight', 'piece', 1000, 100, 50, 1, 1000
    from public.catalogs catalog
    where catalog.slug = 'finiki-ci';
    raise exception 'expected_sale_shape_rejection';
  exception
    when check_violation then null;
  end;
end;
$$;

insert into public.product_variants (
  id,
  catalog_id,
  product_id,
  title,
  sku,
  barcode,
  status,
  price,
  stock_quantity
)
select
  '00000000-0000-4000-8000-000000000311',
  product.catalog_id,
  product.id,
  'Упаковка 1 л',
  'MILK-1L-PACK',
  '4601234567018',
  'active',
  120,
  8
from public.products product
where product.id = '00000000-0000-4000-8000-000000000302';

do $$
begin
  begin
    insert into public.product_variants (
      catalog_id, product_id, title, sku, status, price, stock_quantity
    )
    select
      other_catalog.id,
      '00000000-0000-4000-8000-000000000302',
      'Cross tenant variant',
      'CROSS-TENANT',
      'active',
      100,
      1
    from public.catalogs other_catalog
    where other_catalog.slug = 'other-grocery-ci';
    raise exception 'expected_cross_tenant_variant_rejection';
  exception
    when foreign_key_violation then null;
  end;
end;
$$;

set role anon;

do $$
begin
  if exists (
    select 1
    from public.product_variants
    where id = '00000000-0000-4000-8000-000000000311'
  ) then
    raise exception 'anonymous user can see a variant from a draft grocery';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', false);
set role authenticated;

do $$
begin
  if not exists (
    select 1
    from public.product_variants
    where id = '00000000-0000-4000-8000-000000000311'
  ) then
    raise exception 'grocery owner cannot read own product variant';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

insert into public.orders (id, catalog_id, customer_name, customer_phone)
select
  '00000000-0000-4000-8000-000000000321',
  catalog.id,
  'Test client',
  '+79990000001'
from public.catalogs catalog
where catalog.slug = 'finiki-ci';

insert into public.order_items (
  id,
  catalog_id,
  order_id,
  product_id,
  variant_id,
  title,
  quantity,
  unit_price,
  line_total
)
select
  '00000000-0000-4000-8000-000000000322',
  product.catalog_id,
  '00000000-0000-4000-8000-000000000321',
  product.id,
  '00000000-0000-4000-8000-000000000311',
  product.title,
  3,
  120,
  360
from public.products product
where product.id = '00000000-0000-4000-8000-000000000302';

insert into public.order_items (
  id,
  catalog_id,
  order_id,
  product_id,
  title,
  quantity,
  unit_price,
  requested_quantity,
  line_total
)
select
  '00000000-0000-4000-8000-000000000323',
  product.catalog_id,
  '00000000-0000-4000-8000-000000000321',
  product.id,
  product.title,
  1,
  289,
  350,
  101
from public.products product
where product.id = '00000000-0000-4000-8000-000000000301';

do $$
begin
  if not exists (
    select 1
    from public.order_items
    where id = '00000000-0000-4000-8000-000000000322'
      and requested_quantity = 3
      and sale_unit_snapshot = 'piece'
      and quantity_unit_snapshot = 'piece'
      and price_basis_quantity_snapshot = 1
      and sku_snapshot = 'MILK-1L-PACK'
      and product_snapshot ->> 'title' = 'Молоко 1 л'
  ) then
    raise exception 'piece order snapshot is incomplete';
  end if;

  if not exists (
    select 1
    from public.order_items
    where id = '00000000-0000-4000-8000-000000000323'
      and requested_quantity = 350
      and sale_unit_snapshot = 'weight'
      and quantity_unit_snapshot = 'gram'
      and price_basis_quantity_snapshot = 1000
      and sku_snapshot = 'DATES-MEDJOUL'
      and line_total = 101
  ) then
    raise exception 'weighted order snapshot is incomplete';
  end if;
end;
$$;

update public.products
set title = 'Финики после редактирования',
    price = 399
where id = '00000000-0000-4000-8000-000000000301';

do $$
begin
  if not exists (
    select 1
    from public.order_items
    where id = '00000000-0000-4000-8000-000000000323'
      and title = 'Финики Меджул'
      and unit_price = 289
      and line_total = 101
      and product_snapshot ->> 'title' = 'Финики Меджул'
  ) then
    raise exception 'catalog edit rewrote the historical weighted line';
  end if;
end;
$$;

\echo 'Catalog sale foundation acceptance passed.'
