-- Give the reusable grocery template and the already-created Finik tenant a
-- real product-level assortment without changing other merchants' custom data.
create temporary table grocery_product_asset_map (
  slug text primary key,
  image_url text not null
) on commit drop;

insert into grocery_product_asset_map (slug, image_url) values
  ('medjool-dates', '/assets/template-grocery/products/medjool-dates.webp'),
  ('tunis-dates', '/assets/template-grocery/products/tunis-dates.webp'),
  ('dates-pack-200', '/assets/template-grocery/products/dates-pack-200.webp'),
  ('dried-apricots', '/assets/template-grocery/products/dried-apricots.webp'),
  ('raw-almonds', '/assets/template-grocery/products/raw-almonds.webp'),
  ('walnut-kernels', '/assets/template-grocery/products/walnut-kernels.webp'),
  ('bananas', '/assets/template-grocery/products/bananas.webp'),
  ('red-apples', '/assets/template-grocery/products/red-apples.webp'),
  ('oranges', '/assets/template-grocery/products/oranges.webp'),
  ('green-grapes', '/assets/template-grocery/products/green-grapes.webp'),
  ('lemon-piece', '/assets/template-grocery/products/lemon-piece.webp'),
  ('pink-tomatoes', '/assets/template-grocery/products/pink-tomatoes.webp'),
  ('cucumbers', '/assets/template-grocery/products/cucumbers.webp'),
  ('potatoes', '/assets/template-grocery/products/potatoes.webp'),
  ('onions', '/assets/template-grocery/products/onions.webp'),
  ('fresh-herbs', '/assets/template-grocery/products/fresh-herbs.webp'),
  ('milk-32-1l', '/assets/template-grocery/products/milk-32-1l.webp'),
  ('kefir-25-1l', '/assets/template-grocery/products/kefir-25-1l.webp'),
  ('sour-cream-300', '/assets/template-grocery/products/sour-cream-300.webp'),
  ('butter-180', '/assets/template-grocery/products/butter-180.webp'),
  ('semi-hard-cheese', '/assets/template-grocery/products/semi-hard-cheese.webp'),
  ('eggs-c1-10', '/assets/template-grocery/products/eggs-c1-10.webp'),
  ('home-bread', '/assets/template-grocery/products/home-bread.webp'),
  ('rye-bread', '/assets/template-grocery/products/rye-bread.webp'),
  ('thin-lavash', '/assets/template-grocery/products/thin-lavash.webp'),
  ('classic-croissant', '/assets/template-grocery/products/classic-croissant.webp'),
  ('long-rice-900', '/assets/template-grocery/products/long-rice-900.webp'),
  ('buckwheat-900', '/assets/template-grocery/products/buckwheat-900.webp'),
  ('pasta-penne-450', '/assets/template-grocery/products/pasta-penne-450.webp'),
  ('flour-2kg', '/assets/template-grocery/products/flour-2kg.webp'),
  ('sugar-1kg', '/assets/template-grocery/products/sugar-1kg.webp'),
  ('sunflower-oil-1l', '/assets/template-grocery/products/sunflower-oil-1l.webp'),
  ('salt-1kg', '/assets/template-grocery/products/salt-1kg.webp'),
  ('halal-chicken-fillet', '/assets/template-grocery/products/halal-chicken-fillet.webp'),
  ('halal-beef', '/assets/template-grocery/products/halal-beef.webp'),
  ('halal-ground-beef', '/assets/template-grocery/products/halal-ground-beef.webp'),
  ('still-water-15', '/assets/template-grocery/products/still-water-15.webp'),
  ('sparkling-water-15', '/assets/template-grocery/products/sparkling-water-15.webp'),
  ('pepsi-15', '/assets/template-grocery/products/pepsi-15.webp'),
  ('coca-cola-15', '/assets/template-grocery/products/coca-cola-15.webp'),
  ('orange-juice-1l', '/assets/template-grocery/products/orange-juice-1l.webp'),
  ('black-tea-100', '/assets/template-grocery/products/black-tea-100.webp'),
  ('ground-coffee-250', '/assets/template-grocery/products/ground-coffee-250.webp'),
  ('oat-cookies-300', '/assets/template-grocery/products/oat-cookies-300.webp'),
  ('milk-chocolate-90', '/assets/template-grocery/products/milk-chocolate-90.webp'),
  ('assorted-candy', '/assets/template-grocery/products/assorted-candy.webp'),
  ('potato-chips-140', '/assets/template-grocery/products/lays-chips-140.webp'),
  ('halal-dumplings-800', '/assets/template-grocery/products/halal-dumplings-800.webp'),
  ('frozen-vegetables-400', '/assets/template-grocery/products/frozen-vegetables-400.webp'),
  ('ice-cream-400', '/assets/template-grocery/products/ice-cream-400.webp'),
  ('dish-soap-500', '/assets/template-grocery/products/dish-soap-500.webp'),
  ('laundry-powder-3kg', '/assets/template-grocery/products/laundry-powder-3kg.webp'),
  ('paper-towels-2', '/assets/template-grocery/products/paper-towels-2.webp'),
  ('trash-bags-60l', '/assets/template-grocery/products/trash-bags-60l.webp'),
  ('liquid-soap-500', '/assets/template-grocery/products/liquid-soap-500.webp'),
  ('shampoo-400', '/assets/template-grocery/products/shampoo-400.webp'),
  ('toothpaste-100', '/assets/template-grocery/products/toothpaste-100.webp');

