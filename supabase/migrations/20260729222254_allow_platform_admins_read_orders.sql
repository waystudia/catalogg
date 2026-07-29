drop policy if exists "orders admin read" on public.orders;
create policy "orders admin read"
on public.orders
for select
to authenticated
using (
  public.is_platform_admin()
  or public.is_catalog_member(
    catalog_id,
    array['owner', 'admin', 'viewer']::public.catalog_role[]
  )
);
