create or replace function public.apply_catalog_variant_price_to_order_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_name text := nullif(trim(new.options #>> '{0,name}'), '');
  settings_product_id text;
  resolved_price integer;
begin
  if selected_name is null then
    return new;
  end if;

  if new.product_id is not null then
    settings_product_id := new.product_id::text;
  else
    settings_product_id := nullif(trim(new.options #>> '{0,product_id}'), '');

    if settings_product_id is null or not exists (
      select 1
      from public.product legacy_product
      where legacy_product.id = settings_product_id
        and legacy_product.title = new.title
        and legacy_product.price = new.unit_price
    ) then
      return new;
    end if;
  end if;

  select (choice.value ->> 'price')::integer
    into resolved_price
    from public.catalog_sections section
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(section.settings -> settings_product_id) = 'array'
          then section.settings -> settings_product_id
        else '[]'::jsonb
      end
    ) as choice(value)
    where section.catalog_id = new.catalog_id
      and section.key = 'product-choices'
      and jsonb_typeof(choice.value) = 'object'
      and trim(choice.value ->> 'name') = selected_name
      and coalesce(choice.value ->> 'price', '') ~ '^[0-9]+$'
      and (choice.value ->> 'price')::integer > 0
    limit 1;

  if resolved_price is not null then
    new.unit_price := resolved_price;
    new.line_total := resolved_price * new.quantity;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_catalog_variant_price_before_insert on public.order_items;
create trigger apply_catalog_variant_price_before_insert
before insert on public.order_items
for each row
execute function public.apply_catalog_variant_price_to_order_item();

create or replace function public.recalculate_order_total_after_variant_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  computed_subtotal integer;
begin
  select coalesce(sum(item.line_total), 0)
    into computed_subtotal
    from public.order_items item
    where item.order_id = new.order_id;

  update public.orders
  set subtotal = computed_subtotal,
      total = computed_subtotal + coalesce(delivery_fee, 0)
  where id = new.order_id;

  return null;
end;
$$;

drop trigger if exists recalculate_order_total_after_variant_price on public.order_items;
create constraint trigger recalculate_order_total_after_variant_price
after insert on public.order_items
deferrable initially deferred
for each row
execute function public.recalculate_order_total_after_variant_price();

revoke execute on function public.apply_catalog_variant_price_to_order_item() from public, anon, authenticated;
revoke execute on function public.recalculate_order_total_after_variant_price() from public, anon, authenticated;
