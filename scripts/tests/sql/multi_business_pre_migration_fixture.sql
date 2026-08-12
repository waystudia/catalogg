\set ON_ERROR_STOP on

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

create table auth.users (
  id uuid primary key,
  email text unique
);

create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create type public.catalog_role as enum ('owner', 'admin', 'editor', 'viewer');
create type public.catalog_status as enum ('draft', 'published', 'archived');
create type public.product_status as enum ('draft', 'active', 'hidden', 'sold_out', 'archived');
create type public.order_status as enum ('new', 'accepted', 'preparing', 'ready', 'completed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default ''
);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  business_type text not null default 'restaurant'
);

create table public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  version integer not null default 1
);

create table public.catalogs (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid references public.template_versions(id),
  slug text not null unique,
  name text not null,
  description text,
  status public.catalog_status not null default 'draft',
  logo_url text,
  is_template boolean not null default false,
  template_name text,
  business_type text not null default 'restaurant',
  template_type text not null default 'restaurant',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalogs_business_type_check
    check (business_type in ('restaurant', 'coffee_shop', 'confectionery')),
  constraint catalogs_template_type_check
    check (template_type in ('restaurant', 'coffee_shop', 'confectionery'))
);

create table public.catalog_members (
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.catalog_role not null,
  primary key (catalog_id, user_id)
);

create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  role text not null default 'client'
);

