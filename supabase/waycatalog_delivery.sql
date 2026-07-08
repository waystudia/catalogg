-- WayCatalog client-restaurant-driver delivery extension.
-- Safe to run after catalog_supabase_schema.sql, restaurant_orders.sql and client_platform.sql.

create extension if not exists pgcrypto;

alter type public.order_status add value if not exists 'waiting_payment_confirmation';
alter type public.order_status add value if not exists 'payment_confirmed';
alter type public.order_status add value if not exists 'cooking';
alter type public.order_status add value if not exists 'waiting_driver';
alter type public.order_status add value if not exists 'driver_assigned';
alter type public.order_status add value if not exists 'assigned_driver';
alter type public.order_status add value if not exists 'picked_up';
alter type public.order_status add value if not exists 'on_the_way';
alter type public.order_status add value if not exists 'delivered';
alter type public.order_status add value if not exists 'canceled';

alter table public.orders add column if not exists restaurant_id uuid references public.restaurants(id) on delete set null;
alter table public.orders add column if not exists client_id uuid references public.users(id) on delete set null;
alter table public.orders add column if not exists city_id uuid references public.cities(id) on delete set null;
alter table public.orders add column if not exists order_type text not null default 'dine_in'
  check (order_type in ('dine_in', 'pickup', 'delivery'));
alter table public.orders add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid', 'waiting_confirmation', 'confirmed', 'rejected'));
alter table public.orders add column if not exists delivery_provider text not null default 'dine_in'
  check (delivery_provider in ('restaurant', 'platform', 'hybrid', 'pickup', 'dine_in'));
alter table public.orders add column if not exists client_name text not null default '';
alter table public.orders add column if not exists client_phone text not null default '';
alter table public.orders add column if not exists address_id uuid references public.client_addresses(id) on delete set null;
alter table public.orders add column if not exists delivery_lat numeric(10,7);
alter table public.orders add column if not exists delivery_lng numeric(10,7);
alter table public.orders add column if not exists delivery_comment text;
alter table public.orders add column if not exists client_accuracy_m numeric(10,2);
alter table public.orders add column if not exists delivery_address_id uuid references public.client_addresses(id) on delete set null;
alter table public.orders add column if not exists delivery_address_snapshot text;
alter table public.orders add column if not exists delivery_entrance_snapshot text;
alter table public.orders add column if not exists delivery_floor_snapshot text;
alter table public.orders add column if not exists delivery_apartment_snapshot text;
alter table public.orders add column if not exists delivery_intercom_snapshot text;
alter table public.orders add column if not exists delivery_landmark_snapshot text;
alter table public.orders add column if not exists delivery_comment_snapshot text;
alter table public.orders add column if not exists client_lat numeric(10,7);
alter table public.orders add column if not exists client_lng numeric(10,7);
alter table public.orders add column if not exists restaurant_lat_snapshot numeric(10,7);
alter table public.orders add column if not exists restaurant_lng_snapshot numeric(10,7);
alter table public.orders add column if not exists restaurant_address_snapshot text;
alter table public.orders add column if not exists booth_name text;
alter table public.orders add column if not exists subtotal_amount numeric(12,2) not null default 0;
alter table public.orders add column if not exists total_amount numeric(12,2) not null default 0;
alter table public.orders add column if not exists restaurant_payment_confirmed_at timestamptz;

alter table public.users add column if not exists email text not null default '';

alter table public.restaurants add column if not exists address_line text not null default '';
alter table public.restaurants add column if not exists lat numeric(10,7);
alter table public.restaurants add column if not exists lng numeric(10,7);

alter table public.client_addresses add column if not exists accuracy_m numeric(10,2);
alter table public.client_addresses add column if not exists entrance text not null default '';
alter table public.client_addresses add column if not exists floor text not null default '';
alter table public.client_addresses add column if not exists apartment text not null default '';
alter table public.client_addresses add column if not exists intercom_code text not null default '';
alter table public.client_addresses add column if not exists landmark text not null default '';
alter table public.client_addresses add column if not exists updated_at timestamptz not null default now();

