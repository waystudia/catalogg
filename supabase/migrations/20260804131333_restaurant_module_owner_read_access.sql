-- The active restaurant dashboard recognizes both catalog members and the
-- client account that owns the catalog. Keep module reads aligned with that
-- existing login model while still limiting every user to the exact catalog.
drop policy if exists "platform admins and restaurant members read modules"
on public.restaurant_modules;

create policy "platform admins and restaurant owners read modules"
on public.restaurant_modules
for select
to authenticated
using (
  (select public.is_platform_admin())
  or exists (
    select 1
    from public.catalog_members member
    where member.catalog_id = restaurant_modules.catalog_id
      and member.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.clients client
    where client.catalog_id = restaurant_modules.catalog_id
      and client.owner_user_id = (select auth.uid())
  )
);