create table public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  phone_normalized text not null unique,
  password_hash text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_account_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.client_accounts(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create or replace function public.normalize_client_phone(raw_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when char_length(regexp_replace(coalesce(raw_phone, ''), '[^0-9]', '', 'g')) = 11
      and left(regexp_replace(coalesce(raw_phone, ''), '[^0-9]', '', 'g'), 1) = '8'
      then '7' || substring(regexp_replace(coalesce(raw_phone, ''), '[^0-9]', '', 'g') from 2)
    when char_length(regexp_replace(coalesce(raw_phone, ''), '[^0-9]', '', 'g')) = 10
      then '7' || regexp_replace(coalesce(raw_phone, ''), '[^0-9]', '', 'g')
    else regexp_replace(coalesce(raw_phone, ''), '[^0-9]', '', 'g')
  end;
$$;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  name text not null,
  slug text not null default gen_random_uuid()::text
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  title text not null,
  slug text not null default gen_random_uuid()::text,
  sku text not null default '',
  status public.product_status not null default 'draft',
  price integer not null default 0 check (price >= 0),
  stock_count integer not null default 0 check (stock_count >= 0),
  is_unlimited boolean not null default false,
  unique (catalog_id, slug)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  client_id uuid references public.users(id) on delete set null,
  status public.order_status not null default 'new',
  customer_name text not null default '',
  customer_phone text not null default '',
  client_phone text not null default '',
  subtotal integer not null default 0,
  subtotal_amount integer not null default 0,
  delivery_fee integer not null default 0,
  total_amount integer not null default 0,
  total integer not null default 0,
  payment_status text not null default 'unpaid'
);

create table public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null,
  catalog_id uuid references public.catalogs(id) on delete cascade,
  driver_id uuid,
  order_id uuid references public.orders(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  app_base_url text not null default '',
  user_agent text not null default '',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table public.order_items (
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

create table public.restaurant_delivery_settings (
  catalog_id uuid primary key references public.catalogs(id) on delete cascade,
  delivery_area_mode text not null,
  primary_city text not null default '',
  service_settlements text[] not null default '{}'::text[]
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  catalog_id uuid not null unique references public.catalogs(id) on delete cascade,
  company_name text not null,
  business_type text not null default 'restaurant',
  template_type text not null default 'restaurant',
  owner_name text not null default '',
  email text not null unique,
  phone text not null default '',
  primary_city text not null default '',
  service_settlements text[] not null default '{}'::text[],
  status text not null default 'active',
  legal_activation_status text not null default 'draft',
  plan_code text not null default 'trial',
  subscription_status text not null default 'trial',
  subscription_ends_at timestamptz,
  first_login boolean not null default true,
  consent_given boolean not null default false,
  consent_source text,
  admin_consent_confirmed boolean not null default false,
  admin_consent_confirmed_at timestamptz,
  admin_consent_actor_id uuid references auth.users(id),
  created_by uuid references auth.users(id),
  constraint clients_business_type_check
    check (business_type in ('restaurant', 'coffee_shop', 'confectionery')),
  constraint clients_template_type_check
    check (template_type in ('restaurant', 'coffee_shop', 'confectionery'))
);

create table public.client_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  plan_code text not null,
  status text not null,
  started_at timestamptz not null,
  ends_at timestamptz
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid references public.catalogs(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_table text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb
);

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins platform_admin
    where platform_admin.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_catalog_member(
  target_catalog_id uuid,
  allowed_roles public.catalog_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.catalog_members member
    where member.catalog_id = target_catalog_id
      and member.user_id = (select auth.uid())
      and (allowed_roles is null or member.role = any(allowed_roles))
  );
$$;

create or replace function public.is_catalog_published(target_catalog_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.catalogs catalog
    where catalog.id = target_catalog_id
      and catalog.status = 'published'
  );
$$;

create or replace function public.create_restaurant_from_template(
  template_id uuid,
  new_restaurant_name text,
  new_restaurant_slug text default null,
  new_template_version_id uuid default null,
  created_by_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_catalog public.catalogs%rowtype;
  created_catalog_id uuid;
begin
  select * into source_catalog
  from public.catalogs catalog
  where catalog.id = template_id and catalog.is_template = true;

  if source_catalog.id is null then
    raise exception 'template_not_found';
  end if;

  insert into public.catalogs (
    template_version_id,
    slug,
    name,
    description,
    status,
    logo_url,
    is_template,
    business_type,
    template_type,
    created_by
  )
  values (
    coalesce(new_template_version_id, source_catalog.template_version_id),
    lower(trim(new_restaurant_slug)),
    trim(new_restaurant_name),
    source_catalog.description,
    'published',
    source_catalog.logo_url,
    false,
    source_catalog.business_type,
    source_catalog.template_type,
    created_by_user_id
  )
  returning id into created_catalog_id;

  insert into public.categories (catalog_id, name)
  select created_catalog_id, category.name
  from public.categories category
  where category.catalog_id = template_id;

  insert into public.products (catalog_id, category_id, title)
  select created_catalog_id, null, product.title
  from public.products product
  where product.catalog_id = template_id;

  return created_catalog_id;
end;
$$;

alter table public.catalogs enable row level security;
alter table public.products enable row level security;

create policy "catalogs public read published"
on public.catalogs
for select
to anon
using (status = 'published' and is_template = false);

create policy "catalogs members read own"
on public.catalogs
for select
to authenticated
using (public.is_catalog_member(id));

create policy "products public and member read"
on public.products
for select
using (
  (status in ('active', 'sold_out') and public.is_catalog_published(catalog_id))
  or public.is_catalog_member(catalog_id)
);

grant usage on schema public, auth to anon, authenticated, service_role;
grant select on public.catalogs to anon, authenticated;
grant select on public.products to anon, authenticated;
grant all on all tables in schema public to service_role;

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000010', 'fixture-admin@wayyaam.test');

insert into public.profiles (id, email, full_name)
values ('00000000-0000-4000-8000-000000000010', 'fixture-admin@wayyaam.test', 'Fixture Admin');

insert into public.templates (id, key, name, business_type)
values ('00000000-0000-4000-8000-000000000020', 'restaurant', 'Restaurant', 'restaurant');

insert into public.template_versions (id, template_id, version)
values (
  '00000000-0000-4000-8000-000000000021',
  '00000000-0000-4000-8000-000000000020',
  1
);

insert into public.catalogs (
  id,
  template_version_id,
  slug,
  name,
  status,
  is_template,
  template_name,
  business_type,
  template_type,
  created_by
)
values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000021',
  'restaurant-template',
  'Restaurant Template',
  'draft',
  true,
  'restaurant',
  'restaurant',
  'restaurant',
  '00000000-0000-4000-8000-000000000010'
);
