\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.business_types') is null then
    raise exception 'multi-business registry missing';
  end if;
end;
$$;

do $$
begin
  if (select count(*) from public.business_types) <> 8 then
    raise exception 'expected exactly eight registered business types';
  end if;
  if (select count(*) from public.business_types where availability = 'active') <> 4 then
    raise exception 'expected exactly four active launch business types';
  end if;
  if not exists (
    select 1 from public.business_types
    where code = 'pharmacy' and availability = 'compliance_blocked'
  ) then
    raise exception 'pharmacy must remain compliance blocked';
  end if;
end;
$$;

do $$
declare
  grocery_template_id uuid;
begin
  select catalog.id into grocery_template_id
  from public.catalogs catalog
  where catalog.is_template = true and catalog.business_type = 'grocery';

  if grocery_template_id is null then
    raise exception 'grocery template missing';
  end if;
  if (select status from public.catalogs where id = grocery_template_id) <> 'draft' then
    raise exception 'grocery template must remain draft';
  end if;
  if exists (select 1 from public.categories where catalog_id = grocery_template_id)
    or exists (select 1 from public.products where catalog_id = grocery_template_id) then
    raise exception 'grocery template must start empty';
  end if;
end;
$$;

do $$
declare
  function_signature text :=
    'public.create_platform_business_from_template(uuid,text,text,text,uuid,text,text,uuid,text,text,text,text[],boolean,text,timestamp with time zone,text,text)';
begin
  if has_function_privilege('anon', function_signature, 'execute') then
    raise exception 'anon must not execute onboarding RPC';
  end if;
  if has_function_privilege('authenticated', function_signature, 'execute') then
    raise exception 'authenticated must not execute onboarding RPC directly';
  end if;
  if not has_function_privilege('service_role', function_signature, 'execute') then
    raise exception 'service role must execute onboarding RPC';
  end if;
end;
$$;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000101', 'admin@wayyaam.test'),
  ('00000000-0000-4000-8000-000000000102', 'owner-a@wayyaam.test'),
  ('00000000-0000-4000-8000-000000000103', 'owner-b@wayyaam.test'),
  ('00000000-0000-4000-8000-000000000104', 'owner-rollback@wayyaam.test'),
  ('00000000-0000-4000-8000-000000000105', 'ordinary-actor@wayyaam.test');

insert into public.platform_admins (user_id)
values ('00000000-0000-4000-8000-000000000101');

insert into public.categories (catalog_id, name, slug)
select catalog.id, 'Demo grocery category', 'demo-grocery-category'
from public.catalogs catalog
where catalog.is_template = true and catalog.business_type = 'grocery';

insert into public.products (catalog_id, title, slug)
select catalog.id, 'Demo grocery product', 'demo-grocery-product'
from public.catalogs catalog
where catalog.is_template = true and catalog.business_type = 'grocery';

set role service_role;

create temp table created_business as
select public.create_platform_business_from_template(
  (select catalog.id from public.catalogs catalog where catalog.is_template = true and catalog.business_type = 'grocery'),
  'Финики',
  'finiki-ci',
  'grocery',
  '00000000-0000-4000-8000-000000000102',
  'owner-a@wayyaam.test',
  'Владелец магазина',
  '00000000-0000-4000-8000-000000000101',
  'admin@wayyaam.test',
  '+79990000000',
  'Грозный',
  array['Беркат-Юрт'],
  false,
  'trial',
  null,
  'active',
  'trial'
) as payload;

reset role;

do $$
declare
  created_catalog_id uuid := (select (payload ->> 'catalogId')::uuid from created_business);
  created_client_id uuid := (select (payload ->> 'clientId')::uuid from created_business);
begin
  if not exists (
    select 1 from public.catalogs
    where id = created_catalog_id
      and slug = 'finiki-ci'
      and business_type = 'grocery'
      and template_type = 'grocery'
      and status = 'draft'
  ) then
    raise exception 'grocery catalog was not created as a private draft';
  end if;
  if not exists (
    select 1 from public.clients
    where id = created_client_id
      and catalog_id = created_catalog_id
      and owner_user_id = '00000000-0000-4000-8000-000000000102'
      and legal_activation_status = 'draft'
  ) then
    raise exception 'client record is missing or not draft';
  end if;
  if not exists (
    select 1 from public.catalog_members
    where catalog_id = created_catalog_id
      and user_id = '00000000-0000-4000-8000-000000000102'
      and role = 'owner'
  ) then
    raise exception 'owner membership missing';
  end if;
  if not exists (
    select 1 from public.audit_logs
    where catalog_id = created_catalog_id
      and entity_id = created_client_id
      and action = 'client.created'
      and payload ->> 'business_type' = 'grocery'
  ) then
    raise exception 'auditable grocery onboarding record missing';
  end if;
  if exists (select 1 from public.categories where catalog_id = created_catalog_id)
    or exists (select 1 from public.products where catalog_id = created_catalog_id) then
    raise exception 'unrequested grocery demo catalog data was retained';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.create_platform_business_from_template(
      (select catalog.id from public.catalogs catalog where catalog.is_template = true and catalog.business_type = 'grocery'),
      'Unknown Type',
      'unknown-type-ci',
      'unknown',
      '00000000-0000-4000-8000-000000000103',
      'owner-b@wayyaam.test',
      '',
      '00000000-0000-4000-8000-000000000101',
      'admin@wayyaam.test',
      '',
      '',
      '{}'::text[],
      false,
      'trial',
      null,
      'active',
      'trial'
    );
    raise exception 'expected_unknown_type_rejection';
  exception
    when others then
      if sqlerrm = 'expected_unknown_type_rejection' then raise; end if;
      if sqlerrm <> 'business_type_unknown' then raise; end if;
  end;

  if exists (select 1 from public.catalogs where slug = 'unknown-type-ci') then
    raise exception 'unknown type left partial catalog data';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.create_platform_business_from_template(
      (select catalog.id from public.catalogs catalog where catalog.is_template = true and catalog.business_type = 'grocery'),
      'Disabled Flowers',
      'disabled-flowers-ci',
      'flowers',
      '00000000-0000-4000-8000-000000000103',
      'owner-b@wayyaam.test',
      '',
      '00000000-0000-4000-8000-000000000101',
      'admin@wayyaam.test',
      '',
      '',
      '{}'::text[],
      false,
      'trial',
      null,
      'active',
      'trial'
    );
    raise exception 'expected_disabled_type_rejection';
  exception
    when others then
      if sqlerrm = 'expected_disabled_type_rejection' then raise; end if;
      if sqlerrm <> 'business_type_unavailable' then raise; end if;
  end;
