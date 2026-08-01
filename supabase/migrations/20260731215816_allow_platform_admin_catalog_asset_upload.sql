drop policy if exists "catalog assets platform admins write" on storage.objects;
create policy "catalog assets platform admins write"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'catalog-assets'
  and public.is_platform_admin()
)
with check (
  bucket_id = 'catalog-assets'
  and public.is_platform_admin()
);