alter table public.drivers add column if not exists vehicle_info text not null default '';
alter table public.drivers add column if not exists car_number text not null default '';
alter table public.drivers add column if not exists photo_url text not null default '';
alter table public.drivers add column if not exists rating numeric(3,2) not null default 5;
alter table public.drivers add column if not exists is_online boolean not null default false;
alter table public.drivers add column if not exists status text not null default 'offline'
  check (status in (
    'offline',
    'online',
    'busy',
    'heading_to_restaurant',
    'at_restaurant',
    'picked_up',
    'heading_to_client',
    'at_client',
    'completed'
  ));
alter table public.drivers add column if not exists updated_at timestamptz not null default now();

create table if not exists public.restaurant_couriers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, driver_id)
);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  delivery_provider text not null default 'platform',
  status text not null default 'waiting_courier',
  pickup_qr_token text,
  pickup_qr_expires_at timestamptz,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  estimated_time_min int not null default 20,
  estimated_time_max int not null default 40,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id)
);

alter table public.deliveries add column if not exists delivery_provider text not null default 'platform';
alter table public.deliveries add column if not exists pickup_qr_token text;
alter table public.deliveries add column if not exists pickup_qr_expires_at timestamptz;
alter table public.deliveries add column if not exists assigned_at timestamptz;
alter table public.deliveries add column if not exists picked_up_at timestamptz;
alter table public.deliveries add column if not exists delivered_at timestamptz;
alter table public.deliveries add column if not exists estimated_time_min int not null default 20;
alter table public.deliveries add column if not exists estimated_time_max int not null default 40;
alter table public.deliveries add column if not exists route_to_restaurant_url text;
alter table public.deliveries add column if not exists route_to_client_url text;
alter table public.deliveries add column if not exists driver_arrived_restaurant_at timestamptz;
alter table public.deliveries add column if not exists driver_arrived_client_at timestamptz;

alter table public.deliveries drop constraint if exists deliveries_status_check;
alter table public.deliveries add constraint deliveries_status_check
  check (status in (
    'waiting_driver',
    'waiting_courier',
    'assigned',
    'arrived_to_restaurant',
    'handed_over',
    'on_the_way',
    'arrived_to_client',
    'delivered',
    'failed',
    'canceled',
    'cancelled'
  ));

alter table public.deliveries drop constraint if exists deliveries_status_check;
alter table public.deliveries add constraint deliveries_status_check
  check (status in (
    'not_required',
    'waiting_courier',
    'waiting_driver',
    'assigned',
    'arrived_to_restaurant',
    'handed_over',
    'on_the_way',
    'delivered',
    'failed',
    'canceled',
    'cancelled'
  ));

alter table public.deliveries drop constraint if exists deliveries_delivery_provider_check;
alter table public.deliveries add constraint deliveries_delivery_provider_check
  check (delivery_provider in ('restaurant', 'platform', 'hybrid', 'pickup', 'dine_in'));

