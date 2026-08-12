-- One static application and one WayYaam backend can serve verified branded
-- domains. DNS/TLS activation remains an infrastructure step; unverified rows
-- are never returned to the public client.

create or replace function public.normalize_storefront_hostname(input_hostname text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(trailing '.' from lower(
    regexp_replace(
      regexp_replace(trim(coalesce(input_hostname, '')), '^https?://', '', 'i'),
      '[:/].*$',
      ''
    )
  ));
$$;

create table if not exists public.catalog_storefront_domains (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  hostname text not null,
  status text not null default 'pending',
  verification_token text not null default encode(gen_random_bytes(24), 'hex'),
  verified_at timestamptz,
  is_primary boolean not null default true,
  storefront_mode text not null default 'exclusive',
  brand_name text not null,
  short_name text not null,
  logo_url text not null default '',
  icon_192_url text not null default '',
  icon_512_url text not null default '',
  theme_color text not null default '#6C5CE7',
  background_color text not null default '#F5F6F8',
  powered_by_wayyaam boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_storefront_domains_hostname_unique unique (hostname),
  constraint catalog_storefront_domains_hostname_normalized_check
    check (
      hostname = public.normalize_storefront_hostname(hostname)
      and char_length(hostname) between 4 and 253
      and hostname ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$'
    ),
  constraint catalog_storefront_domains_status_check
    check (status in ('pending', 'active', 'suspended')),
  constraint catalog_storefront_domains_active_verified_check
    check (status <> 'active' or verified_at is not null),
  constraint catalog_storefront_domains_mode_check
    check (storefront_mode in ('exclusive', 'marketplace')),
  constraint catalog_storefront_domains_brand_name_check
    check (char_length(trim(brand_name)) between 1 and 80),
  constraint catalog_storefront_domains_short_name_check
    check (char_length(trim(short_name)) between 1 and 24),
  constraint catalog_storefront_domains_theme_color_check
    check (theme_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint catalog_storefront_domains_background_color_check
    check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint catalog_storefront_domains_wayyaam_infrastructure_check
    check (powered_by_wayyaam)
);

create unique index if not exists catalog_storefront_domains_primary_catalog_idx
  on public.catalog_storefront_domains(catalog_id)
  where is_primary;

create index if not exists catalog_storefront_domains_public_lookup_idx
  on public.catalog_storefront_domains(hostname, status)
  where status = 'active';

create or replace function public.prepare_catalog_storefront_domain()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.hostname := public.normalize_storefront_hostname(new.hostname);
  new.brand_name := trim(new.brand_name);
  new.short_name := trim(new.short_name);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists prepare_catalog_storefront_domain on public.catalog_storefront_domains;
create trigger prepare_catalog_storefront_domain
before insert or update on public.catalog_storefront_domains
for each row execute function public.prepare_catalog_storefront_domain();

alter table public.catalog_storefront_domains enable row level security;

drop policy if exists "storefront domains tenant read" on public.catalog_storefront_domains;
create policy "storefront domains tenant read"
on public.catalog_storefront_domains for select to authenticated
using (
  public.is_platform_admin()
  or public.is_catalog_member(
    catalog_id,
    array['owner', 'admin', 'editor', 'viewer']::public.catalog_role[]
  )
);

drop policy if exists "storefront domains platform write" on public.catalog_storefront_domains;
create policy "storefront domains platform write"
on public.catalog_storefront_domains for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

revoke all on table public.catalog_storefront_domains from public, anon;
grant select on table public.catalog_storefront_domains to authenticated, service_role;
grant insert, update, delete on table public.catalog_storefront_domains to authenticated, service_role;

create or replace function public.get_public_storefront_by_hostname(input_hostname text)
returns table (
  catalog_id uuid,
  catalog_slug text,
  business_type text,
  hostname text,
  brand_name text,
  short_name text,
  logo_url text,
  icon_192_url text,
  icon_512_url text,
  theme_color text,
  background_color text,
  storefront_mode text,
  powered_by_wayyaam boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    domain.catalog_id,
    catalog.slug,
    catalog.business_type,
    domain.hostname,
    domain.brand_name,
    domain.short_name,
    coalesce(nullif(domain.logo_url, ''), catalog.logo_url, ''),
    domain.icon_192_url,
    domain.icon_512_url,
    domain.theme_color,
    domain.background_color,
    domain.storefront_mode,
    domain.powered_by_wayyaam
  from public.catalog_storefront_domains domain
  join public.catalogs catalog on catalog.id = domain.catalog_id
  where domain.hostname = public.normalize_storefront_hostname(input_hostname)
    and domain.status = 'active'
    and domain.verified_at is not null
    and catalog.status = 'published'
    and catalog.is_template is false
  limit 1;
$$;

revoke all on function public.normalize_storefront_hostname(text) from public, anon;
revoke all on function public.get_public_storefront_by_hostname(text) from public;
grant execute on function public.normalize_storefront_hostname(text) to authenticated, service_role;
grant execute on function public.get_public_storefront_by_hostname(text) to anon, authenticated, service_role;
