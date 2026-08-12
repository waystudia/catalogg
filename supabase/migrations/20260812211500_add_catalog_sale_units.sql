alter table public.products
  add column if not exists barcode text not null default '',
  add column if not exists sale_unit text not null default 'piece',
  add column if not exists quantity_unit text not null default 'piece',
  add column if not exists price_basis_quantity integer not null default 1,
  add column if not exists minimum_quantity integer not null default 1,
  add column if not exists quantity_step integer not null default 1,
  add column if not exists stock_quantity integer,
  add column if not exists allow_substitution boolean not null default false;

update public.products
set stock_quantity = stock_count
where stock_quantity is null;

alter table public.products
  alter column stock_quantity set default 0,
  alter column stock_quantity set not null;

alter table public.products drop constraint if exists products_sale_unit_check;
alter table public.products
  add constraint products_sale_unit_check
  check (sale_unit in ('piece', 'weight'));

alter table public.products drop constraint if exists products_quantity_unit_check;
alter table public.products
  add constraint products_quantity_unit_check
  check (quantity_unit in ('piece', 'gram'));

alter table public.products drop constraint if exists products_sale_quantity_shape_check;
alter table public.products
  add constraint products_sale_quantity_shape_check
  check (
    (
      sale_unit = 'piece'
      and quantity_unit = 'piece'
      and price_basis_quantity = 1
      and minimum_quantity = 1
      and quantity_step = 1
    )
    or (
      sale_unit = 'weight'
      and quantity_unit = 'gram'
      and price_basis_quantity > 0
      and minimum_quantity > 0
      and quantity_step > 0
    )
  );

alter table public.products drop constraint if exists products_stock_quantity_check;
alter table public.products
  add constraint products_stock_quantity_check
  check (stock_quantity >= 0);

create unique index if not exists products_catalog_sku_unique_idx
  on public.products (catalog_id, lower(sku))
  where nullif(trim(sku), '') is not null;

create unique index if not exists products_catalog_barcode_unique_idx
  on public.products (catalog_id, lower(barcode))
  where nullif(trim(barcode), '') is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_catalog_id_id_key'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_catalog_id_id_key unique (catalog_id, id);
  end if;
end;
$$;

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  product_id uuid not null,
  title text not null,
  sku text not null default '',
  barcode text not null default '',
  status public.product_status not null default 'draft',
  price integer not null check (price >= 0),
  old_price integer check (old_price is null or old_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_unlimited boolean not null default false,
  attributes jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_catalog_product_fk
    foreign key (catalog_id, product_id)
    references public.products(catalog_id, id)
    on delete cascade,
  unique (catalog_id, id)
);

create index if not exists product_variants_catalog_product_sort_idx
  on public.product_variants(catalog_id, product_id, sort_order);

create unique index if not exists product_variants_catalog_sku_unique_idx
  on public.product_variants (catalog_id, lower(sku))
  where nullif(trim(sku), '') is not null;

create unique index if not exists product_variants_catalog_barcode_unique_idx
  on public.product_variants (catalog_id, lower(barcode))
  where nullif(trim(barcode), '') is not null;

alter table public.product_variants enable row level security;

drop policy if exists "product variants public read active" on public.product_variants;
create policy "product variants public read active"
on public.product_variants
for select
using (
  (
    status in ('active', 'sold_out')
    and public.is_catalog_published(catalog_id)
    and exists (
      select 1
      from public.products product
      where product.id = product_variants.product_id
        and product.catalog_id = product_variants.catalog_id
        and product.status in ('active', 'sold_out')
    )
  )
  or public.is_catalog_member(
    catalog_id,
    array['owner', 'admin', 'editor', 'viewer']::public.catalog_role[]
  )
);

drop policy if exists "product variants editor write" on public.product_variants;
create policy "product variants editor write"
on public.product_variants
for all
using (
  public.is_catalog_member(
    catalog_id,
    array['owner', 'admin', 'editor']::public.catalog_role[]
  )
)
with check (
  public.is_catalog_member(
    catalog_id,
    array['owner', 'admin', 'editor']::public.catalog_role[]
  )
);

grant select on table public.product_variants to anon, authenticated, service_role;
grant insert, update, delete on table public.product_variants to authenticated, service_role;

