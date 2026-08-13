-- Grocery costs are private; selling prices remain on public products.
-- Receiving is posted atomically so document lines and stock cannot diverge.

create table if not exists public.catalog_inventory_items (
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  product_id uuid not null,
  cost_price integer not null default 0 check (cost_price >= 0),
  minimum_stock integer not null default 0 check (minimum_stock >= 0),
  updated_at timestamptz not null default now(),
  primary key (catalog_id, product_id),
  constraint catalog_inventory_items_catalog_product_fk
    foreign key (catalog_id, product_id)
    references public.products(catalog_id, id)
    on delete cascade
);

create table if not exists public.catalog_inventory_documents (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  document_type text not null check (document_type in ('receiving', 'writeoff', 'inventory', 'pos_sale')),
  status text not null default 'posted' check (status in ('draft', 'posted', 'cancelled')),
  supplier_name text not null default '',
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (catalog_id, id)
);

create table if not exists public.catalog_inventory_document_lines (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  document_id uuid not null,
  product_id uuid not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  unit_cost integer not null default 0 check (unit_cost >= 0),
  unit_price integer not null default 0 check (unit_price >= 0),
  stock_before integer not null check (stock_before >= 0),
  stock_after integer not null check (stock_after >= 0),
  created_at timestamptz not null default now(),
  constraint catalog_inventory_lines_catalog_document_fk
    foreign key (catalog_id, document_id)
    references public.catalog_inventory_documents(catalog_id, id)
    on delete cascade,
  constraint catalog_inventory_lines_catalog_product_fk
    foreign key (catalog_id, product_id)
    references public.products(catalog_id, id)
    on delete restrict
);

create index if not exists catalog_inventory_documents_catalog_created_idx
  on public.catalog_inventory_documents(catalog_id, created_at desc);
create index if not exists catalog_inventory_document_lines_catalog_product_idx
  on public.catalog_inventory_document_lines(catalog_id, product_id, created_at desc);

alter table public.catalog_inventory_items enable row level security;
alter table public.catalog_inventory_documents enable row level security;
alter table public.catalog_inventory_document_lines enable row level security;

drop policy if exists "inventory items members read" on public.catalog_inventory_items;
create policy "inventory items members read"
  on public.catalog_inventory_items for select
  to authenticated
  using (public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));

drop policy if exists "inventory items editors write" on public.catalog_inventory_items;
drop policy if exists "inventory items editors insert" on public.catalog_inventory_items;
create policy "inventory items editors insert"
  on public.catalog_inventory_items for insert
  to authenticated
  with check (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[]));

drop policy if exists "inventory items editors update" on public.catalog_inventory_items;
create policy "inventory items editors update"
  on public.catalog_inventory_items for update
  to authenticated
  using (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[]))
  with check (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[]));

drop policy if exists "inventory items editors delete" on public.catalog_inventory_items;
create policy "inventory items editors delete"
  on public.catalog_inventory_items for delete
  to authenticated
  using (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[]));

drop policy if exists "inventory documents members read" on public.catalog_inventory_documents;
create policy "inventory documents members read"
  on public.catalog_inventory_documents for select
  to authenticated
  using (public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));

drop policy if exists "inventory lines members read" on public.catalog_inventory_document_lines;
create policy "inventory lines members read"
  on public.catalog_inventory_document_lines for select
  to authenticated
  using (public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));

grant select on table
  public.catalog_inventory_items,
  public.catalog_inventory_documents,
  public.catalog_inventory_document_lines
to authenticated, service_role;

grant insert, update, delete on table public.catalog_inventory_items
to authenticated, service_role;

