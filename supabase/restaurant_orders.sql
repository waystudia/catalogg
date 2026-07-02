-- Restaurant admin orders and delivery settings.
-- Safe to run after catalog_supabase_schema.sql.

alter type public.order_status add value if not exists 'accepted';
alter type public.order_status add value if not exists 'waiting_driver';
alter type public.order_status add value if not exists 'driver_assigned';
alter type public.order_status add value if not exists 'on_the_way';
alter type public.order_status add value if not exists 'delivered';

alter table public.orders add column if not exists fulfillment_type text not null default 'hall'
  check (fulfillment_type in ('hall', 'takeaway', 'delivery'));
alter table public.orders add column if not exists cabin_label text not null default '';
alter table public.orders add column if not exists delivery_address text not null default '';
alter table public.orders add column if not exists delivery_city text not null default '';
alter table public.orders add column if not exists delivery_settlement text not null default '';
alter table public.orders add column if not exists delivery_coordinates jsonb;
alter table public.orders add column if not exists client_address_comment text not null default '';
alter table public.orders add column if not exists accepted_at timestamptz;
alter table public.orders add column if not exists ready_at timestamptz;
alter table public.orders add column if not exists completed_at timestamptz;
alter table public.orders add column if not exists cancellation_reason text not null default '';
alter table public.orders add column if not exists qr_token text;
alter table public.orders add column if not exists qr_expires_at timestamptz;
alter table public.orders add column if not exists verification_code text;

create table if not exists public.restaurant_delivery_settings (
  catalog_id uuid primary key references public.catalogs(id) on delete cascade,
  enable_orders boolean not null default false,
  enable_delivery boolean not null default false,
  enable_pickup boolean not null default true,
  enable_hall_orders boolean not null default true,
  use_own_courier boolean not null default false,
  use_platform_drivers boolean not null default false,
  own_courier_wait_minutes integer not null default 5 check (own_courier_wait_minutes >= 0),
  fallback_to_platform_drivers boolean not null default true,
  qr_required boolean not null default false,
  minimum_order_amount integer not null default 0 check (minimum_order_amount >= 0),
  free_delivery_from integer not null default 0 check (free_delivery_from >= 0),
  default_preparation_minutes integer not null default 25 check (default_preparation_minutes >= 0),
  delivery_radius_km numeric(8,2) not null default 5 check (delivery_radius_km >= 0),
  delivery_area_mode text not null default 'radius' check (delivery_area_mode in ('radius', 'settlements', 'hybrid')),
  primary_city text not null default '',
  service_settlements text[] not null default '{}',
  delivery_hours_start time,
  delivery_hours_end time,
  out_of_hours_mode text not null default 'warn' check (out_of_hours_mode in ('deny', 'preorder', 'warn')),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_tasks (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  delivery_type text not null default 'platform' check (delivery_type in ('own_courier', 'platform')),
  own_courier_enabled boolean not null default false,
  assigned_driver_id uuid references auth.users(id) on delete set null,
  delivery_status text not null default 'waiting_driver'
    check (delivery_status in ('waiting_driver', 'driver_assigned', 'on_the_way', 'arrived', 'completed', 'cancelled')),
  address text not null default '',
  city text not null default '',
  settlement text not null default '',
  coordinates jsonb,
  qr_required boolean not null default false,
  verified_at timestamptz,
  verified_by_driver_id uuid references auth.users(id) on delete set null,
  verification_method text check (verification_method in ('qr', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id)
);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  reason text not null default '',
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists delivery_tasks_order_id_idx on public.delivery_tasks(order_id);
create index if not exists order_status_history_order_created_idx on public.order_status_history(order_id, created_at desc);

drop trigger if exists restaurant_delivery_settings_updated_at on public.restaurant_delivery_settings;
create trigger restaurant_delivery_settings_updated_at before update on public.restaurant_delivery_settings
for each row execute function public.set_updated_at();

drop trigger if exists delivery_tasks_updated_at on public.delivery_tasks;
create trigger delivery_tasks_updated_at before update on public.delivery_tasks
for each row execute function public.set_updated_at();

alter table public.restaurant_delivery_settings enable row level security;
alter table public.delivery_tasks enable row level security;
alter table public.order_status_history enable row level security;

drop policy if exists "delivery settings members read" on public.restaurant_delivery_settings;
create policy "delivery settings members read" on public.restaurant_delivery_settings
for select using (public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));

drop policy if exists "delivery settings admins write" on public.restaurant_delivery_settings;
create policy "delivery settings admins write" on public.restaurant_delivery_settings
for all using (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[]))
with check (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[]));

drop policy if exists "delivery tasks members read" on public.delivery_tasks;
create policy "delivery tasks members read" on public.delivery_tasks
for select using (public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));

drop policy if exists "delivery tasks admins write" on public.delivery_tasks;
create policy "delivery tasks admins write" on public.delivery_tasks
for all using (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[]))
with check (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[]));

drop policy if exists "status history members read" on public.order_status_history;
create policy "status history members read" on public.order_status_history
for select using (public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));

drop policy if exists "status history admins insert" on public.order_status_history;
create policy "status history admins insert" on public.order_status_history
for insert with check (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[]));

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
set search_path = public
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
  if not public.is_catalog_published(target_catalog_id) then
    raise exception 'Catalog is not published';
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

    if product_record.id is null then
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
