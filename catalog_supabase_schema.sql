-- Universal Catalog Platform schema.
-- Apply to a new Supabase project or after a planned migration from supabase/schema.sql.
-- Security model: every catalog-owned table has catalog_id; writes are gated by catalog_members.

create extension if not exists pgcrypto;

do $$
begin
  create type public.catalog_role as enum ('owner', 'admin', 'editor', 'viewer');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.catalog_status as enum ('draft', 'published', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.product_status as enum ('draft', 'active', 'hidden', 'sold_out', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.order_status as enum ('new', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.booking_status as enum ('new', 'confirmed', 'completed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  business_type text not null default 'restaurant',
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'published' check (status in ('draft', 'published', 'deprecated')),
  entry_key text not null,
  schema_version integer not null default 1,
  defaults jsonb not null default '{}'::jsonb,
  migration_notes text not null default '',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

create table if not exists public.template_presets (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.template_versions(id) on delete cascade,
  name text not null,
  settings jsonb not null default '{}'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.catalogs (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.template_versions(id) on delete restrict,
  slug text not null unique,
  name text not null,
  description text not null default '',
  status public.catalog_status not null default 'published',
  logo_url text not null default '',
  banner_url text not null default '',
  address text not null default '',
  map_url text not null default '',
  whatsapp text not null default '',
  instagram_url text not null default '',
  currency text not null default 'RUB',
  language text not null default 'ru',
  timezone text not null default 'Europe/Moscow',
  order_settings jsonb not null default '{}'::jsonb,
  booking_settings jsonb not null default '{}'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  pwa jsonb not null default '{}'::jsonb,
  is_template boolean not null default false,
  template_name text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.catalogs add column if not exists is_template boolean not null default false;
alter table public.catalogs add column if not exists template_name text;

create table if not exists public.catalog_members (
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.catalog_role not null,
  created_at timestamptz not null default now(),
  primary key (catalog_id, user_id)
);

create table if not exists public.catalog_theme_settings (
  catalog_id uuid primary key references public.catalogs(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog_sections (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  key text not null,
  title text not null default '',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  unique (catalog_id, key)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  parent_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null,
  description text not null default '',
  image_url text not null default '',
  icon text not null default '',
  is_hidden boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_id, slug)
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  name text not null,
  slug text not null,
  icon text not null default '',
  color text not null default '#f59e0b',
  sort_order integer not null default 0,
  unique (catalog_id, slug)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  title text not null,
  slug text not null,
  sku text not null default '',
  status public.product_status not null default 'draft',
  price integer not null default 0 check (price >= 0),
  old_price integer check (old_price is null or old_price >= 0),
  cost_price integer check (cost_price is null or cost_price >= 0),
  description text not null default '',
  ingredients text not null default '',
  weight text not null default '',
  serving text not null default '',
  stock_count integer not null default 0 check (stock_count >= 0),
  is_unlimited boolean not null default false,
  is_popular boolean not null default false,
  is_new boolean not null default false,
  is_promo boolean not null default false,
  seo jsonb not null default '{}'::jsonb,
  custom_fields jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_id, slug)
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt text not null default '',
  sort_order integer not null default 0
);

create table if not exists public.product_tags (
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (product_id, tag_id)
);

create table if not exists public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  required boolean not null default false,
  min_selected integer not null default 0 check (min_selected >= 0),
  max_selected integer not null default 1 check (max_selected >= 1),
  sort_order integer not null default 0
);

create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  group_id uuid not null references public.product_option_groups(id) on delete cascade,
  name text not null,
  price_delta integer not null default 0,
  is_default boolean not null default false,
  sort_order integer not null default 0
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  status public.order_status not null default 'new',
  customer_name text not null default '',
  customer_phone text not null default '',
  comment text not null default '',
  table_label text not null default '',
  subtotal integer not null default 0 check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  delivery_fee integer not null default 0 check (delivery_fee >= 0),
  total integer not null default 0 check (total >= 0),
  admin_comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  title text not null,
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  options jsonb not null default '[]'::jsonb,
  line_total integer not null check (line_total >= 0)
);

create table if not exists public.bookable_resources (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  title text not null,
  capacity integer not null default 1 check (capacity > 0),
  capacity_text text not null default '',
  image_url text not null default '',
  is_active boolean not null default true,
  resource_type text not null default 'normal' check (resource_type in ('normal', 'vip', 'premium')),
  sort_order integer not null default 0
);

alter table public.bookable_resources add column if not exists capacity_text text not null default '';
alter table public.bookable_resources add column if not exists resource_type text not null default 'normal' check (resource_type in ('normal', 'vip', 'premium'));

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  resource_id uuid not null references public.bookable_resources(id) on delete cascade,
  status public.booking_status not null default 'new',
  customer_name text not null,
  customer_phone text not null,
  guests integer not null default 1 check (guests > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  comment text not null default '',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.content_blocks (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  key text not null,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (catalog_id, key)
);

create table if not exists public.catalog_snapshots (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  reason text not null,
  payload jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid references public.catalogs(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_table text not null default '',
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists catalogs_template_version_id_idx on public.catalogs(template_version_id);
create index if not exists catalogs_is_template_idx on public.catalogs(is_template, created_at desc);
create index if not exists catalog_members_user_id_idx on public.catalog_members(user_id);
create index if not exists categories_catalog_id_sort_idx on public.categories(catalog_id, sort_order);
create index if not exists products_catalog_id_status_sort_idx on public.products(catalog_id, status, sort_order);
create index if not exists orders_catalog_id_status_created_idx on public.orders(catalog_id, status, created_at desc);
create index if not exists bookings_catalog_resource_time_idx on public.bookings(catalog_id, resource_id, starts_at, ends_at);
create index if not exists audit_logs_catalog_created_idx on public.audit_logs(catalog_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_catalog_member(target_catalog_id uuid, allowed_roles public.catalog_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.catalog_members member
    where member.catalog_id = target_catalog_id
      and member.user_id = auth.uid()
      and member.role = any(allowed_roles)
  );
$$;

create or replace function public.is_catalog_published(target_catalog_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.catalogs catalog
    where catalog.id = target_catalog_id
      and catalog.status = 'published'
  );
$$;

drop trigger if exists catalogs_updated_at on public.catalogs;
create trigger catalogs_updated_at before update on public.catalogs
for each row execute function public.set_updated_at();
drop trigger if exists categories_updated_at on public.categories;
create trigger categories_updated_at before update on public.categories
for each row execute function public.set_updated_at();
drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();
drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.templates enable row level security;
alter table public.template_versions enable row level security;
alter table public.template_presets enable row level security;
alter table public.catalogs enable row level security;
alter table public.catalog_members enable row level security;
alter table public.catalog_theme_settings enable row level security;
alter table public.catalog_sections enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_tags enable row level security;
alter table public.product_option_groups enable row level security;
alter table public.product_options enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.bookable_resources enable row level security;
alter table public.bookings enable row level security;
alter table public.content_blocks enable row level security;
alter table public.catalog_snapshots enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "templates public read" on public.templates;
create policy "templates public read" on public.templates for select using (true);
drop policy if exists "template versions public read published" on public.template_versions;
create policy "template versions public read published" on public.template_versions for select using (status in ('published', 'deprecated'));
drop policy if exists "template presets public read" on public.template_presets;
create policy "template presets public read" on public.template_presets for select using (true);

drop policy if exists "catalogs public read published" on public.catalogs;
create policy "catalogs public read published" on public.catalogs for select using (
  (status = 'published' and is_template = false)
  or public.is_catalog_member(id, array['owner','admin','editor','viewer']::public.catalog_role[])
);
drop policy if exists "catalogs owner admin update" on public.catalogs;
create policy "catalogs owner admin update" on public.catalogs for update using (public.is_catalog_member(id, array['owner','admin']::public.catalog_role[])) with check (public.is_catalog_member(id, array['owner','admin']::public.catalog_role[]));
drop policy if exists "catalogs owner delete" on public.catalogs;
create policy "catalogs owner delete" on public.catalogs for delete using (public.is_catalog_member(id, array['owner']::public.catalog_role[]));

drop policy if exists "members read same catalog" on public.catalog_members;
create policy "members read same catalog" on public.catalog_members for select using (public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));
drop policy if exists "members owner manage" on public.catalog_members;
create policy "members owner manage" on public.catalog_members for all using (public.is_catalog_member(catalog_id, array['owner']::public.catalog_role[])) with check (public.is_catalog_member(catalog_id, array['owner']::public.catalog_role[]));

drop policy if exists "theme public read published" on public.catalog_theme_settings;
create policy "theme public read published" on public.catalog_theme_settings for select using (public.is_catalog_published(catalog_id) or public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));
drop policy if exists "theme admin write" on public.catalog_theme_settings;
create policy "theme admin write" on public.catalog_theme_settings for all using (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[])) with check (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[]));

drop policy if exists "sections public read published" on public.catalog_sections;
create policy "sections public read published" on public.catalog_sections for select using (public.is_catalog_published(catalog_id) or public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));
drop policy if exists "sections admin write" on public.catalog_sections;
create policy "sections admin write" on public.catalog_sections for all using (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[])) with check (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[]));

drop policy if exists "categories public read published" on public.categories;
create policy "categories public read published" on public.categories for select using ((not is_hidden and public.is_catalog_published(catalog_id)) or public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));
drop policy if exists "categories editor write" on public.categories;
create policy "categories editor write" on public.categories for all using (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[])) with check (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[]));

