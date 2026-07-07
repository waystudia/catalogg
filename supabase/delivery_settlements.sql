alter table public.clients
  add column if not exists primary_city text not null default '',
  add column if not exists service_settlements text[] not null default '{}';

alter table public.restaurant_delivery_settings
  add column if not exists delivery_area_mode text not null default 'radius'
    check (delivery_area_mode in ('radius', 'settlements', 'hybrid')),
  add column if not exists primary_city text not null default '',
  add column if not exists service_settlements text[] not null default '{}';

alter table public.orders
  add column if not exists delivery_city text not null default '',
  add column if not exists delivery_settlement text not null default '';

alter table public.delivery_tasks
  add column if not exists city text not null default '',
  add column if not exists settlement text not null default '';

create or replace function public.create_public_restaurant_order(
  target_catalog_id uuid,
  customer_name text,
  customer_phone text,
  fulfillment_type text,
  cabin_label text,
  delivery_address text,
  delivery_city text,
  delivery_settlement text,
  client_address_comment text,
  comment text,
  items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  created_order_id uuid;
  item jsonb;
  product_record record;
  item_quantity integer;
  line_total integer;
  computed_subtotal integer := 0;
  verification_code text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  if not exists (select 1 from public.catalogs where id = target_catalog_id) then
    raise exception 'Catalog does not exist';
  end if;

  if fulfillment_type not in ('hall', 'takeaway', 'delivery') then
    raise exception 'Unsupported fulfillment type';
  end if;

  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Order items are required';
  end if;

  insert into public.orders (
    catalog_id,
    customer_name,
    customer_phone,
    comment,
    table_label,
    fulfillment_type,
    cabin_label,
    delivery_address,
    delivery_city,
    delivery_settlement,
    client_address_comment,
    verification_code,
    qr_token,
    qr_expires_at
  )
  values (
    target_catalog_id,
    coalesce(nullif(trim(customer_name), ''), 'Guest'),
    coalesce(nullif(trim(customer_phone), ''), ''),
    coalesce(comment, ''),
    coalesce(cabin_label, ''),
    fulfillment_type,
    coalesce(cabin_label, ''),
    coalesce(delivery_address, ''),
    coalesce(delivery_city, ''),
    coalesce(delivery_settlement, ''),
    coalesce(client_address_comment, ''),
    verification_code,
    encode(gen_random_bytes(24), 'hex'),
    now() + interval '24 hours'
  )
  returning id into created_order_id;

  for item in select * from jsonb_array_elements(items)
  loop
    item_quantity := greatest(1, coalesce((item->>'quantity')::integer, 1));

    select id, title, price, stock_count, is_unlimited
      into product_record
      from public.products
      where id = (item->>'product_id')::uuid
        and catalog_id = target_catalog_id
        and status = 'active'
      for update;

    if not found then
      raise exception 'Product is not available';
    end if;

    if not product_record.is_unlimited and product_record.stock_count < item_quantity then
      raise exception 'Product stock is not enough';
    end if;

    line_total := product_record.price * item_quantity;
    computed_subtotal := computed_subtotal + line_total;

    insert into public.order_items (
      catalog_id, order_id, product_id, title, quantity, unit_price, options, line_total
    )
    values (
      target_catalog_id,
      created_order_id,
      product_record.id,
      product_record.title,
      item_quantity,
      product_record.price,
      coalesce(item->'options', '[]'::jsonb),
      line_total
    );

    if not product_record.is_unlimited then
      update public.products
      set stock_count = stock_count - item_quantity,
          status = case when stock_count - item_quantity <= 0 then 'sold_out'::public.product_status else status end
      where id = product_record.id;
    end if;
  end loop;

  update public.orders
  set subtotal = computed_subtotal,
      total = computed_subtotal
  where id = created_order_id;

  return created_order_id;
end;
$$;

grant execute on function public.create_public_restaurant_order(uuid, text, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;

create or replace function public.create_legacy_public_restaurant_order(
  target_catalog_id uuid,
  customer_name text,
  customer_phone text,
  fulfillment_type text,
  cabin_label text,
  delivery_address text,
  delivery_city text,
  delivery_settlement text,
  client_address_comment text,
  comment text,
  items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  created_order_id uuid;
  item jsonb;
  legacy_product record;
  item_quantity integer;
  line_total integer;
  computed_subtotal integer := 0;
  verification_code text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  if not exists (select 1 from public.catalogs where id = target_catalog_id) then
    raise exception 'Catalog does not exist';
  end if;

  if fulfillment_type not in ('hall', 'takeaway', 'delivery') then
    raise exception 'Unsupported fulfillment type';
  end if;

  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Order items are required';
  end if;

  insert into public.orders (
    catalog_id,
    customer_name,
    customer_phone,
    comment,
    table_label,
    fulfillment_type,
    cabin_label,
    delivery_address,
    delivery_city,
    delivery_settlement,
    client_address_comment,
    verification_code,
    qr_token,
    qr_expires_at
  )
  values (
    target_catalog_id,
    coalesce(nullif(trim(customer_name), ''), 'Guest'),
    coalesce(nullif(trim(customer_phone), ''), ''),
    coalesce(comment, ''),
    coalesce(cabin_label, ''),
    fulfillment_type,
    coalesce(cabin_label, ''),
    coalesce(delivery_address, ''),
    coalesce(delivery_city, ''),
    coalesce(delivery_settlement, ''),
    coalesce(client_address_comment, ''),
    verification_code,
    encode(gen_random_bytes(24), 'hex'),
    now() + interval '24 hours'
  )
  returning id into created_order_id;

  for item in select * from jsonb_array_elements(items)
  loop
    item_quantity := greatest(1, coalesce((item->>'quantity')::integer, 1));

    select id, title, price, stock_count, current_stock, is_unlimited
      into legacy_product
      from public.product
      where id = item->>'product_id'
        and coalesce(is_hidden, false) = false
      for update;

    if not found then
      raise exception 'Legacy product is not available';
    end if;

    if not coalesce(legacy_product.is_unlimited, false) and legacy_product.stock_count < item_quantity then
      raise exception 'Legacy product stock is not enough';
    end if;

    line_total := legacy_product.price * item_quantity;
    computed_subtotal := computed_subtotal + line_total;

    insert into public.order_items (
      catalog_id, order_id, product_id, title, quantity, unit_price, options, line_total
    )
    values (
      target_catalog_id,
      created_order_id,
      null,
      legacy_product.title,
      item_quantity,
      legacy_product.price,
      coalesce(item->'options', '[]'::jsonb),
      line_total
    );

    if not coalesce(legacy_product.is_unlimited, false) then
      update public.product
      set stock_count = greatest(0, stock_count - item_quantity),
          current_stock = greatest(0, current_stock - item_quantity)
      where id = legacy_product.id;
    end if;
  end loop;

  update public.orders
  set subtotal = computed_subtotal,
      total = computed_subtotal
  where id = created_order_id;

  return created_order_id;
end;
$$;

grant execute on function public.create_legacy_public_restaurant_order(uuid, text, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;