create table if not exists public.delivery_status_history (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  status text not null,
  comment text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.earnings (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  amount numeric(12,2) not null,
  commission numeric(12,2) not null default 0,
  net_amount numeric(12,2) generated always as (amount - commission) stored,
  created_at timestamptz not null default now(),
  unique(delivery_id)
);

create index if not exists orders_restaurant_status_idx on public.orders(restaurant_id, status, created_at desc);
create index if not exists orders_payment_status_idx on public.orders(payment_status, created_at desc);
create index if not exists deliveries_status_driver_idx on public.deliveries(status, driver_id, created_at desc);
create index if not exists delivery_status_history_delivery_idx on public.delivery_status_history(delivery_id, created_at desc);
create index if not exists earnings_driver_created_idx on public.earnings(driver_id, created_at desc);
create index if not exists restaurant_couriers_restaurant_idx on public.restaurant_couriers(restaurant_id, is_active);

drop trigger if exists drivers_updated_at on public.drivers;
create trigger drivers_updated_at before update on public.drivers
for each row execute function public.set_updated_at();

drop trigger if exists deliveries_updated_at on public.deliveries;
create trigger deliveries_updated_at before update on public.deliveries
for each row execute function public.set_updated_at();

create or replace function public.current_platform_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.users where auth_user_id = auth.uid() limit 1
$$;

create or replace function public.is_driver_profile(target_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.drivers d
    where d.id = target_driver_id
      and d.user_id = public.current_platform_user_id()
  )
$$;

alter table public.drivers enable row level security;
alter table public.restaurant_couriers enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_status_history enable row level security;
alter table public.earnings enable row level security;

drop policy if exists "drivers read own or admins" on public.drivers;
create policy "drivers read own or admins" on public.drivers
for select using (
  public.is_platform_admin()
  or public.is_driver_profile(id)
);

drop policy if exists "drivers update own online status" on public.drivers;
create policy "drivers update own online status" on public.drivers
for update using (
  public.is_platform_admin()
  or public.is_driver_profile(id)
)
with check (
  public.is_platform_admin()
  or public.is_driver_profile(id)
);

drop policy if exists "restaurant couriers restaurant read" on public.restaurant_couriers;
create policy "restaurant couriers restaurant read" on public.restaurant_couriers
for select using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_id
      and r.catalog_id is not null
      and public.is_catalog_member(r.catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[])
  )
  or public.is_driver_profile(driver_id)
);

drop policy if exists "deliveries restaurant driver read" on public.deliveries;
create policy "deliveries restaurant driver read" on public.deliveries
for select using (
  public.is_platform_admin()
  or public.is_driver_profile(driver_id)
  or (
    driver_id is null
    and status in ('waiting_courier', 'waiting_driver')
    and exists (
      select 1
      from public.drivers d
      where d.user_id = public.current_platform_user_id()
        and d.is_active
        and d.is_online
    )
  )
  or exists (
    select 1
    from public.orders o
    join public.restaurants r on r.id = o.restaurant_id
    where o.id = order_id
      and r.catalog_id is not null
      and public.is_catalog_member(r.catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[])
  )
  or exists (
    select 1
    from public.orders o
    where o.id = order_id
      and public.is_catalog_member(o.catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[])
  )
);

drop policy if exists "deliveries restaurant driver update" on public.deliveries;
create policy "deliveries restaurant driver update" on public.deliveries
for update using (
  public.is_platform_admin()
  or public.is_driver_profile(driver_id)
  or exists (
    select 1
    from public.orders o
    join public.restaurants r on r.id = o.restaurant_id
    where o.id = order_id
      and r.catalog_id is not null
      and public.is_catalog_member(r.catalog_id, array['owner','admin']::public.catalog_role[])
  )
  or exists (
    select 1
    from public.orders o
    where o.id = order_id
      and public.is_catalog_member(o.catalog_id, array['owner','admin']::public.catalog_role[])
  )
)
with check (
  public.is_platform_admin()
  or public.is_driver_profile(driver_id)
  or exists (
    select 1
    from public.orders o
    join public.restaurants r on r.id = o.restaurant_id
    where o.id = order_id
      and r.catalog_id is not null
      and public.is_catalog_member(r.catalog_id, array['owner','admin']::public.catalog_role[])
  )
  or exists (
    select 1
    from public.orders o
    where o.id = order_id
      and public.is_catalog_member(o.catalog_id, array['owner','admin']::public.catalog_role[])
  )
);

drop policy if exists "deliveries restaurant insert" on public.deliveries;
create policy "deliveries restaurant insert" on public.deliveries
for insert with check (
  public.is_platform_admin()
  or exists (
    select 1
    from public.orders o
    join public.restaurants r on r.id = o.restaurant_id
    where o.id = order_id
      and r.catalog_id is not null
      and public.is_catalog_member(r.catalog_id, array['owner','admin']::public.catalog_role[])
  )
  or exists (
    select 1
    from public.orders o
    where o.id = order_id
      and public.is_catalog_member(o.catalog_id, array['owner','admin']::public.catalog_role[])
  )
);