end;
$$;

do $$
begin
  begin
    perform public.create_platform_business_from_template(
      (select catalog.id from public.catalogs catalog where catalog.is_template = true and catalog.business_type = 'grocery'),
      'Unauthorized Actor',
      'unauthorized-actor-ci',
      'grocery',
      '00000000-0000-4000-8000-000000000103',
      'owner-b@wayyaam.test',
      '',
      '00000000-0000-4000-8000-000000000105',
      'ordinary-actor@wayyaam.test',
      '',
      '',
      '{}'::text[],
      false,
      'trial',
      null,
      'active',
      'trial'
    );
    raise exception 'expected_platform_admin_rejection';
  exception
    when others then
      if sqlerrm = 'expected_platform_admin_rejection' then raise; end if;
      if sqlerrm <> 'platform_admin_required' then raise; end if;
  end;
end;
$$;

-- Production create_restaurant_from_template uses transaction-local mapping
-- tables. Each RPC normally runs in its own transaction, while this acceptance
-- suite intentionally keeps several calls in one transaction for rollback.
drop table if exists pg_temp.temp_category_map;
drop table if exists pg_temp.temp_tag_map;
drop table if exists pg_temp.temp_product_map;
drop table if exists pg_temp.temp_option_group_map;

alter table public.audit_logs
  add constraint reject_atomic_test_audit
  check (action <> 'client.created') not valid;

do $$
begin
  begin
    perform public.create_platform_business_from_template(
      (select catalog.id from public.catalogs catalog where catalog.is_template = true and catalog.business_type = 'grocery'),
      'Rollback Store',
      'rollback-store-ci',
      'grocery',
      '00000000-0000-4000-8000-000000000104',
      'owner-rollback@wayyaam.test',
      '',
      '00000000-0000-4000-8000-000000000101',
      'admin@wayyaam.test',
      '',
      '',
      '{}'::text[],
      false,
      'trial',
      null,
      'active',
      'trial'
    );
    raise exception 'expected_late_transaction_failure';
  exception
    when check_violation then null;
  end;

  if exists (select 1 from public.catalogs where slug = 'rollback-store-ci') then
    raise exception 'failed onboarding left a catalog behind';
  end if;
  if exists (
    select 1 from public.profiles
    where id = '00000000-0000-4000-8000-000000000104'
  ) then
    raise exception 'failed onboarding left an owner profile behind';
  end if;
  if exists (
    select 1 from public.clients
    where email = 'owner-rollback@wayyaam.test'
  ) then
    raise exception 'failed onboarding left a client behind';
  end if;
end;
$$;

alter table public.audit_logs drop constraint reject_atomic_test_audit;

insert into public.catalogs (
  id,
  template_version_id,
  slug,
  name,
  status,
  is_template,
  business_type,
  template_type
)
select
  '00000000-0000-4000-8000-000000000201',
  template_catalog.template_version_id,
  'other-grocery-ci',
  'Other Grocery',
  'draft',
  false,
  'grocery',
  'grocery'
from public.catalogs template_catalog
where template_catalog.is_template = true
  and template_catalog.business_type = 'grocery';

insert into public.catalog_members (catalog_id, user_id, role)
values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000103',
  'owner'
);

set role anon;

do $$
begin
  if exists (select 1 from public.catalogs where slug in ('finiki-ci', 'other-grocery-ci')) then
    raise exception 'anonymous user can see a draft grocery catalog';
  end if;
end;
$$;

reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', false);
set role authenticated;

do $$
begin
  if not exists (select 1 from public.catalogs where slug = 'finiki-ci') then
    raise exception 'owner cannot read own grocery catalog';
  end if;
  if exists (select 1 from public.catalogs where slug = 'other-grocery-ci') then
    raise exception 'owner can read another grocery tenant';
  end if;
  if exists (select 1 from public.business_types) then
    raise exception 'non-admin can read the protected business registry';
  end if;
end;
$$;

reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', false);
set role authenticated;

do $$
begin
  if (select count(*) from public.business_types) <> 8 then
    raise exception 'platform admin cannot read the complete business registry';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

\echo 'Multi-business database acceptance passed.'
