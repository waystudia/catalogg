-- Keep every official WayYaam hostname out of the white-label registry.
-- The historical GitHub Pages hostname stays reserved for old links while
-- waystudia.github.io is the current repository owner hostname.

alter table public.catalog_storefront_domains
  drop constraint if exists catalog_storefront_domains_reserved_hostname_check;

alter table public.catalog_storefront_domains
  add constraint catalog_storefront_domains_reserved_hostname_check
  check (
    hostname not in (
      'wayyaam.ru',
      'www.wayyaam.ru',
      'studia95.github.io',
      'waystudia.github.io',
      'localhost',
      '127.0.0.1'
    )
  );

create or replace function public.reject_catalog_storefront_reserved_hostname()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.normalize_storefront_hostname(new.hostname) in (
    'wayyaam.ru',
    'www.wayyaam.ru',
    'studia95.github.io',
    'waystudia.github.io',
    'localhost',
    '127.0.0.1'
  ) then
    raise exception 'catalog_storefront_reserved_hostname';
  end if;

  return new;
end;
$$;

revoke all on function public.reject_catalog_storefront_reserved_hostname()
  from public, anon, authenticated;

drop trigger if exists reject_catalog_storefront_reserved_hostname
  on public.catalog_storefront_domains;
create trigger reject_catalog_storefront_reserved_hostname
before insert or update of hostname on public.catalog_storefront_domains
for each row execute function public.reject_catalog_storefront_reserved_hostname();
