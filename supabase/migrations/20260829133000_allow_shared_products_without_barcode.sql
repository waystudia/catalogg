begin;

create or replace function public.search_shared_products(
  target_query text default '',
  target_category_id uuid default null,
  target_limit integer default 50,
  target_offset integer default 0
)
returns table (
  id uuid,
  title text,
  brand text,
  description text,
  ingredients text,
  allergens text[],
  country_of_origin text,
  net_content_value numeric,
  net_content_unit text,
  category_id uuid,
  category_name text,
  barcode text,
  normalized_barcode text,
  image_url text,
  version integer,
  status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    product.id,
    product.title,
    product.brand,
    product.description,
    product.ingredients,
    product.allergens,
    product.country_of_origin,
    product.net_content_value,
    product.net_content_unit,
    category.id,
    category.name,
    identifier.display_value,
    identifier.normalized_value,
    primary_media.url,
    product.version,
    product.status
  from public.master_products product
  join public.master_categories category on category.id = product.category_id
  left join lateral (
    select value.display_value, value.normalized_value
    from public.master_product_identifiers value
    where value.master_product_id = product.id
    order by value.is_primary desc, value.created_at
    limit 1
  ) identifier on true
  left join lateral (
    select media.url
    from public.master_product_media media
    where media.master_product_id = product.id
      and media.processing_status = 'ready'
      and media.moderation_status in ('pending', 'verified')
    order by media.is_primary desc, media.sort_order, media.created_at
    limit 1
  ) primary_media on true
  where product.status <> 'archived'
    and (target_category_id is null or product.category_id = target_category_id)
    and (
      length(trim(coalesce(target_query, ''))) = 0
      or product.title ilike '%' || trim(target_query) || '%'
      or coalesce(product.brand, '') ilike '%' || trim(target_query) || '%'
      or identifier.display_value = regexp_replace(trim(target_query), '[[:space:]-]+', '', 'g')
      or identifier.normalized_value = public.normalize_global_barcode(target_query)
    )
  order by product.updated_at desc, product.title
  limit least(greatest(coalesce(target_limit, 50), 1), 100)
  offset greatest(coalesce(target_offset, 0), 0);
$$;

create or replace function public.bulk_add_shared_products_to_catalog(
  target_catalog_id uuid,
  target_master_product_ids uuid[]
)
returns table (
  master_product_id uuid,
  product_id uuid,
  created boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  requested_master_id uuid;
  master_record record;
  local_category_id uuid;
  local_product_id uuid;
  created_product boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  if not public.is_catalog_member(
    target_catalog_id,
    array['owner', 'admin', 'editor']::public.catalog_role[]
  ) then
    raise exception 'catalog_editor_required';
  end if;

  if coalesce(cardinality(target_master_product_ids), 0) = 0 then
    return;
  end if;

  if cardinality(target_master_product_ids) > 500 then
    raise exception 'shared_product_batch_limit_exceeded';
  end if;

  for requested_master_id in
    select distinct requested_id
    from unnest(target_master_product_ids) as requested(requested_id)
    where requested_id is not null
  loop
    select
      product.id,
      product.category_id,
      product.title,
      product.description,
      product.ingredients,
      product.net_content_value,
      product.net_content_unit,
      product.version,
      identifier.display_value as barcode,
      identifier.normalized_value as normalized_barcode
    into master_record
    from public.master_products product
    left join lateral (
      select value.display_value, value.normalized_value
      from public.master_product_identifiers value
      where value.master_product_id = product.id
      order by value.is_primary desc, value.created_at
      limit 1
    ) identifier on true
    where product.id = requested_master_id
      and product.status in ('pending', 'verified');

    if master_record.id is null then
      continue;
    end if;

    insert into public.categories (
      catalog_id,
      master_category_id,
      name,
      slug,
      description,
      is_hidden
    )
    select
      target_catalog_id,
      category.id,
      category.name,
      'shared-' || replace(category.id::text, '-', ''),
      category.description,
      false
    from public.master_categories category
    where category.id = master_record.category_id
    on conflict do nothing;

    select category.id
    into local_category_id
    from public.categories category
    where category.catalog_id = target_catalog_id
      and category.master_category_id = master_record.category_id;

    select product.id
    into local_product_id
    from public.products product
    where product.catalog_id = target_catalog_id
      and product.master_product_id = requested_master_id;

    created_product := false;

    if local_product_id is null and master_record.normalized_barcode is not null then
      select product.id
      into local_product_id
      from public.products product
      where product.catalog_id = target_catalog_id
        and product.master_product_id is null
        and public.normalize_global_barcode(product.barcode) = master_record.normalized_barcode
      order by product.created_at
      limit 1;

      if local_product_id is not null then
        update public.products
        set
          master_product_id = requested_master_id,
          master_content_version = master_record.version,
          content_source = 'master_override',
          category_id = coalesce(category_id, local_category_id)
        where id = local_product_id
          and catalog_id = target_catalog_id;
      end if;
    end if;

    if local_product_id is null then
      insert into public.products (
        catalog_id,
        category_id,
        master_product_id,
        master_content_version,
        content_source,
        title,
        slug,
        barcode,
        status,
        price,
        description,
        ingredients,
        weight,
        stock_count,
        stock_quantity
      )
      values (
        target_catalog_id,
        local_category_id,
        requested_master_id,
        master_record.version,
        'master',
        master_record.title,
        'shared-' || replace(requested_master_id::text, '-', ''),
        coalesce(master_record.barcode, ''),
        'draft'::public.product_status,
        0,
        master_record.description,
        master_record.ingredients,
        concat_ws(' ', master_record.net_content_value, master_record.net_content_unit),
        0,
        0
      )
      on conflict do nothing
      returning id into local_product_id;

      created_product := local_product_id is not null;

      if local_product_id is null then
        select product.id
        into local_product_id
        from public.products product
        where product.catalog_id = target_catalog_id
          and product.master_product_id = requested_master_id;
      end if;
    end if;

    if local_product_id is null then
      continue;
    end if;

    insert into public.product_images (
      catalog_id,
      product_id,
      master_media_id,
      url,
      alt,
      sort_order
    )
    select
      target_catalog_id,
      local_product_id,
      media.id,
      media.url,
      coalesce(nullif(media.alt, ''), master_record.title),
      media.sort_order
    from public.master_product_media media
    where media.master_product_id = requested_master_id
      and media.processing_status = 'ready'
      and media.moderation_status in ('pending', 'verified')
    on conflict do nothing;

    master_product_id := requested_master_id;
    product_id := local_product_id;
    created := created_product;
    return next;
  end loop;
end;
$$;

commit;