drop policy if exists "tags public read published" on public.tags;
create policy "tags public read published" on public.tags for select using (public.is_catalog_published(catalog_id) or public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));
drop policy if exists "tags editor write" on public.tags;
create policy "tags editor write" on public.tags for all using (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[])) with check (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[]));

drop policy if exists "products public read active" on public.products;
create policy "products public read active" on public.products for select using ((status in ('active','sold_out') and public.is_catalog_published(catalog_id)) or public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));
drop policy if exists "products editor write" on public.products;
create policy "products editor write" on public.products for all using (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[])) with check (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[]));

drop policy if exists "product images public read active" on public.product_images;
create policy "product images public read active" on public.product_images for select using (public.is_catalog_published(catalog_id) or public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));
drop policy if exists "product images editor write" on public.product_images;
create policy "product images editor write" on public.product_images for all using (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[])) with check (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[]));

drop policy if exists "product tags public read" on public.product_tags;
create policy "product tags public read" on public.product_tags for select using (public.is_catalog_published(catalog_id) or public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));
drop policy if exists "product tags editor write" on public.product_tags;
create policy "product tags editor write" on public.product_tags for all using (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[])) with check (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[]));

drop policy if exists "option groups public read" on public.product_option_groups;
create policy "option groups public read" on public.product_option_groups for select using (public.is_catalog_published(catalog_id) or public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));
drop policy if exists "option groups editor write" on public.product_option_groups;
create policy "option groups editor write" on public.product_option_groups for all using (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[])) with check (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[]));
drop policy if exists "options public read" on public.product_options;
create policy "options public read" on public.product_options for select using (public.is_catalog_published(catalog_id) or public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));
drop policy if exists "options editor write" on public.product_options;
create policy "options editor write" on public.product_options for all using (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[])) with check (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[]));

