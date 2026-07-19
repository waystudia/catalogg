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
alter table public.drivers add column if not exists last_lat numeric(10,7);
alter table public.drivers add column if not exists last_lng numeric(10,7);
alter table public.drivers add column if not exists last_location_accuracy numeric(10,2);
alter table public.drivers add column if not exists last_location_at timestamptz;

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
    'arrived_to_client',
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
  select id
  from public.users
  where auth_user_id = auth.uid()
     or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by case when auth_user_id = auth.uid() then 0 else 1 end
  limit 1
$$;

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

create or replace function public.set_current_driver_availability(next_is_online boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  update public.drivers
  set is_online = next_is_online,
      status = case when next_is_online then 'online' else 'offline' end
  where id = viewer_driver_id;

  if not found then
    raise exception 'Driver profile was not found';
  end if;

  return next_is_online;
end;
$$;

revoke all on function public.set_current_driver_availability(boolean) from public, anon;
grant execute on function public.set_current_driver_availability(boolean) to authenticated;

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
      and (
        d.user_id = public.current_platform_user_id()
        or d.id = public.current_driver_id()
      )
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

create or replace function public.driver_serves_delivery_location(
  target_driver_id uuid,
  target_city text,
  target_settlement text
)
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
      and d.is_active
      and d.is_online
      and (
        (
          trim(coalesce(d.city_name, '')) = ''
          and coalesce(cardinality(d.service_settlements), 0) = 0
        )
        or lower(trim(coalesce(target_city, ''))) = lower(trim(coalesce(d.city_name, '')))
        or lower(trim(coalesce(target_settlement, ''))) = lower(trim(coalesce(d.city_name, '')))
        or exists (
          select 1
          from unnest(coalesce(d.service_settlements, '{}'::text[])) served(place)
          where lower(trim(served.place)) in (
            lower(trim(coalesce(target_city, ''))),
            lower(trim(coalesce(target_settlement, '')))
          )
        )
      )
  )
$$;

grant execute on function public.driver_serves_delivery_location(uuid, text, text) to authenticated;

