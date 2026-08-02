alter table public.category
  add column if not exists show_on_home boolean not null default true,
  add column if not exists show_in_order_flow boolean not null default false;

update public.category as legacy_category
set
  show_on_home = coalesce((platform_category.description::jsonb ->> 'showOnHome')::boolean, true),
  show_in_order_flow = coalesce((platform_category.description::jsonb ->> 'showInOrderFlow')::boolean, false)
from public.categories as platform_category
join public.catalogs as catalog on catalog.id = platform_category.catalog_id
where catalog.slug = 'mangal'
  and lower(trim(platform_category.name)) = lower(trim(legacy_category.name));
