-- The cache builder inherits anonymous RLS. It cannot bypass row security or log in.
do $$ begin
 if not exists (select 1 from pg_roles where rolname='wayyaam_menu_cache_owner') then
  create role wayyaam_menu_cache_owner nologin nosuperuser nobypassrls inherit;
 end if;
end $$;
grant anon to wayyaam_menu_cache_owner;
grant usage on schema wayyaam_private to wayyaam_menu_cache_owner;
create or replace function wayyaam_private.build_menu_snapshot(catalog_slug text)
returns jsonb language sql stable security invoker set search_path = '' as $$
 with catalog as materialized (
  select id,slug,name,description,logo_url,banner_url,whatsapp,instagram_url,address,map_url,business_type
  from public.catalogs where slug=catalog_slug
 ), sections as materialized (
  select key,settings,enabled from public.catalog_sections where catalog_id=(select id from catalog)
   and key=any(array['photo-quality','restaurant-gallery','product-choices','product-config','catalog-info'])
 )
 select jsonb_build_object(
  'catalog',to_jsonb(c),
  'categories',(select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select id,slug,name,description,image_url,icon from public.categories where catalog_id=c.id order by sort_order) t),
  'products',(select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select id,category_id,title,status,price,description,ingredients,weight,serving,stock_count,is_unlimited,is_popular,is_new,is_promo,custom_fields from public.products where catalog_id=c.id order by sort_order) t),
  'productImages',(select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select product_id,url,sort_order from public.product_images where catalog_id=c.id order by sort_order) t),
  'tags',(select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select id,slug,name,icon,color from public.tags where catalog_id=c.id order by sort_order) t),
  'cabins',(select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select id,title,capacity,image_url,is_active,capacity_text,resource_type,price from public.bookable_resources where catalog_id=c.id order by sort_order) t),
  'theme',(select jsonb_build_object('settings',settings) from public.catalog_theme_settings where catalog_id=c.id),
  'sections',(select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from sections s),
  'productModifierGroups',(select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select id,product_id,name,required,min_selected,max_selected,is_active from public.product_option_groups where catalog_id=c.id order by sort_order) t),
  'productModifierOptions',(select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select id,group_id,name,price_delta,is_default,is_active from public.product_options where catalog_id=c.id order by sort_order) t),
  'restaurantLocation',(select to_jsonb(t) from (select id,catalog_id,address_line,lat,lng from public.restaurants where catalog_id=c.id limit 1) t)
 ) from catalog c;
$$;

revoke all on function wayyaam_private.build_menu_snapshot(text) from public;
grant execute on function wayyaam_private.build_menu_snapshot(text) to anon, authenticated;
create table if not exists wayyaam_private.public_menu_cache (
 catalog_id uuid primary key references public.catalogs(id) on delete cascade,
 payload jsonb,
 expires_at timestamptz not null default 'epoch'
);
alter table wayyaam_private.public_menu_cache enable row level security;
revoke all on wayyaam_private.public_menu_cache from public,anon,authenticated;
grant select,insert,update,delete on wayyaam_private.public_menu_cache to wayyaam_menu_cache_owner;
create policy menu_cache_owner on wayyaam_private.public_menu_cache to wayyaam_menu_cache_owner using (true) with check (true);

create or replace function wayyaam_private.cached_public_menu_snapshot(catalog_slug text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare target_id uuid; target_test boolean; cached jsonb; deadline timestamptz;
begin
 if (select auth.uid()) is not null or coalesce((select auth.role()),'') <> 'anon' then
  raise exception 'anonymous_menu_only' using errcode='42501';
 end if;
 -- Always recheck visibility before using cached content (including publication/debt gates).
 select id,is_test into target_id,target_test from public.catalogs where slug=catalog_slug;
 if target_id is null then return null; end if;
 if target_test then return wayyaam_private.build_menu_snapshot(catalog_slug); end if;
 select payload into cached from wayyaam_private.public_menu_cache where catalog_id=target_id and expires_at>clock_timestamp();
 if cached is not null then return cached; end if;
 -- One builder per catalog on a miss; ordinary warm reads never acquire a row lock.
 insert into wayyaam_private.public_menu_cache(catalog_id) values(target_id) on conflict do nothing;
 select payload,expires_at into cached,deadline from wayyaam_private.public_menu_cache where catalog_id=target_id for update;
 if cached is not null and deadline>clock_timestamp() then return cached; end if;
 cached:=wayyaam_private.build_menu_snapshot(catalog_slug);
 update wayyaam_private.public_menu_cache set payload=cached,expires_at=clock_timestamp()+interval '30 seconds' where catalog_id=target_id;
 return cached;
end $$;
revoke all on function wayyaam_private.cached_public_menu_snapshot(text) from public;
grant execute on function wayyaam_private.cached_public_menu_snapshot(text) to anon;
grant create on schema wayyaam_private to wayyaam_menu_cache_owner;
grant wayyaam_menu_cache_owner to postgres;
alter function wayyaam_private.cached_public_menu_snapshot(text) owner to wayyaam_menu_cache_owner;
revoke create on schema wayyaam_private from wayyaam_menu_cache_owner;
revoke wayyaam_menu_cache_owner from postgres;

create or replace function public.get_catalog_menu_snapshot(catalog_slug text)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
begin
 if (select auth.uid()) is null and (select auth.role())='anon' then
  return wayyaam_private.cached_public_menu_snapshot(catalog_slug);
 end if;
 return wayyaam_private.build_menu_snapshot(catalog_slug);
end $$;
revoke all on function public.get_catalog_menu_snapshot(text) from public;
grant execute on function public.get_catalog_menu_snapshot(text) to anon,authenticated;

create or replace function wayyaam_private.invalidate_public_menu_cache()
returns trigger language plpgsql security definer set search_path='' as $$
declare before_id uuid; after_id uuid; target_id uuid;
begin
 if tg_op<>'INSERT' then before_id:=nullif(to_jsonb(old)->>case when tg_table_name='catalogs' then 'id' else 'catalog_id' end,'')::uuid; end if;
 if tg_op<>'DELETE' then after_id:=nullif(to_jsonb(new)->>case when tg_table_name='catalogs' then 'id' else 'catalog_id' end,'')::uuid; end if;
 for target_id in select distinct x from unnest(array[before_id,after_id]) x where x is not null order by x loop
  if exists(select 1 from public.catalogs where id=target_id) then
   -- UPSERT synchronizes with a concurrent first cache build, even when no row existed.
   insert into wayyaam_private.public_menu_cache(catalog_id) values(target_id)
    on conflict(catalog_id) do update set payload=null,expires_at='epoch';
  else delete from wayyaam_private.public_menu_cache where catalog_id=target_id;
  end if;
 end loop;
 return null;
end $$;
revoke all on function wayyaam_private.invalidate_public_menu_cache() from public;
do $$ declare relation_name text; begin
 foreach relation_name in array array['catalogs','categories','products','product_images','tags','bookable_resources','catalog_sections','catalog_theme_settings','product_option_groups','product_options','restaurants'] loop
  execute format('create trigger invalidate_public_menu_cache after insert or update or delete on public.%I for each row execute function wayyaam_private.invalidate_public_menu_cache()',relation_name);
 end loop;
end $$;
notify pgrst,'reload schema';