create or replace function public.dispatch_restaurant_order_to_delivery(
  target_order_id uuid,
  target_catalog_id uuid,
  route_to_restaurant_url_input text,
  route_to_client_url_input text,
  offered_fee_input numeric,
  pricing_status_input text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.orders%rowtype;
  created_delivery_id uuid;
begin
  if not (
    public.is_platform_admin()
    or public.is_catalog_member(target_catalog_id, array['owner','admin']::public.catalog_role[])
  ) then
    raise exception 'Restaurant delivery dispatch is not authorized';
  end if;

  select * into target_order
  from public.orders o
  where o.id = target_order_id
    and o.catalog_id = target_catalog_id
  for update;

  if target_order.id is null then raise exception 'Order not found'; end if;
  if target_order.fulfillment_type <> 'delivery' then raise exception 'Order does not require delivery'; end if;
  if coalesce(target_order.payment_status, 'unpaid') not in ('unpaid', 'confirmed') then
    raise exception 'Order payment is not ready for delivery';
  end if;

  if target_order.status::text in ('waiting_driver') then
    select d.id into created_delivery_id
    from public.deliveries d
    where d.order_id = target_order.id;
    if created_delivery_id is not null then return created_delivery_id; end if;
  end if;

  if target_order.status::text <> 'ready' then raise exception 'Order is not ready for delivery'; end if;

  insert into public.deliveries (
    order_id,
    delivery_provider,
    status,
    route_to_restaurant_url,
    route_to_client_url,
    offered_fee,
    pricing_status,
    estimated_time_min,
    estimated_time_max
  ) values (
    target_order.id,
    'platform',
    'waiting_courier',
    coalesce(route_to_restaurant_url_input, ''),
    coalesce(route_to_client_url_input, ''),
    greatest(0, coalesce(offered_fee_input, target_order.delivery_fee, 0)),
    case when pricing_status_input = 'offered' then 'offered' else 'pending' end,
    20,
    40
  )
  on conflict (order_id) do update set
    route_to_restaurant_url = excluded.route_to_restaurant_url,
    route_to_client_url = excluded.route_to_client_url,
    offered_fee = excluded.offered_fee,
    pricing_status = excluded.pricing_status,
    updated_at = now()
  returning id into created_delivery_id;

  insert into public.delivery_tasks (
    catalog_id,
    order_id,
    delivery_status,
    address,
    city,
    settlement,
    qr_required
  ) values (
    target_order.catalog_id,
    target_order.id,
    'waiting_driver',
    coalesce(target_order.delivery_address, ''),
    coalesce(target_order.delivery_city, ''),
    coalesce(target_order.delivery_settlement, ''),
    target_order.qr_token is not null or target_order.verification_code is not null
  )
  on conflict (order_id) do update set
    delivery_status = excluded.delivery_status,
    address = excluded.address,
    city = excluded.city,
    settlement = excluded.settlement,
    qr_required = excluded.qr_required,
    updated_at = now();

  insert into public.order_status_history (catalog_id, order_id, from_status, to_status, reason)
  values (target_order.catalog_id, target_order.id, target_order.status, 'waiting_driver', 'restaurant_dispatched_delivery');

  update public.orders
  set status = 'waiting_driver',
      ready_at = coalesce(ready_at, now())
  where id = target_order.id;

  return created_delivery_id;
end;
$$;

grant execute on function public.dispatch_restaurant_order_to_delivery(uuid, uuid, text, text, numeric, text) to authenticated;

create or replace function public.get_driver_delivery_offers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
  offers jsonb;
begin
  if viewer_driver_id is null then raise exception 'Driver authentication is required'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', d.id,
      'order_id', d.order_id,
      'driver_id', d.driver_id,
      'status', d.status,
      'delivery_provider', d.delivery_provider,
      'pickup_qr_token', case when d.driver_id = viewer_driver_id then d.pickup_qr_token else null end,
      'pickup_qr_expires_at', case when d.driver_id = viewer_driver_id then d.pickup_qr_expires_at else null end,
      'assigned_at', d.assigned_at,
      'route_to_restaurant_url', d.route_to_restaurant_url,
      'route_to_client_url', case when d.driver_id = viewer_driver_id then d.route_to_client_url else null end,
      'estimated_time_min', d.estimated_time_min,
      'estimated_time_max', d.estimated_time_max,
      'offered_fee', d.offered_fee,
      'pricing_status', d.pricing_status,
      'created_at', d.created_at,
      'orders', jsonb_build_object(
        'id', o.id,
        'order_type', case
          when o.fulfillment_type = 'delivery' then 'delivery'
          when o.fulfillment_type = 'takeaway' then 'pickup'
          else 'dine_in'
        end,
        'fulfillment_type', o.fulfillment_type,
        'status', o.status,
        'payment_status', o.payment_status,
        'client_name', case when d.driver_id = viewer_driver_id then o.client_name else '' end,
        'client_phone', case when d.driver_id = viewer_driver_id then o.client_phone else '' end,
        'customer_name', case when d.driver_id = viewer_driver_id then o.customer_name else '' end,
        'customer_phone', case when d.driver_id = viewer_driver_id then o.customer_phone else '' end,
        'delivery_address', o.delivery_address,
        'delivery_city', o.delivery_city,
        'delivery_settlement', o.delivery_settlement,
        'delivery_lat', o.delivery_lat,
        'delivery_lng', o.delivery_lng,
        'delivery_comment', case when d.driver_id = viewer_driver_id then o.delivery_comment else null end,
        'restaurant_address_snapshot', o.restaurant_address_snapshot,
        'restaurant_lat_snapshot', o.restaurant_lat_snapshot,
        'restaurant_lng_snapshot', o.restaurant_lng_snapshot,
        'delivery_fee', o.delivery_fee,
        'total', o.total,
        'total_amount', o.total_amount,
        'created_at', o.created_at,
        'order_items', coalesce((
          select jsonb_agg(jsonb_build_object('quantity', oi.quantity))
          from public.order_items oi
          where oi.order_id = o.id
        ), '[]'::jsonb),
        'restaurants', jsonb_build_object(
          'name', coalesce(r.name, c.name, 'Ресторан'),
          'logo_url', coalesce(r.logo_url, c.logo_url, ''),
          'cover_url', coalesce(r.cover_url, c.banner_url, ''),
          'description', coalesce(r.description, c.description, ''),
          'address_line', coalesce(r.address_line, o.restaurant_address_snapshot, ''),
          'lat', coalesce(r.lat, o.restaurant_lat_snapshot),
          'lng', coalesce(r.lng, o.restaurant_lng_snapshot)
        )
      )
    ) order by d.created_at desc
  ), '[]'::jsonb) into offers
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  left join public.catalogs c on c.id = o.catalog_id
  left join lateral (
    select restaurant.*
    from public.restaurants restaurant
    where restaurant.id = o.restaurant_id
       or restaurant.catalog_id = o.catalog_id
    order by case when restaurant.id = o.restaurant_id then 0 else 1 end
    limit 1
  ) r on true
  where (
    d.driver_id = viewer_driver_id
    or (
      d.driver_id is null
      and d.status in ('waiting_courier', 'waiting_driver')
      and public.driver_serves_delivery_location(viewer_driver_id, o.delivery_city, o.delivery_settlement)
    )
  )
  and d.status in ('waiting_courier', 'waiting_driver', 'assigned', 'arrived_to_restaurant', 'handed_over', 'on_the_way');

  return offers;