alter table public.order_items
  add column if not exists variant_id uuid,
  add column if not exists sku_snapshot text not null default '',
  add column if not exists sale_unit_snapshot text not null default 'piece',
  add column if not exists quantity_unit_snapshot text not null default 'piece',
  add column if not exists requested_quantity integer,
  add column if not exists fulfilled_quantity integer,
  add column if not exists price_basis_quantity_snapshot integer not null default 1,
  add column if not exists product_snapshot jsonb not null default '{}'::jsonb;

update public.order_items
set requested_quantity = greatest(quantity, 1)
where requested_quantity is null;

alter table public.order_items
  alter column requested_quantity set not null;

alter table public.order_items drop constraint if exists order_items_sale_unit_snapshot_check;
alter table public.order_items
  add constraint order_items_sale_unit_snapshot_check
  check (sale_unit_snapshot in ('piece', 'weight'));

alter table public.order_items drop constraint if exists order_items_quantity_unit_snapshot_check;
alter table public.order_items
  add constraint order_items_quantity_unit_snapshot_check
  check (quantity_unit_snapshot in ('piece', 'gram'));

alter table public.order_items drop constraint if exists order_items_requested_quantity_check;
alter table public.order_items
  add constraint order_items_requested_quantity_check
  check (requested_quantity > 0);

alter table public.order_items drop constraint if exists order_items_fulfilled_quantity_check;
alter table public.order_items
  add constraint order_items_fulfilled_quantity_check
  check (fulfilled_quantity is null or fulfilled_quantity >= 0);

alter table public.order_items drop constraint if exists order_items_price_basis_quantity_snapshot_check;
alter table public.order_items
  add constraint order_items_price_basis_quantity_snapshot_check
  check (price_basis_quantity_snapshot > 0);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'order_items_catalog_variant_fk'
      and conrelid = 'public.order_items'::regclass
  ) then
    alter table public.order_items
      add constraint order_items_catalog_variant_fk
      foreign key (catalog_id, variant_id)
      references public.product_variants(catalog_id, id)
      on delete set null (variant_id);
  end if;
end;
$$;

create or replace function public.fill_order_item_sale_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  product_record public.products%rowtype;
  variant_record public.product_variants%rowtype;
begin
  if new.product_id is null then
    if new.requested_quantity is null then
      new.requested_quantity := greatest(new.quantity, 1);
    end if;
    return new;
  end if;

  select * into product_record
  from public.products product
  where product.id = new.product_id
    and product.catalog_id = new.catalog_id;

  if product_record.id is null then
    raise exception 'order_item_product_catalog_mismatch';
  end if;

  if new.variant_id is not null then
    select * into variant_record
    from public.product_variants variant
    where variant.id = new.variant_id
      and variant.product_id = new.product_id
      and variant.catalog_id = new.catalog_id;

    if variant_record.id is null then
      raise exception 'order_item_variant_catalog_mismatch';
    end if;
  end if;

  new.sku_snapshot := coalesce(nullif(variant_record.sku, ''), product_record.sku, '');
  new.sale_unit_snapshot := product_record.sale_unit;
  new.quantity_unit_snapshot := product_record.quantity_unit;
  new.price_basis_quantity_snapshot := product_record.price_basis_quantity;

  if new.requested_quantity is null then
    if product_record.sale_unit = 'weight' then
      raise exception 'weighted_requested_quantity_required';
    end if;
    new.requested_quantity := greatest(new.quantity, 1);
  end if;

  new.product_snapshot := jsonb_build_object(
    'product_id', product_record.id,
    'title', product_record.title,
    'sku', coalesce(nullif(variant_record.sku, ''), product_record.sku, ''),
    'barcode', coalesce(nullif(variant_record.barcode, ''), product_record.barcode, ''),
    'variant_id', variant_record.id,
    'variant_title', variant_record.title,
    'sale_unit', product_record.sale_unit,
    'quantity_unit', product_record.quantity_unit,
    'price_basis_quantity', product_record.price_basis_quantity,
    'unit_price', new.unit_price
  );

  return new;
end;
$$;

drop trigger if exists fill_order_item_sale_snapshot on public.order_items;
create trigger fill_order_item_sale_snapshot
before insert on public.order_items
for each row execute function public.fill_order_item_sale_snapshot();
