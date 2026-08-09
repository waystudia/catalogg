drop policy if exists "platform admins read banner media" on storage.objects;
create policy "platform admins read banner media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'platform-banner-media'
  and public.is_platform_admin()
);

drop policy if exists "platform admins upload banner media" on storage.objects;
create policy "platform admins upload banner media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'platform-banner-media'
  and public.is_platform_admin()
);

drop policy if exists "platform admins update banner media" on storage.objects;
create policy "platform admins update banner media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'platform-banner-media'
  and public.is_platform_admin()
)
with check (
  bucket_id = 'platform-banner-media'
  and public.is_platform_admin()
);

drop policy if exists "platform admins delete banner media" on storage.objects;
create policy "platform admins delete banner media"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'platform-banner-media'
  and public.is_platform_admin()
);
