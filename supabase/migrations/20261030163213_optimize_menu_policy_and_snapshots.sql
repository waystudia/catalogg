-- Private helpers only memoize existing predicates; no new authorization path.
create or replace function wayyaam_private.member_catalog_ids(allowed_roles public.catalog_role[])
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.catalog_id), '{}'::uuid[]) from public.catalog_members m
  where m.user_id = (select auth.uid()) and m.role = any(allowed_roles);
$$;
create or replace function wayyaam_private.template_catalog_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c.id), '{}'::uuid[]) from public.catalogs c where c.is_template;
$$;
create or replace function wayyaam_private.visible_published_catalog_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c.id), '{}'::uuid[]) from public.catalogs c
  where public.is_catalog_published(c.id) and (not c.is_test or (select public.current_actor_is_test()));
$$;
revoke all on function wayyaam_private.member_catalog_ids(public.catalog_role[]) from public;
revoke all on function wayyaam_private.template_catalog_ids() from public;
revoke all on function wayyaam_private.visible_published_catalog_ids() from public;
grant execute on function wayyaam_private.member_catalog_ids(public.catalog_role[]) to anon, authenticated;
grant execute on function wayyaam_private.template_catalog_ids() to anon, authenticated;
grant execute on function wayyaam_private.visible_published_catalog_ids() to anon, authenticated;

do $$
declare p record; replacement text;
begin
 for p in select tablename,policyname,qual from pg_policies where schemaname='public'
  and tablename = any(array['categories','products','product_images','tags','bookable_resources','catalog_sections','catalog_theme_settings','product_option_groups','product_options'])
  and cmd in ('SELECT','ALL') and qual like '%is_catalog_member(catalog_id,%'
 loop
  replacement := regexp_replace(p.qual,
   'is_catalog_member\(catalog_id, (ARRAY\[[^]]+\])\)',
   '(catalog_id = any ((select wayyaam_private.member_catalog_ids(\1))::uuid[]))', 'g');
  execute format('alter policy %I on public.%I using (%s)',p.policyname,p.tablename,replacement);
 end loop;
end;
$$;

alter policy "catalogs public read published" on public.catalogs using (
 (status='published' and not is_template and id=any((select wayyaam_private.published_catalog_ids())::uuid[])
  and (not is_test or (select public.current_actor_is_test())))
 or is_template or (select public.is_platform_admin())
 or id=any((select wayyaam_private.member_catalog_ids(array['owner','admin','editor','viewer']::public.catalog_role[]))::uuid[])
);
alter policy "categories public read published" on public.categories using (
 (not is_hidden and catalog_id=any((select wayyaam_private.visible_published_catalog_ids())::uuid[]))
 or catalog_id=any((select wayyaam_private.member_catalog_ids(array['owner','admin','editor','viewer']::public.catalog_role[]))::uuid[])
);
alter policy "products public read active" on public.products using (
 (status in ('active','sold_out') and catalog_id=any((select wayyaam_private.visible_published_catalog_ids())::uuid[]))
 or catalog_id=any((select wayyaam_private.member_catalog_ids(array['owner','admin','editor','viewer']::public.catalog_role[]))::uuid[])
);
do $$
declare p record; condition text;
begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and cmd='SELECT'
  and tablename=any(array['categories','products','product_images','tags','bookable_resources','catalog_sections','catalog_theme_settings'])
  and policyname like '%public read templates'
 loop
  condition := case p.tablename when 'categories' then 'not is_hidden and '
    when 'products' then 'status in (''active'',''sold_out'') and ' else '' end;
  execute format('alter policy %I on public.%I using (%s catalog_id=any((select wayyaam_private.template_catalog_ids())::uuid[]))',p.policyname,p.tablename,condition);
 end loop;
end;
$$;

-- One read-only statement, one RLS context. Explicit columns match existing menu reads.
create or replace function public.get_catalog_menu_snapshot(catalog_slug text)
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
revoke all on function public.get_catalog_menu_snapshot(text) from public;
grant execute on function public.get_catalog_menu_snapshot(text) to anon, authenticated;
notify pgrst, 'reload schema';


CREATE OR REPLACE FUNCTION public.enforce_restaurant_order_activation_gate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not (public.can_catalog_accept_real_orders(new.catalog_id) or (public.can_catalog_accept_test_orders(new.catalog_id) and (public.current_actor_is_test() or public.is_platform_admin() or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'))) then
    raise exception 'restaurant_activation_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;


CREATE OR REPLACE FUNCTION public.enqueue_web_push_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  endpoint_url text;
  webhook_secret text;
begin
  -- Test traffic must never fan out to real external push subscriptions.
  if coalesce((to_jsonb(new)->>'is_test_order')::boolean, false)
     or coalesce((to_jsonb(new)->>'is_test')::boolean, false)
     or exists (select 1 from public.orders o where o.id = nullif(to_jsonb(new)->>'order_id','')::uuid and o.is_test_order) then
    return new;
  end if;
  select decrypted_secret into endpoint_url
    from vault.decrypted_secrets
   where name = 'web_push_function_url'
   limit 1;

  select decrypted_secret into webhook_secret
    from vault.decrypted_secrets
   where name = 'web_push_webhook_secret'
   limit 1;

  if endpoint_url is null or webhook_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := endpoint_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(new),
      'old_record', case when TG_OP = 'INSERT' then null else to_jsonb(old) end
    )
  );

  return new;
end;
$$;
