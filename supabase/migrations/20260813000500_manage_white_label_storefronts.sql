-- Super-admin control plane for one primary branded storefront per catalog.
-- Domain ownership is still verified operationally through DNS/TLS before the
-- administrator confirms the token and activates the row.

alter table public.catalog_storefront_domains
  drop constraint if exists catalog_storefront_domains_reserved_hostname_check;
alter table public.catalog_storefront_domains
  add constraint catalog_storefront_domains_reserved_hostname_check
  check (
    hostname not in (
      'wayyaam.ru',
      'www.wayyaam.ru',
      'studia95.github.io',
      'localhost',
      '127.0.0.1'
    )
  );

create table if not exists public.catalog_storefront_domain_events (
  id bigint generated always as identity primary key,
  domain_id uuid not null references public.catalog_storefront_domains(id) on delete cascade,
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created', 'updated', 'activated', 'suspended', 'reset_pending')),
  previous_status text,
  next_status text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists catalog_storefront_domain_events_catalog_idx
  on public.catalog_storefront_domain_events(catalog_id, created_at desc);

alter table public.catalog_storefront_domain_events enable row level security;

drop policy if exists "storefront domain events platform read" on public.catalog_storefront_domain_events;
create policy "storefront domain events platform read"
on public.catalog_storefront_domain_events for select to authenticated
using (public.is_platform_admin());

revoke all on table public.catalog_storefront_domain_events from public, anon, authenticated;
grant select on table public.catalog_storefront_domain_events to authenticated, service_role;
grant usage, select on sequence public.catalog_storefront_domain_events_id_seq to service_role;

revoke insert, update, delete on table public.catalog_storefront_domains from authenticated;

create or replace function public.save_catalog_storefront_domain(
  target_catalog_id uuid,
  target_hostname text,
  target_brand_name text,
  target_short_name text,
  target_logo_url text default '',
  target_icon_192_url text default '',
  target_icon_512_url text default '',
  target_theme_color text default '#6C5CE7',
  target_background_color text default '#F5F6F8',
  target_storefront_mode text default 'exclusive'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_hostname text := public.normalize_storefront_hostname(target_hostname);
  domain_record public.catalog_storefront_domains%rowtype;
  saved_domain_id uuid;
  next_status text;
  event_action text;
begin
  if not public.is_platform_admin() then
    raise exception 'platform_admin_required';
  end if;

  if not exists (
    select 1
    from public.catalogs catalog
    where catalog.id = target_catalog_id
      and catalog.is_template is false
  ) then
    raise exception 'catalog_storefront_catalog_invalid';
  end if;

  if normalized_hostname in (
    'wayyaam.ru', 'www.wayyaam.ru', 'studia95.github.io', 'localhost', '127.0.0.1'
  ) then
    raise exception 'catalog_storefront_reserved_hostname';
  end if;

  select domain.*
  into domain_record
  from public.catalog_storefront_domains domain
  where domain.catalog_id = target_catalog_id
    and domain.is_primary
  for update;

  if domain_record.id is null then
    insert into public.catalog_storefront_domains (
      catalog_id,
      hostname,
      status,
      is_primary,
      storefront_mode,
      brand_name,
      short_name,
      logo_url,
      icon_192_url,
      icon_512_url,
      theme_color,
      background_color,
      powered_by_wayyaam
    ) values (
      target_catalog_id,
      normalized_hostname,
      'pending',
      true,
      target_storefront_mode,
      target_brand_name,
      target_short_name,
      coalesce(target_logo_url, ''),
      coalesce(target_icon_192_url, ''),
      coalesce(target_icon_512_url, ''),
      upper(target_theme_color),
      upper(target_background_color),
      true
    )
    returning id into saved_domain_id;
    next_status := 'pending';
    event_action := 'created';
  else
    next_status := case
      when domain_record.hostname <> normalized_hostname then 'pending'
      else domain_record.status
    end;
    event_action := case
      when domain_record.hostname <> normalized_hostname then 'reset_pending'
      else 'updated'
    end;

    update public.catalog_storefront_domains
    set hostname = normalized_hostname,
        status = next_status,
        verified_at = case when domain_record.hostname <> normalized_hostname then null else verified_at end,
        storefront_mode = target_storefront_mode,
        brand_name = target_brand_name,
        short_name = target_short_name,
        logo_url = coalesce(target_logo_url, ''),
        icon_192_url = coalesce(target_icon_192_url, ''),
        icon_512_url = coalesce(target_icon_512_url, ''),
        theme_color = upper(target_theme_color),
        background_color = upper(target_background_color),
        powered_by_wayyaam = true
    where id = domain_record.id
    returning id into saved_domain_id;
  end if;

  insert into public.catalog_storefront_domain_events (
    domain_id, catalog_id, actor_user_id, action, previous_status, next_status, snapshot
  )
  select
    domain.id,
    domain.catalog_id,
    auth.uid(),
    event_action,
    domain_record.status,
    domain.status,
    jsonb_build_object(
      'hostname', domain.hostname,
      'brand_name', domain.brand_name,
      'storefront_mode', domain.storefront_mode,
      'powered_by_wayyaam', domain.powered_by_wayyaam
    )
  from public.catalog_storefront_domains domain
  where domain.id = saved_domain_id;

  return saved_domain_id;
exception
  when unique_violation then
    raise exception 'catalog_storefront_hostname_taken';
end;
$$;

create or replace function public.set_catalog_storefront_domain_status(
  target_domain_id uuid,
  target_status text,
  target_verification_token text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  domain_record public.catalog_storefront_domains%rowtype;
  next_verified_at timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'platform_admin_required';
  end if;
  if target_status not in ('pending', 'active', 'suspended') then
    raise exception 'catalog_storefront_status_invalid';
  end if;

  select domain.*
  into domain_record
  from public.catalog_storefront_domains domain
  join public.catalogs catalog on catalog.id = domain.catalog_id
  where domain.id = target_domain_id
    and catalog.is_template is false
  for update of domain;

  if domain_record.id is null then
    raise exception 'catalog_storefront_not_found';
  end if;

  if target_status = 'active' then
    if target_verification_token is distinct from domain_record.verification_token then
      raise exception 'catalog_storefront_verification_required';
    end if;
    if not exists (
      select 1
      from public.catalogs catalog
      where catalog.id = domain_record.catalog_id
        and catalog.status = 'published'
        and catalog.is_template is false
    ) then
      raise exception 'catalog_storefront_published_catalog_required';
    end if;
    next_verified_at := coalesce(domain_record.verified_at, now());
  elsif target_status = 'pending' then
    next_verified_at := null;
  else
    next_verified_at := domain_record.verified_at;
  end if;

  update public.catalog_storefront_domains
  set status = target_status,
      verified_at = next_verified_at
  where id = domain_record.id;

  insert into public.catalog_storefront_domain_events (
    domain_id, catalog_id, actor_user_id, action, previous_status, next_status, snapshot
  ) values (
    domain_record.id,
    domain_record.catalog_id,
    auth.uid(),
    case target_status
      when 'active' then 'activated'
      when 'suspended' then 'suspended'
      else 'reset_pending'
    end,
    domain_record.status,
    target_status,
    jsonb_build_object('hostname', domain_record.hostname, 'verified_at', next_verified_at)
  );

  return target_status;
end;
$$;

revoke all on function public.save_catalog_storefront_domain(
  uuid, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.set_catalog_storefront_domain_status(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.save_catalog_storefront_domain(
  uuid, text, text, text, text, text, text, text, text, text
) to authenticated, service_role;
grant execute on function public.set_catalog_storefront_domain_status(uuid, text, text)
  to authenticated, service_role;