drop policy if exists "orders admin read" on public.orders;
create policy "orders admin read" on public.orders for select using (public.is_catalog_member(catalog_id, array['owner','admin','viewer']::public.catalog_role[]));
drop policy if exists "orders admin update" on public.orders;
create policy "orders admin update" on public.orders for update using (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[])) with check (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[]));
drop policy if exists "order items admin read" on public.order_items;
create policy "order items admin read" on public.order_items for select using (public.is_catalog_member(catalog_id, array['owner','admin','viewer']::public.catalog_role[]));

drop policy if exists "resources public read active" on public.bookable_resources;
create policy "resources public read active" on public.bookable_resources for select using ((is_active and public.is_catalog_published(catalog_id)) or public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));
drop policy if exists "resources admin write" on public.bookable_resources;
create policy "resources admin write" on public.bookable_resources for all using (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[])) with check (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[]));
drop policy if exists "bookings admin read" on public.bookings;
create policy "bookings admin read" on public.bookings for select using (public.is_catalog_member(catalog_id, array['owner','admin','viewer']::public.catalog_role[]));
drop policy if exists "bookings admin write" on public.bookings;
create policy "bookings admin write" on public.bookings for all using (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[])) with check (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[]));

drop policy if exists "content public read published" on public.content_blocks;
create policy "content public read published" on public.content_blocks for select using (public.is_catalog_published(catalog_id) or public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[]));
drop policy if exists "content editor write" on public.content_blocks;
create policy "content editor write" on public.content_blocks for all using (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[])) with check (public.is_catalog_member(catalog_id, array['owner','admin','editor']::public.catalog_role[]));