insert into public.products (
  catalog_id, category_id, title, slug, sku, barcode, status, price, old_price,
  description, weight, stock_count, is_unlimited, is_popular, is_new, is_promo,
  custom_fields, sort_order, sale_unit, quantity_unit, price_basis_quantity,
  minimum_quantity, quantity_step, stock_quantity, allow_substitution
)
select
  catalog.id,
  category.id,
  seed.title,
  seed.slug,
  seed.sku,
  seed.barcode,
  'active'::public.product_status,
  seed.price,
  null,
  seed.description,
  '1,5 л',
  seed.stock_quantity,
  false,
  true,
  true,
  false,
  pg_catalog.jsonb_build_object(
    'product_image_url', seed.image_url,
    'category_image_url', seed.image_url,
    'substitution_hint', 'Предложить похожий товар'
  ),
  seed.sort_order,
  'piece',
  'piece',
  1,
  1,
  1,
  seed.stock_quantity,
  true
from public.catalogs catalog
join public.categories category
  on category.catalog_id = catalog.id
 and category.slug = 'drinks'
cross join (
  values
    ('Pepsi 1,5 л', 'pepsi-15', 'FIN-DRK-006', '4600494600018', 175, 'Газированный напиток Pepsi, бутылка 1,5 литра.', 385, 30, '/assets/template-grocery/products/pepsi-15.webp'),
    ('Coca-Cola Original 1,5 л', 'coca-cola-15', 'FIN-DRK-007', '5449000054227', 180, 'Газированный напиток Coca-Cola Original, бутылка 1,5 литра.', 386, 30, '/assets/template-grocery/products/coca-cola-15.webp')
) as seed(title, slug, sku, barcode, price, description, sort_order, stock_quantity, image_url)
where catalog.business_type = 'grocery'
  and (catalog.is_template = true or catalog.slug = 'finik')
  and exists (
    select 1 from public.products existing_seed
    where existing_seed.catalog_id = catalog.id
      and existing_seed.slug = 'still-water-15'
  )
on conflict (catalog_id, slug) do update set
  category_id = excluded.category_id,
  title = excluded.title,
  sku = excluded.sku,
  barcode = excluded.barcode,
  status = excluded.status,
  price = excluded.price,
  description = excluded.description,
  weight = excluded.weight,
  stock_count = excluded.stock_count,
  is_popular = excluded.is_popular,
  is_new = excluded.is_new,
  custom_fields = excluded.custom_fields,
  sort_order = excluded.sort_order,
  sale_unit = excluded.sale_unit,
  quantity_unit = excluded.quantity_unit,
  price_basis_quantity = excluded.price_basis_quantity,
  minimum_quantity = excluded.minimum_quantity,
  quantity_step = excluded.quantity_step,
  stock_quantity = excluded.stock_quantity,
  allow_substitution = excluded.allow_substitution,
  updated_at = pg_catalog.now();

update public.products product
set title = case product.slug
      when 'potatoes' then 'Картофель российский отборный'
      when 'home-bread' then 'Хлеб местный домашний'
      when 'potato-chips-140' then 'Чипсы Lay’s с солью 140 г'
      else product.title
    end,
    custom_fields = pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        coalesce(product.custom_fields, '{}'::jsonb),
        '{product_image_url}',
        pg_catalog.to_jsonb(asset.image_url),
        true
      ),
      '{category_image_url}',
      pg_catalog.to_jsonb(asset.image_url),
      true
    ),
    updated_at = pg_catalog.now()
from public.catalogs catalog,
     grocery_product_asset_map asset
where product.catalog_id = catalog.id
  and product.slug = asset.slug
  and catalog.business_type = 'grocery'
  and (catalog.is_template = true or catalog.slug = 'finik');

update public.product_images image
set url = asset.image_url,
    alt = product.title
from public.products product,
     public.catalogs catalog,
     grocery_product_asset_map asset
where image.product_id = product.id
  and image.catalog_id = product.catalog_id
  and product.catalog_id = catalog.id
  and product.slug = asset.slug
  and image.sort_order = 0
  and catalog.business_type = 'grocery'
  and (catalog.is_template = true or catalog.slug = 'finik');

insert into public.product_images (catalog_id, product_id, url, alt, sort_order)
select product.catalog_id, product.id, asset.image_url, product.title, 0
from public.products product
join public.catalogs catalog on catalog.id = product.catalog_id
join grocery_product_asset_map asset on asset.slug = product.slug
where catalog.business_type = 'grocery'
  and (catalog.is_template = true or catalog.slug = 'finik')
  and not exists (
    select 1 from public.product_images image
    where image.catalog_id = product.catalog_id
      and image.product_id = product.id
      and image.sort_order = 0
  );

-- The initial Finik setup is active but was left in draft after onboarding.
-- Publish only that known tenant, and only while its client account is active.
update public.catalogs catalog
set status = 'published',
    updated_at = pg_catalog.now()
where catalog.slug = 'finik'
  and catalog.business_type = 'grocery'
  and exists (
    select 1
    from public.clients client
    where client.catalog_id = catalog.id
      and client.status = 'active'
  );
