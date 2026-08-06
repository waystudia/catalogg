-- Restaurant owners enter their cabinet in demo mode first. Legal activation
-- remains a deliberate action from settings; real orders are still protected
-- by can_catalog_accept_real_orders() and orders_require_active_restaurant.

create or replace function public.resolve_current_login_redirect()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_user_id uuid := auth.uid();
  viewer_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  target_slug text;
begin
  if viewer_user_id is null then return null; end if;
  if public.current_driver_id() is not null then return '/driver'; end if;

  select catalog.slug
  into target_slug
  from public.clients client
  join public.catalogs catalog on catalog.id = client.catalog_id
  where client.owner_user_id = viewer_user_id
     or (viewer_email <> '' and lower(client.email) = viewer_email)
  order by (client.owner_user_id = viewer_user_id) desc
  limit 1;

  if target_slug is not null then
    return '/' || target_slug || '/dashboard';
  end if;

  select catalog.slug
  into target_slug
  from public.catalog_members member
  join public.catalogs catalog on catalog.id = member.catalog_id
  where member.user_id = viewer_user_id
  order by catalog.created_at
  limit 1;

  if target_slug is not null then
    return '/' || target_slug || '/dashboard';
  end if;

  if public.is_platform_admin() then return '/admin'; end if;
  if exists (select 1 from public.admin_user admin where admin.user_id = viewer_user_id) then
    return '/mangal/dashboard';
  end if;
  return '/';
end;
$$;

revoke all on function public.resolve_current_login_redirect() from public, anon;
grant execute on function public.resolve_current_login_redirect() to authenticated;
