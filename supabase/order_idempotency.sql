-- Idempotent public order creation.
-- Run after restaurant_orders.sql / delivery_settlements.sql so these overloads win for clients
-- that pass idempotency_key.

alter table public.orders add column if not exists idempotency_key text;

create unique index if not exists orders_catalog_idempotency_key_idx
  on public.orders(catalog_id, idempotency_key)
  where idempotency_key is not null;

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
  items jsonb,
  idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  created_order_id uuid;
  location jsonb := public.delivery_location_from_note(comment);
  normalized_idempotency_key text := nullif(trim(coalesce(idempotency_key, '')), '');
  item jsonb;
  product_record record;
  item_quantity integer;
  line_total integer;
  computed_subtotal integer := 0;
  verification_code text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  if normalized_idempotency_key is not null then
    select o.id
      into created_order_id
      from public.orders o
      where o.catalog_id = target_catalog_id
        and o.idempotency_key = normalized_idempotency_key;

    if created_order_id is not null then
      return created_order_id;
    end if;
  end if;

  if not exists (select 1 from public.catalogs where id = target_catalog_id) then
    raise exception 'Catalog does not exist';
  end if;

  if fulfillment_type not in ('hall', 'takeaway', 'delivery') then
    raise exception 'Unsupported fulfillment type';
  end if;

  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Order items are required';
  end if;

  begin
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
      delivery_lat,
      delivery_lng,
      client_lat,
      client_lng,
      client_accuracy_m,
      delivery_address_snapshot,
      verification_code,
      qr_token,
      qr_expires_at,
      idempotency_key
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
      case when fulfillment_type = 'delivery' then (location->>'lat')::numeric else null end,
      case when fulfillment_type = 'delivery' then (location->>'lng')::numeric else null end,
      case when fulfillment_type = 'delivery' then (location->>'lat')::numeric else null end,
      case when fulfillment_type = 'delivery' then (location->>'lng')::numeric else null end,
      case when fulfillment_type = 'delivery' then (location->>'accuracy_m')::numeric else null end,
      case when fulfillment_type = 'delivery' then coalesce(delivery_address, '') else null end,
      verification_code,
      encode(gen_random_bytes(24), 'hex'),
      now() + interval '24 hours',
      normalized_idempotency_key
    )
    returning id into created_order_id;
  exception when unique_violation then
    select o.id
      into created_order_id
      from public.orders o
      where o.catalog_id = target_catalog_id
        and o.idempotency_key = normalized_idempotency_key;

    if created_order_id is not null then
      return created_order_id;
    end if;

    raise;
  end;

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

grant execute on function public.create_public_restaurant_order(uuid, text, text, text, text, text, text, text, text, text, jsonb, text) to anon, authenticated;

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
  items jsonb,
  idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  created_order_id uuid;
  location jsonb := public.delivery_location_from_note(comment);
  normalized_idempotency_key text := nullif(trim(coalesce(idempotency_key, '')), '');
  item jsonb;
  legacy_product record;
  item_quantity integer;
  line_total integer;
  computed_subtotal integer := 0;
  verification_code text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  if normalized_idempotency_key is not null then
    select o.id
      into created_order_id
      from public.orders o
      where o.catalog_id = target_catalog_id
        and o.idempotency_key = normalized_idempotency_key;

    if created_order_id is not null then
      return created_order_id;
    end if;
  end if;

  if not exists (select 1 from public.catalogs where id = target_catalog_id) then
    raise exception 'Catalog does not exist';
  end if;

  if fulfillment_type not in ('hall', 'takeaway', 'delivery') then
    raise exception 'Unsupported fulfillment type';
  end if;

  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Order items are required';
  end if;

  begin
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
      delivery_lat,
      delivery_lng,
      client_lat,
      client_lng,
      client_accuracy_m,
      delivery_address_snapshot,
      verification_code,
      qr_token,
      qr_expires_at,
      idempotency_key
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
      case when fulfillment_type = 'delivery' then (location->>'lat')::numeric else null end,
      case when fulfillment_type = 'delivery' then (location->>'lng')::numeric else null end,
      case when fulfillment_type = 'delivery' then (location->>'lat')::numeric else null end,
      case when fulfillment_type = 'delivery' then (location->>'lng')::numeric else null end,
      case when fulfillment_type = 'delivery' then (location->>'accuracy_m')::numeric else null end,
      case when fulfillment_type = 'delivery' then coalesce(delivery_address, '') else null end,
      verification_code,
      encode(gen_random_bytes(24), 'hex'),
      now() + interval '24 hours',
      normalized_idempotency_key
    )
    returning id into created_order_id;
  exception when unique_violation then
    select o.id
      into created_order_id
      from public.orders o
      where o.catalog_id = target_catalog_id
        and o.idempotency_key = normalized_idempotency_key;

    if created_order_id is not null then
      return created_order_id;
    end if;

    raise;
  end;

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

grant execute on function public.create_legacy_public_restaurant_order(uuid, text, text, text, text, text, text, text, text, text, jsonb, text) to anon, authenticated;

create or replace function public.get_public_restaurant_order_status(
  target_order_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'id', o.id,
    'catalog_id', o.catalog_id,
    'customer_name', o.customer_name,
    'customer_phone', o.customer_phone,
    'fulfillment_type', o.fulfillment_type,
    'delivery_address', coalesce(o.delivery_address, ''),
    'delivery_lat', o.delivery_lat,
    'delivery_lng', o.delivery_lng,
    'client_accuracy_m', o.client_accuracy_m,
    'restaurant_name', coalesce(c.name, ''),
    'restaurant_address', coalesce(o.restaurant_address_snapshot, ''),
    'restaurant_lat', o.restaurant_lat_snapshot,
    'restaurant_lng', o.restaurant_lng_snapshot,
    'status', o.status,
    'payment_status', coalesce(o.payment_status, 'unpaid'),
    'delivery_status', d.status,
    'driver_name', drv.name,
    'driver_phone', drv.phone,
    'subtotal', coalesce(o.subtotal, 0),
    'delivery_fee', coalesce(o.delivery_fee, 0),
    'total', coalesce(o.total, 0),
    'created_at', o.created_at,
    'accepted_at', o.accepted_at,
    'ready_at', o.ready_at,
    'completed_at', o.completed_at,
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'title', oi.title,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price,
            'line_total', oi.line_total
          )
          order by oi.id
        )
        from public.order_items oi
        where oi.order_id = o.id
      ),
      '[]'::jsonb
    )
  )
  from public.orders o
  left join public.deliveries d on d.order_id = o.id
  left join public.drivers drv on drv.id = d.driver_id
  left join public.catalogs c on c.id = o.catalog_id
  where o.id = target_order_id;
$$;

grant execute on function public.get_public_restaurant_order_status(uuid) to anon, authenticated;
