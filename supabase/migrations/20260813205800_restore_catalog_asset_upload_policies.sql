drop policy if exists "catalog assets members write own catalog path" on storage.objects;
drop policy if exists "catalog assets platform admins write" on storage.objects;
drop policy if exists "catalog assets authenticated writers" on storage.objects;

create policy "catalog assets authenticated writers"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'catalog-assets'
  and (
    public.is_platform_admin()
    or case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_catalog_member(
        (storage.foldername(name))[1]::uuid,
        array['owner', 'admin', 'editor']::public.catalog_role[]
      )
      else false
    end
  )
)
with check (
  bucket_id = 'catalog-assets'
  and (
    public.is_platform_admin()
    or case
      when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_catalog_member(
        (storage.foldername(name))[1]::uuid,
        array['owner', 'admin', 'editor']::public.catalog_role[]
      )
      else false
    end
  )
);
