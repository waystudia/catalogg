-- Checkout reserves the requested quantity. Picking must therefore reconcile
-- only the difference between requested and actually fulfilled quantity.
create or replace function public.reconcile_picked_catalog_order_item_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_record public.products%rowtype;
  reserved_quantity integer;
  fulfilled_quantity integer;
  stock_delta integer;
  remaining_stock integer;
begin
  if new.fulfillment_state <> 'picked'
    or old.fulfillment_state = 'picked'
    or new.product_id is null then
    return new;
  end if;

  reserved_quantity := greatest(coalesce(old.requested_quantity, old.quantity), 1);
  fulfilled_quantity := greatest(coalesce(new.fulfilled_quantity, reserved_quantity), 1);

  if new.sale_unit_snapshot = 'piece' and fulfilled_quantity <> reserved_quantity then
    raise exception 'piece_fulfilled_quantity_mismatch';
  end if;

  select product.*
  into product_record
  from public.products product
  where product.id = new.product_id
    and product.catalog_id = new.catalog_id
  for update;

  if product_record.id is null or product_record.is_unlimited then return new; end if;

  stock_delta := fulfilled_quantity - reserved_quantity;
  if stock_delta = 0 then return new; end if;
  if stock_delta > 0 and product_record.stock_quantity < stock_delta then
    raise exception 'fulfilled_quantity_stock_insufficient';
  end if;

  remaining_stock := product_record.stock_quantity - stock_delta;
  update public.products product
  set stock_quantity = remaining_stock,
      stock_count = case
        when product.sale_unit = 'weight'
          then pg_catalog.ceil(remaining_stock::numeric / 1000)::integer
        else remaining_stock
      end,
      status = case
        when remaining_stock < product.minimum_quantity
          then 'sold_out'::public.product_status
        when product.status = 'sold_out'::public.product_status
          then 'active'::public.product_status
        else product.status
      end,
      updated_at = pg_catalog.now()
  where product.id = product_record.id;

  return new;
end;
$$;

revoke all on function public.reconcile_picked_catalog_order_item_stock()
from public, anon, authenticated;

drop trigger if exists reconcile_picked_catalog_order_item_stock on public.order_items;
create trigger reconcile_picked_catalog_order_item_stock
after update of fulfillment_state, fulfilled_quantity on public.order_items
for each row
when (new.fulfillment_state = 'picked' and old.fulfillment_state is distinct from 'picked')
execute function public.reconcile_picked_catalog_order_item_stock();

-- "Нет в наличии" is a physical stock correction, not a cancellation. The
-- checkout reservation stays consumed and the affected SKU is hidden from new
-- orders until the store replenishes or corrects its balance.
create or replace function public.mark_unavailable_catalog_substitution_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_record public.order_items%rowtype;
begin
  select item.*
  into item_record
  from public.order_items item
  where item.id = new.original_order_item_id
    and item.order_id = new.order_id
    and item.catalog_id = new.catalog_id;

  if item_record.id is null or item_record.product_id is null then return new; end if;

  if item_record.variant_id is not null then
    update public.product_variants variant
    set stock_quantity = 0,
        status = 'sold_out'::public.product_status,
        updated_at = pg_catalog.now()
    where variant.id = item_record.variant_id
      and variant.product_id = item_record.product_id
      and variant.catalog_id = item_record.catalog_id;
  else
    update public.products product
    set stock_quantity = 0,
        stock_count = 0,
        status = 'sold_out'::public.product_status,
        updated_at = pg_catalog.now()
    where product.id = item_record.product_id
      and product.catalog_id = item_record.catalog_id;
  end if;

  return new;
end;
$$;

revoke all on function public.mark_unavailable_catalog_substitution_stock()
from public, anon, authenticated;

drop trigger if exists mark_unavailable_catalog_substitution_stock on public.order_substitution_requests;
create trigger mark_unavailable_catalog_substitution_stock
after insert on public.order_substitution_requests
for each row execute function public.mark_unavailable_catalog_substitution_stock();

-- A substitution is only reserved when the client accepts it. The immutable
-- replacement order line keeps historical pricing, while this trigger owns the
-- live product/variant stock change and rejects a stale offer atomically.
create or replace function public.reserve_accepted_catalog_substitution_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_record public.products%rowtype;
  variant_record public.product_variants%rowtype;
  remaining_stock integer;
begin
  if new.state <> 'accepted' or old.state = 'accepted' then return new; end if;

  select product.*
  into product_record
  from public.products product
  where product.id = new.proposed_product_id
    and product.catalog_id = new.catalog_id
  for update;

  if product_record.id is null then raise exception 'catalog_substitution_product_not_found'; end if;
  if product_record.status <> 'active'::public.product_status and not product_record.is_unlimited then
    raise exception 'catalog_substitution_stock_insufficient';
  end if;

  if new.proposed_variant_id is not null then
    select variant.*
    into variant_record
    from public.product_variants variant
    where variant.id = new.proposed_variant_id
      and variant.product_id = new.proposed_product_id
      and variant.catalog_id = new.catalog_id
    for update;

    if variant_record.id is null then raise exception 'catalog_substitution_variant_not_found'; end if;
    if variant_record.status <> 'active'::public.product_status and not variant_record.is_unlimited then
      raise exception 'catalog_substitution_stock_insufficient';
    end if;
    if not variant_record.is_unlimited then
      if variant_record.stock_quantity < new.proposed_quantity then
        raise exception 'catalog_substitution_stock_insufficient';
      end if;
      remaining_stock := variant_record.stock_quantity - new.proposed_quantity;
      update public.product_variants variant
      set stock_quantity = remaining_stock,
          status = case
            when remaining_stock = 0 then 'sold_out'::public.product_status
            when variant.status = 'sold_out'::public.product_status then 'active'::public.product_status
            else variant.status
          end,
          updated_at = pg_catalog.now()
      where variant.id = variant_record.id;
    else
      remaining_stock := variant_record.stock_quantity;
    end if;
  elsif not product_record.is_unlimited then
    if product_record.stock_quantity < new.proposed_quantity then
      raise exception 'catalog_substitution_stock_insufficient';
    end if;
    remaining_stock := product_record.stock_quantity - new.proposed_quantity;
    update public.products product
    set stock_quantity = remaining_stock,
        stock_count = case
          when product.sale_unit = 'weight'
            then pg_catalog.ceil(remaining_stock::numeric / 1000)::integer
          else remaining_stock
        end,
        status = case
          when remaining_stock < product.minimum_quantity
            then 'sold_out'::public.product_status
          when product.status = 'sold_out'::public.product_status
            then 'active'::public.product_status
          else product.status
        end,
        updated_at = pg_catalog.now()
    where product.id = product_record.id;
  else
    remaining_stock := product_record.stock_quantity;
  end if;

  return new;
end;
$$;

revoke all on function public.reserve_accepted_catalog_substitution_stock()
from public, anon, authenticated;

drop trigger if exists reserve_accepted_catalog_substitution_stock on public.order_substitution_requests;
create trigger reserve_accepted_catalog_substitution_stock
after update of state on public.order_substitution_requests
for each row
when (new.state = 'accepted' and old.state is distinct from 'accepted')
execute function public.reserve_accepted_catalog_substitution_stock();
