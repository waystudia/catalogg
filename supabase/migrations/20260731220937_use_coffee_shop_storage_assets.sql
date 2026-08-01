update public.product_images as image
set url = 'https://tggwiyvalfvcsvuyhaxc.supabase.co/storage/v1/object/public/catalog-assets/'
  || product.catalog_id::text
  || '/templates/coffee-shop/'
  || category.slug
  || '/'
  || product.slug
  || '.webp'
from public.products as product
join public.categories as category on category.id = product.category_id
join public.catalogs as catalog on catalog.id = product.catalog_id
where image.product_id = product.id
  and image.catalog_id = product.catalog_id
  and catalog.is_template = true
  and catalog.slug = 'coffee-shop';