drop policy if exists "snapshots owner admin read" on public.catalog_snapshots;
create policy "snapshots owner admin read" on public.catalog_snapshots for select using (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[]));
drop policy if exists "snapshots owner admin insert" on public.catalog_snapshots;
create policy "snapshots owner admin insert" on public.catalog_snapshots for insert with check (public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[]));
drop policy if exists "audit members read" on public.audit_logs;
create policy "audit members read" on public.audit_logs for select using (catalog_id is null or public.is_catalog_member(catalog_id, array['owner','admin','viewer']::public.catalog_role[]));

create or replace function public.create_public_order(
  target_catalog_id uuid,
  customer_name text,
  customer_phone text,
  comment text,
  table_label text,
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
begin
  if not exists (select 1 from public.catalogs where id = target_catalog_id) then
    raise exception 'Catalog does not exist';
  end if;

  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'Order items are required';
  end if;

  insert into public.orders (catalog_id, customer_name, customer_phone, comment, table_label)
  values (
    target_catalog_id,
    coalesce(nullif(trim(customer_name), ''), 'Guest'),
    coalesce(nullif(trim(customer_phone), ''), ''),
    coalesce(comment, ''),
    coalesce(table_label, '')
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
language sql
security definer
set search_path = public
as $$
  select public.create_public_order(
    target_catalog_id,
    customer_name,
    customer_phone,
    coalesce(comment, ''),
    case when fulfillment_type = 'hall' then coalesce(cabin_label, '') else '' end,
    items
  );
$$;

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

grant execute on function public.create_public_order(uuid, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.create_public_restaurant_order(uuid, text, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.create_legacy_public_restaurant_order(uuid, text, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;

insert into public.templates (key, name, business_type, description)
values
  ('restaurant-modern', 'Restaurant Modern', 'restaurant', 'Modern restaurant and cafe catalog template.'),
  ('barbershop-dark', 'Barbershop Dark', 'barbershop', 'Dark service catalog template for barbershops and salons.'),
  ('menswear-premium', 'Menswear Premium', 'fashion', 'Premium catalog template for menswear retail.')
on conflict (key) do update set
  name = excluded.name,
  business_type = excluded.business_type,
  description = excluded.description;

insert into public.template_versions (template_id, version, status, entry_key, schema_version, published_at)
select id, 1, 'published', key || '@1', 1, now()
from public.templates
where key in ('restaurant-modern', 'barbershop-dark', 'menswear-premium')
on conflict (template_id, version) do nothing;

insert into public.template_versions (template_id, version, status, entry_key, schema_version, published_at)
select id, 2, 'published', key || '@2', 1, now()
from public.templates
where key = 'restaurant-modern'
on conflict (template_id, version) do nothing;

insert into storage.buckets (id, name, public)
values
  ('catalog-assets', 'catalog-assets', true),
  ('catalog-private', 'catalog-private', false)
on conflict (id) do nothing;

drop policy if exists "catalog assets public read" on storage.objects;
create policy "catalog assets public read" on storage.objects
for select using (bucket_id = 'catalog-assets');

drop policy if exists "catalog assets members write own catalog path" on storage.objects;
create policy "catalog assets members write own catalog path" on storage.objects
for all using (
  bucket_id = 'catalog-assets'
  and public.is_catalog_member((storage.foldername(name))[1]::uuid, array['owner','admin','editor']::public.catalog_role[])
) with check (
  bucket_id = 'catalog-assets'
  and public.is_catalog_member((storage.foldername(name))[1]::uuid, array['owner','admin','editor']::public.catalog_role[])
);

drop policy if exists "catalog private members manage own catalog path" on storage.objects;
create policy "catalog private members manage own catalog path" on storage.objects
for all using (
  bucket_id = 'catalog-private'
  and public.is_catalog_member((storage.foldername(name))[1]::uuid, array['owner','admin']::public.catalog_role[])
) with check (
  bucket_id = 'catalog-private'
  and public.is_catalog_member((storage.foldername(name))[1]::uuid, array['owner','admin']::public.catalog_role[])
);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
  );
$$;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  company_name text not null,
  owner_name text,
  email text not null,
  phone text,
  status text not null default 'active' check (status in ('active', 'inactive', 'blocked', 'pending')),
  plan_code text,
  subscription_status text not null default 'trial' check (subscription_status in ('trial', 'active', 'past_due', 'expired', 'cancelled')),
  subscription_started_at timestamptz,
  subscription_ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id),
  unique(catalog_id),
  unique(email)
);

alter table public.clients add column if not exists first_login boolean not null default true;
alter table public.clients add column if not exists consent_given boolean not null default false;
alter table public.clients add column if not exists consent_given_at timestamptz;
alter table public.clients add column if not exists consent_source text;
alter table public.clients add column if not exists admin_consent_confirmed boolean not null default false;
alter table public.clients add column if not exists admin_consent_confirmed_at timestamptz;
alter table public.clients add column if not exists admin_consent_actor_id uuid references auth.users(id) on delete set null;

create table if not exists public.client_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  plan_code text not null,
  amount numeric(12,2) not null default 0,
  currency_code text not null default 'RUB',
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'expired', 'cancelled')),
  started_at timestamptz,
  ends_at timestamptz,
  paid_at timestamptz,
  auto_renew boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  phone text not null default '',
  source text not null default 'client_profile',
  created_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  name text,
  phone text,
  vehicle_info text,
  car_number text,
  photo_url text,
  city_name text,
  is_active boolean not null default true,
  is_online boolean not null default false,
  status text not null default 'offline',
  rating numeric(3,2) not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drivers add column if not exists email text;