drop policy if exists "delivery history related read" on public.delivery_status_history;
create policy "delivery history related read" on public.delivery_status_history
for select using (
  public.is_platform_admin()
  or exists (
    select 1 from public.deliveries d
    where d.id = delivery_id
      and (
        public.is_driver_profile(d.driver_id)
        or exists (
          select 1
          from public.orders o
          join public.restaurants r on r.id = o.restaurant_id
          where o.id = d.order_id
            and r.catalog_id is not null
            and public.is_catalog_member(r.catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[])
        )
      )
  )
);

drop policy if exists "earnings driver read" on public.earnings;
create policy "earnings driver read" on public.earnings
for select using (
  public.is_platform_admin()
  or public.is_driver_profile(driver_id)
);

create or replace function public.accept_available_delivery(
  target_delivery_id uuid,
  target_driver_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  accepted_order_id uuid;
  next_qr text := encode(gen_random_bytes(32), 'hex');
begin
  update public.deliveries
  set driver_id = target_driver_id,
      status = 'assigned',
      assigned_at = now(),
      pickup_qr_token = next_qr,
      pickup_qr_expires_at = now() + interval '2 hours'
  where id = target_delivery_id
    and driver_id is null
    and status in ('waiting_courier', 'waiting_driver')
  returning order_id into accepted_order_id;

  if accepted_order_id is null then
    raise exception 'Delivery is not available';
  end if;

  update public.orders
  set status = 'assigned_driver'
  where id = accepted_order_id;

  update public.drivers
  set is_online = true,
      status = 'heading_to_restaurant'
  where id = target_driver_id;

  insert into public.delivery_status_history (delivery_id, status, comment)
  values (target_delivery_id, 'assigned', 'driver accepted delivery');

  return target_delivery_id;
end;
$$;

grant execute on function public.accept_available_delivery(uuid, uuid) to authenticated;

create or replace function public.confirm_delivery_pickup_qr(
  target_delivery_id uuid,
  presented_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  target_driver_id uuid;
begin
  select order_id, driver_id
    into target_order_id, target_driver_id
    from public.deliveries
    where id = target_delivery_id
      and status in ('assigned', 'arrived_to_restaurant')
      and pickup_qr_token = presented_token
      and pickup_qr_expires_at > now();

  if target_order_id is null then
    return false;
  end if;

  update public.deliveries
  set status = 'handed_over',
      picked_up_at = now()
  where id = target_delivery_id;

  update public.orders
  set status = 'picked_up'
  where id = target_order_id;

  update public.drivers
  set status = 'picked_up'
  where id = target_driver_id;

  insert into public.delivery_status_history (delivery_id, status, comment)
  values (target_delivery_id, 'handed_over', 'restaurant verified driver QR');

  return true;
end;
$$;

grant execute on function public.confirm_delivery_pickup_qr(uuid, text) to authenticated;

create or replace function public.complete_driver_delivery(
  target_delivery_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  target_driver_id uuid;
  payout numeric(12,2);
begin
  select d.order_id, d.driver_id, coalesce(o.delivery_fee, 0)
    into target_order_id, target_driver_id, payout
    from public.deliveries d
    join public.orders o on o.id = d.order_id
    where d.id = target_delivery_id
      and d.status in ('handed_over', 'on_the_way', 'arrived_to_client');

  if target_order_id is null or target_driver_id is null then
    raise exception 'Delivery cannot be completed';
  end if;

  update public.deliveries
  set status = 'delivered',
      delivered_at = now()
  where id = target_delivery_id;

  update public.orders
  set status = 'completed',
      completed_at = now()
  where id = target_order_id;

  update public.drivers
  set status = 'online',
      is_online = true
  where id = target_driver_id;

  insert into public.delivery_status_history (delivery_id, status, comment)
  values (target_delivery_id, 'delivered', 'driver completed delivery');

  insert into public.earnings (driver_id, delivery_id, amount, commission)
  values (target_driver_id, target_delivery_id, payout, 0)
  on conflict (delivery_id) do nothing;

  return target_delivery_id;
end;
$$;

grant execute on function public.complete_driver_delivery(uuid) to authenticated;

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

do $$
begin
  alter publication supabase_realtime add table public.deliveries;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.delivery_status_history;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.drivers;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
