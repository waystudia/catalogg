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
  if not public.is_catalog_member(
    target_catalog_id,
    array['owner', 'admin', 'editor', 'viewer']::public.catalog_role[]
  ) and not public.is_platform_admin() then
    raise exception 'catalog_membership_required';
  end if;

  return query
  select
    assignment.id,
    assignment.order_id,
    assignment.assignee_user_id,
    coalesce(nullif(trim(profile.full_name), ''), split_part(coalesce(auth_user.email, ''), '@', 1), 'Сотрудник'),
    coalesce(auth_user.email::text, profile.email, ''),
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

revoke all on function public.get_catalog_order_assignments(uuid) from public, anon;
grant execute on function public.get_catalog_order_assignments(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