alter table public.drivers add column if not exists city_name text;

create index if not exists clients_status_created_idx on public.clients(status, created_at desc);
create index if not exists clients_catalog_id_idx on public.clients(catalog_id);
create index if not exists clients_owner_first_login_idx on public.clients(owner_user_id, first_login);
create index if not exists client_subscriptions_client_id_idx on public.client_subscriptions(client_id);
create index if not exists client_subscriptions_status_ends_idx on public.client_subscriptions(status, ends_at);
create index if not exists client_signups_created_idx on public.client_signups(created_at desc);
create index if not exists drivers_created_idx on public.drivers(created_at desc);

create or replace function public.mark_client_personal_data_consent()
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_client public.clients;
begin
  update public.clients
  set consent_given = true,
      first_login = false,
      consent_source = 'user',
      consent_given_at = now()
  where owner_user_id = auth.uid()
  returning * into updated_client;

  if updated_client.id is null then
    raise exception 'Client record not found.';
  end if;

  return updated_client;
end;
$$;

grant execute on function public.mark_client_personal_data_consent() to authenticated;

drop trigger if exists clients_updated_at on public.clients;
create trigger clients_updated_at before update on public.clients
for each row execute function public.set_updated_at();
drop trigger if exists client_subscriptions_updated_at on public.client_subscriptions;
create trigger client_subscriptions_updated_at before update on public.client_subscriptions
for each row execute function public.set_updated_at();

alter table public.platform_admins enable row level security;
alter table public.clients enable row level security;
alter table public.client_subscriptions enable row level security;
alter table public.client_signups enable row level security;
alter table public.drivers enable row level security;

drop policy if exists "platform admins read own row" on public.platform_admins;
create policy "platform admins read own row" on public.platform_admins
for select using (user_id = auth.uid());

drop policy if exists "platform admins manage clients" on public.clients;
create policy "platform admins manage clients" on public.clients
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "clients read own record" on public.clients;
create policy "clients read own record" on public.clients
for select using (public.is_platform_admin() or owner_user_id = auth.uid());

drop policy if exists "platform admins manage subscriptions" on public.client_subscriptions;
create policy "platform admins manage subscriptions" on public.client_subscriptions
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "clients read own subscription" on public.client_subscriptions;
create policy "clients read own subscription" on public.client_subscriptions
for select using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.clients client
    where client.id = client_subscriptions.client_id
      and client.owner_user_id = auth.uid()
  )
);

drop policy if exists "platform admins manage client signups" on public.client_signups;
create policy "platform admins manage client signups" on public.client_signups
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "anon insert client signups" on public.client_signups;
create policy "anon insert client signups" on public.client_signups
for insert with check (true);

drop policy if exists "platform admins manage drivers" on public.drivers;
create policy "platform admins manage drivers" on public.drivers
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "drivers read own record" on public.drivers;
create policy "drivers read own record" on public.drivers
for select using (public.is_platform_admin() or user_id = auth.uid());

drop policy if exists "platform admins read profiles" on public.profiles;
create policy "platform admins read profiles" on public.profiles
for select using (public.is_platform_admin() or auth.uid() = id);

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert or update on auth.users
for each row execute function public.handle_new_auth_user_profile();
