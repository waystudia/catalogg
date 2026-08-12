\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.catalog_storefront_domains') is null then
    raise exception 'white-label domain registry missing';
  end if;
  if has_table_privilege('anon', 'public.catalog_storefront_domains', 'select') then
    raise exception 'anonymous users can enumerate storefront domains';
  end if;
end;
$$;

update public.catalogs
set status = 'published'
where slug = 'finiki-ci';

insert into public.catalog_storefront_domains (
  id,
  catalog_id,
  hostname,
  status,
  verified_at,
  brand_name,
  short_name,
  logo_url,
  icon_192_url,
  icon_512_url,
  theme_color,
  background_color
)
select
  '00000000-0000-4000-8000-000000000401',
  catalog.id,
  'Finiki.Example.',
  'active',
  now(),
  'Финики',
  'Финики',
  '/brand/finiki-logo.png',
  '/brand/finiki-192.png',
  '/brand/finiki-512.png',
  '#8A4B22',
  '#FFFAF4'
from public.catalogs catalog
where catalog.slug = 'finiki-ci';

insert into public.catalog_storefront_domains (
  id, catalog_id, hostname, status, brand_name, short_name
)
values (
  '00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000201',
  'pending.example',
  'pending',
  'Pending',
  'Pending'
);

set role anon;

do $$
declare
  storefront record;
begin
  select * into storefront
  from public.get_public_storefront_by_hostname('https://FINIKI.example:443/path');
  if storefront.catalog_slug <> 'finiki-ci'
    or storefront.brand_name <> 'Финики'
    or storefront.storefront_mode <> 'exclusive'
    or storefront.powered_by_wayyaam is not true then
    raise exception 'verified storefront did not resolve its exact catalog and brand';
  end if;
  if exists (select 1 from public.get_public_storefront_by_hostname('pending.example')) then
    raise exception 'pending storefront became publicly visible';
  end if;
end;
$$;

reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', false);
set role authenticated;

do $$
begin
  if not exists (
    select 1 from public.catalog_storefront_domains domain
    where domain.hostname = 'finiki.example'
  ) then
    raise exception 'catalog owner cannot read own storefront domain';
  end if;
  if exists (
    select 1 from public.catalog_storefront_domains domain
    where domain.hostname = 'pending.example'
  ) then
    raise exception 'catalog owner can read another tenant storefront domain';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

\echo 'White-label storefront acceptance passed.'
