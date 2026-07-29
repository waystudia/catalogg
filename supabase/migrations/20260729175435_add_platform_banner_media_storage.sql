insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'platform-banner-media',
  'platform-banner-media',
  true,
  31457280,
  array['image/*', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public reads platform banner media" on storage.objects;
create policy "public reads platform banner media"
on storage.objects
for select
to public
using (bucket_id = 'platform-banner-media');

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
