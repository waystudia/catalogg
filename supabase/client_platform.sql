-- WayCatalog client platform tables.
-- Safe to run after catalog_supabase_schema.sql and restaurant_orders.sql.

alter type public.order_status add value if not exists 'waiting_payment_confirmation';
alter type public.order_status add value if not exists 'cooking';
alter type public.order_status add value if not exists 'ready';
alter type public.order_status add value if not exists 'waiting_driver';
alter type public.order_status add value if not exists 'on_the_way';
alter type public.order_status add value if not exists 'canceled';

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  region text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_themes (
  id uuid primary key default gen_random_uuid(),
  accent_color text not null default '#5b3df4',
  background_color text not null default '#ffffff',
  button_color text not null default '#5b3df4',
  button_text_color text not null default '#ffffff',
  card_color text not null default '#ffffff',
  text_color text not null default '#111827',
  muted_text_color text not null default '#667085',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid references public.catalogs(id) on delete set null,
  name text not null,
  slug text unique not null,
  description text not null default '',
  city_id uuid references public.cities(id) on delete set null,
  logo_url text not null default '',
  cover_url text not null default '',
  rating numeric(3,2) not null default 0,
  min_order_amount numeric(12,2) not null default 0 check (min_order_amount >= 0),
  free_delivery_from numeric(12,2) not null default 0 check (free_delivery_from >= 0),
  delivery_time_from integer not null default 30 check (delivery_time_from >= 0),
  delivery_time_to integer not null default 40 check (delivery_time_to >= 0),
  delivery_provider text not null default 'restaurant'
    check (delivery_provider in ('restaurant', 'platform', 'pickup', 'dine_in')),
  allow_dine_in boolean not null default true,
  allow_pickup boolean not null default true,
  allow_delivery boolean not null default true,
  is_active boolean not null default true,
  theme_id uuid references public.restaurant_themes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_socials (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  instagram_url text not null default '',
  whatsapp_phone text not null default '',
  location_url text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.platform_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  image_url text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_platform_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  platform_category_id uuid not null references public.platform_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (restaurant_id, platform_category_id)
);

create table if not exists public.restaurant_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  slug text not null,
  image_url text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, slug)
);

create table if not exists public.dishes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id uuid references public.restaurant_categories(id) on delete set null,
  name text not null,
  description text not null default '',
  price numeric(12,2) not null default 0 check (price >= 0),
  image_url text not null default '',
  weight text not null default '',
  tags text[] not null default '{}',
  is_popular boolean not null default false,
  is_active boolean not null default true,
  stock_count integer not null default 0 check (stock_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  role text not null default 'client' check (role in ('client', 'restaurant_admin', 'driver', 'super_admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.client_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  default_city_id uuid references public.cities(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.client_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  phone text not null default '',
  source text not null default 'client_profile',
  created_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  id text primary key default 'global',
  support_whatsapp text not null default '',
  updated_at timestamptz not null default now(),
  check (id = 'global')
);

insert into public.platform_settings (id, support_whatsapp)
values ('global', '')
on conflict (id) do nothing;

create table if not exists public.platform_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  subtitle text not null default '',
  kind text not null default 'promo' check (kind in ('contest', 'promo', 'news')),
  image_url text not null default '',
  link_url text not null default '/restaurants',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null default '',
  address_line text not null,
  lat numeric(10,7),
  lng numeric(10,7),
  comment text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_payment_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  enable_qr boolean not null default false,
  enable_bank_transfer boolean not null default true,
  enable_cash boolean not null default true,
  bank_name text not null default '',
  recipient_full_name text not null default '',
  recipient_phone text not null default '',
  payment_comment text not null default '',
  qr_image_url text not null default '',
  require_manual_confirmation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id)
);

alter table public.orders add column if not exists restaurant_id uuid references public.restaurants(id) on delete set null;
alter table public.orders add column if not exists client_id uuid references public.users(id) on delete set null;
alter table public.orders add column if not exists city_id uuid references public.cities(id) on delete set null;
alter table public.orders add column if not exists order_type text not null default 'dine_in'
  check (order_type in ('dine_in', 'pickup', 'delivery'));
alter table public.orders add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid', 'waiting_confirmation', 'confirmed', 'rejected'));
alter table public.orders add column if not exists delivery_provider text not null default 'dine_in'
  check (delivery_provider in ('restaurant', 'platform', 'pickup', 'dine_in'));
