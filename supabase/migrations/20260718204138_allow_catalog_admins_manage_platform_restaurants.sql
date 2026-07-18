alter table public.restaurants enable row level security;

drop policy if exists "restaurants public read active" on public.restaurants;
create policy "restaurants public read active" on public.restaurants
for select
using (
  is_active
  or public.is_platform_admin()
  or (
    catalog_id is not null
    and public.is_catalog_member(catalog_id, array['owner','admin','editor','viewer']::public.catalog_role[])
  )
);

drop policy if exists "catalog admins insert own platform restaurant" on public.restaurants;
create policy "catalog admins insert own platform restaurant" on public.restaurants
for insert to authenticated
with check (
  public.is_platform_admin()
  or (
    catalog_id is not null
    and public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[])
  )
);

drop policy if exists "catalog admins update own platform restaurant" on public.restaurants;
create policy "catalog admins update own platform restaurant" on public.restaurants
for update to authenticated
using (
  public.is_platform_admin()
  or (
    catalog_id is not null
    and public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[])
  )
)
with check (
  public.is_platform_admin()
  or (
    catalog_id is not null
    and public.is_catalog_member(catalog_id, array['owner','admin']::public.catalog_role[])
  )
);
