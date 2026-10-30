"""Transactional live integration checks; all content changes are rolled back."""
import pathlib, subprocess, sys
migration=pathlib.Path(sys.argv[1]).read_text()
checks=r'''
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare c record; first jsonb; second jsonb; begin
 for c in select slug from public.catalogs loop
  first:=public.get_catalog_menu_snapshot(c.slug);
  second:=public.get_catalog_menu_snapshot(c.slug);
  if first is distinct from wayyaam_private.build_menu_snapshot(c.slug) or first is distinct from second then raise exception 'cache payload mismatch: %',c.slug; end if;
 end loop;
 if public.get_catalog_menu_snapshot('loadtest-20261030') is not null then raise exception 'test catalog exposed'; end if;
 if public.get_catalog_menu_snapshot('cache-check-missing-slug') is not null then raise exception 'unknown catalog exposed'; end if;
 begin perform 1 from wayyaam_private.public_menu_cache; raise exception 'anon cache table accessible'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from pg_roles where rolname='wayyaam_menu_cache_owner' and (rolbypassrls or rolcanlogin or rolsuper)) then raise exception 'unsafe cache owner'; end if;
 if has_function_privilege('authenticated','wayyaam_private.cached_public_menu_snapshot(text)','EXECUTE') then raise exception 'authenticated cache access'; end if;
 if has_table_privilege('anon','wayyaam_private.public_menu_cache','SELECT') then raise exception 'anonymous table access'; end if;
end $$;
-- Warm cache -> change price -> next anonymous read must see the new value.
create temp table cache_changed_product as select p.id,p.catalog_id,p.price from public.products p join public.catalogs c on c.id=p.catalog_id where c.slug='finik' and p.status='active' limit 1;
grant select on cache_changed_product to anon;
update public.products set price=price+1 where id=(select id from cache_changed_product);
set local role anon;
do $$ declare expected numeric; actual numeric; begin
 select price+1 into expected from cache_changed_product;
 select (p->>'price')::numeric into actual from jsonb_array_elements(public.get_catalog_menu_snapshot('finik')->'products') p where (p->>'id')::uuid=(select id from cache_changed_product);
 if expected is distinct from actual then raise exception 'price invalidation failed'; end if;
end $$;
reset role;
update public.catalogs set status='draft' where slug='finik';
set local role anon;
do $$ begin if public.get_catalog_menu_snapshot('finik') is not null then raise exception 'unpublished cache exposed'; end if; end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
do $$ begin
 begin perform wayyaam_private.cached_public_menu_snapshot('rizih'); raise exception 'authenticated private cache accessible'; exception when insufficient_privilege then null; end;
 if public.get_catalog_menu_snapshot('rizih') is distinct from wayyaam_private.build_menu_snapshot('rizih') then raise exception 'authenticated payload mismatch'; end if;
end $$;
reset role;
'''
q='begin;\n'+migration+'\n'+checks+'\nrollback;'
r=subprocess.run(['ssh','-i',str(pathlib.Path.home()/'.ssh/codex_wayyaam_deploy_20260806'),'-o','ConnectTimeout=12','root@155.212.210.45','docker exec -i supabase-db psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres'],input=q,text=True,capture_output=True)
if r.returncode: print(r.stderr[-3500:],file=sys.stderr);sys.exit(r.returncode)
print('PASS: all visible anonymous catalogs equal uncached RLS payloads; warm hits equal; price and publication invalidation; unknown/test catalogs hidden; cache role/ACL isolation. ROLLBACK.')
