-- Evaluate the existing public visibility rule once per catalog per request,
-- rather than once per product/option/image. Membership and write rules stay intact.
create schema if not exists wayyaam_private;
revoke all on schema wayyaam_private from public;
grant usage on schema wayyaam_private to anon, authenticated;

create or replace function wayyaam_private.published_catalog_ids()
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.id), '{}'::uuid[])
  from public.catalogs c
  where public.is_catalog_published(c.id);
$$;
revoke all on function wayyaam_private.published_catalog_ids() from public;
grant execute on function wayyaam_private.published_catalog_ids() to anon, authenticated;

do $$
declare p record;
begin
  for p in
    select tablename, policyname, qual from pg_policies
    where schemaname = 'public' and cmd = 'SELECT'
      and qual like '%is_catalog_published(catalog_id)%'
  loop
    execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename,
      replace(p.qual, 'is_catalog_published(catalog_id)',
        '(catalog_id = any ((select wayyaam_private.published_catalog_ids())::uuid[]))'));
  end loop;
end;
$$;

create index if not exists product_options_catalog_sort_idx
  on public.product_options (catalog_id, sort_order);
analyze public.product_options;
