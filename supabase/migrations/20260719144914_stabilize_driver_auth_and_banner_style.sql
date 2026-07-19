create or replace function public.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select driver_id
  from (
    select d.id as driver_id, 0 as priority
    from public.drivers d
    join public.users u on u.id = d.user_id
    where u.auth_user_id = auth.uid()

    union all

    select d.id as driver_id, 1 as priority
    from public.drivers d
    join public.users u on u.id = d.user_id
    where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and u.role = 'driver'

    union all

    select d.id as driver_id, 2 as priority
    from public.drivers d
    where d.id::text = coalesce(auth.jwt() -> 'app_metadata' ->> 'driver_id', '')
  ) candidates
  order by priority
  limit 1
$$;

revoke all on function public.current_driver_id() from public, anon;
grant execute on function public.current_driver_id() to authenticated;

create or replace function public.set_current_driver_availability(next_is_online boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  update public.drivers
  set is_online = next_is_online,
      status = case
        when next_is_online then 'online'
        else 'offline'
      end
  where id = viewer_driver_id;

  if not found then
    raise exception 'Driver profile was not found';
  end if;

  return next_is_online;
end;
$$;

revoke all on function public.set_current_driver_availability(boolean) from public, anon;
grant execute on function public.set_current_driver_availability(boolean) to authenticated;

create or replace function public.accept_available_delivery(target_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_driver_id uuid := public.current_driver_id();
begin
  if viewer_driver_id is null then
    raise exception 'Driver authentication is required';
  end if;

  return public.accept_available_delivery(target_delivery_id, viewer_driver_id);
end;
$$;

revoke all on function public.accept_available_delivery(uuid) from public, anon;
grant execute on function public.accept_available_delivery(uuid) to authenticated;

create or replace function public.has_catalog_admin_access(target_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then false
    else exists (
      select 1
      from public.catalogs c
      where lower(c.slug) = lower(trim(target_slug))
        and (
          exists (
            select 1
            from public.clients cl
            where cl.catalog_id = c.id
              and cl.owner_user_id = auth.uid()
          )
          or exists (
            select 1
            from public.catalog_members cm
            where cm.catalog_id = c.id
              and cm.user_id = auth.uid()
          )
        )
    )
    or (
      lower(trim(target_slug)) = 'mangal'
      and exists (
        select 1
        from public.admin_user au
        where au.user_id = auth.uid()
      )
    )
  end
$$;

revoke all on function public.has_catalog_admin_access(text) from public, anon;
grant execute on function public.has_catalog_admin_access(text) to authenticated;

alter table public.platform_banners
  add column if not exists background_color text not null default '#5b3df4';
