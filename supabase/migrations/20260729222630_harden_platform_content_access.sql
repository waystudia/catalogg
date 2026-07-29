drop policy if exists "public reads platform banner media" on storage.objects;

do $$
begin
  if to_regclass('public.platform_content_pages') is null then
    return;
  end if;

  execute $policy$
    drop policy if exists "platform content pages public read published" on public.platform_content_pages
  $policy$;
  execute $policy$
    create policy "platform content pages public read published"
    on public.platform_content_pages
    for select to anon
    using (status = 'published')
  $policy$;

  execute $policy$
    drop policy if exists "platform content pages authenticated read" on public.platform_content_pages
  $policy$;
  execute $policy$
    create policy "platform content pages authenticated read"
    on public.platform_content_pages
    for select to authenticated
    using (status = 'published' or public.is_platform_admin())
  $policy$;

  execute $policy$
    drop policy if exists "platform content pages admins manage" on public.platform_content_pages
  $policy$;
  execute $policy$
    drop policy if exists "platform content pages admins insert" on public.platform_content_pages
  $policy$;
  execute $policy$
    create policy "platform content pages admins insert"
    on public.platform_content_pages
    for insert to authenticated
    with check (public.is_platform_admin())
  $policy$;

  execute $policy$
    drop policy if exists "platform content pages admins update" on public.platform_content_pages
  $policy$;
  execute $policy$
    create policy "platform content pages admins update"
    on public.platform_content_pages
    for update to authenticated
    using (public.is_platform_admin())
    with check (public.is_platform_admin())
  $policy$;

  execute $policy$
    drop policy if exists "platform content pages admins delete" on public.platform_content_pages
  $policy$;
  execute $policy$
    create policy "platform content pages admins delete"
    on public.platform_content_pages
    for delete to authenticated
    using (public.is_platform_admin())
  $policy$;
end;
$$;
