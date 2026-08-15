do $$
declare
  primary_catalog_id uuid;
  addon_catalog_id uuid;
  addon_product public.products%rowtype;
  client_account_id uuid := gen_random_uuid();
  primary_order_id uuid;
  target_group_id uuid;
  offer_id uuid;
  quote_id uuid;
  addon_order_id uuid;
  target_delivery_id uuid;
  initialized jsonb;
  context jsonb;
  quote_result jsonb;
  confirm_result jsonb;
  item_snapshot jsonb;
  requested_quantity integer;
  item_quantity integer;
  line_total integer;
  stock_before integer;
  test_phone text := '+70000000001';
  session_token text := 'combined-order-acceptance-token';
  quote_token text := 'combined-order-acceptance-quote-token';
begin
  select id into primary_catalog_id from public.catalogs where slug = 'mangal' limit 1;
  select id into addon_catalog_id from public.catalogs where slug = 'finik' limit 1;
  if primary_catalog_id is null or addon_catalog_id is null then
    raise exception 'combined order acceptance requires mangal and finik';
  end if;

  update public.post_order_addon_config
  set enabled = true,
      test_only = false,
      allowed_primary_merchant_ids = array[primary_catalog_id],
      allowed_addon_merchant_ids = array[addon_catalog_id]
  where id = 'global';

  update public.catalogs
  set status = 'published', is_template = false
  where id in (primary_catalog_id, addon_catalog_id);
  update public.restaurants
  set lat = case when catalog_id = primary_catalog_id then 43.3200000 else 43.3210000 end,
      lng = case when catalog_id = primary_catalog_id then 45.7000000 else 45.7020000 end,
      is_active = true,
      allow_delivery = true,
      delivery_provider = 'platform'
  where catalog_id in (primary_catalog_id, addon_catalog_id);
  update public.restaurant_delivery_settings
  set enable_orders = true,
      enable_delivery = true,
      use_platform_drivers = true,
      delivery_hours_start = null,
      delivery_hours_end = null,
      addon_assembly_minutes = 5
  where catalog_id in (primary_catalog_id, addon_catalog_id);

  select product.* into addon_product
  from public.products product
  where product.catalog_id = addon_catalog_id
  order by product.created_at
  limit 1;
  if addon_product.id is null then raise exception 'finik product is required'; end if;
  update public.products
  set status = 'active',
      is_unlimited = false,
      stock_quantity = greatest(coalesce(stock_quantity, 0), coalesce(minimum_quantity, 1) + coalesce(quantity_step, 1) + 10),
      stock_count = greatest(coalesce(stock_count, 0), 10)
  where id = addon_product.id
  returning * into addon_product;
  stock_before := addon_product.stock_quantity;

  insert into public.client_accounts (
    id, name, phone, phone_normalized, password_hash, is_test
  ) values (
    client_account_id, 'Combined Order QA', test_phone,
    public.normalize_client_phone(test_phone), 'qa-not-a-login-password', true
  );
  insert into public.client_account_sessions (
    account_id, token_hash, expires_at
  ) values (
    client_account_id, extensions.digest(session_token, 'sha256'), pg_catalog.now() + interval '1 hour'
  );

  insert into public.orders (
    catalog_id,
    customer_name,
    customer_phone,
    client_name,
    client_phone,
    fulfillment_type,
    order_type,
    delivery_provider,
    delivery_address,
    delivery_city,
    delivery_settlement,
    delivery_lat,
    delivery_lng,
    client_lat,
    client_lng,
    restaurant_lat_snapshot,
    restaurant_lng_snapshot,
    restaurant_address_snapshot,
    subtotal,
    delivery_fee,
    total,
    subtotal_amount,
    total_amount,
    payment_status,
    is_test_order,
    idempotency_key
  ) values (
    primary_catalog_id,
    'Combined Order QA',
    test_phone,
    'Combined Order QA',
    test_phone,
    'delivery',
    'delivery',
    'platform',
    'QA address',
    'Грозный',
    'Цоци-Юрт',
    43.3300000,
    45.7100000,
    43.3300000,
    45.7100000,
    43.3200000,
    45.7000000,
    'QA primary merchant',
    650,
    150,
    800,
    650,
    800,
    'unpaid',
    true,
    'combined-order-primary-acceptance'
  ) returning id into primary_order_id;

  initialized := public.initialize_post_order_addon(primary_order_id, session_token);
  if coalesce((initialized->>'available')::boolean, false) is not true then
    raise exception 'initializer rejected acceptance fixture: %', initialized;
  end if;
  target_group_id := (initialized->>'order_group_id')::uuid;
  offer_id := (initialized->>'offer_id')::uuid;

  context := public.get_post_order_addon_context(target_group_id, session_token);
  if coalesce((context->>'available')::boolean, false) is not true then
    raise exception 'context rejected acceptance fixture: %', context;
  end if;
  if pg_catalog.jsonb_array_length(context->'candidates') = 0 then
    raise exception 'cheap prefilter returned no addon merchant';
  end if;
  if public.get_post_order_addon_context(target_group_id, 'wrong-token')->>'reason' <> 'access_denied' then
    raise exception 'another client can read combined order context';
  end if;

  update public.addon_offers
  set status = 'available',
      candidate_snapshot = context->'candidates'
  where id = offer_id;

  requested_quantity := case
    when addon_product.sale_unit = 'weight' then addon_product.minimum_quantity
    else 1
  end;
  item_quantity := case when addon_product.sale_unit = 'weight' then 1 else requested_quantity end;
  line_total := pg_catalog.round(
    addon_product.price::numeric * requested_quantity / addon_product.price_basis_quantity
  )::integer;
  item_snapshot := jsonb_build_array(jsonb_build_object(
    'product_id', addon_product.id,
    'title', addon_product.title,
    'quantity', item_quantity,
    'requested_quantity', requested_quantity,
    'unit_price', addon_product.price,
    'price_basis_quantity', addon_product.price_basis_quantity,
    'sale_unit', addon_product.sale_unit,
    'quantity_unit', addon_product.quantity_unit,
    'options', '[]'::jsonb,
    'line_total', line_total
  ));

  quote_result := public.create_post_order_addon_quote(
    target_group_id,
    offer_id,
    addon_catalog_id,
    session_token,
    quote_token,
    'combined-order-quote-acceptance',
    item_snapshot,
    1,
    5,
    '["store","primary","customer"]'::jsonb,
    'acceptance',
    null
  );
  quote_id := (quote_result->>'quote_id')::uuid;

  begin
    perform public.confirm_post_order_addon(
      quote_id, 'wrong-token', quote_token, 'combined-order-confirm-acceptance',
      '["store","primary","customer"]'::jsonb, 1, 5
    );
    raise exception 'another client confirmed addon order';
  exception when others then
    if sqlerrm <> 'access_denied' then raise; end if;
  end;

  confirm_result := public.confirm_post_order_addon(
    quote_id,
    session_token,
    quote_token,
    'combined-order-confirm-acceptance',
    '["store","primary","customer"]'::jsonb,
    1,
    5
  );
  addon_order_id := (confirm_result->>'merchant_order_id')::uuid;
  target_delivery_id := (confirm_result->>'delivery_id')::uuid;

  if (select pg_catalog.count(*) from public.orders where order_group_id = target_group_id) <> 2 then
    raise exception 'combined order did not retain two merchant orders';
  end if;
  if not exists (
    select 1 from public.orders
    where id = addon_order_id and catalog_id = addon_catalog_id
      and is_addon and source = 'post_order_addon' and delivery_fee = 0
  ) then
    raise exception 'addon merchant order shape is invalid';
  end if;
  if (select pg_catalog.count(*) from public.deliveries where order_group_id = target_group_id) <> 1 then
    raise exception 'combined order did not create exactly one delivery';
  end if;
  if (select pg_catalog.count(*) from public.delivery_stops where delivery_id = target_delivery_id) <> 3 then
    raise exception 'combined delivery did not create three ordered stops';
  end if;
  if (select stock_quantity from public.products where id = addon_product.id) <> stock_before - requested_quantity then
    raise exception 'addon stock was not reserved exactly once';
  end if;

  confirm_result := public.confirm_post_order_addon(
    quote_id,
    session_token,
    quote_token,
    'combined-order-confirm-acceptance',
    '["store","primary","customer"]'::jsonb,
    1,
    5
  );
  if coalesce((confirm_result->>'idempotent')::boolean, false) is not true then
    raise exception 'second confirm was not idempotent';
  end if;
  if (select pg_catalog.count(*) from public.orders where order_group_id = target_group_id) <> 2 then
    raise exception 'second confirm duplicated merchant order';
  end if;
  if (select stock_quantity from public.products where id = addon_product.id) <> stock_before - requested_quantity then
    raise exception 'second confirm reserved stock twice';
  end if;
end;
$$;
