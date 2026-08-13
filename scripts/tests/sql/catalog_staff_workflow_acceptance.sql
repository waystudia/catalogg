\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.catalog_staff_memberships') is null
    or to_regclass('public.order_work_assignments') is null then
    raise exception 'catalog staff workflow missing';
  end if;
end;
$$;

do $$
declare
  link_signature text := 'public.link_catalog_staff_by_email(uuid,text,text,boolean)';
  create_link_signature text := 'public.link_catalog_staff_by_user_id(uuid,uuid,text,boolean,uuid)';
  accept_signature text := 'public.accept_catalog_order_assignment(uuid,integer)';
begin
  if has_function_privilege('anon', link_signature, 'execute') then
    raise exception 'anonymous user can link catalog staff';
  end if;
  if not has_function_privilege('authenticated', link_signature, 'execute') then
    raise exception 'authenticated owner cannot execute staff link RPC';
  end if;
  if has_function_privilege('anon', accept_signature, 'execute') then
    raise exception 'anonymous user can accept assignments';
  end if;
  if has_function_privilege('anon', create_link_signature, 'execute')
    or has_function_privilege('authenticated', create_link_signature, 'execute') then
    raise exception 'browser role can execute privileged staff account linking';
  end if;
  if not has_function_privilege('service_role', create_link_signature, 'execute') then
    raise exception 'service role cannot link a securely created staff account';
  end if;
end;
$$;

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000106', 'picker@wayyaam.test'),
  ('00000000-0000-4000-8000-000000000107', 'outsider@wayyaam.test');

insert into public.profiles (id, email, full_name)
values
  ('00000000-0000-4000-8000-000000000106', 'picker@wayyaam.test', 'Сборщик Фиников'),
  ('00000000-0000-4000-8000-000000000107', 'outsider@wayyaam.test', 'Посторонний');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000103', false);
set role authenticated;

do $$
begin
  begin
    perform public.link_catalog_staff_by_email(
      (select catalog.id from public.catalogs catalog where catalog.slug = 'finiki-ci'),
      'picker@wayyaam.test',
      'picker',
      true
    );
    raise exception 'expected_cross_tenant_team_rejection';
  exception
    when others then
      if sqlerrm = 'expected_cross_tenant_team_rejection' then raise; end if;
      if sqlerrm <> 'catalog_team_management_required' then raise; end if;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', false);
set role authenticated;

select *
from public.link_catalog_staff_by_email(
  (select catalog.id from public.catalogs catalog where catalog.slug = 'finiki-ci'),
  'picker@wayyaam.test',
  'picker',
  true
);

reset role;

do $$
begin
  if not exists (
    select 1
    from public.catalog_staff_memberships staff
    join public.catalogs catalog on catalog.id = staff.catalog_id
    where catalog.slug = 'finiki-ci'
      and staff.user_id = '00000000-0000-4000-8000-000000000106'
      and staff.role_code = 'picker'
      and staff.is_active
      and staff.receives_new_orders
  ) then
    raise exception 'picker membership was not created';
  end if;
  if not exists (
    select 1
    from public.catalog_members member
    join public.catalogs catalog on catalog.id = member.catalog_id
    where catalog.slug = 'finiki-ci'
      and member.user_id = '00000000-0000-4000-8000-000000000106'
      and member.role = 'viewer'
  ) then
    raise exception 'picker did not receive tenant-scoped catalog access';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '', false);

insert into public.orders (id, catalog_id, customer_name, customer_phone)
select
  '00000000-0000-4000-8000-000000000331',
  catalog.id,
  'Picker assignment client',
  '+79990000002'
from public.catalogs catalog
where catalog.slug = 'finiki-ci';

do $$
begin
  if not exists (
    select 1
    from public.order_work_assignments assignment
    where assignment.order_id = '00000000-0000-4000-8000-000000000331'
      and assignment.assignee_user_id = '00000000-0000-4000-8000-000000000106'
      and assignment.state = 'offered'
      and assignment.source = 'automatic'
      and assignment.expires_at is not null
  ) then
    raise exception 'new grocery order was not offered to picker';
  end if;
end;
$$;

