-- A separate client RPC keeps the established restaurant order function
-- untouched while allowing a mixed cart to carry an exact gram quantity.
create or replace function public.create_client_platform_catalog_order(
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
  idempotency_key text,
  payment_method text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_order_id uuid;
  location jsonb := public.delivery_location_from_note(comment);
  normalized_idempotency_key text := nullif(pg_catalog.btrim(coalesce(idempotency_key, '')), '');
  item jsonb;
  product_record public.products%rowtype;
  item_quantity integer;
  requested_quantity integer;
  remaining_stock integer;
  line_total integer;
  computed_subtotal integer := 0;
  verification_code text := pg_catalog.lpad((pg_catalog.floor(pg_catalog.random() * 1000000))::integer::text, 6, '0');
begin
  if payment_method not in ('cash', 'bank_transfer', 'qr') then
    raise exception 'Unsupported payment method';
  end if;

  if normalized_idempotency_key is not null then
    select order_record.id
    into created_order_id
    from public.orders order_record
    where order_record.catalog_id = target_catalog_id
      and order_record.idempotency_key = normalized_idempotency_key;

    if created_order_id is not null then
      return public.finalize_created_client_platform_order(created_order_id, payment_method);
    end if;
  end if;

  if not exists (
    select 1
    from public.catalogs catalog
    where catalog.id = target_catalog_id
      and catalog.business_type = 'grocery'
      and catalog.status = 'published'
      and catalog.is_template = false
  ) then
    raise exception 'Grocery catalog is not available';
  end if;

  if fulfillment_type not in ('hall', 'takeaway', 'delivery') then
    raise exception 'Unsupported fulfillment type';
  end if;

  if pg_catalog.jsonb_typeof(items) <> 'array' or pg_catalog.jsonb_array_length(items) = 0 then
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
      coalesce(nullif(pg_catalog.btrim(customer_name), ''), 'Guest'),
      coalesce(nullif(pg_catalog.btrim(customer_phone), ''), ''),
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
      pg_catalog.encode(extensions.gen_random_bytes(24), 'hex'),
      pg_catalog.now() + interval '24 hours',
      normalized_idempotency_key
    )
    returning id into created_order_id;
  exception when unique_violation then
    select order_record.id
    into created_order_id
    from public.orders order_record
    where order_record.catalog_id = target_catalog_id
      and order_record.idempotency_key = normalized_idempotency_key;

    if created_order_id is not null then
      return public.finalize_created_client_platform_order(created_order_id, payment_method);
    end if;
    raise;
  end;

  for item in select value from pg_catalog.jsonb_array_elements(items)
  loop
    item_quantity := greatest(1, coalesce((item->>'quantity')::integer, 1));

    select product.*
    into product_record
    from public.products product
    where product.id = (item->>'product_id')::uuid
      and product.catalog_id = target_catalog_id
      and product.status = 'active'
    for update;

    if product_record.id is null then
      raise exception 'Product is not available';
    end if;

    if product_record.sale_unit = 'weight' then
      requested_quantity := coalesce((item->>'requested_quantity')::integer, 0);
      item_quantity := 1;
      if requested_quantity < product_record.minimum_quantity
        or mod(requested_quantity - product_record.minimum_quantity, product_record.quantity_step) <> 0 then
        raise exception 'Weighted quantity is invalid';
      end if;
    else
      requested_quantity := item_quantity;
    end if;

    if not product_record.is_unlimited and product_record.stock_quantity < requested_quantity then
      raise exception 'Product stock is not enough';
    end if;

    line_total := pg_catalog.round(
      product_record.price::numeric * requested_quantity / product_record.price_basis_quantity
    )::integer;
    computed_subtotal := computed_subtotal + line_total;

    insert into public.order_items (
      catalog_id,
      order_id,
      product_id,
      title,
      quantity,
      requested_quantity,
      unit_price,
      options,
      line_total
    )
    values (
      target_catalog_id,
      created_order_id,
      product_record.id,
      product_record.title,
      item_quantity,
      requested_quantity,
      product_record.price,
      coalesce(item->'options', '[]'::jsonb),
      line_total
    );

    if not product_record.is_unlimited then
      remaining_stock := product_record.stock_quantity - requested_quantity;
      update public.products product
      set stock_quantity = remaining_stock,
          stock_count = case
            when product_record.sale_unit = 'weight'
              then pg_catalog.ceil(remaining_stock::numeric / 1000)::integer
            else remaining_stock
          end,
          status = case
            when remaining_stock < product_record.minimum_quantity
              then 'sold_out'::public.product_status
            else product.status
          end,
          updated_at = pg_catalog.now()
      where product.id = product_record.id;
    end if;
  end loop;

  update public.orders
  set subtotal = computed_subtotal,
      total = computed_subtotal
  where id = created_order_id;

  return public.finalize_created_client_platform_order(created_order_id, payment_method);
end;
$$;

revoke all on function public.create_client_platform_catalog_order(
  uuid, text, text, text, text, text, text, text, text, text, jsonb, text, text
) from public;
grant execute on function public.create_client_platform_catalog_order(
  uuid, text, text, text, text, text, text, text, text, text, jsonb, text, text
) to anon, authenticated;
