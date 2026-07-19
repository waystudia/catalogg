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

alter table public.drivers
  add column if not exists city_name text not null default '',
  add column if not exists service_settlements text[] not null default '{}';

update public.users platform_user
set auth_user_id = auth_user.id
from auth.users auth_user
where platform_user.auth_user_id is null
  and platform_user.email <> ''
  and lower(platform_user.email) = lower(auth_user.email);

drop policy if exists "catalog members read own membership" on public.catalog_members;
create policy "catalog members read own membership"
  on public.catalog_members
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.current_platform_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.users
  where auth_user_id = auth.uid()
     or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when auth_user_id = auth.uid() then 0 else 1 end
  limit 1
$$;

create table if not exists public.delivery_settlements (
  id uuid primary key default gen_random_uuid(),
  city_name text not null default '',
  settlement_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_name, settlement_name)
);

drop trigger if exists delivery_settlements_updated_at on public.delivery_settlements;
create trigger delivery_settlements_updated_at before update on public.delivery_settlements
for each row execute function public.set_updated_at();

alter table public.delivery_settlements enable row level security;

drop policy if exists "Anyone can read active delivery settlements" on public.delivery_settlements;
create policy "Anyone can read active delivery settlements"
  on public.delivery_settlements
  for select
  to anon, authenticated
  using (
    is_active
    or public.is_platform_admin()
    or exists (
      select 1
      from public.users
      where users.id = public.current_platform_user_id()
        and users.role = 'super_admin'
    )
  );

drop policy if exists "Platform admins manage delivery settlements" on public.delivery_settlements;
create policy "Platform admins manage delivery settlements"
  on public.delivery_settlements
  for all
  to authenticated
  using (
    public.is_platform_admin()
    or
    exists (
      select 1
      from public.users
      where users.id = public.current_platform_user_id()
        and users.role = 'super_admin'
    )
  )
  with check (
    public.is_platform_admin()
    or
    exists (
      select 1
      from public.users
      where users.id = public.current_platform_user_id()
        and users.role = 'super_admin'
    )
  );

create or replace function public.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select driver_id
  from (
    select d.id as driver_id, 0 as priority
    from public.drivers d
    join public.users u on u.id = d.user_id
    where u.auth_user_id = auth.uid()

    union all

    select d.id as driver_id, 1 as priority
    from public.drivers d
    join public.users u on u.id = d.user_id
    where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and u.role = 'driver'

    union all

    select d.id as driver_id, 2 as priority
    from public.drivers d
    where d.id::text = coalesce(auth.jwt() -> 'app_metadata' ->> 'driver_id', '')
  ) candidates
  order by priority
  limit 1
$$;

revoke all on function public.current_driver_id() from public, anon;
grant execute on function public.current_driver_id() to authenticated;

create table if not exists public.settlement_requests (
  id uuid primary key default gen_random_uuid(),
  city_name text not null default '',
  settlement_name text not null,
  source text not null default 'checkout',
  request_count integer not null default 1,
  status text not null default 'new'
    check (status in ('new', 'approved', 'dismissed')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists settlement_requests_open_unique_idx
  on public.settlement_requests (
    lower(trim(city_name)),
    lower(trim(settlement_name))
  )
  where status = 'new';

alter table public.settlement_requests enable row level security;

drop policy if exists "Anyone can request new settlements" on public.settlement_requests;
create policy "Anyone can request new settlements"
  on public.settlement_requests
  for insert
  to anon, authenticated
  with check (status = 'new');

drop policy if exists "Platform admins can read settlement requests" on public.settlement_requests;
create policy "Platform admins can read settlement requests"
  on public.settlement_requests
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.users
      where users.id = public.current_platform_user_id()
        and users.role = 'super_admin'
    )
  );

insert into public.drivers (user_id, name, phone, city_name, service_settlements, is_active, is_online, status)
select
  user_record.id,
  coalesce(nullif(user_record.name, ''), split_part(user_record.email, '@', 1), 'Водитель'),
  coalesce(user_record.phone, ''),
  '',
  '{}',
  true,
  false,
  'offline'
from public.users user_record
where user_record.role = 'driver'
  and not exists (
    select 1
    from public.drivers driver
    where driver.user_id = user_record.id
  );

create or replace function public.record_settlement_request(
  city_name_input text,
  settlement_name_input text,
  source_input text default 'checkout'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_city text := trim(coalesce(city_name_input, ''));
  normalized_settlement text := trim(coalesce(settlement_name_input, ''));
  existing_id uuid;
begin
  if normalized_settlement = '' then
    raise exception 'Settlement name is required';
  end if;

  select id
    into existing_id
    from public.settlement_requests
    where status = 'new'
      and lower(trim(city_name)) = lower(normalized_city)
      and lower(trim(settlement_name)) = lower(normalized_settlement)
    limit 1;

  if existing_id is not null then
    update public.settlement_requests
      set request_count = request_count + 1,
          last_seen_at = now(),
          source = coalesce(nullif(trim(source_input), ''), source)
      where id = existing_id;
    return existing_id;
  end if;

  insert into public.settlement_requests (city_name, settlement_name, source)
  values (
    normalized_city,
    normalized_settlement,
    coalesce(nullif(trim(source_input), ''), 'checkout')
  )
  returning id into existing_id;

  return existing_id;
end;
$$;

grant execute on function public.record_settlement_request(text, text, text) to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.order_items;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.order_status_history;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

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
