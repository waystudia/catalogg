create table if not exists public.catalog_staff_roles (
  code text primary key,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  constraint catalog_staff_roles_code_check check (code ~ '^[a-z][a-z0-9_]{1,63}$')
);

create table if not exists public.catalog_staff_permissions (
  code text primary key,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  constraint catalog_staff_permissions_code_check check (code ~ '^[a-z][a-z0-9_.]{2,95}$')
);

create table if not exists public.catalog_staff_role_permissions (
  role_code text not null references public.catalog_staff_roles(code) on delete cascade,
  permission_code text not null references public.catalog_staff_permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

insert into public.catalog_staff_roles (code, name, description, sort_order)
values
  ('manager', 'Менеджер заказов', 'Контролирует очередь заказов и может назначать сборщиков.', 10),
  ('picker', 'Сборщик', 'Принимает назначенные заказы, собирает и передаёт их в доставку.', 20)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order;

insert into public.catalog_staff_permissions (code, name, description)
values
  ('orders.view', 'Просмотр заказов', 'Просмотр заказов в рамках своего бизнеса.'),
  ('orders.assign', 'Назначение заказов', 'Контроль очереди и назначение исполнителей.'),
  ('orders.accept', 'Принятие назначения', 'Принятие предложенного заказа в работу.'),
  ('orders.update', 'Обновление заказа', 'Изменение этапа назначенного заказа.'),
  ('orders.pick', 'Сборка заказа', 'Отметка фактически собранных позиций.'),
  ('substitutions.manage', 'Замены товаров', 'Создание и обработка предложений замены.')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description;

insert into public.catalog_staff_role_permissions (role_code, permission_code)
values
  ('manager', 'orders.view'),
  ('manager', 'orders.assign'),
  ('manager', 'orders.accept'),
  ('manager', 'orders.update'),
  ('manager', 'orders.pick'),
  ('manager', 'substitutions.manage'),
  ('picker', 'orders.view'),
  ('picker', 'orders.accept'),
  ('picker', 'orders.update'),
  ('picker', 'orders.pick'),
  ('picker', 'substitutions.manage')
on conflict do nothing;

create table if not exists public.catalog_staff_memberships (
  catalog_id uuid not null,
  user_id uuid not null,
  role_code text not null references public.catalog_staff_roles(code),
  is_active boolean not null default true,
  receives_new_orders boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (catalog_id, user_id),
  constraint catalog_staff_memberships_catalog_member_fk
    foreign key (catalog_id, user_id)
    references public.catalog_members(catalog_id, user_id)
    on delete cascade
);

create index if not exists catalog_staff_memberships_routing_idx
  on public.catalog_staff_memberships(catalog_id, is_active, receives_new_orders, role_code);

create or replace function public.touch_catalog_staff_membership_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists catalog_staff_memberships_updated_at on public.catalog_staff_memberships;
create trigger catalog_staff_memberships_updated_at
before update on public.catalog_staff_memberships
for each row execute function public.touch_catalog_staff_membership_updated_at();

create or replace function public.has_catalog_staff_permission(
  target_catalog_id uuid,
  target_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_platform_admin()
    or public.is_catalog_member(
      target_catalog_id,
      array['owner', 'admin']::public.catalog_role[]
    )
    or exists (
      select 1
      from public.catalog_staff_memberships staff
      join public.catalog_staff_role_permissions permission
        on permission.role_code = staff.role_code
      where staff.catalog_id = target_catalog_id
        and staff.user_id = (select auth.uid())
        and staff.is_active
        and permission.permission_code = target_permission_code
    );
$$;

create or replace function public.get_catalog_staff_for_catalog(target_catalog_id uuid)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role_code text,
  role_name text,
  is_active boolean,
  receives_new_orders boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    public.is_platform_admin()
    or public.is_catalog_member(
      target_catalog_id,
      array['owner', 'admin']::public.catalog_role[]
    )
  ) then
    raise exception 'catalog_team_management_required';
  end if;

  return query
  select
    staff.user_id,
    coalesce(nullif(trim(profile.full_name), ''), split_part(coalesce(auth_user.email, ''), '@', 1), 'Сотрудник'),
    coalesce(auth_user.email, profile.email, ''),
    staff.role_code,
    role.name,
    staff.is_active,
    staff.receives_new_orders,
    staff.updated_at
  from public.catalog_staff_memberships staff
  join public.catalog_staff_roles role on role.code = staff.role_code
  join auth.users auth_user on auth_user.id = staff.user_id
  left join public.profiles profile on profile.id = staff.user_id
  where staff.catalog_id = target_catalog_id
  order by staff.is_active desc, role.sort_order, staff.updated_at desc;
end;
$$;

create or replace function public.link_catalog_staff_by_email(
  target_catalog_id uuid,
  target_email text,
  target_role_code text,
  target_receives_new_orders boolean default true
)
returns table (
  user_id uuid,
  full_name text,
  email text,
  role_code text,
  role_name text,
  is_active boolean,
  receives_new_orders boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(coalesce(target_email, '')));
  resolved_user_id uuid;
  existing_catalog_role public.catalog_role;
begin
  if not (
    public.is_platform_admin()
    or public.is_catalog_member(
      target_catalog_id,
      array['owner', 'admin']::public.catalog_role[]
    )
  ) then
    raise exception 'catalog_team_management_required';
  end if;

  if normalized_email = '' or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'catalog_staff_email_invalid';
  end if;

  if not exists (select 1 from public.catalog_staff_roles role where role.code = target_role_code) then
    raise exception 'catalog_staff_role_invalid';
  end if;

  select auth_user.id
  into resolved_user_id
  from auth.users auth_user
  where lower(auth_user.email) = normalized_email
  limit 1;

  if resolved_user_id is null then
    raise exception 'catalog_staff_account_not_found';
  end if;

  select member.role
  into existing_catalog_role
  from public.catalog_members member
  where member.catalog_id = target_catalog_id
    and member.user_id = resolved_user_id;

  if existing_catalog_role in ('owner', 'admin', 'editor') then
    raise exception 'catalog_privileged_member_cannot_be_staff';
  end if;

  insert into public.catalog_members (catalog_id, user_id, role)
  values (target_catalog_id, resolved_user_id, 'viewer'::public.catalog_role)
  on conflict (catalog_id, user_id) do nothing;

  insert into public.catalog_staff_memberships (
    catalog_id,
    user_id,
    role_code,
    is_active,
    receives_new_orders,
    created_by
  )
  values (
    target_catalog_id,
    resolved_user_id,
    target_role_code,
    true,
    target_receives_new_orders,
    (select auth.uid())
  )
  on conflict (catalog_id, user_id)
  do update set
    role_code = excluded.role_code,
    is_active = true,
    receives_new_orders = excluded.receives_new_orders;

  insert into public.audit_logs (catalog_id, actor_id, action, entity_table, entity_id, payload)
  values (
    target_catalog_id,
    (select auth.uid()),
    'catalog.staff.linked',
    'catalog_staff_memberships',
    resolved_user_id,
    jsonb_build_object('email', normalized_email, 'role_code', target_role_code)
  );

  return query
  select team.*
  from public.get_catalog_staff_for_catalog(target_catalog_id) team
  where team.user_id = resolved_user_id;
end;
$$;

create or replace function public.remove_catalog_staff_member(
  target_catalog_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed boolean := false;
begin
  if not (
    public.is_platform_admin()
    or public.is_catalog_member(
      target_catalog_id,
      array['owner', 'admin']::public.catalog_role[]
    )
  ) then
    raise exception 'catalog_team_management_required';
  end if;

  if not exists (
    select 1
    from public.catalog_staff_memberships staff
    where staff.catalog_id = target_catalog_id
      and staff.user_id = target_user_id
  ) then
    return false;
  end if;

  insert into public.audit_logs (catalog_id, actor_id, action, entity_table, entity_id, payload)
  select
    target_catalog_id,
    (select auth.uid()),
    'catalog.staff.removed',
    'catalog_staff_memberships',
    target_user_id,
    jsonb_build_object('role_code', staff.role_code)
  from public.catalog_staff_memberships staff
  where staff.catalog_id = target_catalog_id
    and staff.user_id = target_user_id;

  delete from public.catalog_members member
  where member.catalog_id = target_catalog_id
    and member.user_id = target_user_id
    and member.role = 'viewer'::public.catalog_role;
  removed := found;

  return removed;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_catalog_id_id_key'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_catalog_id_id_key unique (catalog_id, id);
  end if;
end;
$$;

create table if not exists public.order_work_assignments (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  order_id uuid not null,
  assignee_user_id uuid not null references auth.users(id) on delete restrict,
  state text not null default 'offered',
  source text not null default 'automatic',
  offered_at timestamptz not null default now(),
  expires_at timestamptz,
  accepted_at timestamptz,
  responded_at timestamptz,
  escalation_level integer not null default 0,
  version integer not null default 1,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_work_assignments_catalog_order_fk
    foreign key (catalog_id, order_id)
    references public.orders(catalog_id, id)
    on delete cascade,
  constraint order_work_assignments_state_check
    check (state in ('offered', 'accepted', 'declined', 'expired', 'superseded')),
  constraint order_work_assignments_source_check
    check (source in ('automatic', 'manual', 'owner_fallback')),
  constraint order_work_assignments_version_check check (version > 0),
  constraint order_work_assignments_escalation_check check (escalation_level >= 0),
  constraint order_work_assignments_expiry_check
    check (expires_at is null or expires_at > offered_at)
);

create unique index if not exists order_work_assignments_one_active_idx
  on public.order_work_assignments(order_id)
  where state in ('offered', 'accepted');

create index if not exists order_work_assignments_assignee_queue_idx
  on public.order_work_assignments(assignee_user_id, state, offered_at desc);

create index if not exists order_work_assignments_escalation_idx
  on public.order_work_assignments(state, expires_at)
  where state = 'offered' and expires_at is not null;

create table if not exists public.order_work_assignment_events (
  id bigint generated always as identity primary key,
  catalog_id uuid not null references public.catalogs(id) on delete cascade,
  order_id uuid not null,
  assignment_id uuid not null references public.order_work_assignments(id) on delete cascade,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint order_work_assignment_events_catalog_order_fk
    foreign key (catalog_id, order_id)
    references public.orders(catalog_id, id)
    on delete cascade,
  constraint order_work_assignment_events_type_check
    check (event_type in ('offered', 'accepted', 'declined', 'expired', 'owner_fallback'))
);

create or replace function public.offer_catalog_order_internal(
  target_order_id uuid,
  target_catalog_id uuid,
  target_assignee_user_id uuid default null,
  target_offer_seconds integer default 120,
  target_source text default 'automatic',
  target_assigned_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_assignee_user_id uuid := target_assignee_user_id;
  resolved_source text := target_source;
  resolved_expires_at timestamptz;
  created_assignment_id uuid;
  existing_assignment_id uuid;
  assignee_is_staff boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_order_id::text, 0));

  if not exists (
    select 1 from public.orders order_record
    where order_record.id = target_order_id
      and order_record.catalog_id = target_catalog_id
  ) then
    raise exception 'catalog_order_not_found';
  end if;

  select assignment.id
  into existing_assignment_id
  from public.order_work_assignments assignment
  where assignment.order_id = target_order_id
    and assignment.state in ('offered', 'accepted')
  limit 1;

  if existing_assignment_id is not null then
    return existing_assignment_id;
  end if;

  if resolved_assignee_user_id is null then
    select staff.user_id
    into resolved_assignee_user_id
    from public.catalog_staff_memberships staff
    where staff.catalog_id = target_catalog_id
      and staff.is_active
      and staff.receives_new_orders
      and exists (
        select 1
        from public.catalog_staff_role_permissions permission
        where permission.role_code = staff.role_code
          and permission.permission_code = 'orders.accept'
      )
    order by
      (
        select count(*)
        from public.order_work_assignments active_assignment
        where active_assignment.assignee_user_id = staff.user_id
          and active_assignment.state in ('offered', 'accepted')
      ),
      staff.updated_at,
      staff.user_id
    limit 1;
  end if;

  select exists (
    select 1
    from public.catalog_staff_memberships staff
    where staff.catalog_id = target_catalog_id
      and staff.user_id = resolved_assignee_user_id
      and staff.is_active
  ) into assignee_is_staff;

  if resolved_assignee_user_id is null then
    select member.user_id
    into resolved_assignee_user_id
    from public.catalog_members member
    where member.catalog_id = target_catalog_id
      and member.role = 'owner'::public.catalog_role
    order by member.user_id
    limit 1;
    resolved_source := 'owner_fallback';
  elsif not assignee_is_staff and not exists (
    select 1
    from public.catalog_members member
    where member.catalog_id = target_catalog_id
      and member.user_id = resolved_assignee_user_id
      and member.role in ('owner', 'admin')
  ) then
    raise exception 'catalog_order_assignee_invalid';
  end if;

  if resolved_assignee_user_id is null then
    raise exception 'catalog_order_owner_missing';
  end if;

  resolved_expires_at := case
    when assignee_is_staff
      then now() + make_interval(secs => greatest(30, least(coalesce(target_offer_seconds, 120), 900)))
    else null
  end;

  insert into public.order_work_assignments (
    catalog_id,
    order_id,
    assignee_user_id,
    source,
    expires_at,
    escalation_level,
    assigned_by
  )
  values (
    target_catalog_id,
    target_order_id,
    resolved_assignee_user_id,
    resolved_source,
    resolved_expires_at,
    case when resolved_source = 'owner_fallback' then 1 else 0 end,
    target_assigned_by
  )
  returning id into created_assignment_id;

  insert into public.order_work_assignment_events (
    catalog_id,
    order_id,
    assignment_id,
    event_type,
    actor_id,
    payload
  )
  values (
    target_catalog_id,
    target_order_id,
    created_assignment_id,
    case when resolved_source = 'owner_fallback' then 'owner_fallback' else 'offered' end,
    target_assigned_by,
    jsonb_build_object('assignee_user_id', resolved_assignee_user_id, 'source', resolved_source)
  );

  return created_assignment_id;
end;
$$;

create or replace function public.offer_catalog_order(
  target_order_id uuid,
  target_catalog_id uuid,
  target_assignee_user_id uuid default null,
  target_offer_seconds integer default 120
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or public.has_catalog_staff_permission(target_catalog_id, 'orders.assign')
  ) then
    raise exception 'catalog_order_assignment_required';
  end if;

  return public.offer_catalog_order_internal(
    target_order_id,
    target_catalog_id,
    target_assignee_user_id,
    target_offer_seconds,
    case when target_assignee_user_id is null then 'automatic' else 'manual' end,
    (select auth.uid())
  );
end;
$$;

create or replace function public.accept_catalog_order_assignment(
  target_assignment_id uuid,
  expected_version integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_assignment public.order_work_assignments%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required';
  end if;

  select assignment.*
  into current_assignment
  from public.order_work_assignments assignment
  where assignment.id = target_assignment_id
  for update;

  if current_assignment.id is null then
    raise exception 'catalog_order_assignment_not_found';
  end if;
  if current_assignment.assignee_user_id <> (select auth.uid()) then
    raise exception 'catalog_order_assignment_not_assignee';
  end if;
  if current_assignment.state <> 'offered'
    or current_assignment.version <> expected_version
    or (current_assignment.expires_at is not null and current_assignment.expires_at <= now()) then
    return false;
  end if;

  update public.order_work_assignments assignment
  set state = 'accepted',
      accepted_at = now(),
      responded_at = now(),
      updated_at = now(),
      version = assignment.version + 1
  where assignment.id = target_assignment_id;

  insert into public.order_work_assignment_events (
    catalog_id, order_id, assignment_id, event_type, actor_id
  )
  values (
    current_assignment.catalog_id,
    current_assignment.order_id,
    current_assignment.id,
    'accepted',
    (select auth.uid())
  );

  return true;
end;
$$;

create or replace function public.escalate_catalog_order_assignments(
  target_catalog_id uuid default null,
  as_of timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_assignment public.order_work_assignments%rowtype;
  owner_user_id uuid;
  escalated_count integer := 0;
  owner_assignment_id uuid;
  is_service_request boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
begin
  if not is_service_request and (
    target_catalog_id is null
    or not public.is_catalog_member(
      target_catalog_id,
      array['owner', 'admin']::public.catalog_role[]
    )
  ) and not public.is_platform_admin() then
    raise exception 'catalog_order_escalation_required';
  end if;

  for expired_assignment in
    select assignment.*
    from public.order_work_assignments assignment
    where assignment.state = 'offered'
      and assignment.expires_at is not null
      and assignment.expires_at <= as_of
      and (target_catalog_id is null or assignment.catalog_id = target_catalog_id)
    order by assignment.expires_at, assignment.id
    for update skip locked
  loop
    update public.order_work_assignments assignment
    set state = 'expired',
        responded_at = as_of,
        updated_at = as_of,
        version = assignment.version + 1
    where assignment.id = expired_assignment.id;

    insert into public.order_work_assignment_events (
      catalog_id, order_id, assignment_id, event_type, actor_id
    )
    values (
      expired_assignment.catalog_id,
      expired_assignment.order_id,
      expired_assignment.id,
      'expired',
      (select auth.uid())
    );

    select member.user_id
    into owner_user_id
    from public.catalog_members member
    where member.catalog_id = expired_assignment.catalog_id
      and member.role = 'owner'::public.catalog_role
    order by member.user_id
    limit 1;

    if owner_user_id is not null then
      owner_assignment_id := public.offer_catalog_order_internal(
        expired_assignment.order_id,
        expired_assignment.catalog_id,
        owner_user_id,
        120,
        'owner_fallback',
        (select auth.uid())
      );
    end if;

    escalated_count := escalated_count + 1;
  end loop;

  return escalated_count;
end;
$$;

create or replace function public.get_catalog_order_assignments(target_catalog_id uuid)
returns table (
  id uuid,
  order_id uuid,
  assignee_user_id uuid,
  assignee_name text,
  assignee_email text,
  state text,
  offered_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  version integer,
  is_mine boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_catalog_member(target_catalog_id) and not public.is_platform_admin() then
    raise exception 'catalog_membership_required';
  end if;

  return query
  select
    assignment.id,
    assignment.order_id,
    assignment.assignee_user_id,
    coalesce(nullif(trim(profile.full_name), ''), split_part(coalesce(auth_user.email, ''), '@', 1), 'Сотрудник'),
    coalesce(auth_user.email, profile.email, ''),
    assignment.state,
    assignment.offered_at,
    assignment.expires_at,
    assignment.accepted_at,
    assignment.version,
    assignment.assignee_user_id = (select auth.uid())
  from public.order_work_assignments assignment
  join auth.users auth_user on auth_user.id = assignment.assignee_user_id
  left join public.profiles profile on profile.id = assignment.assignee_user_id
  where assignment.catalog_id = target_catalog_id
    and (
      assignment.assignee_user_id = (select auth.uid())
      or public.has_catalog_staff_permission(target_catalog_id, 'orders.assign')
    )
  order by assignment.created_at desc;
end;
$$;

create or replace function public.update_catalog_assigned_order_status(
  target_order_id uuid,
  target_catalog_id uuid,
  next_status text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required';
  end if;
  if next_status not in ('accepted', 'preparing', 'ready', 'completed', 'cancelled', 'canceled') then
    raise exception 'catalog_order_work_status_invalid';
  end if;
  if not exists (
    select 1
    from public.order_work_assignments assignment
    where assignment.order_id = target_order_id
      and assignment.catalog_id = target_catalog_id
      and assignment.assignee_user_id = (select auth.uid())
      and assignment.state = 'accepted'
  ) then
    raise exception 'accepted_catalog_order_assignment_required';
  end if;

  select order_record.status::text
  into current_status
  from public.orders order_record
  where order_record.id = target_order_id
    and order_record.catalog_id = target_catalog_id
  for update;

  if current_status is null then
    raise exception 'catalog_order_not_found';
  end if;

  if not (
    (current_status = 'new' and next_status in ('accepted', 'cancelled', 'canceled'))
    or (current_status in ('accepted', 'confirmed') and next_status = 'preparing')
    or (current_status = 'preparing' and next_status = 'ready')
    or (current_status = 'ready' and next_status = 'completed')
  ) then
    raise exception 'catalog_order_work_transition_invalid';
  end if;

  execute format(
    'update public.orders set status = $1::public.order_status where id = $2 and catalog_id = $3'
  )
  using case when next_status = 'cancelled' then 'canceled' else next_status end,
    target_order_id,
    target_catalog_id;

  insert into public.audit_logs (catalog_id, actor_id, action, entity_table, entity_id, payload)
  values (
    target_catalog_id,
    (select auth.uid()),
    'catalog.order.work_status_changed',
    'orders',
    target_order_id,
    jsonb_build_object('from_status', current_status, 'to_status', next_status)
  );

  return case when next_status = 'cancelled' then 'canceled' else next_status end;
end;
$$;

create or replace function public.route_new_grocery_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.catalogs catalog
    where catalog.id = new.catalog_id
      and catalog.business_type = 'grocery'
  ) then
    perform public.offer_catalog_order_internal(
      new.id,
      new.catalog_id,
      null,
      120,
      'automatic',
      null
    );
  end if;
  return new;
end;
$$;

drop trigger if exists route_new_grocery_order on public.orders;
create trigger route_new_grocery_order
after insert on public.orders
for each row execute function public.route_new_grocery_order();

alter table public.catalog_staff_roles enable row level security;
alter table public.catalog_staff_permissions enable row level security;
alter table public.catalog_staff_role_permissions enable row level security;
alter table public.catalog_staff_memberships enable row level security;
alter table public.order_work_assignments enable row level security;
alter table public.order_work_assignment_events enable row level security;

drop policy if exists "orders admin read" on public.orders;
create policy "orders admin read"
on public.orders
for select
to authenticated
using (
  public.is_platform_admin()
  or public.is_catalog_member(catalog_id, array['owner', 'admin']::public.catalog_role[])
  or (
    public.is_catalog_member(catalog_id, array['viewer']::public.catalog_role[])
    and (
      not exists (
        select 1
        from public.catalog_staff_memberships staff
        where staff.catalog_id = orders.catalog_id
          and staff.user_id = (select auth.uid())
          and staff.is_active
      )
      or public.has_catalog_staff_permission(catalog_id, 'orders.assign')
      or exists (
        select 1
        from public.order_work_assignments assignment
        where assignment.order_id = orders.id
          and assignment.assignee_user_id = (select auth.uid())
          and assignment.state in ('offered', 'accepted')
      )
    )
  )
);

drop policy if exists "order items admin read" on public.order_items;
create policy "order items admin read"
on public.order_items
for select
to authenticated
using (
  public.is_platform_admin()
  or public.is_catalog_member(catalog_id, array['owner', 'admin']::public.catalog_role[])
  or (
    public.is_catalog_member(catalog_id, array['viewer']::public.catalog_role[])
    and (
      not exists (
        select 1
        from public.catalog_staff_memberships staff
        where staff.catalog_id = order_items.catalog_id
          and staff.user_id = (select auth.uid())
          and staff.is_active
      )
      or public.has_catalog_staff_permission(catalog_id, 'orders.assign')
      or exists (
        select 1
        from public.order_work_assignments assignment
        where assignment.order_id = order_items.order_id
          and assignment.assignee_user_id = (select auth.uid())
          and assignment.state in ('offered', 'accepted')
      )
    )
  )
);

drop policy if exists "catalog staff roles authenticated read" on public.catalog_staff_roles;
create policy "catalog staff roles authenticated read"
on public.catalog_staff_roles for select to authenticated using (true);

drop policy if exists "catalog staff permissions authenticated read" on public.catalog_staff_permissions;
create policy "catalog staff permissions authenticated read"
on public.catalog_staff_permissions for select to authenticated using (true);

drop policy if exists "catalog staff role permissions authenticated read" on public.catalog_staff_role_permissions;
create policy "catalog staff role permissions authenticated read"
on public.catalog_staff_role_permissions for select to authenticated using (true);

drop policy if exists "catalog staff membership scoped read" on public.catalog_staff_memberships;
create policy "catalog staff membership scoped read"
on public.catalog_staff_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_platform_admin()
  or public.is_catalog_member(catalog_id, array['owner', 'admin']::public.catalog_role[])
);

drop policy if exists "order work assignments scoped read" on public.order_work_assignments;
create policy "order work assignments scoped read"
on public.order_work_assignments for select to authenticated
using (
  assignee_user_id = (select auth.uid())
  or public.has_catalog_staff_permission(catalog_id, 'orders.assign')
);

drop policy if exists "order work assignment events scoped read" on public.order_work_assignment_events;
create policy "order work assignment events scoped read"
on public.order_work_assignment_events for select to authenticated
using (
  public.has_catalog_staff_permission(catalog_id, 'orders.assign')
  or exists (
    select 1
    from public.order_work_assignments assignment
    where assignment.id = order_work_assignment_events.assignment_id
      and assignment.assignee_user_id = (select auth.uid())
  )
);

grant select on table public.catalog_staff_roles to authenticated, service_role;
grant select on table public.catalog_staff_permissions to authenticated, service_role;
grant select on table public.catalog_staff_role_permissions to authenticated, service_role;
grant select on table public.catalog_staff_memberships to authenticated, service_role;
grant select on table public.order_work_assignments to authenticated, service_role;
grant select on table public.order_work_assignment_events to authenticated, service_role;
grant insert, update, delete on table public.catalog_staff_memberships to service_role;
grant insert, update, delete on table public.order_work_assignments to service_role;
grant insert on table public.order_work_assignment_events to service_role;
grant usage, select on sequence public.order_work_assignment_events_id_seq to service_role;

revoke all on function public.has_catalog_staff_permission(uuid, text) from public, anon;
revoke all on function public.get_catalog_staff_for_catalog(uuid) from public, anon;
revoke all on function public.link_catalog_staff_by_email(uuid, text, text, boolean) from public, anon;
revoke all on function public.remove_catalog_staff_member(uuid, uuid) from public, anon;
revoke all on function public.offer_catalog_order_internal(uuid, uuid, uuid, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.offer_catalog_order(uuid, uuid, uuid, integer) from public, anon;
revoke all on function public.accept_catalog_order_assignment(uuid, integer) from public, anon;
revoke all on function public.escalate_catalog_order_assignments(uuid, timestamptz) from public, anon;
revoke all on function public.get_catalog_order_assignments(uuid) from public, anon;
revoke all on function public.update_catalog_assigned_order_status(uuid, uuid, text) from public, anon;

grant execute on function public.has_catalog_staff_permission(uuid, text) to authenticated, service_role;
grant execute on function public.get_catalog_staff_for_catalog(uuid) to authenticated, service_role;
grant execute on function public.link_catalog_staff_by_email(uuid, text, text, boolean) to authenticated, service_role;
grant execute on function public.remove_catalog_staff_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.offer_catalog_order(uuid, uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.accept_catalog_order_assignment(uuid, integer) to authenticated, service_role;
grant execute on function public.escalate_catalog_order_assignments(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.get_catalog_order_assignments(uuid) to authenticated, service_role;
grant execute on function public.update_catalog_assigned_order_status(uuid, uuid, text) to authenticated, service_role;
