-- Multi-business tenant foundation. Existing catalog/order tables remain intact;
-- business_type becomes registry-backed and grocery starts as a private draft.

create table if not exists public.business_types (
  code text primary key,
  label text not null,
  availability text not null
    check (availability in ('active', 'disabled', 'compliance_blocked')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.business_types (code, label, availability, sort_order)
values
  ('restaurant', 'Ресторан', 'active', 10),
  ('coffee_shop', 'Кофейня', 'active', 20),
  ('confectionery', 'Кондитерская', 'active', 30),
  ('grocery', 'Продуктовый магазин', 'active', 40),
  ('flowers', 'Цветочный магазин', 'disabled', 50),
  ('gifts', 'Магазин подарков', 'disabled', 60),
  ('household', 'Хозяйственный магазин', 'disabled', 70),
  ('pharmacy', 'Аптека', 'compliance_blocked', 80)
on conflict (code) do update set
  label = excluded.label,
  availability = excluded.availability,
  sort_order = excluded.sort_order,
  updated_at = now();

alter table public.business_types enable row level security;

drop policy if exists "platform admins read business types" on public.business_types;
create policy "platform admins read business types"
on public.business_types
for select
to authenticated
using ((select public.is_platform_admin()));

revoke all on table public.business_types from public, anon;
grant select on table public.business_types to authenticated, service_role;

alter table public.clients drop constraint if exists clients_business_type_check;
alter table public.clients drop constraint if exists clients_template_type_check;
alter table public.catalogs drop constraint if exists catalogs_business_type_check;
alter table public.catalogs drop constraint if exists catalogs_template_type_check;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_business_type_registry_fkey') then
    alter table public.clients
      add constraint clients_business_type_registry_fkey
      foreign key (business_type) references public.business_types(code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clients_template_type_registry_fkey') then
    alter table public.clients
      add constraint clients_template_type_registry_fkey
      foreign key (template_type) references public.business_types(code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalogs_business_type_registry_fkey') then
    alter table public.catalogs
      add constraint catalogs_business_type_registry_fkey
      foreign key (business_type) references public.business_types(code);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'catalogs_template_type_registry_fkey') then
    alter table public.catalogs
      add constraint catalogs_template_type_registry_fkey
      foreign key (template_type) references public.business_types(code);
  end if;
end;
$$;

-- The first grocery template intentionally contains no public products. Catalog
-- and weighted-product behavior arrive in later approved slices.
do $$
declare
  base_template_id uuid;
  grocery_template_id uuid;
begin
  select catalog.id into grocery_template_id
  from public.catalogs catalog
  where catalog.is_template = true and catalog.business_type = 'grocery'
  order by catalog.created_at
  limit 1;

  if grocery_template_id is null then
    select catalog.id into base_template_id
    from public.catalogs catalog
    where catalog.is_template = true and catalog.business_type = 'restaurant'
    order by catalog.created_at
    limit 1;

    if base_template_id is null then
      raise notice 'Base restaurant template not found; grocery template seed skipped.';
      return;
    end if;

    grocery_template_id := public.create_restaurant_from_template(
      base_template_id,
      'Продуктовый магазин',
      'grocery',
      null,
      null
    );
  end if;

  update public.catalogs
  set name = 'Продуктовый магазин',
      description = 'Чистый каталог продуктового магазина для настройки владельцем.',
      slug = 'grocery',
      status = 'draft',
      is_template = true,
      template_name = 'grocery',
      business_type = 'grocery',
      template_type = 'grocery',
      updated_at = now()
  where id = grocery_template_id;

  delete from public.products where catalog_id = grocery_template_id;
  delete from public.categories where catalog_id = grocery_template_id;
end;
$$;

create or replace function public.create_platform_business_from_template(
  requested_template_id uuid,
  requested_name text,
  requested_slug text,
  requested_business_type text,
  requested_owner_user_id uuid,
  requested_owner_email text,
  requested_owner_name text,
  requested_actor_user_id uuid,
  requested_actor_email text,
  requested_phone text,
  requested_primary_city text,
  requested_service_settlements text[],
  requested_seed_demo_menu boolean,
  requested_plan_code text,
  requested_subscription_ends_at timestamptz,
  requested_client_status text,
  requested_subscription_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  business_type record;
  template_catalog record;
  created_catalog_id uuid;
  created_client_id uuid;
  normalized_settlements text[] := coalesce(requested_service_settlements, '{}'::text[]);
begin
  if not exists (
    select 1 from public.platform_admins platform_admin
    where platform_admin.user_id = requested_actor_user_id
  ) then
    raise exception 'platform_admin_required';
  end if;

  select registry.code, registry.availability
    into business_type
    from public.business_types registry
    where registry.code = requested_business_type;

  if business_type.code is null then raise exception 'business_type_unknown'; end if;
  if business_type.availability <> 'active' then raise exception 'business_type_unavailable'; end if;

  select catalog.id, catalog.template_version_id, catalog.business_type
    into template_catalog
    from public.catalogs catalog
    where catalog.id = requested_template_id
      and catalog.is_template = true;

  if template_catalog.id is null then raise exception 'business_template_unavailable'; end if;
  if template_catalog.business_type <> requested_business_type then
    raise exception 'business_template_type_mismatch';
  end if;

  if exists (select 1 from public.clients client where lower(client.email) = lower(requested_owner_email)) then
    raise exception 'business_owner_email_exists';
  end if;
  if exists (select 1 from public.catalogs catalog where lower(catalog.slug) = lower(requested_slug)) then
    raise exception 'business_slug_exists';
  end if;

  insert into public.profiles (id, email, full_name)
  values (requested_actor_user_id, coalesce(requested_actor_email, ''), '')
  on conflict (id) do update set email = excluded.email;

  insert into public.profiles (id, email, full_name)
  values (requested_owner_user_id, lower(requested_owner_email), coalesce(requested_owner_name, ''))
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name;

  created_catalog_id := public.create_restaurant_from_template(
    requested_template_id,
    requested_name,
    requested_slug,
    template_catalog.template_version_id,
    requested_actor_user_id
  );

  update public.catalogs
  set status = 'draft',
      business_type = requested_business_type,
      template_type = requested_business_type,
      updated_at = now()
  where id = created_catalog_id;

  if requested_business_type <> 'restaurant' and not requested_seed_demo_menu then
    delete from public.products where catalog_id = created_catalog_id;
    delete from public.categories where catalog_id = created_catalog_id;
  end if;

  insert into public.catalog_members (catalog_id, user_id, role)
  values (created_catalog_id, requested_owner_user_id, 'owner'::public.catalog_role)
  on conflict (catalog_id, user_id) do update set role = excluded.role;

  if nullif(trim(coalesce(requested_primary_city, '')), '') is not null
    or cardinality(normalized_settlements) > 0 then
    insert into public.restaurant_delivery_settings (
      catalog_id,
      delivery_area_mode,
      primary_city,
      service_settlements
    )
    values (
      created_catalog_id,
      case when cardinality(normalized_settlements) > 0 then 'settlements' else 'radius' end,
      coalesce(requested_primary_city, ''),
      normalized_settlements
    )
    on conflict (catalog_id) do update set
      delivery_area_mode = excluded.delivery_area_mode,
      primary_city = excluded.primary_city,
      service_settlements = excluded.service_settlements;
  end if;

  insert into public.clients (
    owner_user_id,
    catalog_id,
    company_name,
    business_type,
    template_type,
    owner_name,
    email,
    phone,
    primary_city,
    service_settlements,
    status,
    legal_activation_status,
    plan_code,
    subscription_status,
    subscription_ends_at,
    first_login,
    consent_given,
    consent_source,
    admin_consent_confirmed,
    admin_consent_confirmed_at,
    admin_consent_actor_id,
    created_by
  )
  values (
    requested_owner_user_id,
    created_catalog_id,
    trim(requested_name),
    requested_business_type,
    requested_business_type,
    coalesce(requested_owner_name, ''),
    lower(requested_owner_email),
    coalesce(requested_phone, ''),
    coalesce(requested_primary_city, ''),
    normalized_settlements,
    requested_client_status,
    'draft',
    requested_plan_code,
    requested_subscription_status,
    requested_subscription_ends_at,
    true,
    false,
    null,
    true,
    now(),
    requested_actor_user_id,
    requested_actor_user_id
  )
  returning id into created_client_id;

  insert into public.client_subscriptions (
    client_id,
    plan_code,
    status,
    started_at,
    ends_at
  )
  values (
    created_client_id,
    requested_plan_code,
    requested_subscription_status,
    now(),
    requested_subscription_ends_at
  );

  insert into public.audit_logs (
    catalog_id,
    actor_id,
    action,
    entity_table,
    entity_id,
    payload
  )
  values (
    created_catalog_id,
    requested_actor_user_id,
    'client.created',
    'clients',
    created_client_id,
    jsonb_build_object(
      'client_name', trim(requested_name),
      'actor_email', requested_actor_email,
      'owner_email', lower(requested_owner_email),
      'business_type', requested_business_type
    )
  );

  -- The existing client trigger may publish active restaurant-compatible
  -- tenants. Grocery remains private until its later publication slice.
  if requested_business_type = 'grocery' then
    update public.catalogs set status = 'draft', updated_at = now()
    where id = created_catalog_id;
  end if;

  return jsonb_build_object(
    'clientId', created_client_id,
    'catalogId', created_catalog_id,
    'slug', lower(requested_slug),
    'email', lower(requested_owner_email)
  );
end;
$$;

revoke all on function public.create_platform_business_from_template(
  uuid, text, text, text, uuid, text, text, uuid, text, text, text, text[], boolean, text, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.create_platform_business_from_template(
  uuid, text, text, text, uuid, text, text, uuid, text, text, text, text[], boolean, text, timestamptz, text, text
) to service_role;