alter table public.orders add column if not exists client_name text not null default '';
alter table public.orders add column if not exists client_phone text not null default '';
alter table public.orders add column if not exists address_id uuid references public.client_addresses(id) on delete set null;
alter table public.orders add column if not exists delivery_address text;
alter table public.orders add column if not exists delivery_lat numeric(10,7);
alter table public.orders add column if not exists delivery_lng numeric(10,7);
alter table public.orders add column if not exists delivery_comment text;
alter table public.orders add column if not exists booth_name text;
alter table public.orders add column if not exists subtotal_amount numeric(12,2) not null default 0;
alter table public.orders add column if not exists total_amount numeric(12,2) not null default 0;

alter table public.order_items add column if not exists dish_id uuid references public.dishes(id) on delete set null;
alter table public.order_items add column if not exists dish_name_snapshot text not null default '';
alter table public.order_items add column if not exists price_snapshot numeric(12,2) not null default 0;

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  name text not null,
  phone text not null default '',
  vehicle_info text not null default '',
  is_active boolean not null default true,
  city_id uuid references public.cities(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.client_reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.catalogs(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  client_name text not null default '',
  client_phone text not null default '',
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  target_type text not null default 'restaurant' check (target_type in ('restaurant', 'driver')),
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  delivery_provider text not null default 'restaurant'
    check (delivery_provider in ('restaurant', 'platform', 'pickup', 'dine_in')),
  status text not null default 'waiting_driver'
    check (status in ('waiting_driver', 'assigned', 'on_the_way', 'delivered', 'canceled')),
  estimated_time_min integer not null default 20 check (estimated_time_min >= 0),
  estimated_time_max integer not null default 40 check (estimated_time_max >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

create table if not exists public.favorites_restaurants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, restaurant_id)
);

create table if not exists public.favorites_dishes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  dish_id uuid not null references public.dishes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, dish_id)
);

create index if not exists restaurants_city_active_idx on public.restaurants(city_id, is_active);
create index if not exists restaurants_slug_idx on public.restaurants(slug);
create index if not exists platform_categories_slug_idx on public.platform_categories(slug);
create index if not exists restaurant_platform_categories_lookup_idx on public.restaurant_platform_categories(platform_category_id, restaurant_id);
create index if not exists restaurant_categories_restaurant_idx on public.restaurant_categories(restaurant_id, sort_order);
create index if not exists dishes_restaurant_category_idx on public.dishes(restaurant_id, category_id, is_active);
create index if not exists client_signups_created_idx on public.client_signups(created_at desc);
create index if not exists platform_banners_order_idx on public.platform_banners(is_active, sort_order);
create index if not exists client_reviews_restaurant_idx on public.client_reviews(restaurant_id, created_at desc);
create index if not exists client_addresses_user_idx on public.client_addresses(user_id, is_default desc);
create index if not exists orders_client_status_idx on public.orders(client_id, status, created_at desc);
create index if not exists deliveries_order_idx on public.deliveries(order_id);

alter table public.client_signups enable row level security;
alter table public.platform_settings enable row level security;
alter table public.platform_banners enable row level security;
alter table public.client_reviews enable row level security;

drop policy if exists "client signups public insert" on public.client_signups;
create policy "client signups public insert" on public.client_signups
for insert with check (true);

drop policy if exists "client signups platform admins read" on public.client_signups;
create policy "client signups platform admins read" on public.client_signups
for select using (public.is_platform_admin());

drop policy if exists "client signups platform admins manage" on public.client_signups;
create policy "client signups platform admins manage" on public.client_signups
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "platform settings public read" on public.platform_settings;
create policy "platform settings public read" on public.platform_settings
for select using (true);

drop policy if exists "platform settings admins manage" on public.platform_settings;
create policy "platform settings admins manage" on public.platform_settings
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "platform banners public read active" on public.platform_banners;
create policy "platform banners public read active" on public.platform_banners
for select using (is_active or public.is_platform_admin());

drop policy if exists "platform banners admins manage" on public.platform_banners;
create policy "platform banners admins manage" on public.platform_banners
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "client reviews public insert" on public.client_reviews;
create policy "client reviews public insert" on public.client_reviews
for insert with check (true);

drop policy if exists "client reviews public read visible" on public.client_reviews;
create policy "client reviews public read visible" on public.client_reviews
for select using (is_visible or public.is_platform_admin());

drop policy if exists "client reviews admins manage" on public.client_reviews;
create policy "client reviews admins manage" on public.client_reviews
for all using (public.is_platform_admin())
with check (public.is_platform_admin());
