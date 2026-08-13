create or replace function public.can_manage_catalog_team(target_catalog_id uuid)
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
    );
$$;

revoke all on function public.can_manage_catalog_team(uuid) from public, anon;
grant execute on function public.can_manage_catalog_team(uuid) to authenticated, service_role;

create or replace function public.link_catalog_staff_by_user_id(
  target_catalog_id uuid,
  target_user_id uuid,
  target_role_code text,
  target_receives_new_orders boolean,
  target_actor_user_id uuid
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
  existing_catalog_role public.catalog_role;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if not exists (
    select 1 from auth.users auth_user where auth_user.id = target_actor_user_id
  ) or not (
    exists (
      select 1 from public.platform_admins platform_admin
      where platform_admin.user_id = target_actor_user_id
    )
    or exists (
      select 1 from public.catalog_members actor_member
      where actor_member.catalog_id = target_catalog_id
        and actor_member.user_id = target_actor_user_id
        and actor_member.role in ('owner', 'admin')
    )
  ) then
    raise exception 'catalog_team_management_required';
  end if;
  if not exists (
    select 1 from public.catalog_staff_roles role where role.code = target_role_code
  ) then
    raise exception 'catalog_staff_role_invalid';
  end if;
  if not exists (select 1 from auth.users auth_user where auth_user.id = target_user_id) then
    raise exception 'catalog_staff_account_not_found';
  end if;

  select member.role into existing_catalog_role
  from public.catalog_members member
  where member.catalog_id = target_catalog_id and member.user_id = target_user_id;
  if existing_catalog_role in ('owner', 'admin', 'editor') then
    raise exception 'catalog_privileged_member_cannot_be_staff';
  end if;

  insert into public.catalog_members (catalog_id, user_id, role)
  values (target_catalog_id, target_user_id, 'viewer'::public.catalog_role)
  on conflict on constraint catalog_members_pkey do nothing;

  insert into public.catalog_staff_memberships (
    catalog_id, user_id, role_code, is_active, receives_new_orders, created_by
  ) values (
    target_catalog_id, target_user_id, target_role_code, true,
    coalesce(target_receives_new_orders, true), target_actor_user_id
  )
  on conflict on constraint catalog_staff_memberships_pkey
  do update set
    role_code = excluded.role_code,
    is_active = true,
    receives_new_orders = excluded.receives_new_orders,
    updated_at = pg_catalog.now();

  insert into public.audit_logs (catalog_id, actor_id, action, entity_table, entity_id, payload)
  values (
    target_catalog_id,
    target_actor_user_id,
    'catalog.staff.linked',
    'catalog_staff_memberships',
    target_user_id,
    pg_catalog.jsonb_build_object('role_code', target_role_code, 'source', 'staff_account_onboarding')
  );

  return query
  select
    staff.user_id,
    coalesce(nullif(pg_catalog.btrim(profile.full_name), ''),
      pg_catalog.split_part(coalesce(auth_user.email::text, ''), '@', 1), 'Сотрудник'),
    coalesce(auth_user.email::text, profile.email, ''),
    staff.role_code,
    role.name,
    staff.is_active,
    staff.receives_new_orders,
    staff.updated_at
  from public.catalog_staff_memberships staff
  join public.catalog_staff_roles role on role.code = staff.role_code
  join auth.users auth_user on auth_user.id = staff.user_id
  left join public.profiles profile on profile.id = staff.user_id
  where staff.catalog_id = target_catalog_id and staff.user_id = target_user_id;
end;
$$;

revoke all on function public.link_catalog_staff_by_user_id(uuid, uuid, text, boolean, uuid)
from public, anon, authenticated;
grant execute on function public.link_catalog_staff_by_user_id(uuid, uuid, text, boolean, uuid)
to service_role;
