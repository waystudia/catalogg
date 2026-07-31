-- Template catalogs contain generic demo content and need a public preview URL.
-- Write access remains limited to platform administrators by the existing policies.

drop policy if exists "catalogs public read templates" on public.catalogs;
create policy "catalogs public read templates" on public.catalogs
for select using (is_template = true);

drop policy if exists "categories public read templates" on public.categories;
create policy "categories public read templates" on public.categories
for select using (
  not is_hidden
  and exists (
    select 1 from public.catalogs catalog
    where catalog.id = categories.catalog_id
      and catalog.is_template = true
  )
);

drop policy if exists "products public read templates" on public.products;
create policy "products public read templates" on public.products
for select using (
  status in ('active'::public.product_status, 'sold_out'::public.product_status)
  and exists (
    select 1 from public.catalogs catalog
    where catalog.id = products.catalog_id
      and catalog.is_template = true
  )
);

drop policy if exists "product images public read templates" on public.product_images;
create policy "product images public read templates" on public.product_images
for select using (
  exists (
    select 1 from public.catalogs catalog
    where catalog.id = product_images.catalog_id
      and catalog.is_template = true
  )
);

drop policy if exists "theme public read templates" on public.catalog_theme_settings;
create policy "theme public read templates" on public.catalog_theme_settings
for select using (
  exists (
    select 1 from public.catalogs catalog
    where catalog.id = catalog_theme_settings.catalog_id
      and catalog.is_template = true
  )
);

drop policy if exists "sections public read templates" on public.catalog_sections;
create policy "sections public read templates" on public.catalog_sections
for select using (
  exists (
    select 1 from public.catalogs catalog
    where catalog.id = catalog_sections.catalog_id
      and catalog.is_template = true
  )
);

drop policy if exists "tags public read templates" on public.tags;
create policy "tags public read templates" on public.tags
for select using (
  exists (
    select 1 from public.catalogs catalog
    where catalog.id = tags.catalog_id
      and catalog.is_template = true
  )
);

drop policy if exists "resources public read templates" on public.bookable_resources;
create policy "resources public read templates" on public.bookable_resources
for select using (
  exists (
    select 1 from public.catalogs catalog
    where catalog.id = bookable_resources.catalog_id
      and catalog.is_template = true
  )
);
