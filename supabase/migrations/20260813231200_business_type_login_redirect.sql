-- Keep the shared profile login role-aware without changing a grocery into a
-- restaurant workspace. The business type decides only the destination route.

create or replace function public.resolve_current_login_redirect()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_user_id uuid := auth.uid();
  viewer_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  target_slug text;
  target_business_type text;
begin
  if viewer_user_id is null then return null; end if;
  if public.current_driver_id() is not null then return '/driver'; end if;

  select catalog.slug, catalog.business_type::text
  into target_slug, target_business_type
  from public.clients client
  join public.catalogs catalog on catalog.id = client.catalog_id
  where client.owner_user_id = viewer_user_id
     or (viewer_email <> '' and lower(client.email) = viewer_email)
  order by (client.owner_user_id = viewer_user_id) desc
  limit 1;

  if target_slug is not null then
    return case
      when target_business_type = 'grocery' then '/business/' || target_slug
      else '/' || target_slug || '/dashboard'
    end;
  end if;

  select catalog.slug, catalog.business_type::text
  into target_slug, target_business_type
  from public.catalog_members member
  join public.catalogs catalog on catalog.id = member.catalog_id
  where member.user_id = viewer_user_id
  order by catalog.created_at
  limit 1;

  if target_slug is not null then
    return case
      when target_business_type = 'grocery' then '/business/' || target_slug
      else '/' || target_slug || '/dashboard'
    end;
  end if;

  if public.is_platform_admin() then return '/admin'; end if;
  if exists (
    select 1
    from public.admin_user admin
    where admin.user_id = viewer_user_id
  ) then return '/mangal/dashboard'; end if;
  if exists (
    select 1
    from public.users platform_user
    where platform_user.auth_user_id = viewer_user_id
      and platform_user.role = 'client'
  ) then return '/profile'; end if;
  return '/';
end;
$$;

revoke all on function public.resolve_current_login_redirect() from public, anon;
grant execute on function public.resolve_current_login_redirect() to authenticated;