create or replace function public.post_catalog_receiving(
  target_catalog_id uuid,
  target_supplier_name text,
  target_note text,
  target_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_document_id uuid;
  line_item jsonb;
  target_product_id uuid;
  target_quantity integer;
  target_unit_cost integer;
  target_unit_price integer;
  target_minimum_stock integer;
  product_record record;
  quantity_before integer;
  quantity_after integer;
begin
  if (select auth.uid()) is null
     or not public.is_catalog_member(target_catalog_id, array['owner','admin','editor']::public.catalog_role[]) then
    raise exception 'Catalog inventory access denied';
  end if;

  if jsonb_typeof(target_lines) <> 'array'
     or jsonb_array_length(target_lines) = 0
     or jsonb_array_length(target_lines) > 500 then
    raise exception 'Receiving must contain between 1 and 500 lines';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(target_lines) value
    group by value->>'product_id'
    having count(*) > 1
  ) then
    raise exception 'Receiving cannot contain duplicate product lines';
  end if;

  insert into public.catalog_inventory_documents (
    catalog_id, document_type, status, supplier_name, note, created_by, posted_at
  ) values (
    target_catalog_id,
    'receiving',
    'posted',
    left(coalesce(trim(target_supplier_name), ''), 180),
    left(coalesce(trim(target_note), ''), 500),
    (select auth.uid()),
    now()
  ) returning id into created_document_id;

  for line_item in select value from jsonb_array_elements(target_lines)
  loop
    target_product_id := (line_item->>'product_id')::uuid;
    target_quantity := greatest(0, coalesce((line_item->>'quantity')::integer, 0));
    target_unit_cost := greatest(0, coalesce((line_item->>'unit_cost')::integer, 0));
    target_unit_price := greatest(0, coalesce((line_item->>'unit_price')::integer, 0));
    target_minimum_stock := greatest(0, coalesce((line_item->>'minimum_stock')::integer, 0));

    if target_quantity <= 0 then
      raise exception 'Receiving quantity must be positive';
    end if;

    select product.id, product.catalog_id, product.sale_unit, product.stock_quantity,
           product.stock_count, product.price, product.status
      into product_record
      from public.products product
      where product.id = target_product_id
        and product.catalog_id = target_catalog_id
      for update;

    if not found then
      raise exception 'Receiving product does not belong to this catalog';
    end if;

    quantity_before := greatest(0, coalesce(product_record.stock_quantity, product_record.stock_count, 0));
    quantity_after := quantity_before + target_quantity;

    update public.products product
    set stock_quantity = quantity_after,
        stock_count = case
          when product_record.sale_unit = 'weight' then ceil(quantity_after / 1000.0)::integer
          else quantity_after
        end,
        price = case when target_unit_price > 0 then target_unit_price else product.price end,
        status = case when product.status = 'sold_out' then 'active'::public.product_status else product.status end,
        updated_at = now()
    where product.id = target_product_id
      and product.catalog_id = target_catalog_id;

    insert into public.catalog_inventory_items (
      catalog_id, product_id, cost_price, minimum_stock, updated_at
    ) values (
      target_catalog_id, target_product_id, target_unit_cost, target_minimum_stock, now()
    )
    on conflict (catalog_id, product_id) do update
    set cost_price = excluded.cost_price,
        minimum_stock = excluded.minimum_stock,
        updated_at = now();

    insert into public.catalog_inventory_document_lines (
      catalog_id, document_id, product_id, quantity_delta,
      unit_cost, unit_price, stock_before, stock_after
    ) values (
      target_catalog_id, created_document_id, target_product_id, target_quantity,
      target_unit_cost,
      case when target_unit_price > 0 then target_unit_price else product_record.price end,
      quantity_before, quantity_after
    );
  end loop;

  insert into public.audit_logs (catalog_id, actor_id, action, entity_table, entity_id, payload)
  values (
    target_catalog_id,
    (select auth.uid()),
    'inventory.receiving.posted',
    'catalog_inventory_documents',
    created_document_id,
    jsonb_build_object('line_count', jsonb_array_length(target_lines))
  );

  return created_document_id;
end;
$$;

revoke all on function public.post_catalog_receiving(uuid, text, text, jsonb) from public, anon;
grant execute on function public.post_catalog_receiving(uuid, text, text, jsonb) to authenticated, service_role;