end;
$$;

grant execute on function public.get_driver_delivery_offers() to authenticated;

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
  if target_driver_id is distinct from public.current_driver_id() then
    raise exception 'Driver cannot accept a delivery for another account';
  end if;

  update public.deliveries
  set driver_id = target_driver_id,
      status = 'assigned',
      assigned_at = now(),
      pickup_qr_token = next_qr,
      pickup_qr_expires_at = now() + interval '2 hours'
  where id = target_delivery_id
    and driver_id is null
    and status in ('waiting_courier', 'waiting_driver')
    and exists (
      select 1
      from public.orders o
      where o.id = deliveries.order_id
        and public.driver_serves_delivery_location(target_driver_id, o.delivery_city, o.delivery_settlement)
    )
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

revoke all on function public.accept_available_delivery(uuid, uuid) from public, anon;
grant execute on function public.accept_available_delivery(uuid, uuid) to authenticated;

create or replace function public.accept_available_delivery(target_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  return public.accept_available_delivery(target_delivery_id, viewer_driver_id);
end;
$$;

revoke all on function public.accept_available_delivery(uuid) from public, anon;
grant execute on function public.accept_available_delivery(uuid) to authenticated;

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

create or replace function public.confirm_driver_pickup(
  target_delivery_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid;
  viewer_driver_id uuid := public.current_driver_id();
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  update public.deliveries
  set status = 'handed_over',
      picked_up_at = now()
  where id = target_delivery_id
    and driver_id = viewer_driver_id
    and status = 'arrived_to_restaurant'
  returning order_id into target_order_id;

  if target_order_id is null then
    return false;
  end if;

  update public.orders
  set status = 'picked_up'
  where id = target_order_id;

  update public.drivers
  set status = 'picked_up'
  where id = viewer_driver_id;

  insert into public.delivery_status_history (delivery_id, status, comment)
  values (target_delivery_id, 'handed_over', 'driver confirmed pickup');

  return true;
end;
$$;

grant execute on function public.confirm_driver_pickup(uuid) to authenticated;

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

create or replace function public.get_public_order_tracking(target_order_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'driver_id', d.id,
    'driver_name', coalesce(d.name, ''),
    'driver_phone', coalesce(d.phone, ''),
    'driver_status', coalesce(d.status, 'offline'),
    'driver_lat', d.last_lat,
    'driver_lng', d.last_lng,
    'driver_accuracy', d.last_location_accuracy,
    'driver_location_at', d.last_location_at,
    'delivery_status', coalesce(delivery.status, 'waiting_courier')
  )
  from public.orders o
  join public.deliveries delivery on delivery.order_id = o.id
  join public.drivers d on d.id = delivery.driver_id
  where o.id = target_order_id
  limit 1
$$;

grant execute on function public.get_public_order_tracking(uuid) to anon, authenticated;