select set_config(
  'wayyaam.test.picker_assignment_id',
  (
    select assignment.id::text
    from public.order_work_assignments assignment
    where assignment.order_id = '00000000-0000-4000-8000-000000000331'
  ),
  false
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000107', false);
set role authenticated;

do $$
declare
  assignment_id uuid := current_setting('wayyaam.test.picker_assignment_id')::uuid;
begin
  begin
    perform public.accept_catalog_order_assignment(assignment_id, 1);
    raise exception 'expected_non_assignee_rejection';
  exception
    when others then
      if sqlerrm = 'expected_non_assignee_rejection' then raise; end if;
      if sqlerrm <> 'catalog_order_assignment_not_assignee' then raise; end if;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000106', false);
set role authenticated;

do $$
declare
  assignment_id uuid := (
    select assignment.id
    from public.order_work_assignments assignment
    where assignment.order_id = '00000000-0000-4000-8000-000000000331'
  );
begin
  if not public.has_catalog_staff_permission(
    (select catalog.id from public.catalogs catalog where catalog.slug = 'finiki-ci'),
    'orders.pick'
  ) then
    raise exception 'picker permission was not resolved';
  end if;
  if not public.accept_catalog_order_assignment(assignment_id, 1) then
    raise exception 'picker could not atomically accept offered order';
  end if;
  if public.accept_catalog_order_assignment(assignment_id, 1) then
    raise exception 'stale assignment version was accepted twice';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', false);
set role authenticated;

do $$
declare
  assignment_count integer;
begin
  select count(*)
  into assignment_count
  from public.get_catalog_order_assignments(
    (select catalog.id from public.catalogs catalog where catalog.slug = 'finiki-ci')
  );

  if assignment_count < 1 then
    raise exception 'catalog owner could not read tenant assignments';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

do $$
begin
  if not exists (
    select 1
    from public.order_work_assignments assignment
    where assignment.order_id = '00000000-0000-4000-8000-000000000331'
      and assignment.state = 'accepted'
      and assignment.version = 2
      and assignment.accepted_at is not null
  ) then
    raise exception 'accepted assignment state is inconsistent';
  end if;
  if (select count(*) from public.order_work_assignment_events event
      where event.order_id = '00000000-0000-4000-8000-000000000331'
        and event.event_type in ('offered', 'accepted')) <> 2 then
    raise exception 'assignment audit events are incomplete';
  end if;
end;
$$;

insert into public.orders (id, catalog_id, customer_name, customer_phone)
select
  '00000000-0000-4000-8000-000000000332',
  catalog.id,
  'Escalation client',
  '+79990000003'
from public.catalogs catalog
where catalog.slug = 'finiki-ci';

select set_config('request.jwt.claim.role', 'service_role', false);
set role service_role;

do $$
begin
  if public.escalate_catalog_order_assignments(
    (select catalog.id from public.catalogs catalog where catalog.slug = 'finiki-ci'),
    now() + interval '20 minutes'
  ) <> 1 then
    raise exception 'expected exactly one expired picker assignment';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.role', '', false);

do $$
begin
  if not exists (
    select 1
    from public.order_work_assignments assignment
    where assignment.order_id = '00000000-0000-4000-8000-000000000332'
      and assignment.assignee_user_id = '00000000-0000-4000-8000-000000000106'
      and assignment.state = 'expired'
  ) then
    raise exception 'unanswered picker offer did not expire';
  end if;
  if not exists (
    select 1
    from public.order_work_assignments assignment
    where assignment.order_id = '00000000-0000-4000-8000-000000000332'
      and assignment.assignee_user_id = '00000000-0000-4000-8000-000000000102'
      and assignment.state = 'offered'
      and assignment.source = 'owner_fallback'
      and assignment.expires_at is null
  ) then
    raise exception 'expired picker offer did not fall back to owner';
  end if;
  if (select count(*) from public.order_work_assignments assignment
      where assignment.order_id = '00000000-0000-4000-8000-000000000332'
        and assignment.state in ('offered', 'accepted')) <> 1 then
    raise exception 'order has more than one active assignment';
  end if;
end;
$$;

insert into public.catalogs (
  id, template_version_id, slug, name, status, is_template, business_type, template_type
)
select
  '00000000-0000-4000-8000-000000000202',
  template_catalog.template_version_id,
  'restaurant-routing-regression-ci',
  'Restaurant regression',
  'draft',
  false,
  'restaurant',
  'restaurant'
from public.catalogs template_catalog
where template_catalog.is_template = true
  and template_catalog.business_type = 'restaurant'
limit 1;

insert into public.catalog_members (catalog_id, user_id, role)
values (
  '00000000-0000-4000-8000-000000000202',
  '00000000-0000-4000-8000-000000000103',
  'owner'
);

insert into public.clients (
  owner_user_id,
  catalog_id,
  company_name,
  email,
  status,
  legal_activation_status,
  business_type,
  template_type
)
values (
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000202',
  'Restaurant regression',
  'restaurant-routing@wayyaam.test',
  'active',
  'draft',
  'restaurant',
  'restaurant'
);

insert into public.orders (id, catalog_id, customer_name, customer_phone)
values (
  '00000000-0000-4000-8000-000000000333',
  '00000000-0000-4000-8000-000000000202',
  'Restaurant client',
  '+79990000004'
);

do $$
begin
  if exists (
    select 1
    from public.order_work_assignments assignment
    where assignment.order_id = '00000000-0000-4000-8000-000000000333'
  ) then
    raise exception 'grocery routing changed restaurant order flow';
  end if;
end;
$$;

do $$
declare
  sensitive_table text;
begin
  foreach sensitive_table in array array[
    'catalog_staff_roles',
    'catalog_staff_permissions',
    'catalog_staff_role_permissions',
    'catalog_staff_memberships',
    'order_work_assignments',
    'order_work_assignment_events'
  ] loop
    if has_table_privilege('anon', format('public.%I', sensitive_table), 'select')
      or has_table_privilege('anon', format('public.%I', sensitive_table), 'insert')
      or has_table_privilege('anon', format('public.%I', sensitive_table), 'update')
      or has_table_privilege('anon', format('public.%I', sensitive_table), 'delete') then
      raise exception 'anonymous role has direct access to %', sensitive_table;
    end if;
  end loop;

  if has_sequence_privilege(
    'anon',
    'public.order_work_assignment_events_id_seq',
    'usage'
  ) then
    raise exception 'anonymous role can use order assignment event sequence';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', '', false);

\echo 'Catalog staff workflow acceptance passed.'
