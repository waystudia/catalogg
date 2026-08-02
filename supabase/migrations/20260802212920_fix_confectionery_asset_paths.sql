-- The production site is served from the domain root. Replace the former
-- GitHub Pages /catalogg prefix in existing templates and cloned catalogs.

update public.catalogs
set logo_url = replace(logo_url, '/catalogg/assets/templates/confectionery', '/assets/templates/confectionery'),
    banner_url = replace(banner_url, '/catalogg/assets/templates/confectionery', '/assets/templates/confectionery'),
    updated_at = now()
where coalesce(logo_url, '') like '/catalogg/assets/templates/confectionery/%'
   or coalesce(banner_url, '') like '/catalogg/assets/templates/confectionery/%';

update public.categories
set image_url = replace(image_url, '/catalogg/assets/templates/confectionery', '/assets/templates/confectionery')
where coalesce(image_url, '') like '/catalogg/assets/templates/confectionery/%';

update public.product_images
set url = replace(url, '/catalogg/assets/templates/confectionery', '/assets/templates/confectionery')
where coalesce(url, '') like '/catalogg/assets/templates/confectionery/%';

update public.catalog_sections
set settings = replace(
  settings::text,
  '/catalogg/assets/templates/confectionery',
  '/assets/templates/confectionery'
)::jsonb
where settings::text like '%/catalogg/assets/templates/confectionery/%';
