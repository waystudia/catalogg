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

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000105', false);
set role authenticated;

do $$
begin
  begin
    perform public.save_catalog_storefront_domain(
      '00000000-0000-4000-8000-000000000201',
      'ordinary.example',
      'Ordinary',
      'Ordinary'
    );
    raise exception 'expected_non_admin_storefront_rejection';
  exception
    when others then
      if sqlerrm = 'expected_non_admin_storefront_rejection' then raise; end if;
      if sqlerrm <> 'platform_admin_required' then raise; end if;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', false);
set role authenticated;

do $$
declare
  domain_id uuid;
  verification_token text;
begin
  begin
    perform public.save_catalog_storefront_domain(
      '00000000-0000-4000-8000-000000000201',
      'wayyaam.ru',
      'Reserved',
      'Reserved'
    );
    raise exception 'expected_reserved_hostname_rejection';
  exception
    when others then
      if sqlerrm = 'expected_reserved_hostname_rejection' then raise; end if;
      if sqlerrm <> 'catalog_storefront_reserved_hostname' then raise; end if;
  end;

  domain_id := public.save_catalog_storefront_domain(
    '00000000-0000-4000-8000-000000000201',
    'managed.example',
    'Managed Grocery',
    'Managed',
    '/managed-logo.png',
    '/managed-192.png',
    '/managed-512.png',
    '#123456',
    '#F4F5F6',
    'exclusive'
  );

  select domain.verification_token
  into verification_token
  from public.catalog_storefront_domains domain
  where domain.id = domain_id;

  begin
    perform public.set_catalog_storefront_domain_status(domain_id, 'active', verification_token);
    raise exception 'expected_draft_catalog_activation_rejection';
  exception
    when others then
      if sqlerrm = 'expected_draft_catalog_activation_rejection' then raise; end if;
      if sqlerrm <> 'catalog_storefront_published_catalog_required' then raise; end if;
  end;
end;
$$;

reset role;
update public.catalogs
set status = 'published'
where id = '00000000-0000-4000-8000-000000000201';

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', false);
set role authenticated;

do $$
declare
  domain_record public.catalog_storefront_domains%rowtype;
begin
  select domain.*
  into domain_record
  from public.catalog_storefront_domains domain
  where domain.catalog_id = '00000000-0000-4000-8000-000000000201'
    and domain.is_primary;

  begin
    perform public.set_catalog_storefront_domain_status(domain_record.id, 'active', 'wrong-token');
    raise exception 'expected_wrong_token_rejection';
  exception
    when others then
      if sqlerrm = 'expected_wrong_token_rejection' then raise; end if;
      if sqlerrm <> 'catalog_storefront_verification_required' then raise; end if;
  end;

  if public.set_catalog_storefront_domain_status(
    domain_record.id,
    'active',
    domain_record.verification_token
  ) <> 'active' then
    raise exception 'platform admin could not activate verified storefront';
  end if;

  if not exists (
    select 1
    from public.catalog_storefront_domain_events event
    where event.domain_id = domain_record.id
      and event.action = 'activated'
      and event.actor_user_id = '00000000-0000-4000-8000-000000000101'
  ) then
    raise exception 'storefront activation audit event missing';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

do $$
begin
  if has_table_privilege('anon', 'public.catalog_storefront_domains', 'select')
    or has_table_privilege('anon', 'public.catalog_storefront_domain_events', 'select') then
    raise exception 'anonymous role can read white-label control tables';
  end if;

  if has_sequence_privilege(
    'anon',
    'public.catalog_storefront_domain_events_id_seq',
    'usage'
  ) then
    raise exception 'anonymous role can use storefront event sequence';
  end if;
end;
$$;

\echo 'White-label storefront acceptance passed.'
